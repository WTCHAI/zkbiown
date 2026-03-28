#!/bin/bash
# Worker 4: Download celebrities 318-423 (106 people)
# Run this in a separate terminal tab

cd "$(dirname "$0")"

echo "=============================================================="
echo "  Worker 4: Downloading celebrities 318-423 (106 people)"
echo "=============================================================="
echo "  Start time: $(date)"
echo ""

python3 -u download_facescrub.py \
    --people-start 318 \
    --people-end 424 \
    --images 50 \
    --workers 8 \
    --worker-id 4

echo ""
echo "  End time: $(date)"
echo "=============================================================="
echo "  Worker 4: Complete"
echo "=============================================================="
