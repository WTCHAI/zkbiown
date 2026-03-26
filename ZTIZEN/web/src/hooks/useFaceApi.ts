/**
 * useFaceApi Hook - face-api.js 128D Embeddings
 *
 * This hook provides face detection and recognition using face-api.js,
 * which produces 128-dimensional face descriptors (embeddings).
 *
 * These embeddings are used instead of MediaPipe landmarks for:
 * - Better biometric recognition accuracy
 * - Smaller vector size (128 vs 956 dimensions)
 * - Industry-standard face recognition approach
 *
 * Note: MediaPipe is still used for visual face mesh overlay (UI only).
 *
 * EAGER LOADING: Models start loading immediately when this module is imported.
 * This ensures models are ready by the time user reaches the capture screen.
 */

import { useState, useCallback, useEffect } from 'react';
import * as faceapi from 'face-api.js';
import { useMetricsStore, METRIC_OPERATIONS } from '@/stores/useMetricsStore';

// Singleton state (persists across component remounts)
let modelsLoaded = false;
let loadingPromise: Promise<void> | null = null;

/**
 * Eagerly load face-api.js models at module import time
 * This runs once when the app starts, not when component mounts
 */
function eagerLoadModels(): Promise<void> {
  if (modelsLoaded) return Promise.resolve();
  if (loadingPromise) return loadingPromise;

  console.log('📥 [Eager] Loading face-api.js models at app startup...');
  const startTime = performance.now();

  loadingPromise = (async () => {
    try {
      // Load required models in parallel
      // Using TinyFaceDetector for faster detection (vs SSD MobileNetV1)
      await Promise.all([
        faceapi.nets.tinyFaceDetector.loadFromUri('/models'),
        faceapi.nets.faceLandmark68TinyNet.loadFromUri('/models'),
        faceapi.nets.faceRecognitionNet.loadFromUri('/models'),
      ]);

      modelsLoaded = true;
      const loadTime = ((performance.now() - startTime) / 1000).toFixed(2);
      console.log(`✅ [Eager] face-api.js models loaded in ${loadTime}s`);

      // Pre-warm the model with a dummy detection (first inference is always slow)
      // This runs the model once so subsequent calls are faster
      const warmupCanvas = document.createElement('canvas');
      warmupCanvas.width = 100;
      warmupCanvas.height = 100;
      const ctx = warmupCanvas.getContext('2d')!;
      ctx.fillStyle = '#888';
      ctx.fillRect(0, 0, 100, 100);

      console.log('🔥 [Eager] Pre-warming face recognition model...');
      const warmupStart = performance.now();
      try {
        await faceapi
          .detectSingleFace(warmupCanvas, new faceapi.TinyFaceDetectorOptions({ inputSize: 160 }))
          .withFaceLandmarks(true)
          .withFaceDescriptor();
      } catch {
        // Expected to fail (no face in dummy image), but model is now warm
      }
      const warmupTime = ((performance.now() - warmupStart) / 1000).toFixed(2);
      console.log(`✅ [Eager] Model pre-warmed in ${warmupTime}s (next detection will be faster)`);
    } catch (err) {
      console.error('❌ [Eager] Failed to load face-api.js models:', err);
      loadingPromise = null; // Allow retry
      throw err;
    }
  })();

  return loadingPromise;
}

/**
 * Resize video frame for faster processing
 * face-api.js processes smaller images much faster
 */
function createResizedCanvas(video: HTMLVideoElement, maxSize: number = 320): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  const scale = Math.min(maxSize / video.videoWidth, maxSize / video.videoHeight);
  canvas.width = Math.round(video.videoWidth * scale);
  canvas.height = Math.round(video.videoHeight * scale);

  const ctx = canvas.getContext('2d')!;
  ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

  return canvas;
}

// Start loading immediately when module is imported
eagerLoadModels().catch(() => {
  // Silently catch - will retry when hook is used
});

export interface UseFaceApiReturn {
  isLoaded: boolean;
  isLoading: boolean;
  error: Error | null;
  detectFace: (video: HTMLVideoElement) => Promise<Float32Array | null>;
  loadModels: () => Promise<void>;
}

/**
 * Hook for face-api.js face detection and recognition
 *
 * @returns Object with loading state and detection function
 *
 * @example
 * ```tsx
 * const { isLoaded, loadModels, detectFace } = useFaceApi();
 *
 * useEffect(() => { loadModels(); }, [loadModels]);
 *
 * const handleCapture = async () => {
 *   const descriptor = await detectFace(videoRef.current!);
 *   if (descriptor) {
 *     console.log('128D face descriptor:', descriptor);
 *   }
 * };
 * ```
 */
