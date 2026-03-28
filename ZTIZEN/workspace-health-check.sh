#!/bin/bash
# Workspace Health Verification Script
# Run this to verify all fixes are working

set -e

echo "=============================================="
echo "WORKSPACE HEALTH CHECK"
echo "=============================================="
echo ""

cd /Users/wtshai/Work/Ku/SeniorProject/ZTIZEN

# 1. Check workspace structure
echo "✓ Checking workspace structure..."
if pnpm -r list --depth=0 >/dev/null 2>&1; then
    WORKSPACE_COUNT=$(pnpm -r list --depth=0 | grep -c "@zkbiown" || true)
    echo "  Found $WORKSPACE_COUNT workspace packages"
else
    echo "  ✗ Failed to list workspaces"
    exit 1
fi

# 2. Check lock file
echo "✓ Checking lock file..."
if [ -f "pnpm-lock.yaml" ]; then
    LOCK_SIZE=$(du -sh pnpm-lock.yaml | awk '{print $1}')
    echo "  Single lock file: $LOCK_SIZE"
else
    echo "  ✗ Missing root lock file"
    exit 1
fi

# 3. Check for stray lock files
echo "✓ Checking for individual package lock files..."
STRAY_LOCKS=$(find . -name "pnpm-lock.yaml" -not -path "./pnpm-lock.yaml" | wc -l | tr -d ' ')
if [ "$STRAY_LOCKS" -eq 0 ]; then
    echo "  No stray lock files ✓"
else
    echo "  ✗ Found $STRAY_LOCKS stray lock files"
    exit 1
fi

# 4. Check install speed
echo "✓ Testing install speed..."
START=$(date +%s)
pnpm install >/dev/null 2>&1
END=$(date +%s)
DURATION=$((END - START))
if [ "$DURATION" -lt 10 ]; then
    echo "  Install completed in ${DURATION}s ✓"
else
    echo "  ⚠ Install took ${DURATION}s (expected <10s)"
fi

# 5. Check experimental poseidon-lite
echo "✓ Checking experimental/poseidon-lite..."
if [ -L "experimental/node_modules/poseidon-lite" ]; then
    TARGET=$(readlink experimental/node_modules/poseidon-lite)
    if [[ "$TARGET" == *"poseidon-lite@0.3.0"* ]]; then
        echo "  Correct version (0.3.0) ✓"
    else
        echo "  ✗ Wrong version: $TARGET"
        exit 1
    fi
else
    echo "  ✗ Symlink missing"
    exit 1
fi

# 6. Check package.json for install script
echo "✓ Checking for problematic install script..."
if grep -q '"install"' package.json 2>/dev/null; then
    echo "  ✗ Found 'install' script (should be removed)"
    exit 1
else
    echo "  No install script ✓"
fi

# 7. Test experimental pipeline
echo "✓ Testing experimental pipeline (Step 4 only)..."
cd experimental
if pnpm run step4 >/dev/null 2>&1; then
    echo "  Step 4 executes successfully ✓"
else
    echo "  ✗ Step 4 failed"
    exit 1
fi
cd ..

echo ""
echo "=============================================="
echo "✅ ALL CHECKS PASSED"
echo "=============================================="
echo ""
echo "Workspace is healthy and ready to use!"
echo ""
echo "Quick commands:"
echo "  pnpm install              - Install dependencies"
echo "  pnpm --filter web run dev - Start web app"
echo "  cd experimental && pnpm run pipeline - Run full pipeline"
echo ""
