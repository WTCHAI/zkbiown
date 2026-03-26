import { useRef, useState, useEffect } from 'react';
import { FaceLandmarker, FilesetResolver, DrawingUtils, NormalizedLandmark } from '@mediapipe/tasks-vision';
import { useEnrollmentStore } from '@/stores/useEnrollmentStore';
import { useVerificationStore } from '@/stores/useVerificationStore';
import { useFaceApi } from '@/hooks/useFaceApi';

interface BiometricCaptureProps {
  stage: 'enrollment' | 'verify';
  onCaptureComplete?: (biometric: Float32Array) => void;
  onError?: (error: Error) => void;
}

// Face position validation types
interface FaceBounds {
  x: number;
  y: number;
  width: number;
  height: number;
  centerX: number;
  centerY: number;
}

interface PositionCheckResult {
  isValid: boolean;
  feedback: string | null;
}

// Helper: Draw face guide oval on canvas
function drawFaceGuideOval(
  ctx: CanvasRenderingContext2D,
  canvasWidth: number,
  canvasHeight: number,
  isValid: boolean
) {
  const centerX = canvasWidth / 2;
  const centerY = canvasHeight / 2;
  const ovalHeight = canvasHeight * 0.65;
  const ovalWidth = ovalHeight * 0.75; // Typical face aspect ratio

  ctx.save();
  ctx.beginPath();
  ctx.ellipse(centerX, centerY, ovalWidth / 2, ovalHeight / 2, 0, 0, 2 * Math.PI);

  if (isValid) {
    // Valid position: solid green
    ctx.strokeStyle = '#22c55e';
    ctx.lineWidth = 3;
    ctx.setLineDash([]);
  } else {
    // Default: dashed white
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.7)';
    ctx.lineWidth = 2;
    ctx.setLineDash([10, 8]);
  }

  ctx.stroke();
  ctx.restore();
}

// Helper: Calculate face bounding box from landmarks
function calculateFaceBounds(
  landmarks: NormalizedLandmark[],
  canvasWidth: number,
  canvasHeight: number
): FaceBounds {
  let minX = Infinity, maxX = -Infinity;
  let minY = Infinity, maxY = -Infinity;

  for (const landmark of landmarks) {
    const x = landmark.x * canvasWidth;
    const y = landmark.y * canvasHeight;
    minX = Math.min(minX, x);
    maxX = Math.max(maxX, x);
    minY = Math.min(minY, y);
    maxY = Math.max(maxY, y);
  }

  const width = maxX - minX;
  const height = maxY - minY;

  return {
    x: minX,
    y: minY,
    width,
    height,
    centerX: minX + width / 2,
    centerY: minY + height / 2,
  };
}

// Helper: Check if face is properly positioned within the oval guide
function checkFacePosition(
  faceBounds: FaceBounds,
  canvasWidth: number,
  canvasHeight: number
): PositionCheckResult {
  const ovalCenterX = canvasWidth / 2;
  const ovalCenterY = canvasHeight / 2;
  const ovalHeight = canvasHeight * 0.65;
  const ovalWidth = ovalHeight * 0.75;

  // Calculate face center offset from oval center
  const horizontalOffset = faceBounds.centerX - ovalCenterX;
  const verticalOffset = faceBounds.centerY - ovalCenterY;

  // Thresholds for position feedback
  const horizontalThreshold = ovalWidth * 0.15;
  const verticalThreshold = ovalHeight * 0.15;

  // Check face size relative to oval
  const idealFaceHeight = ovalHeight * 0.85;
  const minFaceHeight = idealFaceHeight * 0.6;
  const maxFaceHeight = idealFaceHeight * 1.3;

  // Position feedback
  if (faceBounds.height < minFaceHeight) {
    return { isValid: false, feedback: 'Move closer' };
  }

  if (faceBounds.height > maxFaceHeight) {
    return { isValid: false, feedback: 'Move back' };
  }

  if (horizontalOffset < -horizontalThreshold) {
    return { isValid: false, feedback: 'Move right' };
  }

  if (horizontalOffset > horizontalThreshold) {
    return { isValid: false, feedback: 'Move left' };
  }

  if (verticalOffset < -verticalThreshold) {
    return { isValid: false, feedback: 'Move down' };
  }

  if (verticalOffset > verticalThreshold) {
    return { isValid: false, feedback: 'Move up' };
  }

  // All checks passed
  return { isValid: true, feedback: null };
}

