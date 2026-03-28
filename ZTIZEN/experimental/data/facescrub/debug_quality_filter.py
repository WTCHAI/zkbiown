#!/usr/bin/env python3 -u
"""
Debug Quality Filter - Shows visual examples of each rejection reason.

Saves rejected images to debug_output/ folder organized by rejection reason,
so you can visually verify the filters are working correctly.
"""

import os
import sys
import csv
import urllib.request
from pathlib import Path
from collections import defaultdict
import time

# Configuration
SCRIPT_DIR = Path(__file__).parent
ACTORS_FILE = SCRIPT_DIR / "facescrub_actors.txt"
ACTRESSES_FILE = SCRIPT_DIR / "facescrub_actresses.txt"
DEBUG_OUTPUT_DIR = SCRIPT_DIR / "debug_output"
TIMEOUT = 15

# Quality thresholds - STRICT for authentication dataset
MIN_CONFIDENCE = 0.95
MIN_FACE_AREA_RATIO = 0.10
MAX_FACE_AREA_RATIO = 0.90
MIN_BLUR_SCORE = 100.0
REQUIRE_SINGLE_FACE = True
MAX_YAW_ANGLE = 20.0
MAX_PITCH_ANGLE = 25.0

# Lazy-loaded
_detector = None
_cv2 = None
_numpy = None

def get_face_detector():
    global _detector, _cv2, _numpy
    if _detector is None:
        from retinaface import RetinaFace
        import cv2
        import numpy as np
        _detector = RetinaFace
        _cv2 = cv2
        _numpy = np
    return _detector, _cv2, _numpy


def calculate_blur_score(img, face_area, cv2):
    x1, y1, x2, y2 = face_area
    h, w = img.shape[:2]
    pad = int((x2 - x1) * 0.1)
    x1, y1 = max(0, x1 - pad), max(0, y1 - pad)
    x2, y2 = min(w, x2 + pad), min(h, y2 + pad)
    face_roi = img[y1:y2, x1:x2]
    if face_roi.size == 0:
        return 0.0
    gray = cv2.cvtColor(face_roi, cv2.COLOR_BGR2GRAY)
    laplacian = cv2.Laplacian(gray, cv2.CV_64F)
    return laplacian.var()


def estimate_pose(landmarks, np):
    try:
        left_eye = np.array(landmarks['left_eye'])
        right_eye = np.array(landmarks['right_eye'])
        nose = np.array(landmarks['nose'])
        mouth_left = np.array(landmarks['mouth_left'])
        mouth_right = np.array(landmarks['mouth_right'])

        eye_center = (left_eye + right_eye) / 2
        mouth_center = (mouth_left + mouth_right) / 2
        eye_width = np.linalg.norm(right_eye - left_eye)

        if eye_width < 1:
            return 0, 0

        nose_offset_x = nose[0] - eye_center[0]
        yaw = np.degrees(np.arcsin(np.clip(nose_offset_x / (eye_width * 0.5), -1, 1)))

        eye_to_nose = np.linalg.norm(nose - eye_center)
        nose_to_mouth = np.linalg.norm(mouth_center - nose)

        if nose_to_mouth > 0:
            ratio = eye_to_nose / nose_to_mouth
            pitch = (ratio - 1.0) * 30
            pitch = np.clip(pitch, -45, 45)
        else:
            pitch = 0

        return float(yaw), float(pitch)
    except:
        return 0, 0


