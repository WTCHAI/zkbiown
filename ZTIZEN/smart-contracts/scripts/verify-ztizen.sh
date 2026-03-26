#!/bin/bash

# ZTIZEN Verification Script
# Usage: ./scripts/verify-ztizen.sh <CONTRACT_ADDRESS> <VERIFIER_ADDRESS> <NETWORK>
#
# Example:
#   ./scripts/verify-ztizen.sh 0x1234...5678 0xabcd...ef00 sepolia
#   ./scripts/verify-ztizen.sh 0x1234...5678 0xabcd...ef00 baseSepolia

CONTRACT_ADDRESS=$1
VERIFIER_ADDRESS=$2
NETWORK=${3:-sepolia}

if [ -z "$CONTRACT_ADDRESS" ] || [ -z "$VERIFIER_ADDRESS" ]; then
  echo "❌ Error: Contract address and verifier address are required"
  echo "Usage: ./scripts/verify-ztizen.sh <CONTRACT_ADDRESS> <VERIFIER_ADDRESS> <NETWORK>"
  exit 1
fi

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "🔍 Verifying ZTIZEN on $NETWORK"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "Contract: $CONTRACT_ADDRESS"
echo "Verifier: $VERIFIER_ADDRESS"
echo "Network: $NETWORK"
echo ""

npx hardhat verify --network "$NETWORK" "$CONTRACT_ADDRESS" "$VERIFIER_ADDRESS"

if [ $? -eq 0 ]; then
  echo ""
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo "✅ ZTIZEN verified successfully!"
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
else
  echo ""
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo "❌ Verification failed!"
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  exit 1
fi
