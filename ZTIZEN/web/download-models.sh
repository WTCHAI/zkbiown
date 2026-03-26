#!/bin/bash

# Download face-api.js models for ZITZEN demo

echo "📥 Downloading face-api.js models..."

mkdir -p public/models
cd public/models

BASE_URL="https://github.com/vladmandic/face-api/raw/master/model"

# SSD MobileNet v1 (Face Detection)
echo "Downloading SSD MobileNet v1..."
curl -L -O "$BASE_URL/ssd_mobilenetv1_model-weights_manifest.json"
curl -L -O "$BASE_URL/ssd_mobilenetv1_model-shard1"
curl -L -O "$BASE_URL/ssd_mobilenetv1_model-shard2"

# Face Landmark 68
echo "Downloading Face Landmark 68..."
curl -L -O "$BASE_URL/face_landmark_68_model-weights_manifest.json"
curl -L -O "$BASE_URL/face_landmark_68_model-shard1"

# Face Recognition (128-dim embeddings) - CRITICAL!
echo "Downloading Face Recognition Model (embeddings)..."
curl -L -O "$BASE_URL/face_recognition_model-weights_manifest.json"
curl -L -O "$BASE_URL/face_recognition_model-shard1"
curl -L -O "$BASE_URL/face_recognition_model-shard2"

cd ../..

echo "✅ Models downloaded successfully!"
echo ""
echo "Models location: public/models/"
ls -lh public/models/
echo ""
echo "You can now run: npm run dev"
