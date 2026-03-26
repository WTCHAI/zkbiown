/**
 * Test Different Dimension Combinations
 *
 * Tests: X-only, Y-only, Z-only, XY, XZ, YZ, XYZ
 * Note: For browser ZK, dimensions are downsampled to 128 for WASM compatibility
 */

import type { Landmark } from './biohashing-mediapipe';

export type DimensionMode = 'x' | 'y' | 'z' | 'xy' | 'xz' | 'yz' | 'xyz';

/**
 * Extract biometric with specific dimension combination
 */
export function extractBiometricWithMode(
  faceLandmarks: Landmark[],
  mode: DimensionMode
): { values: number[]; dimensionCount: number } {
  if (faceLandmarks.length !== 478) {
    throw new Error(`Expected 478 landmarks, got ${faceLandmarks.length}`);
  }

  const values: number[] = [];

  for (let i = 0; i < faceLandmarks.length; i++) {
    const lm = faceLandmarks[i];

    // Normalize to [-1, 1] range
    const normX = (lm.x * 2) - 1;
    const normY = (lm.y * 2) - 1;
    const normZ = lm.z; // Z already in reasonable range

    switch (mode) {
      case 'x':
        values.push(normX);
        break;
      case 'y':
        values.push(normY);
        break;
      case 'z':
        values.push(normZ);
        break;
      case 'xy':
        values.push(normX);
        values.push(normY);
        break;
      case 'xz':
        values.push(normX);
        values.push(normZ);
        break;
      case 'yz':
        values.push(normY);
        values.push(normZ);
        break;
      case 'xyz':
        values.push(normX);
        values.push(normY);
        values.push(normZ);
        break;
    }
  }

  return {
    values,
    dimensionCount: values.length,
  };
}

/**
 * Get dimension info
 */
export function getDimensionInfo(mode: DimensionMode): {
  name: string;
  dimensions: number;
  digestBytes: number;
  description: string;
} {
  const info = {
    x: {
      name: 'X only',
      dimensions: 478,
      digestBytes: 60,
      description: 'Horizontal position only',
    },
    y: {
      name: 'Y only',
      dimensions: 478,
      digestBytes: 60,
      description: 'Vertical position only',
    },
    z: {
      name: 'Z only',
      dimensions: 478,
      digestBytes: 60,
      description: 'Depth only (unstable with distance)',
    },
    xy: {
      name: 'X,Y',
      dimensions: 956,
      digestBytes: 120,
      description: 'Position (x,y) - stable',
    },
    xz: {
      name: 'X,Z',
      dimensions: 956,
      digestBytes: 120,
      description: 'Horizontal + depth',
    },
    yz: {
      name: 'Y,Z',
      dimensions: 956,
      digestBytes: 120,
      description: 'Vertical + depth',
    },
    xyz: {
      name: 'X,Y,Z',
      dimensions: 1434,
      digestBytes: 180,
      description: 'Full 3D (depth varies with distance)',
    },
  };

  return info[mode];
}

/**
 * All dimension modes to test
 */
export const ALL_DIMENSION_MODES: DimensionMode[] = ['x', 'y', 'z', 'xy', 'xz', 'yz', 'xyz'];
