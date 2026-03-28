#!/bin/bash
# Worker 2: Download celebrities 106-211 (106 people)
# Run this in a separate terminal tab

cd "$(dirname "$0")"

echo "=============================================================="
echo "  Worker 2: Downloading celebrities 106-211 (106 people)"
echo "=============================================================="
echo "  Start time: $(date)"
echo ""

python3 -u download_facescrub.py \
    --people-start 106 \
    --people-end 212 \
    --images 50 \
    --workers 8 \
    --worker-id 2

echo ""
echo "  End time: $(date)"
echo "=============================================================="
echo "  Worker 2: Complete"
echo "=============================================================="
