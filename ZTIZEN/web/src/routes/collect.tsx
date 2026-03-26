/**
 * Biometric Data Collection & Multi-Model Comparison
 *
 * This page allows you to:
 * 1. Capture 5 face samples per person from webcam
 * 2. Get embeddings from 4 different models for each capture
 * 3. Download all samples as a single JSON file
 *
 * Models:
 *    - face-api.js (browser, 128D)
 *    - DeepFace Facenet (Python API, 128D)
 *    - DeepFace Facenet512 (Python API, 512D)
 *    - DeepFace ArcFace (Python API, 512D)
 *
 * Requirements:
 *   - Start Python API server: cd python-embeddings && ./venv/bin/python api_server.py
 */

import { createFileRoute } from '@tanstack/react-router';
import { useRef, useState, useEffect, useCallback } from 'react';
import * as faceapi from 'face-api.js';

export const Route = createFileRoute('/collect')({
  component: CollectPage,
});

// API server URL
const PYTHON_API_URL = 'http://localhost:5000';

// Number of captures per person
const CAPTURES_PER_PERSON = 5;

// Embedding result type
interface EmbeddingResult {
  model: string;
  source: string;
  dimensions: number;
  embedding: number[];
  time: number;
  error?: string;
}

// Single capture with all model embeddings
interface CaptureData {
  captureIndex: number;
  timestamp: number;
  imageDataUrl: string;
  embeddings: EmbeddingResult[];
}

// Person data with all captures
interface PersonData {
  personId: string;
  captures: CaptureData[];
  createdAt: string;
}

