#!/bin/bash
# Worker 1: Download celebrities 0-105 (106 people)
# Run this in a separate terminal tab

cd "$(dirname "$0")"

echo "=============================================================="
echo "  Worker 1: Downloading celebrities 0-105 (106 people)"
echo "=============================================================="
echo "  Start time: $(date)"
echo ""

python3 -u download_facescrub.py \
    --people-start 0 \
    --people-end 106 \
    --images 50 \
    --workers 8 \
    --worker-id 1

echo ""
echo "  End time: $(date)"
echo "=============================================================="
echo "  Worker 1: Complete"
echo "=============================================================="