export function useFaceApi(): UseFaceApiReturn {
  const [isLoading, setIsLoading] = useState(!modelsLoaded && !!loadingPromise);
  const [error, setError] = useState<Error | null>(null);
  const [isLoaded, setIsLoaded] = useState(modelsLoaded);

  // Sync state with singleton on mount (models may have loaded eagerly)
  useEffect(() => {
    if (modelsLoaded && !isLoaded) {
      setIsLoaded(true);
      setIsLoading(false);
    }
  }, [isLoaded]);

  /**
   * Load face-api.js models from /models directory
   * Uses singleton pattern - models likely already loaded eagerly at app start
   */
  const loadModels = useCallback(async () => {
    // Already loaded (likely from eager loading)
    if (modelsLoaded) {
      setIsLoaded(true);
      setIsLoading(false);
      return;
    }

    // Loading in progress (from eager loading)
    if (loadingPromise) {
      setIsLoading(true);
      try {
        await loadingPromise;
        setIsLoaded(true);
      } catch (err) {
        setError(err instanceof Error ? err : new Error('Failed to load models'));
      } finally {
        setIsLoading(false);
      }
      return;
    }

    // Fallback: start loading if not already started
    setIsLoading(true);
    setError(null);

    try {
      await eagerLoadModels();
      setIsLoaded(true);
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Failed to load models'));
    } finally {
      setIsLoading(false);
    }
  }, []);

  /**
   * Detect face in video element and extract 128D descriptor
   *
   * @param video - HTMLVideoElement with camera feed
   * @returns Float32Array[128] face descriptor or null if no face detected
   */
  const detectFace = useCallback(async (video: HTMLVideoElement): Promise<Float32Array | null> => {
    if (!modelsLoaded) {
      console.warn('⚠️ face-api.js models not loaded');
      return null;
    }

    if (!video || video.readyState < 2) {
      console.warn('⚠️ Video not ready');
      return null;
    }

    try {
      const startTime = performance.now();

      // Resize video to smaller canvas for faster processing
      // 320px is optimal balance between speed and accuracy
      const resizedCanvas = createResizedCanvas(video, 320);
      const resizeTime = performance.now() - startTime;

      // Detect single face with landmarks and descriptor
      // Using TinyFaceDetector for ~10x faster detection
      const detection = await faceapi
        .detectSingleFace(resizedCanvas, new faceapi.TinyFaceDetectorOptions({
          inputSize: 224,      // Even smaller for speed (160, 224, 320, 416, 512, 608)
          scoreThreshold: 0.5, // Confidence threshold
        }))
        .withFaceLandmarks(true) // true = use tiny landmarks model
        .withFaceDescriptor();

      const totalTimeMs = performance.now() - startTime;
      const totalTime = totalTimeMs.toFixed(0);

      if (!detection) {
        console.log(`⚠️ No face detected by face-api.js (${totalTime}ms)`);
        return null;
      }

      // Record face detection timing metric
      useMetricsStore.getState().recordTiming(METRIC_OPERATIONS.FACE_DETECTION, totalTimeMs, {
        resizeTimeMs: resizeTime,
        confidence: detection.detection.score,
      });

      // Extract the 128D face descriptor
      const descriptor = detection.descriptor;

      console.log(`✅ Face descriptor extracted in ${totalTime}ms (resize: ${resizeTime.toFixed(0)}ms):`, {
        dimensions: descriptor.length,
        confidence: detection.detection.score.toFixed(3),
      });

      // ═══════════════════════════════════════════════════════════════════
      // RAW BIOMETRIC DATA LOGGING
      // ═══════════════════════════════════════════════════════════════════
      console.log('\n');
      console.log('═══════════════════════════════════════════════════════════════════');
      console.log('📊 RAW FACE-API.JS 128D DESCRIPTOR (BIOMETRIC DATA)');
      console.log('═══════════════════════════════════════════════════════════════════');
      console.log('Type:', descriptor.constructor.name);
      console.log('Length:', descriptor.length);
      console.log('');

      // Log as array for easy copy-paste
      const rawArray = Array.from(descriptor);
      console.log('🔢 RAW VALUES (copy-paste friendly):');
      console.log(JSON.stringify(rawArray));
      console.log('');

      // Log formatted for readability
      console.log('📋 FORMATTED VALUES (8 per row):');
      for (let i = 0; i < rawArray.length; i += 8) {
        const row = rawArray.slice(i, i + 8).map(v => v.toFixed(6).padStart(10, ' ')).join(', ');
        console.log(`  [${String(i).padStart(3, '0')}-${String(Math.min(i + 7, rawArray.length - 1)).padStart(3, '0')}]: ${row}`);
      }
      console.log('');

      // Statistics
      const min = Math.min(...rawArray);
      const max = Math.max(...rawArray);
      const mean = rawArray.reduce((a, b) => a + b, 0) / rawArray.length;
      const variance = rawArray.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / rawArray.length;
      const stdDev = Math.sqrt(variance);

      console.log('📈 STATISTICS:');
      console.log(`  Min:      ${min.toFixed(6)}`);
      console.log(`  Max:      ${max.toFixed(6)}`);
      console.log(`  Mean:     ${mean.toFixed(6)}`);
      console.log(`  Std Dev:  ${stdDev.toFixed(6)}`);
      console.log(`  Range:    ${(max - min).toFixed(6)}`);
      console.log('');

      // Magnitude distribution (for 4-bit encoding insight)
      const magnitudeHist = new Array(10).fill(0);
      let positiveCount = 0;
      let negativeCount = 0;
      rawArray.forEach(v => {
        if (v >= 0) positiveCount++; else negativeCount++;
        const mag = Math.min(9, Math.floor(Math.abs(v) * 10));
        magnitudeHist[mag]++;
      });

      console.log('📊 DISTRIBUTION (for encoding):');
      console.log(`  Positive values: ${positiveCount} (${(positiveCount / rawArray.length * 100).toFixed(1)}%)`);
      console.log(`  Negative values: ${negativeCount} (${(negativeCount / rawArray.length * 100).toFixed(1)}%)`);
      console.log(`  Magnitude histogram (0-9): [${magnitudeHist.join(', ')}]`);
      console.log('═══════════════════════════════════════════════════════════════════');
      console.log('\n');

      return descriptor; // Float32Array[128]
    } catch (err) {
      console.error('❌ Face detection error:', err);
      return null;
    }
  }, []);

  return {
    isLoaded,
    isLoading,
    error,
    detectFace,
    loadModels,
  };
}
