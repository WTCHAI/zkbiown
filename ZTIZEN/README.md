# ZK BIOWN Implementation

> Privacy-preserving biometric authentication using Cancelable Biometrics and Zero-Knowledge Proofs

## Project Structure

This directory contains the core ZK BIOWN implementation:

```
ZTIZEN/
├── web/                  # React web application
├── circuit/              # Noir ZK circuit
└── experimental/         # Metrics validation and experiments
```

---

## 📚 Documents

### ⚠️ CRITICAL DECISION DOCUMENTS - **READ BEFORE IMPLEMENTING**

#### 1. [CRITICAL_ANALYSIS_ZK_NECESSITY.md](./CRITICAL_ANALYSIS_ZK_NECESSITY.md) 🚨
**Do You Really Need ZK? Security Audit? Future-proofing?**

Honest analysis of whether ZK is overkill:
- 🔍 **Critical Issues**: Device trust problem, backend compromise, nonce desync
- 💰 **Cost Analysis**: $390K with ZK vs $200K without ZK
- ⚡ **Simpler Alternative**: Signature-based auth achieves 80% of goals for 50% cost
- 🎯 **Recommendation**: Hybrid approach - start simple, add ZK when proven valuable
- 📋 **Security Audit Scope**: What you need regardless of ZK choice ($90K-$150K)

**When to read**: BEFORE committing to ZK implementation

#### 2. [TRUSTLESS_ARCHITECTURE_OPTIONS.md](./TRUSTLESS_ARCHITECTURE_OPTIONS.md) ⭐ **RECOMMENDED**
**If You Want Trustless: How to Do It Right**

Addresses your critical questions:
- ✅ **Liveness check fixes device trust** - Face ID/Touch ID at enrollment solves the problem
- ✅ **User-controlled encryption** - Backend can't decrypt, only user has key
- ✅ **Where to store auth_commit** - IPFS hybrid: on-chain hash + decentralized storage
- 💰 **Cost comparison**: 4 trustless options from $10-$50 per enrollment
- 🏗️ **IPFS Hybrid (recommended)**: Trustless, decentralized, 10x cheaper than full on-chain

**Key Insight**: With liveness at enrollment + user-controlled encryption + IPFS storage, you achieve true trustlessness without storing biometric data on-chain.

**When to read**: If trustlessness is your primary goal

---

### 1. [FLOW_VISUALIZATION.md](./FLOW_VISUALIZATION.md) - **START HERE** ⭐⭐⭐⭐
**Complete Step-by-Step Flow with All Actors**

Visual guide showing interactions between User Device, Product Owner, ZITZEN Backend, and Smart Contract:
- ✅ **Where nonce comes from**: Smart contract registration and tracking
- ✅ **Where b_partial_key comes from**: Product Owner during registration
- ✅ **Phase 0**: Initial setup (seed generation + product registration)
- ✅ **Phase 1**: Enrollment flow (all 7 steps with diagrams)
- ✅ **Phase 2**: Authentication flow (all 12 steps with diagrams)
- ✅ **Phase 3**: Subsequent authentications (rotating commitments)
- ✅ **Phase 4**: Revocation via version increment
- ✅ **Security properties**: Where each secret lives
- ✅ **Data flow summary**: What data flows where

**When to use**: Best starting point to understand complete system interactions

---

### 2. [ZITZEN_CORRECTED_FLOW.md](./ZITZEN_CORRECTED_FLOW.md) - **TECHNICAL SPECIFICATION** ⭐⭐⭐
**CORRECTED: Exact Flow as Specified**

**AUTHORITATIVE TECHNICAL SPECIFICATION** - matches your exact clarified flow:
- ✅ **Per-element digestor**: `digestor(i) = math.randSeed(seed+i, raw_biometric[i])` → binary
- ✅ **Commitment with all params**: `Poseidon(binary[128], seed, partial_key, nonce, version)`
- ✅ **Rotating commitments**: Nonce included in commitment, rotates each session
- ✅ **Fuzzy matching**: Circuit compares 128 elements, requires ≥80% match
- ✅ **Double replay protection**: Nonce increment + commitment rotation
- ✅ **Complete Noir circuit** with fuzzy matching logic
- ✅ **Enrollment stores encrypted enrolled_biometric** on backend
- ✅ **Smart contracts** updated for fuzzy verification

**Key Corrections from Previous Spec**:
- ❌ Matrix multiplication → ✅ Per-element digestor
- ❌ Exact hash match → ✅ 80% threshold fuzzy matching
- ❌ Only store hash → ✅ Store encrypted enrolled_biometric
- ❌ Nonce separate → ✅ Nonce IN commitment (rotating)

**When to use**: This is THE implementation guide (supersedes all previous versions)

