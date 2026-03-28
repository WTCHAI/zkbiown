#!/usr/bin/env python3 -u
"""
FaceScrub Dataset Downloader (Enhanced for Parallel Workers)

Downloads face images from FaceScrub metadata files with support for
parallel worker ranges AND quality filtering (face detection + confidence).

Usage:
    # Single worker (all people) with quality filtering
    python download_facescrub.py --full --images 50

    # Worker with specific range (for parallel downloads)
    python download_facescrub.py --people-start 0 --people-end 106 --images 50 --worker-id 1

    # Disable quality filtering (download all, filter later)
    python download_facescrub.py --people-start 0 --people-end 106 --no-quality-filter

Quality Filtering:
    - Uses RetinaFace for face detection
    - Requires 90% confidence
    - Requires face area >= 5% of image
    - Images failing quality check are NOT saved
"""

import os
import sys
import csv
import hashlib
import argparse
import urllib.request
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor, as_completed
from collections import defaultdict
import time
import tempfile
import io

# Configuration
SCRIPT_DIR = Path(__file__).parent
ACTORS_FILE = SCRIPT_DIR / "facescrub_actors.txt"
ACTRESSES_FILE = SCRIPT_DIR / "facescrub_actresses.txt"
OUTPUT_DIR = SCRIPT_DIR / "images"
TIMEOUT = 15  # seconds (increased from 10)

# Quality thresholds - STRICT for authentication dataset
MIN_CONFIDENCE = 0.95       # Very high confidence for clean faces
MIN_FACE_AREA_RATIO = 0.10  # Face must be at least 10% of image (head+shoulders OK)
MAX_FACE_AREA_RATIO = 0.90  # Face shouldn't be too cropped
MIN_BLUR_SCORE = 100.0      # Higher blur threshold for sharper images
REQUIRE_SINGLE_FACE = True  # Reject images with multiple faces
MAX_YAW_ANGLE = 20.0        # Max left/right rotation (degrees) - frontal only
MAX_PITCH_ANGLE = 25.0      # Max up/down rotation (degrees)

# Lazy-loaded face detector
_detector = None
_cv2 = None
_numpy = None

def get_face_detector():
    """Lazy load RetinaFace detector."""
    global _detector, _cv2, _numpy
    if _detector is None:
        try:
            from retinaface import RetinaFace
            import cv2
            import numpy as np
            _detector = RetinaFace
            _cv2 = cv2
            _numpy = np
        except ImportError:
            return None, None, None
    return _detector, _cv2, _numpy


def calculate_blur_score(img, face_area, cv2):
    """
    Calculate blur score using Laplacian variance on the face region.
    Higher score = sharper image.
    """
    x1, y1, x2, y2 = face_area

    # Add some padding around face
    h, w = img.shape[:2]
    pad = int((x2 - x1) * 0.1)
    x1 = max(0, x1 - pad)
    y1 = max(0, y1 - pad)
    x2 = min(w, x2 + pad)
    y2 = min(h, y2 + pad)

    # Extract face region
    face_roi = img[y1:y2, x1:x2]

    if face_roi.size == 0:
        return 0.0

    # Convert to grayscale
    gray = cv2.cvtColor(face_roi, cv2.COLOR_BGR2GRAY)

    # Calculate Laplacian variance (blur metric)
    laplacian = cv2.Laplacian(gray, cv2.CV_64F)
    variance = laplacian.var()

    return variance