def analyze_image(image_data: bytes) -> dict:
    """Analyze image and return detailed quality metrics."""
    detector, cv2, np = get_face_detector()

    result = {
        'passed': False,
        'reason': None,
        'metrics': {},
        'faces': []
    }

    try:
        nparr = np.frombuffer(image_data, np.uint8)
        img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)

        if img is None:
            result['reason'] = 'decode_failed'
            return result

        img_height, img_width = img.shape[:2]
        img_area = img_height * img_width
        result['metrics']['image_size'] = f"{img_width}x{img_height}"

        if img_width < 100 or img_height < 100:
            result['reason'] = 'img_too_small'
            return result

        faces = detector.detect_faces(img)

        if not faces:
            result['reason'] = 'no_face'
            return result

        result['metrics']['face_count'] = len(faces)

        # Analyze all faces
        for face_key, face_data in faces.items():
            confidence = face_data.get('score', 0)
            facial_area = face_data.get('facial_area', [0, 0, 0, 0])
            x1, y1, x2, y2 = facial_area
            face_area = (x2 - x1) * (y2 - y1)
            area_ratio = face_area / img_area if img_area > 0 else 0

            landmarks = face_data.get('landmarks', {})
            yaw, pitch = estimate_pose(landmarks, np) if landmarks else (0, 0)

            result['faces'].append({
                'confidence': confidence,
                'area_ratio': area_ratio,
                'yaw': yaw,
                'pitch': pitch,
                'bbox': facial_area
            })

        # Check multi-face
        high_conf_faces = [f for f in result['faces'] if f['confidence'] >= 0.5]
        if REQUIRE_SINGLE_FACE and len(high_conf_faces) > 1:
            result['reason'] = f'multi_face:{len(high_conf_faces)}'
            result['metrics']['high_conf_faces'] = len(high_conf_faces)
            return result

        # Get best face
        best_face = max(result['faces'], key=lambda f: f['confidence'])
        result['metrics']['confidence'] = best_face['confidence']
        result['metrics']['area_ratio'] = best_face['area_ratio']
        result['metrics']['yaw'] = best_face['yaw']
        result['metrics']['pitch'] = best_face['pitch']

        # Check confidence
        if best_face['confidence'] < MIN_CONFIDENCE:
            result['reason'] = f"low_conf:{best_face['confidence']:.2f}"
            return result

        # Check face area
        if best_face['area_ratio'] < MIN_FACE_AREA_RATIO:
            result['reason'] = f"face_small:{best_face['area_ratio']:.2f}"
            return result

        if best_face['area_ratio'] > MAX_FACE_AREA_RATIO:
            result['reason'] = f"face_large:{best_face['area_ratio']:.2f}"
            return result

        # Check blur
        blur_score = calculate_blur_score(img, best_face['bbox'], cv2)
        result['metrics']['blur_score'] = blur_score
        if blur_score < MIN_BLUR_SCORE:
            result['reason'] = f"blurry:{blur_score:.0f}"
            return result

        # Check pose
        if abs(best_face['yaw']) > MAX_YAW_ANGLE:
            result['reason'] = f"side_face:yaw{best_face['yaw']:.0f}"
            return result

        if abs(best_face['pitch']) > MAX_PITCH_ANGLE:
            result['reason'] = f"tilt_face:pitch{best_face['pitch']:.0f}"
            return result

        result['passed'] = True
        result['reason'] = 'passed'
        return result

    except Exception as e:
        result['reason'] = f"error:{str(e)[:30]}"
        return result


def draw_debug_image(image_data: bytes, analysis: dict) -> bytes:
    """Draw bounding boxes and metrics on image for debugging."""
    detector, cv2, np = get_face_detector()

    nparr = np.frombuffer(image_data, np.uint8)
    img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)

    if img is None:
        return image_data

    # Colors
    GREEN = (0, 255, 0)
    RED = (0, 0, 255)
    YELLOW = (0, 255, 255)
    WHITE = (255, 255, 255)

    color = GREEN if analysis['passed'] else RED

    # Draw face boxes
    for i, face in enumerate(analysis.get('faces', [])):
        bbox = face.get('bbox', [0, 0, 0, 0])
        x1, y1, x2, y2 = [int(v) for v in bbox]

        # Box color based on confidence
        box_color = GREEN if face['confidence'] >= MIN_CONFIDENCE else YELLOW
        if not analysis['passed']:
            box_color = RED

        cv2.rectangle(img, (x1, y1), (x2, y2), box_color, 2)

        # Label with metrics
        label = f"conf:{face['confidence']:.2f} area:{face['area_ratio']:.2f}"
        cv2.putText(img, label, (x1, y1 - 25), cv2.FONT_HERSHEY_SIMPLEX, 0.5, box_color, 2)

        label2 = f"yaw:{face['yaw']:.0f} pitch:{face['pitch']:.0f}"
        cv2.putText(img, label2, (x1, y1 - 8), cv2.FONT_HERSHEY_SIMPLEX, 0.5, box_color, 2)

    # Draw rejection reason at top
    reason = analysis.get('reason', 'unknown')
    status = "PASSED" if analysis['passed'] else f"REJECTED: {reason}"
    cv2.putText(img, status, (10, 30), cv2.FONT_HERSHEY_SIMPLEX, 0.8, color, 2)

    # Draw blur score if available
    blur = analysis.get('metrics', {}).get('blur_score')
    if blur is not None:
        cv2.putText(img, f"blur:{blur:.0f}", (10, 55), cv2.FONT_HERSHEY_SIMPLEX, 0.6, WHITE, 2)

    # Encode back to bytes
    _, encoded = cv2.imencode('.jpg', img)
    return encoded.tobytes()


def parse_metadata(file_path: Path) -> list[dict]:
    entries = []
    with open(file_path, 'r', encoding='utf-8') as f:
        reader = csv.DictReader(f, delimiter='\t')
        for row in reader:
            entries.append(row)
    return entries


def download_image(url: str):
    try:
        request = urllib.request.Request(
            url,
            headers={'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)'}
        )
        with urllib.request.urlopen(request, timeout=TIMEOUT) as response:
            data = response.read()

        if len(data) < 100:
            return None, "too_small"

        if not (data[:2] == b'\xff\xd8' or data[:4] == b'\x89PNG'):
            return None, "not_image"

        return data, "ok"
    except Exception as e:
        return None, str(e)[:30]