---

### 3. [FLOW_COMPARISON.md](./FLOW_COMPARISON.md) - 8KB, 300+ lines
**Quick Reference: What Changed**

Visual comparison showing differences between original (wrong) and corrected (right) approach:
- ✅ Side-by-side comparison tables
- ✅ Why matrix multiplication was wrong
- ✅ Why fuzzy matching is required
- ✅ Nonce handling explained

**When to use**: Quick reference when reviewing old docs wondering "what's different?"

---

### 4. [IMPLEMENTATION_SUMMARY.md](./IMPLEMENTATION_SUMMARY.md) - 11KB, 461 lines
**Alternative: Arkworks Implementation Plan**

Comprehensive guide for implementing ZITZEN with:
- **Arkworks (Rust)** for ZK circuits
- **Groth16** proving system (faster but needs trusted setup)
- Performance: ~180ms proving, ~1.3ms verification

**When to use**: Only if you migrate to Arkworks later for performance optimization

---

### 5. [NOIR_ARCHITECTURE_REFERENCE.md](./NOIR_ARCHITECTURE_REFERENCE.md) - 30KB, 1076 lines
**Noir Implementation Reference (RECOMMENDED)**

Detailed analysis of your existing Noir projects with:
- ✅ Complete Noir circuit examples (biometric + encryption)
- ✅ face-api.js integration for biometric capture
- ✅ Frontend integration patterns (Next.js + TypeScript)
- ✅ Real working code from your projects
- ✅ Step-by-step adaptation strategy for ZITZEN

**Key sections**:
1. Noir project structure
2. Biometric capture with face-api.js (128-dimensional face embeddings)
3. Noir circuit implementation (matching + encryption + ECDSA)
4. Frontend integration (@noir-lang/noir_js + @aztec/bb.js)
5. Encryption layer (double AES with Poseidon)
6. ZITZEN adaptation strategy

**When to use**: Your primary reference for implementation (start here!)

---

### 6. [TECH_STACK_COMPARISON.md](./TECH_STACK_COMPARISON.md) - 11KB, 472 lines
**Arkworks vs Noir Decision Guide**

Head-to-head comparison covering:
- ⚡ Performance (proof size, speed, gas costs)
- 🛠️ Developer experience
- 🔗 Frontend integration
- 🔐 Security & trust assumptions
- 💰 Cost analysis (Ethereum L1 vs L2)
- 🎯 Use case recommendations

**Recommendation**: **Start with Noir**
- Faster development (2-3x)
- Better TypeScript integration
- Easier testing
- No trusted setup needed
- Can migrate to Arkworks later if needed

**Performance trade-off**:
- Noir: ~5s proof generation (browser)
- Arkworks: ~180ms proof generation (native)
- **Conclusion**: Acceptable for MVP, optimize later if needed

---

### 7. [QUICK_START_NOIR.md](./QUICK_START_NOIR.md) - 15KB, 648 lines
**Hands-On Implementation Guide**

Get started in 30 minutes with:
1. ⚙️ Install Noir (`noirup`)
2. 🔧 Create first circuit
3. 🧪 Compile and test
4. 🌐 Frontend integration (Next.js)
5. 📜 Smart contract deployment
6. 🧪 End-to-end testing

**Includes**:
- Complete biometric circuit code
- React components for face capture
- Noir context provider
- Contract examples
- Common issues & solutions

**When to use**: When you're ready to start coding!

---

## 🚀 Recommended Implementation Path

### Phase 1: Prototype with Noir (Weeks 1-6)

**Why Noir?**
- ✅ You already have working Noir code to reference
- ✅ Faster development cycle
- ✅ Better tooling and debugging
- ✅ Easier team onboarding
- ✅ No trusted setup ceremony

**Steps**:
1. Read [NOIR_ARCHITECTURE_REFERENCE.md](./NOIR_ARCHITECTURE_REFERENCE.md)
2. Follow [QUICK_START_NOIR.md](./QUICK_START_NOIR.md) to set up
3. Adapt circuit from `/Users/wtshai/Work/Personal/zkBiownt/PoCzkbio/research_noir`
4. Use frontend patterns from `/Users/wtshai/Work/Hackathon/Stupido/YoungGuRuPikad`
5. Deploy to testnet and validate

**Expected timeline**: 6-8 weeks to MVP

### Phase 2: Optimize (If Needed)

Only if performance becomes a bottleneck:
1. Read [TECH_STACK_COMPARISON.md](./TECH_STACK_COMPARISON.md)
2. Migrate critical circuits to Arkworks
3. Use [IMPLEMENTATION_SUMMARY.md](./IMPLEMENTATION_SUMMARY.md) as reference