def estimate_pose(landmarks, np):
    """
    Estimate face pose (yaw, pitch) from 5 facial landmarks.
    RetinaFace provides: left_eye, right_eye, nose, mouth_left, mouth_right

    Returns (yaw, pitch) in degrees.
    - yaw: left/right rotation (positive = looking right)
    - pitch: up/down rotation (positive = looking up)
    """
    try:
        left_eye = np.array(landmarks['left_eye'])
        right_eye = np.array(landmarks['right_eye'])
        nose = np.array(landmarks['nose'])
        mouth_left = np.array(landmarks['mouth_left'])
        mouth_right = np.array(landmarks['mouth_right'])

        # Eye center
        eye_center = (left_eye + right_eye) / 2

        # Mouth center
        mouth_center = (mouth_left + mouth_right) / 2

        # Eye width (inter-ocular distance)
        eye_width = np.linalg.norm(right_eye - left_eye)

        if eye_width < 1:
            return 0, 0

        # YAW estimation: nose offset from eye center
        # If nose is left of eye center -> looking left (negative yaw)
        # If nose is right of eye center -> looking right (positive yaw)
        nose_offset_x = nose[0] - eye_center[0]
        yaw = np.degrees(np.arcsin(np.clip(nose_offset_x / (eye_width * 0.5), -1, 1)))

        # PITCH estimation: vertical ratio
        # Distance from eye to nose vs nose to mouth
        eye_to_nose = np.linalg.norm(nose - eye_center)
        nose_to_mouth = np.linalg.norm(mouth_center - nose)

        # Normal ratio is about 1:1, if looking down nose appears closer to eyes
        if nose_to_mouth > 0:
            ratio = eye_to_nose / nose_to_mouth
            # Normal ratio ~1.0, looking up -> ratio decreases, looking down -> ratio increases
            pitch = (ratio - 1.0) * 30  # Scale to approximate degrees
            pitch = np.clip(pitch, -45, 45)
        else:
            pitch = 0

        return float(yaw), float(pitch)

    except Exception:
        return 0, 0


def check_face_quality(image_data: bytes) -> tuple[bool, str]:
    """
    Check if image has a high-quality, frontal face suitable for authentication.

    Checks:
    1. Single face only (no group photos)
    2. High detection confidence (>95%)
    3. Face area 10-90% of image
    4. Not blurry (Laplacian variance > 100)
    5. Frontal pose (yaw < 20°, pitch < 15°)

    Returns (passed, reason).
    """
    detector, cv2, np = get_face_detector()

    if detector is None:
        return True, "no_detector"

    try:
        # Decode image from bytes
        nparr = np.frombuffer(image_data, np.uint8)
        img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)

        if img is None:
            return False, "decode_failed"

        img_height, img_width = img.shape[:2]
        img_area = img_height * img_width

        # Minimum image size
        if img_width < 100 or img_height < 100:
            return False, "img_too_small"

        # Detect faces
        faces = detector.detect_faces(img)

        if not faces:
            return False, "no_face"

        # Count high-confidence faces
        high_conf_faces = [f for f in faces.values() if f.get('score', 0) >= 0.5]

        # Reject multiple faces
        if REQUIRE_SINGLE_FACE and len(high_conf_faces) > 1:
            return False, f"multi_face:{len(high_conf_faces)}"

        # Get the best face
        best_face = None
        best_confidence = 0

        for face_data in faces.values():
            confidence = face_data.get('score', 0)
            if confidence > best_confidence:
                best_confidence = confidence
                best_face = face_data

        if best_face is None:
            return False, "no_face"

        # Check confidence
        if best_confidence < MIN_CONFIDENCE:
            return False, f"low_conf:{best_confidence:.2f}"

        # Check face area ratio
        facial_area = best_face.get('facial_area', [0, 0, 0, 0])
        x1, y1, x2, y2 = facial_area
        face_area = (x2 - x1) * (y2 - y1)
        area_ratio = face_area / img_area if img_area > 0 else 0

        if area_ratio < MIN_FACE_AREA_RATIO:
            return False, f"face_small:{area_ratio:.2f}"

        if area_ratio > MAX_FACE_AREA_RATIO:
            return False, f"face_large:{area_ratio:.2f}"

        # Check blur
        blur_score = calculate_blur_score(img, facial_area, cv2)
        if blur_score < MIN_BLUR_SCORE:
            return False, f"blurry:{blur_score:.0f}"

        # Check pose (frontal face only)
        landmarks = best_face.get('landmarks', {})
        if landmarks:
            yaw, pitch = estimate_pose(landmarks, np)

            if abs(yaw) > MAX_YAW_ANGLE:
                return False, f"side_face:yaw{yaw:.0f}"

            if abs(pitch) > MAX_PITCH_ANGLE:
                return False, f"tilt_face:pitch{pitch:.0f}"
        else:
            # No landmarks = can't verify pose, reject to be safe
            return False, "no_landmarks"

        return True, f"ok:c{best_confidence:.2f}_b{blur_score:.0f}_y{yaw:.0f}"

    except Exception as e:
        return False, f"error:{str(e)[:20]}"


