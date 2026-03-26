/**
 * LFW Dataset - face-api.js Batch Extractor
 *
 * Extracts 128D embeddings from LFW dataset using face-api.js in browser.
 * Select the lfw-deepfunneled folder and it auto-processes all images.
 *
 * Output: JSON with faceapi embeddings for all persons with 2+ images
 */

import { createFileRoute } from '@tanstack/react-router';
import { useRef, useState, useEffect, useCallback } from 'react';
import * as faceapi from 'face-api.js';

export const Route = createFileRoute('/lfw-extract')({
  component: LfwExtractPage,
});

interface PersonData {
  description: string;
  original_name: string;
  captures: Record<string, { faceapi: number[] }>;
}

interface ExtractionResult {
  description: string;
  metadata: {
    source: string;
    library: string;
    dimension: number;
    extraction_date: string;
    total_persons: number;
    total_images: number;
    success_count: number;
    fail_count: number;
    extraction_time_seconds: number;
    images_per_second: number;
  };
  persons: Record<string, PersonData>;
}

function LfwExtractPage() {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [isLoading, setIsLoading] = useState(true);
  const [isProcessing, setIsProcessing] = useState(false);
  const [shouldStop, setShouldStop] = useState(false);

  const [personFolders, setPersonFolders] = useState<Map<string, File[]>>(new Map());
  const [results, setResults] = useState<ExtractionResult | null>(null);

  const [stats, setStats] = useState({
    persons: 0,
    total: 0,
    processed: 0,
    success: 0,
    failed: 0,
    rate: 0,
  });

  const [logs, setLogs] = useState<string[]>([]);
  const [previews, setPreviews] = useState<string[]>([]);

  // Load face-api.js models
  useEffect(() => {
    const loadModels = async () => {
      try {
        await Promise.all([
          faceapi.nets.ssdMobilenetv1.loadFromUri('/models'),
          faceapi.nets.faceLandmark68Net.loadFromUri('/models'),
          faceapi.nets.faceRecognitionNet.loadFromUri('/models'),
        ]);
        setIsLoading(false);
        addLog('face-api.js models loaded', 'success');
      } catch (err) {
        addLog(`Failed to load models: ${err}`, 'error');
      }
    };
    loadModels();
  }, []);

  const addLog = (message: string, type: 'info' | 'success' | 'error' | 'warning' = 'info') => {
    const time = new Date().toLocaleTimeString();
    setLogs(prev => [`[${time}] ${type.toUpperCase()}: ${message}`, ...prev.slice(0, 199)]);
  };

  // Handle folder selection
  const handleFolderSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;

    const folders = new Map<string, File[]>();

    // Group files by person folder
    Array.from(files).forEach(file => {
      if (!file.type.startsWith('image/') && !file.name.endsWith('.jpg') && !file.name.endsWith('.png')) {
        return;
      }

      const parts = file.webkitRelativePath.split('/');
      if (parts.length >= 3) {
        const personName = parts[1];
        if (!folders.has(personName)) {
          folders.set(personName, []);
        }
        folders.get(personName)!.push(file);
      }
    });

    // Filter to persons with 2+ images and sort
    const filtered = new Map(
      Array.from(folders.entries())
        .filter(([_, images]) => images.length >= 2)
        .sort((a, b) => a[0].localeCompare(b[0]))
    );

    setPersonFolders(filtered);

    let totalImages = 0;
    filtered.forEach(images => totalImages += images.length);

    setStats(prev => ({ ...prev, persons: filtered.size, total: totalImages }));
    addLog(`Loaded ${filtered.size} persons with ${totalImages} images (2+ per person)`, 'success');

    // Show first few names
    const names = Array.from(filtered.keys()).slice(0, 5);
    addLog(`First persons: ${names.join(', ')}${filtered.size > 5 ? '...' : ''}`, 'info');
  };

  // Extract embedding from image
  const extractEmbedding = async (file: File): Promise<number[] | null> => {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = async () => {
        try {
          let detection = await faceapi
            .detectSingleFace(img)
            .withFaceLandmarks()
            .withFaceDescriptor();

          // Retry with lower threshold for pre-cropped faces
          if (!detection) {
            detection = await faceapi
              .detectSingleFace(img, new faceapi.SsdMobilenetv1Options({ minConfidence: 0.1 }))
              .withFaceLandmarks()
              .withFaceDescriptor();
          }

          URL.revokeObjectURL(img.src);
          resolve(detection ? Array.from(detection.descriptor) : null);
        } catch {
          URL.revokeObjectURL(img.src);
          resolve(null);
        }
      };
      img.onerror = () => {
        URL.revokeObjectURL(img.src);
        resolve(null);
      };
      img.src = URL.createObjectURL(file);
    });
  };

  // Start extraction
  const startExtraction = useCallback(async () => {
    if (isProcessing || personFolders.size === 0) return;

    setIsProcessing(true);
    setShouldStop(false);
    setPreviews([]);

    const result: ExtractionResult = {
      description: 'LFW Dataset - face-api.js embeddings (128D)',
      metadata: {
        source: 'LFW-deepfunneled',
        library: 'face-api.js (browser)',
        dimension: 128,
        extraction_date: new Date().toISOString(),
        total_persons: personFolders.size,
        total_images: stats.total,
        success_count: 0,
        fail_count: 0,
        extraction_time_seconds: 0,
        images_per_second: 0,
      },
      persons: {},
    };

    const startTime = Date.now();
    let processed = 0;
    let success = 0;
    let failed = 0;

    const persons = Array.from(personFolders.entries());

    addLog(`Starting extraction: ${persons.length} persons, ${stats.total} images`, 'info');

    for (let pIdx = 0; pIdx < persons.length; pIdx++) {
      if (shouldStop) {
        addLog('Extraction stopped by user', 'warning');
        break;
      }

      const [personName, images] = persons[pIdx];
      const personId = `P${pIdx}`;

      result.persons[personId] = {
        description: personName,
        original_name: personName,
        captures: {},
      };

      // Sort images by name
      images.sort((a, b) => a.name.localeCompare(b.name));

      for (let imgIdx = 0; imgIdx < images.length; imgIdx++) {
        if (shouldStop) break;

        const file = images[imgIdx];
        // Use filename (without extension) as capture ID for alignment with DeepFace
        const captureId = file.name.replace(/\.[^/.]+$/, '');

        const embedding = await extractEmbedding(file);
        processed++;

        if (embedding) {
          result.persons[personId].captures[captureId] = { faceapi: embedding };
          success++;

          // Add preview (keep last 20)
          const previewUrl = URL.createObjectURL(file);
          setPreviews(prev => [previewUrl, ...prev.slice(0, 19)]);
        } else {
          failed++;
        }

        // Update stats
        const elapsed = (Date.now() - startTime) / 1000;
        setStats({
          persons: personFolders.size,
          total: stats.total,
          processed,
          success,
          failed,
          rate: Math.round((processed / elapsed) * 10) / 10,
        });
      }

      // Log progress every 50 persons
      if ((pIdx + 1) % 50 === 0) {
        addLog(`Processed ${pIdx + 1}/${persons.length} persons (${success} faces found)`, 'info');
      }
    }

    // Finalize
    const elapsed = (Date.now() - startTime) / 1000;
    result.metadata.success_count = success;
    result.metadata.fail_count = failed;
    result.metadata.extraction_time_seconds = elapsed;
    result.metadata.images_per_second = processed / elapsed;

    setResults(result);
    setIsProcessing(false);

    addLog(`Extraction complete in ${elapsed.toFixed(1)}s: ${success} faces from ${processed} images`, 'success');

    // Show embedding stats
    if (success > 0) {
      const allValues: number[] = [];
      Object.values(result.persons).forEach(person => {
        Object.values(person.captures).forEach(capture => {
          if (capture.faceapi) allValues.push(...capture.faceapi);
        });
      });
      const min = Math.min(...allValues);
      const max = Math.max(...allValues);
      addLog(`Embedding range: [${min.toFixed(3)}, ${max.toFixed(3)}]`, 'success');
    }
  }, [isProcessing, personFolders, stats.total, shouldStop]);

  // Export JSON
  const exportResults = () => {
    if (!results) return;

    const blob = new Blob([JSON.stringify(results, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `lfw-faceapi-embeddings.json`;
    a.click();
    URL.revokeObjectURL(url);

    addLog(`Exported ${results.metadata.success_count} embeddings to JSON`, 'success');
  };

  const progress = stats.total > 0 ? (stats.processed / stats.total * 100).toFixed(1) : '0';

  return (
    <div style={styles.container}>
      <div style={styles.content}>
        <h1 style={styles.title}>LFW Dataset - face-api.js Extractor</h1>
        <p style={styles.subtitle}>
          Extract 128D face embeddings from LFW dataset (browser-based)
        </p>

        {/* Status */}
        <div style={styles.statusBar}>
          <span>face-api.js: </span>
          <span style={{ color: isLoading ? '#eab308' : '#22c55e' }}>
            {isLoading ? 'Loading models...' : 'Ready'}
          </span>
        </div>

        {/* Step 1: Select Folder */}
        <div style={styles.panel}>
          <h2 style={styles.panelTitle}>Step 1: Select LFW Folder</h2>
          <p style={styles.hint}>Select the <code style={styles.code}>lfw-deepfunneled</code> folder containing person subfolders</p>
          <input
            ref={fileInputRef}
            type="file"
            // @ts-ignore - webkitdirectory is valid but not in types
            webkitdirectory="true"
            multiple
            onChange={handleFolderSelect}
            style={{ display: 'none' }}
          />
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={isLoading || isProcessing}
            style={styles.primaryButton}
          >
            Select LFW Folder
          </button>
          {stats.persons > 0 && (
            <span style={styles.folderInfo}>
              {stats.persons} persons, {stats.total} images
            </span>
          )}
        </div>

        {/* Step 2: Extract */}
        <div style={styles.panel}>
          <h2 style={styles.panelTitle}>Step 2: Extract Embeddings</h2>

          {/* Stats Grid */}
          <div style={styles.statsGrid}>
            <div style={styles.statBox}>
              <div style={styles.statValue}>{stats.persons}</div>
              <div style={styles.statLabel}>Persons</div>
            </div>
            <div style={styles.statBox}>
              <div style={styles.statValue}>{stats.processed}</div>
              <div style={styles.statLabel}>Processed</div>
            </div>
            <div style={styles.statBox}>
              <div style={styles.statValue}>{stats.success}</div>
              <div style={styles.statLabel}>Success</div>
            </div>
            <div style={styles.statBox}>
              <div style={styles.statValue}>{stats.failed}</div>
              <div style={styles.statLabel}>Failed</div>
            </div>
            <div style={styles.statBox}>
              <div style={styles.statValue}>{stats.rate}</div>
              <div style={styles.statLabel}>img/sec</div>
            </div>
          </div>

          {/* Progress Bar */}
          <div style={styles.progressBar}>
            <div style={{ ...styles.progressFill, width: `${progress}%` }}>
              {progress}%
            </div>
          </div>

          {/* Buttons */}
          <div style={styles.buttonRow}>
            <button
              onClick={startExtraction}
              disabled={isLoading || isProcessing || stats.persons === 0}
              style={styles.primaryButton}
            >
              {isProcessing ? 'Processing...' : 'Start Extraction'}
            </button>
            <button
              onClick={() => setShouldStop(true)}
              disabled={!isProcessing}
              style={styles.dangerButton}
            >
              Stop
            </button>
            <button
              onClick={exportResults}
              disabled={!results || results.metadata.success_count === 0}
              style={styles.successButton}
            >
              Export JSON
            </button>
          </div>
        </div>

        {/* Preview */}
        {previews.length > 0 && (
          <div style={styles.panel}>
            <h2 style={styles.panelTitle}>Preview (Last 20)</h2>
            <div style={styles.previewGrid}>
              {previews.map((url, idx) => (
                <img key={idx} src={url} alt="" style={styles.previewImg} />
              ))}
            </div>
          </div>
        )}

        {/* Log */}
        <div style={styles.panel}>
          <h2 style={styles.panelTitle}>Log</h2>
          <div style={styles.logBox}>
            {logs.map((log, idx) => (
              <div key={idx} style={{
                ...styles.logEntry,
                color: log.includes('ERROR') ? '#f87171' :
                       log.includes('SUCCESS') ? '#4ade80' :
                       log.includes('WARNING') ? '#fbbf24' : '#94a3b8'
              }}>
                {log}
              </div>
            ))}
          </div>
        </div>

        <a href="/" style={styles.backLink}>Back to Home</a>
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
    maxWidth: '900px',
    margin: '0 auto',
  },
  title: {
    fontSize: '1.5rem',
    fontWeight: 700,
    color: '#fff',
    margin: '0 0 0.5rem 0',
    textAlign: 'center',
  },
  subtitle: {
    fontSize: '0.9rem',
    color: '#94a3b8',
    textAlign: 'center',
    margin: '0 0 1.5rem 0',
  },
  statusBar: {
    display: 'flex',
    justifyContent: 'center',
    gap: '0.5rem',
    padding: '0.75rem',
    backgroundColor: '#1e293b',
    borderRadius: '8px',
    marginBottom: '1rem',
    fontSize: '0.9rem',
  },
  panel: {
    backgroundColor: '#1e293b',
    borderRadius: '12px',
    padding: '1.25rem',
    marginBottom: '1rem',
  },
  panelTitle: {
    fontSize: '1.1rem',
    fontWeight: 600,
    color: '#fff',
    margin: '0 0 1rem 0',
  },
  hint: {
    fontSize: '0.85rem',
    color: '#64748b',
    margin: '0 0 1rem 0',
  },
  code: {
    backgroundColor: '#0f172a',
    padding: '0.2rem 0.5rem',
    borderRadius: '4px',
    fontFamily: 'monospace',
  },
  primaryButton: {
    padding: '0.75rem 1.5rem',
    fontSize: '1rem',
    fontWeight: 600,
    color: '#fff',
    backgroundColor: '#2563eb',
    border: 'none',
    borderRadius: '8px',
    cursor: 'pointer',
    marginRight: '0.75rem',
  },
  successButton: {
    padding: '0.75rem 1.5rem',
    fontSize: '1rem',
    fontWeight: 600,
    color: '#fff',
    backgroundColor: '#16a34a',
    border: 'none',
    borderRadius: '8px',
    cursor: 'pointer',
  },
  dangerButton: {
    padding: '0.75rem 1.5rem',
    fontSize: '1rem',
    fontWeight: 600,
    color: '#fff',
    backgroundColor: '#dc2626',
    border: 'none',
    borderRadius: '8px',
    cursor: 'pointer',
    marginRight: '0.75rem',
  },
  folderInfo: {
    marginLeft: '1rem',
    color: '#4ade80',
    fontSize: '0.9rem',
  },
  statsGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(5, 1fr)',
    gap: '0.75rem',
    marginBottom: '1rem',
  },
  statBox: {
    backgroundColor: '#0f172a',
    padding: '1rem',
    borderRadius: '8px',
    textAlign: 'center',
  },
  statValue: {
    fontSize: '1.5rem',
    fontWeight: 700,
    color: '#00d9ff',
  },
  statLabel: {
    fontSize: '0.75rem',
    color: '#64748b',
    marginTop: '0.25rem',
  },
  progressBar: {
    width: '100%',
    height: '30px',
    backgroundColor: '#0f172a',
    borderRadius: '15px',
    overflow: 'hidden',
    marginBottom: '1rem',
  },
  progressFill: {
    height: '100%',
    background: 'linear-gradient(90deg, #00d9ff, #4ade80)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    color: '#0f172a',
    fontWeight: 700,
    fontSize: '0.9rem',
    transition: 'width 0.3s',
  },
  buttonRow: {
    display: 'flex',
    gap: '0.75rem',
  },
  previewGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(10, 1fr)',
    gap: '5px',
  },
  previewImg: {
    width: '100%',
    aspectRatio: '1',
    objectFit: 'cover',
    borderRadius: '4px',
  },
  logBox: {
    backgroundColor: '#0f172a',
    padding: '1rem',
    borderRadius: '8px',
    maxHeight: '300px',
    overflowY: 'auto',
    fontFamily: 'monospace',
    fontSize: '0.75rem',
  },
  logEntry: {
    margin: '2px 0',
  },
  backLink: {
    display: 'block',
    textAlign: 'center',
    color: '#64748b',
    fontSize: '0.9rem',
    textDecoration: 'none',
    padding: '1rem',
  },
};
