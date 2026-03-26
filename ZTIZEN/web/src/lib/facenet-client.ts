/**
 * FaceNet API Client
 * Calls Python server for face embedding extraction
 * Server: /python-facenet-server/server.py
 */

const FACENET_SERVER = import.meta.env.VITE_FACENET_URL || 'http://localhost:5000';

export interface FaceNetEmbedding {
  embedding: number[];  // 128-dim
  dimension: number;    // Always 128
}

/**
 * Check if FaceNet server is running and healthy
 */
export async function checkFaceNetServerHealth(): Promise<boolean> {
  try {
    const response = await fetch(`${FACENET_SERVER}/health`, {
      method: 'GET',
    });
    const data = await response.json();
    return data.status === 'ok' && data.embedding_dim === 128;
  } catch (error) {
    console.error('FaceNet server health check failed:', error);
    return false;
  }
}

/**
 * Extract FaceNet embedding from video element
 * Captures current frame and sends to Python server
 */
export async function extractFaceNetEmbeddingFromVideo(
  video: HTMLVideoElement
): Promise<FaceNetEmbedding | null> {
  try {
    // Capture frame from video
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');

    if (!ctx) {
      throw new Error('Canvas context not available');
    }

    ctx.drawImage(video, 0, 0);
    const imageData = canvas.toDataURL('image/png');

    // Call Python server
    const response = await fetch(`${FACENET_SERVER}/extract-embedding-webcam`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ imageData }),
    });

    const result = await response.json();

    if (!result.success) {
      console.error('FaceNet extraction failed:', result.error);
      return null;
    }

    console.log('✅ FaceNet embedding extracted:', {
      dimension: result.dimension,
      firstValues: result.embedding.slice(0, 5).map((v: number) => v.toFixed(3)),
    });

    return {
      embedding: result.embedding,
      dimension: result.dimension,
    };
  } catch (error) {
    console.error('FaceNet client error:', error);
    return null;
  }
}

/**
 * Extract FaceNet embedding from canvas ImageData
 */
export async function extractFaceNetEmbeddingFromImageData(
  imageDataUrl: string
): Promise<FaceNetEmbedding | null> {
  try {
    const response = await fetch(`${FACENET_SERVER}/extract-embedding-webcam`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ imageData: imageDataUrl }),
    });

    const result = await response.json();

    if (!result.success) {
      console.error('FaceNet extraction failed:', result.error);
      return null;
    }

    return {
      embedding: result.embedding,
      dimension: result.dimension,
    };
  } catch (error) {
    console.error('FaceNet client error:', error);
    return null;
  }
}