**When to optimize**:
- User base > 10k daily authentications
- Performance complaints
- L1 mainnet deployment required

---

## 📊 Key Metrics

### Noir (Recommended for MVP)
| Metric | Value |
|--------|-------|
| Proof generation | 3-8 seconds (browser) |
| Proof verification | 50-200ms (on-chain) |
| Proof size | 1-2 KB |
| Gas cost | ~400k (~$12 on L1, $0.00006 on L2) |
| Development time | Fast (high-level syntax) |
| Trusted setup | ❌ Not required (UltraHonk) |

### Arkworks (For Later Optimization)
| Metric | Value |
|--------|-------|
| Proof generation | 180ms (native Rust) |
| Proof verification | 1.3ms (on-chain) |
| Proof size | 128 bytes |
| Gas cost | ~250k (~$7.50 on L1) |
| Development time | Slow (manual constraints) |
| Trusted setup | ✅ Required (MPC ceremony) |

---

## 🧪 Your Existing Reference Code

You have two excellent reference projects:

### 1. zkBiownt - `/Users/wtshai/Work/Personal/zkBiownt/PoCzkbio`

**What it has**:
- ✅ `research_noir/`: Full biometric circuit with:
  - Euclidean distance matching
  - Double AES encryption
  - ECDSA signature verification
  - Poseidon hashing
- ✅ `research_encryption/`: TypeScript utilities for:
  - Descriptor scaling
  - AES encryption/decryption
  - Poseidon key derivation
- ✅ `researchFaceApp/`: Next.js app with:
  - face-api.js integration
  - Real-time face detection
  - 128-dimensional embeddings
  - Averaging 10 captures for stability

**Key learnings**:
- Biometric matching in ZK is feasible
- face-api.js provides good 128-dim embeddings
- Averaging multiple captures reduces noise
- Double encryption adds privacy layer

### 2. YoungGuRuPikad - `/Users/wtshai/Work/Hackathon/Stupido/YoungGuRuPikad`

**What it has**:
- ✅ `yg-circuit/`: Simple Noir circuit (point in circle)
- ✅ `web/`: Production-quality Next.js integration:
  - Noir context provider
  - Proof generation hooks
  - Proof formatting utilities
  - Contract interaction patterns

**Key learnings**:
- Noir + Next.js integration is smooth
- `@noir-lang/noir_js` + `@aztec/bb.js` work well
- Proof formatting for Solidity is straightforward
- UltraHonk backend is production-ready

---

## 🎯 Recommended Reading Order

### For Complete System Understanding (START HERE):
1. **[FLOW_VISUALIZATION.md](./FLOW_VISUALIZATION.md)** ⭐⭐⭐⭐ - **READ THIS FIRST**
   - Visual step-by-step guide with all actors
   - Shows where nonce comes from (smart contract)
   - Shows where b_partial_key comes from (product owner)
   - Complete enrollment and authentication flows
   - Data flow between all components

2. **[ZITZEN_CORRECTED_FLOW.md](./ZITZEN_CORRECTED_FLOW.md)** ⭐⭐⭐ - **TECHNICAL SPECIFICATION**
   - **CORRECTED**: Matches your exact clarified flow
   - Per-element digestor: `digestor(i, bio[i], seed)`
   - Fuzzy matching with 80% threshold
   - Full Noir circuit with element-wise comparison
   - Enrollment stores encrypted enrolled_biometric
   - Updated smart contracts

### For Understanding Changes:
3. [FLOW_COMPARISON.md](./FLOW_COMPARISON.md) - What changed from original spec

### For Implementation Details:
4. [QUICK_START_NOIR.md](./QUICK_START_NOIR.md) - Get coding in 30 minutes
5. [NOIR_ARCHITECTURE_REFERENCE.md](./NOIR_ARCHITECTURE_REFERENCE.md) - Reference your existing projects

### For Decision Validation:
6. [TECH_STACK_COMPARISON.md](./TECH_STACK_COMPARISON.md) - Why Noir over Arkworks

### For Later Optimization (Optional):
7. [IMPLEMENTATION_SUMMARY.md](./IMPLEMENTATION_SUMMARY.md) - Arkworks migration guide (if needed)

---

## 🎬 Live Demos - **TRY IT NOW!**

### 1. Vite Demo (Full Stack with Noir) ⭐⭐⭐ **RECOMMENDED**

Complete working demo with biometric capture AND ZK proof generation:

```bash
# Navigate to vite-demo folder
cd /Users/wtshai/Work/Ku/SeniorProject/ZTIZEN/vite-demo

# Install dependencies
npm install

# Download face-api.js models
./download-models.sh

# Compile Noir circuit
npm run compile:circuit

# Start dev server
npm run dev
# Open: http://localhost:5173
```

