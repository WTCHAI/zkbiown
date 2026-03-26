/**
 * FaceScrub Dataset - face-api.js Batch Extractor
 *
 * Extracts 128D embeddings from FaceScrub dataset using face-api.js in browser.
 * Select the faceScrub/images folder and it auto-processes all images.
 *
 * Output: JSON with faceapi embeddings for all persons with 2+ images
 */

import { createFileRoute } from '@tanstack/react-router';
import { useRef, useState, useEffect } from 'react';
import * as faceapi from 'face-api.js';

export const Route = createFileRoute('/facescrub-extract')({
  component: FaceScrubExtractPage,
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

function FaceScrubExtractPage() {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

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
    // FaceScrub structure: faceScrub/images/Person Name/image.jpg
    Array.from(files).forEach(file => {
      if (!file.type.startsWith('image/') && !file.name.endsWith('.jpg') && !file.name.endsWith('.png')) {
        return;
      }

      const parts = file.webkitRelativePath.split('/');
      // Expected: images/Person Name/123.jpg OR faceScrub/images/Person Name/123.jpg
      let personName: string | null = null;

      for (let i = 0; i < parts.length - 1; i++) {
        if (parts[i] === 'images' && i + 1 < parts.length - 1) {
          personName = parts[i + 1];
          break;
        }
      }

      // Fallback: just use parent folder name
      if (!personName && parts.length >= 2) {
        personName = parts[parts.length - 2];
      }

      if (personName && !personName.startsWith('.')) {
        if (!folders.has(personName)) {
          folders.set(personName, []);
        }
        folders.get(personName)!.push(file);
      }
    });

    // Filter to persons with 2+ images
    const filteredFolders = new Map<string, File[]>();
    folders.forEach((files, name) => {
      if (files.length >= 2) {
        filteredFolders.set(name, files);
      }
    });

    setPersonFolders(filteredFolders);

    const totalImages = Array.from(filteredFolders.values()).reduce((sum, files) => sum + files.length, 0);
    setStats(prev => ({
      ...prev,
      persons: filteredFolders.size,
      total: totalImages,
    }));

    addLog(`Found ${filteredFolders.size} persons with ${totalImages} images`, 'info');
  };

  // Extract embedding from image
  const extractEmbedding = async (file: File): Promise<number[] | null> => {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = async () => {
        try {
          const detection = await faceapi
            .detectSingleFace(img)
            .withFaceLandmarks()
            .withFaceDescriptor();

          if (detection) {
            // Show preview occasionally
            if (Math.random() < 0.02 && canvasRef.current) {
              const canvas = canvasRef.current;
              canvas.width = Math.min(img.width, 200);
              canvas.height = (canvas.width / img.width) * img.height;
              const ctx = canvas.getContext('2d');
              ctx?.drawImage(img, 0, 0, canvas.width, canvas.height);
              setPreviews(prev => [canvas.toDataURL(), ...prev.slice(0, 4)]);
            }
            resolve(Array.from(detection.descriptor));
          } else {
            resolve(null);
          }
        } catch {
          resolve(null);
        }
        URL.revokeObjectURL(img.src);
      };
      img.onerror = () => {
        URL.revokeObjectURL(img.src);
        resolve(null);
      };
      img.src = URL.createObjectURL(file);
    });
  };

  // Process all images
  const processAllImages = async () => {
    if (personFolders.size === 0) return;

    setIsProcessing(true);
    setShouldStop(false);
    setResults(null);

    const startTime = Date.now();
    const persons: Record<string, PersonData> = {};
    let processed = 0;
    let success = 0;
    let failed = 0;

    const sortedPersons = Array.from(personFolders.entries()).sort((a, b) => a[0].localeCompare(b[0]));

    for (const [personName, files] of sortedPersons) {
      if (shouldStop) {
        addLog('Processing stopped by user', 'warning');
        break;
      }

      const personKey = personName.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '');
      const captures: Record<string, { faceapi: number[] }> = {};

      for (const file of files) {
        if (shouldStop) break;

        const embedding = await extractEmbedding(file);
        processed++;

        if (embedding) {
          const captureId = file.name.replace(/\.[^/.]+$/, '');
          captures[captureId] = { faceapi: embedding };
          success++;
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
          rate: processed / elapsed,
        });
      }

      // Only save if 2+ successful extractions
      if (Object.keys(captures).length >= 2) {
        persons[personKey] = {
          description: `FaceScrub celebrity ${personName}`,
          original_name: personName,
          captures,
        };
        addLog(`✓ ${personName}: ${Object.keys(captures).length} embeddings`, 'success');
      } else {
        addLog(`✗ ${personName}: only ${Object.keys(captures).length} embeddings (skipped)`, 'warning');
      }
    }

    const totalTime = (Date.now() - startTime) / 1000;

    const result: ExtractionResult = {
      description: 'FaceScrub embeddings extracted with face-api.js (128D)',
      metadata: {
        source: 'FaceScrub',
        library: 'face-api.js',
        dimension: 128,
        extraction_date: new Date().toISOString(),
        total_persons: Object.keys(persons).length,
        total_images: success,
        success_count: success,
        fail_count: failed,
        extraction_time_seconds: totalTime,
        images_per_second: processed / totalTime,
      },
      persons,
    };

    setResults(result);
    setIsProcessing(false);

    addLog(`Extraction complete: ${Object.keys(persons).length} persons, ${success} embeddings`, 'success');
  };

  // Download results
  const downloadResults = () => {
    if (!results) return;
    const blob = new Blob([JSON.stringify(results, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'facescrub-faceapi-embeddings.json';
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div style={{ padding: '20px', fontFamily: 'system-ui', maxWidth: '1200px', margin: '0 auto' }}>
      <h1>FaceScrub - face-api.js Extractor</h1>
      <p>Extract 128D embeddings from FaceScrub dataset using face-api.js in browser.</p>

      {isLoading ? (
        <div style={{ padding: '20px', background: '#f0f0f0', borderRadius: '8px' }}>
          Loading face-api.js models...
        </div>
      ) : (
        <>
          <div style={{ marginBottom: '20px' }}>
            <h3>Step 1: Select FaceScrub images folder</h3>
            <input
              ref={fileInputRef}
              type="file"
              // @ts-ignore
              webkitdirectory=""
              // @ts-ignore
              directory=""
              onChange={handleFolderSelect}
              disabled={isProcessing}
              style={{ marginBottom: '10px' }}
            />
            <p style={{ color: '#666', fontSize: '14px' }}>
              Select the <code>faceScrub/images</code> folder containing celebrity subfolders.
            </p>
          </div>

          {personFolders.size > 0 && (
            <div style={{ marginBottom: '20px' }}>
              <h3>Step 2: Start extraction</h3>
              <button
                onClick={isProcessing ? () => setShouldStop(true) : processAllImages}
                style={{
                  padding: '10px 20px',
                  fontSize: '16px',
                  background: isProcessing ? '#dc3545' : '#28a745',
                  color: 'white',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: 'pointer',
                }}
              >
                {isProcessing ? 'Stop' : 'Start Extraction'}
              </button>
            </div>
          )}

          {/* Stats */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(6, 1fr)',
            gap: '10px',
            marginBottom: '20px'
          }}>
            {[
              { label: 'Persons', value: stats.persons },
              { label: 'Total', value: stats.total },
              { label: 'Processed', value: stats.processed },
              { label: 'Success', value: stats.success },
              { label: 'Failed', value: stats.failed },
              { label: 'Rate', value: `${stats.rate.toFixed(1)}/s` },
            ].map(({ label, value }) => (
              <div key={label} style={{
                padding: '10px',
                background: '#f8f9fa',
                borderRadius: '4px',
                textAlign: 'center'
              }}>
                <div style={{ fontSize: '12px', color: '#666' }}>{label}</div>
                <div style={{ fontSize: '20px', fontWeight: 'bold' }}>{value}</div>
              </div>
            ))}
          </div>

          {/* Progress bar */}
          {stats.total > 0 && (
            <div style={{ marginBottom: '20px' }}>
              <div style={{
                height: '20px',
                background: '#e9ecef',
                borderRadius: '4px',
                overflow: 'hidden'
              }}>
                <div style={{
                  height: '100%',
                  width: `${(stats.processed / stats.total) * 100}%`,
                  background: '#28a745',
                  transition: 'width 0.3s'
                }} />
              </div>
              <div style={{ textAlign: 'center', marginTop: '5px', fontSize: '14px' }}>
                {((stats.processed / stats.total) * 100).toFixed(1)}%
              </div>
            </div>
          )}

          {/* Previews and Canvas */}
          <div style={{ display: 'flex', gap: '20px', marginBottom: '20px' }}>
            <canvas ref={canvasRef} style={{ display: 'none' }} />
            {previews.map((src, i) => (
              <img
                key={i}
                src={src}
                alt={`Preview ${i}`}
                style={{ width: '100px', height: '100px', objectFit: 'cover', borderRadius: '4px' }}
              />
            ))}
          </div>

          {/* Download button */}
          {results && (
            <div style={{ marginBottom: '20px' }}>
              <h3>Step 3: Download results</h3>
              <button
                onClick={downloadResults}
                style={{
                  padding: '10px 20px',
                  fontSize: '16px',
                  background: '#007bff',
                  color: 'white',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: 'pointer',
                }}
              >
                Download JSON ({results.metadata.total_persons} persons, {results.metadata.total_images} embeddings)
              </button>
            </div>
          )}

          {/* Logs */}
          <div style={{ marginTop: '20px' }}>
            <h3>Logs</h3>
            <div style={{
              height: '300px',
              overflow: 'auto',
              background: '#1e1e1e',
              color: '#d4d4d4',
              padding: '10px',
              borderRadius: '4px',
              fontFamily: 'monospace',
              fontSize: '12px',
            }}>
              {logs.map((log, i) => (
                <div
                  key={i}
                  style={{
                    color: log.includes('ERROR') ? '#f44336' :
                           log.includes('SUCCESS') ? '#4caf50' :
                           log.includes('WARNING') ? '#ff9800' : '#d4d4d4'
                  }}
                >
                  {log}
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
