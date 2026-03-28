# Experiment Data Directory

This directory contains biometric embedding data for running experiments.

## Privacy Notice

**IMPORTANT:** Real biometric data files are NOT included in the public repository for privacy protection.

The following files are excluded via `.gitignore`:
- `real-biometric-data.json` - Real person face embeddings
- `celeba-embeddings.json` - CelebA-HQ dataset embeddings
- `three-lib-comparison.json` - Multi-library comparison data

## How to Generate Your Own Test Data

### Option 1: Use the Web Interface

1. Start the development server:
   ```bash
   pnpm dev
   ```

2. Navigate to `http://localhost:5173/collect`

3. Capture multiple face images for each person

4. Run the embedding extraction:
   ```bash
   npx tsx experiments/extract-embeddings.ts
   ```

### Option 2: Use Python Scripts

1. Place face images in `python-embeddings/sample_faces/`:
   ```
   sample_faces/
   ├── P0/
   │   ├── capture1.jpg
   │   └── capture2.jpg
   ├── P1/
   │   └── ...
   ```

2. Run the Python extraction:
   ```bash
   cd python-embeddings
   ./venv/bin/python run_metrics.py
   ```

### Option 3: Use Synthetic Data

For testing purposes, you can generate synthetic embeddings:

```bash
npx tsx experiments/generate-synthetic-data.ts
```

## Expected File Formats

### real-biometric-data.json
```json
{
  "metadata": {
    "source": "face-api.js",
    "dimension": 128,
    "timestamp": "2026-02-01T00:00:00Z"
  },
  "persons": {
    "P0": {
      "captures": {
        "capture1": [0.123, -0.456, ...],  // 128-dim vector
        "capture2": [0.124, -0.455, ...]
      }
    }
  }
}
```

### three-lib-comparison.json
```json
{
  "persons": {
    "P0": {
      "captures": {
        "capture1": {
          "faceapi": [...],      // 128D
          "facenet512": [...],   // 512D
          "arcface": [...]       // 512D
        }
      }
    }
  }
}
```

## Minimum Dataset Requirements

For meaningful experiments:
- **Minimum:** 2 persons, 2 captures each
- **Recommended:** 10+ persons, 5 captures each
- **Paper validation:** 12 persons, 5 captures each (60 total embeddings)
