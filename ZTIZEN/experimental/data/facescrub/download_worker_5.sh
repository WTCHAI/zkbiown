#!/bin/bash
# Worker 5: Download celebrities 424-530 (106 people)
# Run this in a separate terminal tab

cd "$(dirname "$0")"

echo "=============================================================="
echo "  Worker 5: Downloading celebrities 424-530 (106 people)"
echo "=============================================================="
echo "  Start time: $(date)"
echo ""

python3 -u download_facescrub.py \
    --people-start 424 \
    --people-end 530 \
    --images 50 \
    --workers 8 \
    --worker-id 5

echo ""
echo "  End time: $(date)"
echo "=============================================================="
echo "  Worker 5: Complete"
echo "=============================================================="