def download_image(url: str, save_path: Path, expected_sha256: str = None, check_quality: bool = True) -> tuple[bool, str]:
    """Download a single image, optionally verify SHA256 and check face quality."""
    try:
        # Create directory if needed
        save_path.parent.mkdir(parents=True, exist_ok=True)

        # Skip if already exists
        if save_path.exists():
            return True, "already_exists"

        # Download
        request = urllib.request.Request(
            url,
            headers={'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'}
        )
        with urllib.request.urlopen(request, timeout=TIMEOUT) as response:
            data = response.read()

        # Basic validation - check if it's a valid image (starts with magic bytes)
        if len(data) < 100:
            return False, "too_small"

        # JPEG starts with FFD8FF, PNG starts with 89504E47
        if not (data[:2] == b'\xff\xd8' or data[:4] == b'\x89PNG'):
            return False, "not_image"

        # Verify SHA256 if provided
        if expected_sha256:
            actual_sha256 = hashlib.sha256(data).hexdigest()
            if actual_sha256 != expected_sha256:
                return False, "sha256_mismatch"

        # Quality check (face detection + confidence)
        if check_quality:
            passed, reason = check_face_quality(data)
            if not passed:
                return False, reason

        # Save image (only if passed all checks)
        with open(save_path, 'wb') as f:
            f.write(data)

        return True, "downloaded"

    except urllib.error.HTTPError as e:
        return False, f"http_{e.code}"
    except urllib.error.URLError as e:
        reason = str(e.reason)[:30] if hasattr(e, 'reason') else 'unknown'
        return False, f"url_error_{reason}"
    except TimeoutError:
        return False, "timeout"
    except Exception as e:
        return False, str(e)[:30]


def parse_metadata(file_path: Path) -> list[dict]:
    """Parse FaceScrub metadata file."""
    entries = []
    with open(file_path, 'r', encoding='utf-8') as f:
        reader = csv.DictReader(f, delimiter='\t')
        for row in reader:
            entries.append(row)
    return entries


def get_file_extension(url: str) -> str:
    """Extract file extension from URL."""
    path = url.split('?')[0]  # Remove query params
    ext = os.path.splitext(path)[1].lower()
    return ext if ext in ['.jpg', '.jpeg', '.png', '.gif'] else '.jpg'


