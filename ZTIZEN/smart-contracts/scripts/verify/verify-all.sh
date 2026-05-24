#!/bin/bash

# ZTIZEN System Verification Script
# Verifies both HonkVerifier and ZTIZEN contracts
#
# Usage: ./scripts/verify-all.sh <NETWORK> [DEPLOYMENT_FILE]
#
# Example:
#   ./scripts/verify-all.sh sepolia
#   ./scripts/verify-all.sh sepolia ./deployments/sepolia-1733308800000.json

NETWORK=${1:-sepolia}
DEPLOYMENT_FILE=$2

if [ -z "$DEPLOYMENT_FILE" ]; then
  # Find the latest deployment file for the network
  DEPLOYMENT_FILE=$(ls -t ./deployments/${NETWORK}-*.json 2>/dev/null | head -n 1)
fi

if [ -z "$DEPLOYMENT_FILE" ] || [ ! -f "$DEPLOYMENT_FILE" ]; then
  echo "❌ Error: No deployment file found for network $NETWORK"
  echo ""
  echo "Usage: ./scripts/verify-all.sh <NETWORK> [DEPLOYMENT_FILE]"
  echo ""
  echo "Or set addresses manually:"
  echo "  export HONK_VERIFIER_ADDRESS=0x..."
  echo "  export ZTIZEN_ADDRESS=0x..."
  echo "  ./scripts/verify-all.sh $NETWORK"
  exit 1
fi

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "🔍 ZTIZEN System Verification"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "Network: $NETWORK"
echo "Deployment file: $DEPLOYMENT_FILE"
echo ""

# Extract addresses from deployment file
HONK_VERIFIER=$(cat "$DEPLOYMENT_FILE" | grep -o '"HonkVerifier": *"[^"]*"' | grep -o '0x[a-fA-F0-9]*')
ZTIZEN=$(cat "$DEPLOYMENT_FILE" | grep -o '"ZTIZEN": *"[^"]*"' | grep -o '0x[a-fA-F0-9]*')

# Fallback to environment variables if not found in file
HONK_VERIFIER=${HONK_VERIFIER:-$HONK_VERIFIER_ADDRESS}
ZTIZEN=${ZTIZEN:-$ZTIZEN_ADDRESS}

if [ -z "$HONK_VERIFIER" ] || [ -z "$ZTIZEN" ]; then
  echo "❌ Error: Could not extract contract addresses"
  echo "HonkVerifier: $HONK_VERIFIER"
  echo "ZTIZEN: $ZTIZEN"
  exit 1
fi

echo "📋 Contract Addresses:"
echo "  HonkVerifier: $HONK_VERIFIER"
echo "  ZTIZEN: $ZTIZEN"
echo ""

# Step 1: Verify HonkVerifier
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "1️⃣  Verifying HonkVerifier..."
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
./scripts/verify-honk.sh "$HONK_VERIFIER" "$NETWORK"

if [ $? -ne 0 ]; then
  echo "⚠️  HonkVerifier verification failed, continuing..."
fi

echo ""

# Step 2: Verify ZTIZEN
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "2️⃣  Verifying ZTIZEN..."
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
./scripts/verify-ztizen.sh "$ZTIZEN" "$HONK_VERIFIER" "$NETWORK"

if [ $? -ne 0 ]; then
  echo "⚠️  ZTIZEN verification failed"
  exit 1
fi

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "✅ All contracts verified successfully!"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