def main():
    print("=" * 70)
    print("Quality Filter Debug Tool")
    print("=" * 70)
    print(f"\nThresholds:")
    print(f"  - Min confidence: {MIN_CONFIDENCE} ({int(MIN_CONFIDENCE*100)}%)")
    print(f"  - Face area: {MIN_FACE_AREA_RATIO}-{MAX_FACE_AREA_RATIO}")
    print(f"  - Min blur score: {MIN_BLUR_SCORE}")
    print(f"  - Single face only: {REQUIRE_SINGLE_FACE}")
    print(f"  - Max yaw: ±{MAX_YAW_ANGLE}°")
    print(f"  - Max pitch: ±{MAX_PITCH_ANGLE}°")
    print()

    # Parse metadata
    print("Parsing metadata...")
    actors = parse_metadata(ACTORS_FILE)
    actresses = parse_metadata(ACTRESSES_FILE)
    all_entries = actors + actresses

    people_dict = defaultdict(list)
    for entry in all_entries:
        people_dict[entry['name']].append(entry)

    all_people = sorted(people_dict.keys())

    # Test first 2 people with 30 images each
    test_people = all_people[:2]
    max_images = 30

    # Create output directories
    DEBUG_OUTPUT_DIR.mkdir(exist_ok=True)
    for reason_dir in ['passed', 'side_face', 'tilt_face', 'face_small', 'blurry',
                       'low_conf', 'multi_face', 'no_face', 'download_error']:
        (DEBUG_OUTPUT_DIR / reason_dir).mkdir(exist_ok=True)

    print(f"\nTesting {len(test_people)} people, {max_images} images each")
    print(f"Output: {DEBUG_OUTPUT_DIR}")
    print("-" * 70)

    stats = defaultdict(int)

    for person_name in test_people:
        print(f"\n📁 {person_name}")
        entries = people_dict[person_name][:max_images]

        for i, entry in enumerate(entries):
            face_id = entry['face_id']
            url = entry['url']

            # Download
            data, dl_status = download_image(url)

            if data is None:
                stats['download_error'] += 1
                print(f"  [{i+1}/{len(entries)}] {face_id}: ❌ download failed ({dl_status})")
                continue

            # Analyze
            analysis = analyze_image(data)
            reason = analysis['reason']

            # Categorize reason
            if analysis['passed']:
                category = 'passed'
                stats['passed'] += 1
                symbol = '✅'
            elif reason.startswith('side_face'):
                category = 'side_face'
                stats['side_face'] += 1
                symbol = '👈'
            elif reason.startswith('tilt_face'):
                category = 'tilt_face'
                stats['tilt_face'] += 1
                symbol = '👆'
            elif reason.startswith('face_small'):
                category = 'face_small'
                stats['face_small'] += 1
                symbol = '🔍'
            elif reason.startswith('blurry'):
                category = 'blurry'
                stats['blurry'] += 1
                symbol = '💨'
            elif reason.startswith('low_conf'):
                category = 'low_conf'
                stats['low_conf'] += 1
                symbol = '❓'
            elif reason.startswith('multi_face'):
                category = 'multi_face'
                stats['multi_face'] += 1
                symbol = '👥'
            elif reason == 'no_face':
                category = 'no_face'
                stats['no_face'] += 1
                symbol = '🚫'
            else:
                category = 'download_error'
                stats['other'] += 1
                symbol = '❌'

            # Draw debug image and save
            debug_data = draw_debug_image(data, analysis)
            safe_name = "".join(c if c.isalnum() or c in ' -_' else '_' for c in person_name)
            output_path = DEBUG_OUTPUT_DIR / category / f"{safe_name}_{face_id}.jpg"

            with open(output_path, 'wb') as f:
                f.write(debug_data)

            # Print with metrics
            metrics = analysis.get('metrics', {})
            conf = metrics.get('confidence', 0)
            area = metrics.get('area_ratio', 0)
            yaw = metrics.get('yaw', 0)
            pitch = metrics.get('pitch', 0)
            blur = metrics.get('blur_score', 0)

            print(f"  [{i+1}/{len(entries)}] {face_id}: {symbol} {reason}")
            print(f"       conf={conf:.2f} area={area:.2f} yaw={yaw:.0f}° pitch={pitch:.0f}° blur={blur:.0f}")

    # Summary
    print("\n" + "=" * 70)
    print("SUMMARY")
    print("=" * 70)
    total = sum(stats.values())
    for reason, count in sorted(stats.items(), key=lambda x: -x[1]):
        pct = count / total * 100 if total > 0 else 0
        print(f"  {reason}: {count} ({pct:.1f}%)")

    print(f"\nTotal: {total}")
    print(f"Pass rate: {stats['passed'] / total * 100:.1f}%" if total > 0 else "N/A")

    print(f"\n📂 Debug images saved to: {DEBUG_OUTPUT_DIR}")
    print("   Open each folder to see examples of each rejection type!")


if __name__ == '__main__':
    main()
