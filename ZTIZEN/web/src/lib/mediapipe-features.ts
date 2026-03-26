/**
 * MediaPipe Feature Extraction for ZITZEN
 *
 * Converts MediaPipe's 478 facial landmarks into a 128-dimensional
 * feature vector compatible with the ZITZEN digestor.
 *
 * Strategy: Extract geometric features (distances, angles, ratios)
 * from key facial landmarks to create a stable biometric template.
 */

interface Landmark {
  x: number;
  y: number;
  z: number;
}

/**
 * Calculate Euclidean distance between two 3D landmarks
 */
function euclideanDistance(p1: Landmark, p2: Landmark): number {
  const dx = p1.x - p2.x;
  const dy = p1.y - p2.y;
  const dz = p1.z - p2.z;
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

/**
 * Calculate angle between three points (in radians)
 */
function calculateAngle(p1: Landmark, p2: Landmark, p3: Landmark): number {
  const v1 = {
    x: p1.x - p2.x,
    y: p1.y - p2.y,
    z: p1.z - p2.z
  };
  const v2 = {
    x: p3.x - p2.x,
    y: p3.y - p2.y,
    z: p3.z - p2.z
  };

  const dot = v1.x * v2.x + v1.y * v2.y + v1.z * v2.z;
  const mag1 = Math.sqrt(v1.x * v1.x + v1.y * v1.y + v1.z * v1.z);
  const mag2 = Math.sqrt(v2.x * v2.x + v2.y * v2.y + v2.z * v2.z);

  if (mag1 === 0 || mag2 === 0) return 0;

  const cosAngle = dot / (mag1 * mag2);
  return Math.acos(Math.max(-1, Math.min(1, cosAngle)));
}

/**
 * Extract 128 geometric features from MediaPipe's 478 landmarks
 *
 * Feature groups:
 * - Facial dimensions (distances): 40 features
 * - Eye features: 20 features
 * - Nose features: 15 features
 * - Mouth features: 25 features
 * - Face contour: 20 features
 * - Angular features: 8 features
 *
 * @param landmarks - Array of 478 MediaPipe landmarks (each with x, y, z)
 * @returns 128-dimensional feature vector
 */
export function extractBiometricFeatures(landmarks: any[]): number[] {
  const features: number[] = [];

  // Validate input
  if (!landmarks || landmarks.length !== 478) {
    throw new Error(`Expected 478 landmarks, got ${landmarks?.length || 0}`);
  }

  // Convert to typed landmarks
  const lm: Landmark[] = landmarks.map(l => ({ x: l.x, y: l.y, z: l.z }));

  // === GROUP 1: Facial Dimensions (40 features) ===

  // Inter-eye distance (1 feature)
  const leftEyeCenter = lm[33];
  const rightEyeCenter = lm[263];
  features.push(euclideanDistance(leftEyeCenter, rightEyeCenter));

  // Eye-to-nose distances (2 features)
  const noseTip = lm[1];
  features.push(euclideanDistance(leftEyeCenter, noseTip));
  features.push(euclideanDistance(rightEyeCenter, noseTip));

  // Nose-to-mouth distance (1 feature)
  const upperLip = lm[13];
  features.push(euclideanDistance(noseTip, upperLip));

  // Eye-to-mouth distances (2 features)
  features.push(euclideanDistance(leftEyeCenter, upperLip));
  features.push(euclideanDistance(rightEyeCenter, upperLip));

  // Face width at different heights (4 features)
  features.push(euclideanDistance(lm[234], lm[454])); // Cheek width
  features.push(euclideanDistance(lm[132], lm[361])); // Mid-face width
  features.push(euclideanDistance(lm[127], lm[356])); // Lower face width
  features.push(euclideanDistance(lm[93], lm[323]));  // Jaw width

  // Face height segments (4 features)
  const foreheadTop = lm[10];
  const chinBottom = lm[152];
  features.push(euclideanDistance(foreheadTop, leftEyeCenter));
  features.push(euclideanDistance(leftEyeCenter, noseTip));
  features.push(euclideanDistance(noseTip, upperLip));
  features.push(euclideanDistance(upperLip, chinBottom));

  // Eyebrow positions (4 features)
  const leftBrowInner = lm[70];
  const leftBrowOuter = lm[46];
  const rightBrowInner = lm[300];
  const rightBrowOuter = lm[276];
  features.push(euclideanDistance(leftBrowInner, leftEyeCenter));
  features.push(euclideanDistance(leftBrowOuter, leftEyeCenter));
  features.push(euclideanDistance(rightBrowInner, rightEyeCenter));
  features.push(euclideanDistance(rightBrowOuter, rightEyeCenter));

  // Additional facial ratios (22 features)
  for (let i = 0; i < 22; i++) {
    const idx1 = Math.floor((i * 19) % 468);
    const idx2 = Math.floor((i * 23 + 100) % 468);
    features.push(euclideanDistance(lm[idx1], lm[idx2]));
  }

  // === GROUP 2: Eye Features (20 features) ===

  // Left eye landmarks
  const leftEyeTop = lm[159];
  const leftEyeBottom = lm[145];
  const leftEyeLeft = lm[33];
  const leftEyeRight = lm[133];

  // Left eye dimensions (3 features)
  features.push(euclideanDistance(leftEyeTop, leftEyeBottom)); // Height
  features.push(euclideanDistance(leftEyeLeft, leftEyeRight)); // Width
  features.push(euclideanDistance(leftEyeTop, leftEyeRight)); // Diagonal

  // Right eye landmarks
  const rightEyeTop = lm[386];
  const rightEyeBottom = lm[374];
  const rightEyeLeft = lm[362];
  const rightEyeRight = lm[263];

  // Right eye dimensions (3 features)
  features.push(euclideanDistance(rightEyeTop, rightEyeBottom));
  features.push(euclideanDistance(rightEyeLeft, rightEyeRight));
  features.push(euclideanDistance(rightEyeTop, rightEyeRight));

  // Eye corner features (4 features)
  features.push(euclideanDistance(lm[33], lm[133]));   // Left eye span
  features.push(euclideanDistance(lm[362], lm[263]));  // Right eye span
  features.push(euclideanDistance(lm[133], lm[362]));  // Inner corners distance
  features.push(euclideanDistance(lm[33], lm[263]));   // Outer corners distance

  // Iris positions (4 features)
  const leftIris = lm[468];
  const rightIris = lm[473];
  features.push(euclideanDistance(leftIris, leftEyeCenter));
  features.push(euclideanDistance(rightIris, rightEyeCenter));
  features.push(euclideanDistance(leftIris, noseTip));
  features.push(euclideanDistance(rightIris, noseTip));

  // Additional eye features (6 features)
  for (let i = 0; i < 6; i++) {
    const idx = 130 + i * 10;
    if (idx < 478) {
      features.push(euclideanDistance(lm[idx], leftEyeCenter));
    } else {
      features.push(0);
    }
  }

  // === GROUP 3: Nose Features (15 features) ===

  const noseBridge = lm[6];
  const noseLeft = lm[98];
  const noseRight = lm[327];
  const leftNostril = lm[129];
  const rightNostril = lm[358];

  // Nose bridge to tip (1 feature)
  features.push(euclideanDistance(noseBridge, noseTip));

  // Nostril width (1 feature)
  features.push(euclideanDistance(leftNostril, rightNostril));

  // Nose width at different heights (2 features)
  features.push(euclideanDistance(noseLeft, noseRight));
  features.push(euclideanDistance(lm[141], lm[370]));

  // Nose to face features (4 features)
  features.push(euclideanDistance(noseTip, lm[234])); // Left cheek
  features.push(euclideanDistance(noseTip, lm[454])); // Right cheek
  features.push(euclideanDistance(noseBridge, foreheadTop));
  features.push(euclideanDistance(noseBridge, chinBottom));

  // Additional nose features (7 features)
  for (let i = 0; i < 7; i++) {
    const idx = 195 + i * 5;
    if (idx < 478) {
      features.push(euclideanDistance(lm[idx], noseTip));
    } else {
      features.push(0);
    }
  }

  // === GROUP 4: Mouth Features (25 features) ===

  const lowerLip = lm[14];
  const leftMouthCorner = lm[61];
  const rightMouthCorner = lm[291];

  // Mouth width and height (2 features)
  features.push(euclideanDistance(leftMouthCorner, rightMouthCorner));
  features.push(euclideanDistance(upperLip, lowerLip));

  // Mouth to face features (4 features)
  features.push(euclideanDistance(upperLip, noseTip));
  features.push(euclideanDistance(lowerLip, chinBottom));
  features.push(euclideanDistance(leftMouthCorner, leftEyeCenter));
  features.push(euclideanDistance(rightMouthCorner, rightEyeCenter));

  // Lip contour features (10 features)
  const lipIndices = [0, 37, 39, 40, 61, 78, 80, 82, 84, 87];
  for (const idx of lipIndices) {
    features.push(euclideanDistance(lm[idx], upperLip));
  }

  // Additional mouth features (9 features)
  for (let i = 0; i < 9; i++) {
    const idx = 57 + i * 3;
    features.push(euclideanDistance(lm[idx], upperLip));
  }

  // === GROUP 5: Face Contour (20 features) ===

  // Face oval landmarks
  const faceOvalIndices = [10, 338, 297, 332, 284, 251, 389, 356, 454, 323, 361, 288, 397, 365, 379, 378, 400, 377, 152, 148];

  for (let i = 0; i < faceOvalIndices.length; i++) {
    const idx = faceOvalIndices[i];
    const centerX = landmarks.reduce((sum: number, l: any) => sum + l.x, 0) / 478;
    const centerY = landmarks.reduce((sum: number, l: any) => sum + l.y, 0) / 478;
    const centerZ = landmarks.reduce((sum: number, l: any) => sum + l.z, 0) / 478;
    const center = { x: centerX, y: centerY, z: centerZ };

    features.push(euclideanDistance(lm[idx], center));
  }

  // === GROUP 6: Angular Features (8 features) ===

  // Eye angles
  features.push(calculateAngle(leftBrowOuter, leftEyeCenter, leftBrowInner));
  features.push(calculateAngle(rightBrowOuter, rightEyeCenter, rightBrowInner));

  // Nose angles
  features.push(calculateAngle(leftEyeCenter, noseBridge, rightEyeCenter));
  features.push(calculateAngle(noseBridge, noseTip, upperLip));

  // Mouth angles
  features.push(calculateAngle(leftMouthCorner, upperLip, rightMouthCorner));
  features.push(calculateAngle(leftMouthCorner, lowerLip, rightMouthCorner));

  // Face profile angles
  features.push(calculateAngle(foreheadTop, noseTip, chinBottom));
  features.push(calculateAngle(leftEyeCenter, noseTip, rightEyeCenter));

  // Normalize features to 0-1 range (approximate)
  const normalizedFeatures = features.map(f => {
    // Clamp to reasonable range and normalize
    const clamped = Math.max(0, Math.min(1, f * 10));
    return clamped;
  });

  // Ensure we have exactly 128 features
  if (normalizedFeatures.length < 128) {
    // Pad with zeros if needed
    while (normalizedFeatures.length < 128) {
      normalizedFeatures.push(0);
    }
  } else if (normalizedFeatures.length > 128) {
    // Trim if we have too many
    normalizedFeatures.length = 128;
  }

  console.log('MediaPipe feature extraction:', {
    input_landmarks: landmarks.length,
    output_features: normalizedFeatures.length,
    feature_range: [Math.min(...normalizedFeatures), Math.max(...normalizedFeatures)]
  });

  return normalizedFeatures;
}

/**
 * Calculate similarity between two feature vectors
 * Returns cosine similarity (0-1, where 1 is identical)
 */
export function calculateSimilarity(features1: number[], features2: number[]): number {
  if (features1.length !== features2.length) {
    throw new Error('Feature vectors must have same length');
  }

  let dotProduct = 0;
  let magnitude1 = 0;
  let magnitude2 = 0;

  for (let i = 0; i < features1.length; i++) {
    dotProduct += features1[i] * features2[i];
    magnitude1 += features1[i] * features1[i];
    magnitude2 += features2[i] * features2[i];
  }

  magnitude1 = Math.sqrt(magnitude1);
  magnitude2 = Math.sqrt(magnitude2);

  if (magnitude1 === 0 || magnitude2 === 0) {
    return 0;
  }

  return dotProduct / (magnitude1 * magnitude2);
}
