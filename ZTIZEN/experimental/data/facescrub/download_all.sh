#!/bin/bash
# Download ALL FaceScrub celebrities using 5 parallel workers
#
# This script launches all 5 workers in the background and waits for completion.
# For manual monitoring, use individual worker scripts with separate terminal tabs.
#
# Usage:
#   ./download_all.sh              # Run all 5 workers in parallel (background)
#   ./download_all.sh --sequential # Run workers one at a time (for debugging)

cd "$(dirname "$0")"

echo "=============================================================="
echo "  FaceScrub Full Dataset Download"
echo "  530 celebrities, 5 parallel workers"
echo "=============================================================="
echo "  Start time: $(date)"
echo ""

if [[ "$1" == "--sequential" ]]; then
    echo "Running workers SEQUENTIALLY (slower, for debugging)..."
    echo ""

    ./download_worker_1.sh 2>&1 | tee worker1.log
    ./download_worker_2.sh 2>&1 | tee worker2.log
    ./download_worker_3.sh 2>&1 | tee worker3.log
    ./download_worker_4.sh 2>&1 | tee worker4.log
    ./download_worker_5.sh 2>&1 | tee worker5.log
else
    echo "Running 5 workers in PARALLEL (faster)..."
    echo "Logs: worker1.log, worker2.log, worker3.log, worker4.log, worker5.log"
    echo ""

    # Launch all workers in background
    ./download_worker_1.sh > worker1.log 2>&1 &
    PID1=$!
    ./download_worker_2.sh > worker2.log 2>&1 &
    PID2=$!
    ./download_worker_3.sh > worker3.log 2>&1 &
    PID3=$!
    ./download_worker_4.sh > worker4.log 2>&1 &
    PID4=$!
    ./download_worker_5.sh > worker5.log 2>&1 &
    PID5=$!

    echo "Worker PIDs: $PID1, $PID2, $PID3, $PID4, $PID5"
    echo ""
    echo "Waiting for all workers to complete..."
    echo "Monitor progress with: tail -f worker*.log"
    echo ""

    wait $PID1 $PID2 $PID3 $PID4 $PID5
fi

echo ""
echo "=============================================================="
echo "  Download Complete!"
echo "  End time: $(date)"
echo "=============================================================="

# Show summary
echo ""
echo "Downloaded celebrities:"
ls -1 images | wc -l

echo ""
echo "Downloaded images:"
find images -name "*.jpg" -o -name "*.png" -o -name "*.jpeg" 2>/dev/null | wc -l

echo ""
echo "Worker summaries:"
for i in 1 2 3 4 5; do
    if [[ -f "worker${i}.log" ]]; then
        echo "  Worker $i:"
        grep -E "^Total:|Pass rate:" "worker${i}.log" | sed 's/^/    /'
    fi
done

echo ""
echo "Next steps:"
echo "  1. Start embedding workers:"
echo "     cd ../../../lfw-pipeline/python"
echo "     for port in 5001 5002 5003 5004 5005; do python embedding_worker_v2.py --port \$port & done"
echo ""
echo "  2. Run extraction:"
echo "     cd ../../.."
echo "     npx tsx experiments/scripts/extract-facescrub.ts"
echo ""