**What it does:**
- ✅ **Enrollment**: Capture face → Digest to binary → Store encrypted
- ✅ **Authentication**: Capture face → Compare fuzzy match → Generate ZK proof
- ✅ **Noir Integration**: Real ZK proof generation with circuit
- ✅ **Complete Flow**: End-to-end biometric auth with privacy
- ✅ **Production-ready**: TypeScript + React + Vite + Noir

**See**: `/vite-demo/README.md` for full documentation

---

### 2. Simple HTML Demo (Biometric Capture Only)

Standalone demo for testing just biometric capture:

```bash
# Navigate to demo folder
cd /Users/wtshai/Work/Ku/SeniorProject/ZTIZEN/demo

# Option 1: Open HTML directly
open biometric-capture-demo.html

# Option 2: Serve with HTTP server
python3 -m http.server 8000
# Then open: http://localhost:8000/biometric-capture-demo.html
```

**What it does:**
- 📷 Real-time face detection with overlay
- 🧬 Extracts 128-dimensional face embeddings
- 📊 Shows confidence scores and statistics
- 💾 Export biometric data as JSON
- ✨ No build tools needed

**See**: `/demo/README.md` for detailed instructions

---

## 🔧 Quick Commands Reference

### Noir Development
```bash
# Install Noir
curl -L https://raw.githubusercontent.com/noir-lang/noirup/main/install | bash
noirup

# Create circuit
nargo new my-circuit
cd my-circuit

# Compile
nargo compile

# Test
nargo test

# Generate verifier
nargo codegen-verifier
```

### Frontend Setup
```bash
# Create Next.js app
npx create-next-app@latest --typescript --tailwind

# Install Noir libraries
npm install @noir-lang/noir_js @noir-lang/acvm_js @noir-lang/noirc_abi @aztec/bb.js

# Install biometric libraries
npm install face-api.js react-webcam
```

### Contracts
```bash
# Create Foundry project
forge init contracts

# Deploy
forge script script/Deploy.s.sol --rpc-url $RPC_URL --broadcast
```

---

## 📞 Support & Resources

### Official Documentation
- **Noir**: https://noir-lang.org/docs
- **Aztec (bb.js)**: https://docs.aztec.network/
- **face-api.js**: https://github.com/justadudewhohacks/face-api.js

### Community
- **Noir Discord**: https://discord.gg/aztec
- **Noir GitHub**: https://github.com/noir-lang/noir

### Your Reference Projects
- **zkBiownt**: `/Users/wtshai/Work/Personal/zkBiownt/PoCzkbio`
- **YoungGuRuPikad**: `/Users/wtshai/Work/Hackathon/Stupido/YoungGuRuPikad`

---

## 🎓 Learning Resources

### Beginner (Start Here)
1. Read [QUICK_START_NOIR.md](./QUICK_START_NOIR.md)
2. Complete Noir tutorial: https://noir-lang.org/tutorials/noirjs_app
3. Study your YoungGuRuPikad project

### Intermediate
1. Read [NOIR_ARCHITECTURE_REFERENCE.md](./NOIR_ARCHITECTURE_REFERENCE.md)
2. Study your zkBiownt research_noir circuit
3. Build enrollment flow

### Advanced
1. Optimize circuit constraints
2. Implement fuzzy extraction (BCH codes)
3. Consider Arkworks migration ([IMPLEMENTATION_SUMMARY.md](./IMPLEMENTATION_SUMMARY.md))

---

## ✅ Checklist for Getting Started

- [ ] Install Noir (`noirup`)
- [ ] Read TECH_STACK_COMPARISON.md (confirm Noir choice)
- [ ] Read QUICK_START_NOIR.md
- [ ] Create first test circuit
- [ ] Review zkBiownt research_noir code
- [ ] Review YoungGuRuPikad frontend integration
- [ ] Set up Next.js app
- [ ] Integrate face-api.js
- [ ] Build enrollment flow
- [ ] Build authentication flow
- [ ] Deploy to testnet
- [ ] Beta testing

---

## 📈 Success Metrics

### MVP Goals (6-8 weeks)
- [ ] Working enrollment (capture + commitment)
- [ ] Working authentication (proof generation + verification)
- [ ] Deployed to testnet
- [ ] 10 beta users successfully authenticated

### Production Goals (12-16 weeks)
- [ ] <5s authentication time
- [ ] <$1 per auth on L2
- [ ] Security audit completed
- [ ] Mainnet deployment
- [ ] 100+ active users

---

**Last Updated**: 2025-11-28
**Status**: Ready for implementation
**Recommended**: Start with Noir (QUICK_START_NOIR.md)
