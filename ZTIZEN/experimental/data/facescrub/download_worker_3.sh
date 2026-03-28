#!/bin/bash
# Worker 3: Download celebrities 212-317 (106 people)
# Run this in a separate terminal tab

cd "$(dirname "$0")"

echo "=============================================================="
echo "  Worker 3: Downloading celebrities 212-317 (106 people)"
echo "=============================================================="
echo "  Start time: $(date)"
echo ""

python3 -u download_facescrub.py \
    --people-start 212 \
    --people-end 318 \
    --images 50 \
    --workers 8 \
    --worker-id 3

echo ""
echo "  End time: $(date)"
echo "=============================================================="
echo "  Worker 3: Complete"
echo "=============================================================="