/**
 * Biometric Capture Component (UI/UX Updated)
 *
 * Architecture:
 * - MediaPipe Face Landmarker: Used for face mesh visualization (UI only)
 * - face-api.js: Used for 128D face descriptor extraction (biometric data)
 *
 * This dual approach provides:
 * - Beautiful real-time face mesh overlay from MediaPipe
 * - Semantically meaningful 128D embeddings from face-api.js for recognition
 *
 * Flow:
 * 1. MediaPipe runs continuously for visual feedback
 * 2. On capture, face-api.js extracts 128D descriptor
 * 3. Descriptor passed to parent for template generation
 */
export default function BiometricCapture({
  stage,
  onCaptureComplete,
  onError,
}: BiometricCaptureProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const animationFrameRef = useRef<number | null>(null);

  // Get stores for storing raw biometric
  const { setRawBiometric: setEnrollmentBiometric } = useEnrollmentStore();
  const { setRawBiometric: setVerifyBiometric } = useVerificationStore();

  // face-api.js for 128D embeddings (biometric extraction)
  const {
    isLoaded: faceApiLoaded,
    isLoading: faceApiLoading,
    error: faceApiError,
    loadModels: loadFaceApiModels,
    detectFace,
  } = useFaceApi();

  const [mediapipeLandmarker, setMediapipeLandmarker] = useState<FaceLandmarker | null>(null);
  const [isMediaPipeLoaded, setIsMediaPipeLoaded] = useState(false);

  const [isCameraActive, setIsCameraActive] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [status, setStatus] = useState('Loading MediaPipe Face Landmarker...');
  const [faceDetected, setFaceDetected] = useState(false);
  const [loadingStep, setLoadingStep] = useState<string>('');
  const [showLoadingModal, setShowLoadingModal] = useState(false);

  // Multi-face detection and position guidance state
  const [multipleFacesDetected, setMultipleFacesDetected] = useState(false);
  const [faceCount, setFaceCount] = useState(0);
  const [facePositionFeedback, setFacePositionFeedback] = useState<string | null>(null);
  const [isFacePositionValid, setIsFacePositionValid] = useState(false);

  const lastVideoTimeRef = useRef<number>(-1);
  const latestLandmarksRef = useRef<NormalizedLandmark[] | null>(null);

  // Inject spinner animation style
  useEffect(() => {
    const styleId = 'spinner-animation-mediapipe-production';
    if (!document.getElementById(styleId)) {
      const style = document.createElement('style');
      style.id = styleId;
      style.textContent = `
        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
      `;
      document.head.appendChild(style);
    }
  }, []);

  useEffect(() => {
    // Load both MediaPipe (visualization) and face-api.js (biometric extraction) models
    loadMediaPipeModels();
    loadFaceApiModels();
    return () => {
      stopCamera();
    };
  }, [loadFaceApiModels]);

  const loadMediaPipeModels = async () => {
    try {
      setStatus('Loading MediaPipe Face Landmarker (visualization)...');

      const filesetResolver = await FilesetResolver.forVisionTasks(
        'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.3/wasm'
      );

      const landmarker = await FaceLandmarker.createFromOptions(filesetResolver, {
        baseOptions: {
          modelAssetPath: 'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task',
          delegate: 'GPU'
        },
        outputFaceBlendshapes: false,
        runningMode: 'VIDEO',
        numFaces: 5  // Enable multi-face detection for security warnings
      });

      setMediapipeLandmarker(landmarker);
      setIsMediaPipeLoaded(true);
      console.log('✅ MediaPipe Face Landmarker loaded (visualization only)');

    } catch (error) {
      console.error('Error loading MediaPipe:', error);
      // MediaPipe is optional for visualization - don't block if it fails
    }
  };

  // Check if both models are ready
  const isReady = faceApiLoaded && !faceApiError;

  // Update status based on loading state
  useEffect(() => {
    if (faceApiError) {
      setStatus(`❌ Error loading face-api.js: ${faceApiError.message}`);
      onError?.(faceApiError);
    } else if (faceApiLoading) {
      setStatus('Loading face recognition models...');
    } else if (faceApiLoaded) {
      setStatus('Ready to scan biometric');
    }
  }, [faceApiLoaded, faceApiLoading, faceApiError, onError]);

  const startCamera = async () => {
    try {
      setStatus('Starting camera...');

      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          width: { ideal: 640 },
          height: { ideal: 480 },
          facingMode: 'user',
        },
        audio: false,
      });

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        streamRef.current = stream;

        videoRef.current.onloadedmetadata = async () => {
          try {
            await videoRef.current?.play();
            setIsCameraActive(true);
            setStatus('Camera active. Position your face clearly.');

            setTimeout(() => {
              startDetectionLoop();
            }, 100);
          } catch (err) {
            console.error('❌ Video play error:', err);
            setStatus('Failed to start video');
          }
        };
      }
    } catch (error) {
      setStatus('Camera access denied');
      onError?.(error as Error);
    }
  };

  const startDetectionLoop = () => {
    if (!videoRef.current || !canvasRef.current) {
      console.error('❌ Cannot start detection: missing refs');
      return;
    }

    const video = videoRef.current;
    const canvas = canvasRef.current;

    const detect = async () => {
      if (!video || video.paused || video.ended) {
        animationFrameRef.current = requestAnimationFrame(detect);
        return;
      }

      const currentTime = video.currentTime;

      if (currentTime !== lastVideoTimeRef.current) {
        lastVideoTimeRef.current = currentTime;

        const ctx = canvas.getContext('2d');
        if (!ctx) {
          animationFrameRef.current = requestAnimationFrame(detect);
          return;
        }

        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;

        // 1. Draw video frame first
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

        // Track position validity for oval color
        let currentPositionValid = false;

        // 2. Run MediaPipe detection if loaded
        if (mediapipeLandmarker) {
          const results = mediapipeLandmarker.detectForVideo(video, performance.now());
          const detectedFaceCount = results.faceLandmarks?.length || 0;

          // Update face count state
          setFaceCount(detectedFaceCount);

          // 3. Check for multiple faces (security)
          if (detectedFaceCount >= 2) {
            setMultipleFacesDetected(true);
            setFaceDetected(true);
            setIsFacePositionValid(false);
            setFacePositionFeedback(null);
            latestLandmarksRef.current = null;

            // Draw oval in warning state (red)
            ctx.save();
            ctx.beginPath();
            ctx.ellipse(
              canvas.width / 2,
              canvas.height / 2,
              (canvas.height * 0.65 * 0.75) / 2,
              (canvas.height * 0.65) / 2,
              0, 0, 2 * Math.PI
            );
            ctx.strokeStyle = '#ef4444';
            ctx.lineWidth = 3;
            ctx.setLineDash([]);
            ctx.stroke();
            ctx.restore();

            // Still draw face meshes for all detected faces (in red)
            const drawingUtils = new DrawingUtils(ctx);
            for (const landmarks of results.faceLandmarks) {
              drawingUtils.drawConnectors(
                landmarks,
                FaceLandmarker.FACE_LANDMARKS_TESSELATION,
                { color: '#ef444470', lineWidth: 1 }
              );
              drawingUtils.drawConnectors(
                landmarks,
                FaceLandmarker.FACE_LANDMARKS_FACE_OVAL,
                { color: '#ef4444' }
              );
            }
          } else if (detectedFaceCount === 1) {
            // Single face detected - normal flow
            setMultipleFacesDetected(false);
            setFaceDetected(true);
            latestLandmarksRef.current = results.faceLandmarks[0];

            // 4. Check face position
            const faceBounds = calculateFaceBounds(
              results.faceLandmarks[0],
              canvas.width,
              canvas.height
            );
            const positionCheck = checkFacePosition(faceBounds, canvas.width, canvas.height);

            currentPositionValid = positionCheck.isValid;
            setIsFacePositionValid(positionCheck.isValid);
            setFacePositionFeedback(positionCheck.feedback);

            // 5. Draw oval guide (color based on validity)
            drawFaceGuideOval(ctx, canvas.width, canvas.height, positionCheck.isValid);

            // 6. Draw face mesh with color based on validity
            const drawingUtils = new DrawingUtils(ctx);
            const meshColor = positionCheck.isValid ? '#22c55e70' : '#C0C0C070';
            const accentColor = positionCheck.isValid ? '#22c55e' : '#E0E0E0';

            drawingUtils.drawConnectors(
              results.faceLandmarks[0],
              FaceLandmarker.FACE_LANDMARKS_TESSELATION,
              { color: meshColor, lineWidth: 1 }
            );

            drawingUtils.drawConnectors(
              results.faceLandmarks[0],
              FaceLandmarker.FACE_LANDMARKS_RIGHT_EYE,
              { color: positionCheck.isValid ? '#22c55e' : '#FF3030' }
            );

            drawingUtils.drawConnectors(
              results.faceLandmarks[0],
              FaceLandmarker.FACE_LANDMARKS_RIGHT_EYEBROW,
              { color: positionCheck.isValid ? '#22c55e' : '#FF3030' }
            );

            drawingUtils.drawConnectors(
              results.faceLandmarks[0],
              FaceLandmarker.FACE_LANDMARKS_LEFT_EYE,
              { color: positionCheck.isValid ? '#22c55e' : '#30FF30' }
            );

            drawingUtils.drawConnectors(
              results.faceLandmarks[0],
              FaceLandmarker.FACE_LANDMARKS_LEFT_EYEBROW,
              { color: positionCheck.isValid ? '#22c55e' : '#30FF30' }
            );

            drawingUtils.drawConnectors(
              results.faceLandmarks[0],
              FaceLandmarker.FACE_LANDMARKS_FACE_OVAL,
              { color: accentColor }
            );

            drawingUtils.drawConnectors(
              results.faceLandmarks[0],
              FaceLandmarker.FACE_LANDMARKS_LIPS,
              { color: accentColor }
            );
          } else {
            // No face detected
            setMultipleFacesDetected(false);
            setFaceDetected(false);
            setIsFacePositionValid(false);
            setFacePositionFeedback('No face detected');
            latestLandmarksRef.current = null;

            // Draw default oval guide
            drawFaceGuideOval(ctx, canvas.width, canvas.height, false);
          }
        } else {
          // MediaPipe not loaded - draw oval guide anyway
          drawFaceGuideOval(ctx, canvas.width, canvas.height, false);
          setFaceDetected(true); // Assume face is there if camera works
        }
      }

      animationFrameRef.current = requestAnimationFrame(detect);
    };

    detect();
  };

  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }

    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }

    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }

    if (canvasRef.current) {
      const ctx = canvasRef.current.getContext('2d');
      ctx?.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
    }

    setIsCameraActive(false);
    setFaceDetected(false);
    setStatus('Camera stopped');
  };

  const handleCapture = async () => {
    // Check video element
    if (!videoRef.current) {
      setStatus('Camera not ready');
      return;
    }

    // Block capture if multiple faces detected
    if (multipleFacesDetected) {
      setStatus('Multiple faces detected - only one person allowed');
      return;
    }

    // MediaPipe face detection is optional (for visual mesh only)
    // face-api.js will do the actual face detection during capture
    if (mediapipeLandmarker && !latestLandmarksRef.current) {
      setStatus('No face detected - position your face in the frame');
      return;
    }

    try {
      setIsProcessing(true);
      setShowLoadingModal(true);
      setLoadingStep('Extracting face descriptor (128D)...');

      // Use face-api.js to extract 128D face descriptor
      // This is the biometric data used for recognition
      // TinyFaceDetector is fast (~100-300ms), no artificial delay needed
      const faceDescriptor = await detectFace(videoRef.current);

      if (!faceDescriptor) {
        throw new Error('No face detected by face-api.js. Please ensure your face is clearly visible.');
      }

      // Validate descriptor dimensions
      if (faceDescriptor.length !== 128) {
        throw new Error(`Expected 128D descriptor, got ${faceDescriptor.length}D`);
      }

      console.log('✅ Face descriptor extracted (face-api.js 128D):', {
        dimensions: faceDescriptor.length,
        source: 'face-api-128d',
        sample: Array.from(faceDescriptor.slice(0, 5)).map(v => v.toFixed(4)),
      });

      // ═══════════════════════════════════════════════════════════════════
      // BIOMETRIC CAPTURE - DATA PASSED TO PARENT
      // ═══════════════════════════════════════════════════════════════════
      console.log('\n');
      console.log('═══════════════════════════════════════════════════════════════════');
      console.log(`🎯 BIOMETRIC CAPTURE COMPLETE (Stage: ${stage})`);
      console.log('═══════════════════════════════════════════════════════════════════');
      console.log('This Float32Array will be passed to the parent route for template generation.');
      console.log('');
      console.log('📦 DATA BEING PASSED TO onCaptureComplete():');
      console.log('  Type:', faceDescriptor.constructor.name);
      console.log('  Length:', faceDescriptor.length, 'dimensions');
      console.log('  First 10 values:', Array.from(faceDescriptor.slice(0, 10)).map(v => v.toFixed(4)).join(', '));
      console.log('  Last 10 values:', Array.from(faceDescriptor.slice(-10)).map(v => v.toFixed(4)).join(', '));
      console.log('═══════════════════════════════════════════════════════════════════');
      console.log('\n');

      // Store in appropriate store based on stage
      if (stage === 'enrollment') {
        setEnrollmentBiometric(faceDescriptor);
        console.log('📊 128D face descriptor stored in useEnrollmentStore');
      } else if (stage === 'verify') {
        setVerifyBiometric(faceDescriptor);
        console.log('📊 128D face descriptor stored in useVerificationStore');
      }

      setLoadingStep('Biometric captured successfully!');
      setStatus('✅ Capture complete');

      setShowLoadingModal(false);

      // Return 128D face descriptor to parent route for template generation
      onCaptureComplete?.(faceDescriptor);

      stopCamera();

    } catch (error) {
      setShowLoadingModal(false);
      setStatus(`Error: ${(error as Error).message}`);
      onError?.(error as Error);
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div style={styles.container}>
      {/* Loading Modal */}
      {showLoadingModal && (
        <div style={styles.loadingModalOverlay}>
          <div style={styles.loadingModalContent}>
            <div style={styles.loadingSpinner}>
              <div style={styles.spinner}></div>
            </div>
            <div style={styles.loadingText}>
              {loadingStep || 'Processing...'}
            </div>
            <div style={styles.loadingSubtext}>
              Processing biometric data...<br/>
              Please wait
            </div>
          </div>
        </div>
      )}

      {/* Status - only show when not camera active */}
      {!isCameraActive && !isReady && (
        <div style={styles.statusCard}>
          {faceApiLoading ? 'Loading face recognition models...' : 'Loading...'}
        </div>
      )}

      {/* Video Container */}
      <div style={styles.videoContainer}>
        <video ref={videoRef} autoPlay muted playsInline style={styles.video} />
        <canvas ref={canvasRef} style={styles.canvas} />

        {/* Multi-face warning overlay */}
        {isCameraActive && multipleFacesDetected && (
          <div style={styles.multiFaceWarningOverlay}>
            <div style={styles.warningIcon}>⚠️</div>
            <div style={styles.warningTitle}>Only one person allowed</div>
            <div style={styles.warningSubtitle}>{faceCount} faces detected</div>
          </div>
        )}

        {/* Position feedback badge (top center) */}
        {isCameraActive && !multipleFacesDetected && facePositionFeedback && (
          <div style={styles.positionFeedbackBadge}>
            {facePositionFeedback}
          </div>
        )}

        {/* Face indicator (bottom center) */}
        {isCameraActive && !multipleFacesDetected && (
          <div style={{
            ...styles.faceIndicator,
            backgroundColor: isFacePositionValid ? 'rgba(34, 197, 94, 0.9)' : 'rgba(0, 0, 0, 0.7)',
          }}>
            {!faceDetected
              ? 'Position your face in the oval'
              : isFacePositionValid
                ? '✓ Face positioned correctly'
                : 'Position your face in the oval'}
          </div>
        )}
      </div>

      {/* Action Buttons */}
      <div style={styles.actionSection}>
        {!isCameraActive ? (
          <button
            onClick={startCamera}
            disabled={!isReady}
            style={{
              ...styles.button,
              opacity: !isReady ? 0.5 : 1,
            }}
          >
            {!isReady ? (faceApiLoading ? 'Loading models...' : 'Loading...') : 'Start Camera'}
          </button>
        ) : (
          <>
            <button
              onClick={handleCapture}
              disabled={isProcessing || !faceDetected || multipleFacesDetected}
              style={{
                ...styles.button,
                opacity: (isProcessing || !faceDetected || multipleFacesDetected) ? 0.5 : 1,
              }}
            >
              {isProcessing ? 'Processing...' : stage === 'enrollment' ? 'Capture Biometric' : 'Capture & Verify'}
            </button>
            <button
              onClick={stopCamera}
              disabled={isProcessing}
              style={{
                ...styles.buttonSecondary,
                opacity: isProcessing ? 0.5 : 1,
              }}
            >
              Cancel
            </button>
          </>
        )}
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    width: '100%',
    maxWidth: '100%',
    margin: '0 auto',
  },
  statusCard: {
    padding: '1rem',
    fontSize: '0.9rem',
    color: '#666',
    textAlign: 'center' as const,
    marginBottom: '1.5rem',
  },
  videoContainer: {
    position: 'relative' as const,
    backgroundColor: '#000',
    borderRadius: '12px',
    overflow: 'hidden',
    width: '100%',
    minHeight: '300px',
    aspectRatio: '4/3',
    marginBottom: '1.5rem',
  },
  video: {
    position: 'absolute' as const,
    top: 0,
    left: 0,
    width: '100%',
    height: '100%',
    objectFit: 'cover' as const,
    opacity: 0, // Hidden - canvas shows video with face mesh overlay
  },
  canvas: {
    position: 'absolute' as const,
    top: 0,
    left: 0,
    width: '100%',
    height: '100%',
    objectFit: 'cover' as const,
  },
  faceIndicator: {
    position: 'absolute' as const,
    bottom: '1rem',
    left: '50%',
    transform: 'translateX(-50%)',
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    color: '#fff',
    padding: '0.5rem 1rem',
    borderRadius: '6px',
    fontSize: '0.85rem',
    fontWeight: 500,
  },
  actionSection: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '0.75rem',
  },
  button: {
    width: '100%',
    padding: '1rem',
    fontSize: '1rem',
    fontWeight: 600,
    backgroundColor: '#1a1a1a',
    color: '#fff',
    border: 'none',
    borderRadius: '8px',
    cursor: 'pointer',
    transition: 'all 0.2s ease',
  },
  buttonSecondary: {
    width: '100%',
    padding: '0.75rem',
    fontSize: '0.95rem',
    fontWeight: 500,
    backgroundColor: '#f5f5f5',
    color: '#666',
    border: 'none',
    borderRadius: '8px',
    cursor: 'pointer',
    transition: 'all 0.2s ease',
  },
  loadingModalOverlay: {
    position: 'fixed' as const,
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.8)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 9999,
  },
  loadingModalContent: {
    backgroundColor: '#fff',
    borderRadius: '16px',
    padding: '2.5rem 2rem',
    textAlign: 'center' as const,
    maxWidth: '400px',
    width: '90%',
    boxShadow: '0 10px 40px rgba(0, 0, 0, 0.3)',
  },
  loadingSpinner: {
    display: 'flex',
    justifyContent: 'center',
    marginBottom: '1.5rem',
  },
  spinner: {
    width: '60px',
    height: '60px',
    border: '6px solid #f3f3f3',
    borderTop: '6px solid #1a1a1a',
    borderRadius: '50%',
    animation: 'spin 1s linear infinite',
  },
  loadingText: {
    fontSize: '1.1rem',
    fontWeight: 600,
    color: '#1a1a1a',
    marginBottom: '0.75rem',
  },
  loadingSubtext: {
    fontSize: '0.9rem',
    color: '#666',
    lineHeight: '1.5',
  },
  // Multi-face warning overlay styles
  multiFaceWarningOverlay: {
    position: 'absolute' as const,
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(239, 68, 68, 0.85)',
    display: 'flex',
    flexDirection: 'column' as const,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 10,
  },
  warningIcon: {
    fontSize: '3rem',
    marginBottom: '0.75rem',
  },
  warningTitle: {
    color: '#fff',
    fontSize: '1.25rem',
    fontWeight: 700,
    marginBottom: '0.5rem',
    textAlign: 'center' as const,
  },
  warningSubtitle: {
    color: 'rgba(255, 255, 255, 0.9)',
    fontSize: '1rem',
    fontWeight: 500,
  },
  // Position feedback badge (top center)
  positionFeedbackBadge: {
    position: 'absolute' as const,
    top: '1rem',
    left: '50%',
    transform: 'translateX(-50%)',
    backgroundColor: 'rgba(251, 191, 36, 0.95)',
    color: '#1a1a1a',
    padding: '0.5rem 1.25rem',
    borderRadius: '20px',
    fontSize: '0.9rem',
    fontWeight: 600,
    zIndex: 5,
    boxShadow: '0 2px 8px rgba(0, 0, 0, 0.2)',
  },
};
