#!/bin/bash

# HonkVerifier Verification Script
# Usage: ./scripts/verify-honk.sh <CONTRACT_ADDRESS> <NETWORK>
#
# Example:
#   ./scripts/verify-honk.sh 0x1234...5678 sepolia
#   ./scripts/verify-honk.sh 0x1234...5678 baseSepolia

CONTRACT_ADDRESS=$1
NETWORK=${2:-sepolia}

# HonkVerifier has no constructor parameters

if [ -z "$CONTRACT_ADDRESS" ]; then
  echo "❌ Error: Contract address is required"
  echo "Usage: ./scripts/verify-honk.sh <CONTRACT_ADDRESS> <NETWORK>"
  exit 1
fi

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "🔍 Verifying HonkVerifier on $NETWORK"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "Contract: $CONTRACT_ADDRESS"
echo "Network: $NETWORK"
echo ""

npx hardhat verify --network "$NETWORK" "$CONTRACT_ADDRESS"

if [ $? -eq 0 ]; then
  echo ""
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo "✅ HonkVerifier verified successfully!"
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
else
  echo ""
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo "❌ Verification failed!"
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  exit 1
fi