def main():
    parser = argparse.ArgumentParser(description='Download FaceScrub dataset (with worker support)')
    parser.add_argument('--full', action='store_true', help='Download all images')
    parser.add_argument('--people', type=int, default=None, help='Number of people to download (legacy mode)')
    parser.add_argument('--people-start', type=int, default=0, help='Start person index (inclusive)')
    parser.add_argument('--people-end', type=int, default=None, help='End person index (exclusive)')
    parser.add_argument('--images', type=int, default=50, help='Max images per person (default: 50)')
    parser.add_argument('--workers', type=int, default=8, help='Number of download threads (default: 8)')
    parser.add_argument('--worker-id', type=int, default=0, help='Worker ID for logging')
    parser.add_argument('--verify', action='store_true', help='Verify SHA256 checksums')
    parser.add_argument('--no-quality-filter', action='store_true', help='Disable face quality filtering')
    args = parser.parse_args()

    check_quality = not args.no_quality_filter
    worker_prefix = f"[Worker {args.worker_id}] " if args.worker_id > 0 else ""

    print("=" * 70)
    print(f"{worker_prefix}FaceScrub Dataset Downloader")
    print("=" * 70)

    # Check if quality filter dependencies are available
    if check_quality:
        detector, _, _ = get_face_detector()
        if detector is None:
            print(f"{worker_prefix}WARNING: RetinaFace not installed. Install with:")
            print(f"{worker_prefix}  pip install retinaface-pytorch opencv-python numpy")
            print(f"{worker_prefix}Quality filtering DISABLED.")
            check_quality = False
        else:
            print(f"{worker_prefix}Quality filtering ENABLED (Authentication Grade):")
            print(f"{worker_prefix}  - Min confidence: {MIN_CONFIDENCE} ({int(MIN_CONFIDENCE*100)}%)")
            print(f"{worker_prefix}  - Face area: {MIN_FACE_AREA_RATIO}-{MAX_FACE_AREA_RATIO} ({int(MIN_FACE_AREA_RATIO*100)}%-{int(MAX_FACE_AREA_RATIO*100)}%)")
            print(f"{worker_prefix}  - Min blur score: {MIN_BLUR_SCORE} (Laplacian variance)")
            print(f"{worker_prefix}  - Single face only: {REQUIRE_SINGLE_FACE}")
            print(f"{worker_prefix}  - Max yaw (left/right): ±{MAX_YAW_ANGLE}°")
            print(f"{worker_prefix}  - Max pitch (up/down): ±{MAX_PITCH_ANGLE}°")
    else:
        print(f"{worker_prefix}Quality filtering DISABLED (--no-quality-filter)")

    # Parse metadata files
    print(f"\n{worker_prefix}Parsing metadata files...")
    actors = parse_metadata(ACTORS_FILE)
    actresses = parse_metadata(ACTRESSES_FILE)
    all_entries = actors + actresses
    print(f"{worker_prefix}  Total entries: {len(all_entries):,}")

    # Group by person (maintain sorted order for consistent ranges)
    people_dict = defaultdict(list)
    for entry in all_entries:
        people_dict[entry['name']].append(entry)

    # Sort people names for consistent ordering across workers
    all_people = sorted(people_dict.keys())
    print(f"{worker_prefix}  Total people: {len(all_people)}")

    # Select people based on mode
    if args.full:
        # Full download - all people
        selected_people = all_people
        print(f"\n{worker_prefix}Downloading ALL {len(selected_people)} people...")
    elif args.people is not None:
        # Legacy mode - first N people
        selected_people = all_people[:args.people]
        print(f"\n{worker_prefix}Downloading first {args.people} people...")
    else:
        # Worker range mode
        start_idx = args.people_start
        end_idx = args.people_end if args.people_end is not None else len(all_people)
        selected_people = all_people[start_idx:end_idx]
        print(f"\n{worker_prefix}Downloading people {start_idx} to {end_idx} ({len(selected_people)} people)...")

    images_per_person = args.images

    # Prepare download tasks
    tasks = []
    person_task_counts = {}  # Track tasks per person

    for person_name in selected_people:
        person_entries = people_dict[person_name][:images_per_person]
        person_task_counts[person_name] = len(person_entries)

        for entry in person_entries:
            # Create safe filename
            safe_name = "".join(c if c.isalnum() or c in ' -_' else '_' for c in person_name)
            ext = get_file_extension(entry['url'])
            filename = f"{entry['face_id']}{ext}"
            save_path = OUTPUT_DIR / safe_name / filename

            tasks.append({
                'url': entry['url'],
                'save_path': save_path,
                'sha256': entry['sha256'] if args.verify else None,
                'name': person_name,
                'face_id': entry['face_id']
            })

    print(f"{worker_prefix}  Tasks prepared: {len(tasks)}")
    print(f"{worker_prefix}  Max images per person: {images_per_person}")
    print(f"{worker_prefix}  Output directory: {OUTPUT_DIR}")

    # Download with progress
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

    # Track results per person
    person_results = defaultdict(lambda: {'loaded': 0, 'ignored': 0, 'errors': defaultdict(int)})

    global_results = {
        'downloaded': 0,
        'already_exists': 0,
        'failed': 0,
        'errors': defaultdict(int)
    }

    print(f"\n{worker_prefix}Downloading with {args.workers} threads...")
    print("-" * 70)

    start_time = time.time()

    with ThreadPoolExecutor(max_workers=args.workers) as executor:
        futures = {
            executor.submit(download_image, t['url'], t['save_path'], t['sha256'], check_quality): t
            for t in tasks
        }

        completed_per_person = defaultdict(int)

        for i, future in enumerate(as_completed(futures), 1):
            task = futures[future]
            person_name = task['name']
            success, status = future.result()

            completed_per_person[person_name] += 1

            if success:
                if status == 'downloaded':
                    global_results['downloaded'] += 1
                    person_results[person_name]['loaded'] += 1
                else:  # already_exists
                    global_results['already_exists'] += 1
                    person_results[person_name]['loaded'] += 1
            else:
                global_results['failed'] += 1
                global_results['errors'][status] += 1
                person_results[person_name]['ignored'] += 1
                person_results[person_name]['errors'][status] += 1

            # Check if person is complete and print summary
            if completed_per_person[person_name] == person_task_counts[person_name]:
                pr = person_results[person_name]
                person_idx = selected_people.index(person_name) + 1
                total_loaded = sum(p['loaded'] for p in person_results.values())
                total_processed = sum(p['loaded'] + p['ignored'] for p in person_results.values())
                print(f"{worker_prefix}[{person_idx}/{len(selected_people)}] {person_name}: "
                      f"{pr['loaded']} loaded, {pr['ignored']} ignored "
                      f"(total: {total_loaded}/{total_processed})")

    elapsed = time.time() - start_time

    print("-" * 70)
    print(f"\n{worker_prefix}=== Summary ===")
    print(f"{worker_prefix}Time elapsed: {elapsed:.1f} seconds")
    print(f"{worker_prefix}Downloaded: {global_results['downloaded']}")
    print(f"{worker_prefix}Already existed: {global_results['already_exists']}")
    print(f"{worker_prefix}Failed: {global_results['failed']}")

    total_loaded = global_results['downloaded'] + global_results['already_exists']
    total_processed = total_loaded + global_results['failed']
    pass_rate = (total_loaded / total_processed * 100) if total_processed > 0 else 0

    print(f"\n{worker_prefix}Total: {total_loaded} loaded, {global_results['failed']} ignored")
    print(f"{worker_prefix}Pass rate: {pass_rate:.1f}%")

    if global_results['errors']:
        print(f"\n{worker_prefix}Error breakdown:")
        for error, count in sorted(global_results['errors'].items(), key=lambda x: -x[1])[:10]:
            print(f"{worker_prefix}    {error}: {count}")

    # Count actual downloaded
    if OUTPUT_DIR.exists():
        downloaded_dirs = sorted([d.name for d in OUTPUT_DIR.iterdir() if d.is_dir()])
        total_images = sum(len(list((OUTPUT_DIR / d).glob('*'))) for d in downloaded_dirs)
        print(f"\n{worker_prefix}Output: {len(downloaded_dirs)} people, {total_images} images in {OUTPUT_DIR}")

    print("\n" + "=" * 70)
    print(f"{worker_prefix}Done!")

    return 0 if global_results['failed'] < total_processed * 0.5 else 1  # Allow up to 50% failure


if __name__ == '__main__':
    sys.exit(main())