function CollectPage() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const [stream, setStream] = useState<MediaStream | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [pythonApiStatus, setPythonApiStatus] = useState<'checking' | 'online' | 'offline'>('checking');
  const [statusMessage, setStatusMessage] = useState('');

  // face-api.js state
  const [faceApiLoaded, setFaceApiLoaded] = useState(false);

  // Multi-capture state
  const [personId, setPersonId] = useState('p0');
  const [captures, setCaptures] = useState<CaptureData[]>([]);
  const [currentPreview, setCurrentPreview] = useState<string | null>(null);

  // Load face-api.js models
  useEffect(() => {
    const loadModels = async () => {
      try {
        await Promise.all([
          faceapi.nets.tinyFaceDetector.loadFromUri('/models'),
          faceapi.nets.faceLandmark68TinyNet.loadFromUri('/models'),
          faceapi.nets.faceRecognitionNet.loadFromUri('/models'),
        ]);
        setFaceApiLoaded(true);
        console.log('face-api.js models loaded');
      } catch (err) {
        console.error('Failed to load face-api.js models:', err);
      }
    };
    loadModels();
  }, []);

  // Check Python API status
  useEffect(() => {
    const checkApi = async () => {
      try {
        const res = await fetch(`${PYTHON_API_URL}/health`, { method: 'GET' });
        if (res.ok) {
          setPythonApiStatus('online');
        } else {
          setPythonApiStatus('offline');
        }
      } catch {
        setPythonApiStatus('offline');
      }
    };
    checkApi();
    const interval = setInterval(checkApi, 10000);
    return () => clearInterval(interval);
  }, []);

  // Start camera
  const startCamera = async () => {
    try {
      const mediaStream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user', width: 640, height: 480 },
      });
      setStream(mediaStream);
      if (videoRef.current) {
        videoRef.current.srcObject = mediaStream;
      }
    } catch (err) {
      console.error('Failed to start camera:', err);
      setStatusMessage('Camera access denied');
    }
  };

  const stopCamera = () => {
    if (stream) {
      stream.getTracks().forEach((track) => track.stop());
      setStream(null);
    }
  };

  useEffect(() => {
    startCamera();
    return () => stopCamera();
  }, []);

  // Get embedding from face-api.js
  const getFaceApiEmbedding = async (imageData: string): Promise<EmbeddingResult> => {
    const startTime = performance.now();
    try {
      const img = new Image();
      img.src = imageData;
      await new Promise((resolve) => { img.onload = resolve; });

      const detection = await faceapi
        .detectSingleFace(img, new faceapi.TinyFaceDetectorOptions({ inputSize: 416, scoreThreshold: 0.5 }))
        .withFaceLandmarks(true)
        .withFaceDescriptor();

      if (!detection) {
        return { model: 'face-api.js', source: 'browser', dimensions: 0, embedding: [], time: 0, error: 'No face detected' };
      }

      return {
        model: 'face-api.js',
        source: 'browser (128D)',
        dimensions: detection.descriptor.length,
        embedding: Array.from(detection.descriptor),
        time: performance.now() - startTime,
      };
    } catch (err) {
      return { model: 'face-api.js', source: 'browser', dimensions: 0, embedding: [], time: 0, error: String(err) };
    }
  };

  // Get embedding from Python DeepFace API
  const getDeepFaceEmbedding = async (imageData: string, modelName: string): Promise<EmbeddingResult> => {
    const startTime = performance.now();
    try {
      const res = await fetch(`${PYTHON_API_URL}/embed`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image: imageData, model: modelName }),
      });

      const data = await res.json();

      if (!data.success) {
        return { model: modelName, source: 'Python DeepFace', dimensions: 0, embedding: [], time: 0, error: data.error };
      }

      return {
        model: modelName,
        source: `DeepFace (${data.dimensions}D)`,
        dimensions: data.dimensions,
        embedding: data.embedding,
        time: data.processing_time_ms || (performance.now() - startTime),
      };
    } catch (err) {
      return { model: modelName, source: 'Python DeepFace', dimensions: 0, embedding: [], time: 0, error: String(err) };
    }
  };

  // Capture single frame and get all embeddings
  const handleCaptureSingle = useCallback(async () => {
    if (!videoRef.current || !canvasRef.current) return;
    if (captures.length >= CAPTURES_PER_PERSON) {
      setStatusMessage(`Already captured ${CAPTURES_PER_PERSON} samples. Download or reset.`);
      return;
    }

    setIsProcessing(true);
    const captureNum = captures.length + 1;
    setStatusMessage(`Capturing sample ${captureNum}/${CAPTURES_PER_PERSON}...`);

    // Capture frame to canvas
    const canvas = canvasRef.current;
    const video = videoRef.current;
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.drawImage(video, 0, 0);
    const imageData = canvas.toDataURL('image/jpeg', 0.95);
    setCurrentPreview(imageData);

    setStatusMessage(`Processing sample ${captureNum} with 4 models...`);

    // Get embeddings from all sources
    const embeddingPromises: Promise<EmbeddingResult>[] = [];

    // 1. face-api.js (browser, 128D)
    if (faceApiLoaded) {
      embeddingPromises.push(getFaceApiEmbedding(imageData));
    }

    // 2, 3 & 4. DeepFace models (Python API)
    if (pythonApiStatus === 'online') {
      embeddingPromises.push(getDeepFaceEmbedding(imageData, 'Facenet'));    // 128D
      embeddingPromises.push(getDeepFaceEmbedding(imageData, 'Facenet512')); // 512D
      embeddingPromises.push(getDeepFaceEmbedding(imageData, 'ArcFace'));    // 512D
    }

    const embeddings = await Promise.all(embeddingPromises);

    // Check if any face was detected
    const hasValidEmbedding = embeddings.some(e => e.embedding.length > 0);
    if (!hasValidEmbedding) {
      setStatusMessage(`Sample ${captureNum} failed: No face detected. Try again.`);
      setIsProcessing(false);
      return;
    }

    const newCapture: CaptureData = {
      captureIndex: captures.length,
      timestamp: Date.now(),
      imageDataUrl: imageData,
      embeddings,
    };

    const updatedCaptures = [...captures, newCapture];
    setCaptures(updatedCaptures);

    if (updatedCaptures.length >= CAPTURES_PER_PERSON) {
      setStatusMessage(`All ${CAPTURES_PER_PERSON} samples captured! Ready to download.`);
    } else {
      setStatusMessage(`Sample ${captureNum} captured. ${CAPTURES_PER_PERSON - updatedCaptures.length} more to go.`);
    }

    setIsProcessing(false);
  }, [captures, faceApiLoaded, pythonApiStatus]);

  // Download all captures as JSON
  const handleDownloadJSON = () => {
    if (captures.length === 0) {
      setStatusMessage('No captures to download');
      return;
    }

    const personData: PersonData = {
      personId,
      captures: captures.map(c => ({
        ...c,
        // Remove imageDataUrl from download to reduce file size (optional: keep it if needed)
        imageDataUrl: '', // Set to empty or keep c.imageDataUrl if you want images
      })),
      createdAt: new Date().toISOString(),
    };

    // Create embeddings-only export (smaller file)
    const exportData = {
      personId,
      captureCount: captures.length,
      createdAt: personData.createdAt,
      captures: captures.map((c, idx) => ({
        captureId: `${personId}_c${idx}`,
        timestamp: c.timestamp,
        embeddings: Object.fromEntries(
          c.embeddings
            .filter(e => e.embedding.length > 0)
            .map(e => [e.model.toLowerCase().replace(/[^a-z0-9]/g, ''), {
              model: e.model,
              dimensions: e.dimensions,
              embedding: e.embedding,
              processingTimeMs: Math.round(e.time),
            }])
        ),
      })),
    };

    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${personId}_${captures.length}captures_${Date.now()}.json`;
    link.click();
    URL.revokeObjectURL(url);

    setStatusMessage(`Downloaded ${personId} with ${captures.length} captures!`);
  };

  // Download captures with images (larger file)
  const handleDownloadWithImages = () => {
    if (captures.length === 0) {
      setStatusMessage('No captures to download');
      return;
    }

    const exportData = {
      personId,
      captureCount: captures.length,
      createdAt: new Date().toISOString(),
      captures: captures.map((c, idx) => ({
        captureId: `${personId}_c${idx}`,
        timestamp: c.timestamp,
        imageDataUrl: c.imageDataUrl,
        embeddings: Object.fromEntries(
          c.embeddings
            .filter(e => e.embedding.length > 0)
            .map(e => [e.model.toLowerCase().replace(/[^a-z0-9]/g, ''), {
              model: e.model,
              dimensions: e.dimensions,
              embedding: e.embedding,
            }])
        ),
      })),
    };

    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${personId}_${captures.length}captures_with_images_${Date.now()}.json`;
    link.click();
    URL.revokeObjectURL(url);

    setStatusMessage(`Downloaded ${personId} with images!`);
  };

  // Reset for next person
  const handleReset = () => {
    setCaptures([]);
    setCurrentPreview(null);
    setStatusMessage('');
    // Auto-increment person ID
    const match = personId.match(/^p(\d+)$/);
    if (match) {
      setPersonId(`p${parseInt(match[1]) + 1}`);
    }
  };

  // Remove last capture
  const handleRemoveLast = () => {
    if (captures.length > 0) {
      const updated = captures.slice(0, -1);
      setCaptures(updated);
      setCurrentPreview(updated.length > 0 ? updated[updated.length - 1].imageDataUrl : null);
      setStatusMessage(`Removed last capture. ${updated.length}/${CAPTURES_PER_PERSON} remaining.`);
    }
  };

  return (
    <div style={styles.container}>
      <div style={styles.content}>
        {/* Header */}
        <div style={styles.header}>
          <h1 style={styles.title}>Multi-Sample Face Collector</h1>
          <p style={styles.subtitle}>
            Capture {CAPTURES_PER_PERSON} samples per person with 4 embedding models
          </p>
        </div>

        {/* Status Bar */}
        <div style={styles.statusBar}>
          <div style={styles.statusItem}>
            <span>face-api.js:</span>
            <span style={{ color: faceApiLoaded ? '#22c55e' : '#eab308' }}>
              {faceApiLoaded ? '✓ Ready' : '⏳ Loading...'}
            </span>
          </div>
          <div style={styles.statusItem}>
            <span>Python API:</span>
            <span style={{ color: pythonApiStatus === 'online' ? '#22c55e' : '#ef4444' }}>
              {pythonApiStatus === 'online' ? '✓ Online' : pythonApiStatus === 'checking' ? '⏳ Checking...' : '✗ Offline'}
            </span>
          </div>
        </div>

        {pythonApiStatus === 'offline' && (
          <div style={styles.warning}>
            <strong>⚠️ Python API is offline.</strong>
            <p style={{ margin: '0.5rem 0 0 0', fontSize: '0.85rem' }}>
              Start it with: <code style={styles.code}>cd python-embeddings && ./venv/bin/python api_server.py</code>
            </p>
          </div>
        )}

        {/* Person ID Input */}
        <div style={styles.personIdSection}>
          <label style={styles.personIdLabel}>Person ID:</label>
          <input
            type="text"
            value={personId}
            onChange={(e) => setPersonId(e.target.value)}
            style={styles.personIdInput}
            placeholder="e.g., p0, p1, john_doe"
          />
          <div style={styles.captureCounter}>
            <span style={styles.captureCounterNumber}>{captures.length}</span>
            <span style={styles.captureCounterLabel}>/ {CAPTURES_PER_PERSON}</span>
          </div>
        </div>

        {/* Video / Preview */}
        <div style={styles.previewContainer}>
          <video ref={videoRef} autoPlay playsInline muted style={styles.video} />
          <canvas ref={canvasRef} style={{ display: 'none' }} />
        </div>

        {/* Capture Progress Thumbnails */}
        {captures.length > 0 && (
          <div style={styles.thumbnailRow}>
            {Array.from({ length: CAPTURES_PER_PERSON }).map((_, idx) => (
              <div
                key={idx}
                style={{
                  ...styles.thumbnail,
                  border: captures[idx] ? '2px solid #22c55e' : '2px dashed #475569',
                  backgroundColor: captures[idx] ? 'transparent' : '#1e293b',
                }}
              >
                {captures[idx] ? (
                  <img src={captures[idx].imageDataUrl} alt={`Capture ${idx + 1}`} style={styles.thumbnailImage} />
                ) : (
                  <span style={styles.thumbnailPlaceholder}>{idx + 1}</span>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Action Buttons */}
        <div style={styles.buttonRow}>
          <button
            onClick={handleCaptureSingle}
            disabled={isProcessing || !stream || captures.length >= CAPTURES_PER_PERSON}
            style={{
              ...styles.primaryButton,
              opacity: isProcessing || !stream || captures.length >= CAPTURES_PER_PERSON ? 0.5 : 1,
            }}
          >
            {isProcessing ? '⏳ Processing...' : `📸 Capture ${captures.length + 1}/${CAPTURES_PER_PERSON}`}
          </button>
        </div>

        {captures.length > 0 && (
          <div style={styles.buttonRow}>
            <button onClick={handleRemoveLast} style={styles.secondaryButton}>
              ↩️ Undo Last
            </button>
            <button onClick={handleReset} style={styles.secondaryButton}>
              🔄 Reset
            </button>
          </div>
        )}

        {/* Download Buttons */}
        {captures.length === CAPTURES_PER_PERSON && (
          <div style={styles.downloadSection}>
            <h3 style={styles.downloadTitle}>✅ All {CAPTURES_PER_PERSON} samples captured!</h3>
            <div style={styles.buttonRow}>
              <button onClick={handleDownloadJSON} style={styles.downloadButton}>
                💾 Download JSON (embeddings only)
              </button>
              <button onClick={handleDownloadWithImages} style={styles.downloadButtonAlt}>
                🖼️ Download with Images
              </button>
            </div>
            <p style={styles.downloadHint}>
              After download, click Reset to capture next person ({personId} → p{parseInt(personId.replace('p', '')) + 1 || 'next'})
            </p>
          </div>
        )}

        {/* Status Message */}
        {statusMessage && (
          <div style={styles.statusMessage}>{statusMessage}</div>
        )}

        {/* Last Capture Summary */}
        {captures.length > 0 && (
          <div style={styles.summarySection}>
            <h3 style={styles.summaryTitle}>Last Capture Summary</h3>
            <div style={styles.summaryGrid}>
              {captures[captures.length - 1].embeddings.map((emb, idx) => (
                <div
                  key={idx}
                  style={{
                    ...styles.summaryCard,
                    borderLeft: emb.error ? '3px solid #ef4444' : '3px solid #22c55e',
                  }}
                >
                  <div style={styles.summaryModel}>{emb.model}</div>
                  <div style={styles.summaryDim}>
                    {emb.error ? (
                      <span style={{ color: '#ef4444' }}>✗ Failed</span>
                    ) : (
                      <>
                        <span style={{
                          ...styles.dimensionBadge,
                          backgroundColor: emb.dimensions === 128 ? '#3730a3' : '#065f46',
                        }}>
                          {emb.dimensions}D
                        </span>
                        <span style={styles.summaryTime}>{emb.time.toFixed(0)}ms</span>
                      </>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Instructions */}
        <div style={styles.instructionsBox}>
          <h3 style={{ margin: '0 0 0.5rem 0' }}>📝 How to Use</h3>
          <ol style={{ margin: 0, paddingLeft: '1.5rem' }}>
            <li>Set Person ID (e.g., p0, p1, p2...)</li>
            <li>Click "Capture" 5 times for different angles/expressions</li>
            <li>Download the JSON file with all embeddings</li>
            <li>Click "Reset" and repeat for the next person</li>
          </ol>
        </div>

        {/* Back Link */}
        <a href="/" style={styles.backLink}>← Back to Home</a>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    minHeight: '100vh',
    backgroundColor: '#0f172a',
    padding: '1rem',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
    color: '#e2e8f0',
  },
  content: {
    maxWidth: '700px',
    margin: '0 auto',
  },
  header: {
    textAlign: 'center',
    marginBottom: '1.5rem',
  },
  title: {
    fontSize: '1.5rem',
    fontWeight: 700,
    color: '#fff',
    margin: 0,
  },
  subtitle: {
    fontSize: '0.9rem',
    color: '#94a3b8',
    margin: '0.5rem 0 0 0',
  },
  statusBar: {
    display: 'flex',
    justifyContent: 'center',
    gap: '2rem',
    padding: '0.75rem',
    backgroundColor: '#1e293b',
    borderRadius: '8px',
    marginBottom: '1rem',
    fontSize: '0.9rem',
  },
  statusItem: {
    display: 'flex',
    gap: '0.5rem',
  },
  warning: {
    backgroundColor: '#7c2d12',
    color: '#fef3c7',
    padding: '1rem',
    borderRadius: '8px',
    marginBottom: '1rem',
  },
  code: {
    backgroundColor: '#1e293b',
    padding: '0.2rem 0.5rem',
    borderRadius: '4px',
    fontFamily: 'monospace',
    fontSize: '0.8rem',
  },
  personIdSection: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.75rem',
    marginBottom: '1rem',
    padding: '0.75rem',
    backgroundColor: '#1e293b',
    borderRadius: '8px',
  },
  personIdLabel: {
    fontWeight: 600,
    color: '#94a3b8',
  },
  personIdInput: {
    flex: 1,
    padding: '0.5rem 0.75rem',
    fontSize: '1rem',
    fontWeight: 600,
    backgroundColor: '#0f172a',
    border: '1px solid #475569',
    borderRadius: '6px',
    color: '#fff',
    outline: 'none',
  },
  captureCounter: {
    display: 'flex',
    alignItems: 'baseline',
    gap: '0.25rem',
    padding: '0.5rem 1rem',
    backgroundColor: '#0f172a',
    borderRadius: '6px',
  },
  captureCounterNumber: {
    fontSize: '1.5rem',
    fontWeight: 700,
    color: '#22c55e',
  },
  captureCounterLabel: {
    fontSize: '1rem',
    color: '#64748b',
  },
  previewContainer: {
    width: '100%',
    aspectRatio: '4/3',
    backgroundColor: '#1e293b',
    borderRadius: '12px',
    overflow: 'hidden',
    marginBottom: '1rem',
  },
  video: {
    width: '100%',
    height: '100%',
    objectFit: 'cover',
    transform: 'scaleX(-1)',
  },
  thumbnailRow: {
    display: 'flex',
    gap: '0.5rem',
    marginBottom: '1rem',
    justifyContent: 'center',
  },
  thumbnail: {
    width: '60px',
    height: '60px',
    borderRadius: '8px',
    overflow: 'hidden',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  thumbnailImage: {
    width: '100%',
    height: '100%',
    objectFit: 'cover',
  },
  thumbnailPlaceholder: {
    color: '#475569',
    fontSize: '1.2rem',
    fontWeight: 600,
  },
  buttonRow: {
    display: 'flex',
    gap: '0.75rem',
    marginBottom: '0.75rem',
  },
  primaryButton: {
    flex: 1,
    padding: '1rem',
    fontSize: '1.1rem',
    fontWeight: 600,
    color: '#fff',
    backgroundColor: '#2563eb',
    border: 'none',
    borderRadius: '8px',
    cursor: 'pointer',
  },
  secondaryButton: {
    flex: 1,
    padding: '0.75rem',
    fontSize: '0.95rem',
    fontWeight: 600,
    color: '#e2e8f0',
    backgroundColor: '#334155',
    border: 'none',
    borderRadius: '8px',
    cursor: 'pointer',
  },
  downloadSection: {
    backgroundColor: '#14532d',
    border: '2px solid #22c55e',
    borderRadius: '12px',
    padding: '1rem',
    marginBottom: '1rem',
    textAlign: 'center',
  },
  downloadTitle: {
    margin: '0 0 0.75rem 0',
    color: '#22c55e',
    fontSize: '1.1rem',
  },
  downloadButton: {
    flex: 1,
    padding: '1rem',
    fontSize: '1rem',
    fontWeight: 600,
    color: '#fff',
    backgroundColor: '#16a34a',
    border: 'none',
    borderRadius: '8px',
    cursor: 'pointer',
  },
  downloadButtonAlt: {
    flex: 1,
    padding: '1rem',
    fontSize: '1rem',
    fontWeight: 600,
    color: '#fff',
    backgroundColor: '#0d9488',
    border: 'none',
    borderRadius: '8px',
    cursor: 'pointer',
  },
  downloadHint: {
    margin: '0.75rem 0 0 0',
    fontSize: '0.85rem',
    color: '#86efac',
  },
  statusMessage: {
    padding: '0.75rem',
    backgroundColor: '#1e293b',
    borderRadius: '8px',
    textAlign: 'center',
    marginBottom: '1rem',
    color: '#94a3b8',
  },
  summarySection: {
    marginTop: '1rem',
    marginBottom: '1rem',
  },
  summaryTitle: {
    fontSize: '1rem',
    fontWeight: 600,
    color: '#94a3b8',
    marginBottom: '0.75rem',
  },
  summaryGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(2, 1fr)',
    gap: '0.5rem',
  },
  summaryCard: {
    backgroundColor: '#1e293b',
    borderRadius: '8px',
    padding: '0.75rem',
  },
  summaryModel: {
    fontSize: '0.9rem',
    fontWeight: 600,
    color: '#fff',
    marginBottom: '0.25rem',
  },
  summaryDim: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.5rem',
    fontSize: '0.85rem',
  },
  summaryTime: {
    color: '#64748b',
  },
  dimensionBadge: {
    fontSize: '0.75rem',
    color: '#fff',
    padding: '0.15rem 0.4rem',
    borderRadius: '4px',
    fontWeight: 600,
  },
  instructionsBox: {
    backgroundColor: '#1e3a5f',
    border: '1px solid #2563eb',
    borderRadius: '12px',
    padding: '1rem',
    marginTop: '1rem',
    fontSize: '0.9rem',
    color: '#bfdbfe',
  },
  backLink: {
    display: 'block',
    textAlign: 'center',
    color: '#64748b',
    fontSize: '0.9rem',
    textDecoration: 'none',
    padding: '1.5rem',
  },
};
