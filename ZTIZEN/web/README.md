# ZK BIOWN: Privacy-First Biometric Authentication

**Trustless biometric authentication using Cancelable Biometrics and Zero-Knowledge Proofs**

[![IEEE](https://img.shields.io/badge/IEEE-2026-blue)](../../docs/paper/IEEE_ZK_BIOWN_Paper.md)
[![ECTI-CARD](https://img.shields.io/badge/ECTI--CARD-2026-green)](../../docs/paper/ECTI_ZK_BIOWN_Paper.md)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

---

## Overview

ZK BIOWN is a biometric authentication system that proves identity **without revealing biometric data**. Unlike traditional systems that store biometrics in databases, ZK BIOWN:

- **Stores nothing** - Only cryptographic commitments, never biometrics
- **Enables revocation** - Change keys to create new templates (cancelable biometrics)
- **Provides mathematical privacy** - Zero-knowledge proofs guarantee no information leakage
- **Works in-browser** - Full proof generation in WASM (~15 seconds)

```
Face Image → Embedding → Transform → ZK Proof → Verified
                ↓
         Never stored
         Revocable by key change
         Mathematically private
```

---

## Key Results

Validated with 12 subjects, 60 samples, 1,770 pairs:

| Metric | Value | Meaning |
|--------|-------|---------|
| **Pearson ρ** | 0.8340 | Strong uniqueness preservation |
| **AUC** | 0.9851 | Excellent discrimination |
| **GAR@FAR=0%** | 93.3% | High genuine acceptance |
| **Cross-key decorrelation** | 22.9% ≈ 21.4% theoretical | Cancelability confirmed |
| **Gap amplification** | 3.3× | 7.6% raw → 24.8% transformed |

---

## How It Works

### Three-Party Key Distribution

```
Combined Key = SHA256(productKey || ztizenKey || userKey || version)
                  ↓
         Seed for deterministic matrix generation
         Change any key → New template → Cancelability
```

No single party can reconstruct templates:
- **Product Key**: Service provider
- **ZTIZEN Key**: Platform operator
- **User Key**: Derived from PIN + password + wallet signature

### SZQ (Symmetric Z-Score Quantization)

Converts floating-point embeddings to deterministic integer codes:

```
Z-score    | Code (below mean) | Code (above mean)
-----------|-------------------|------------------
|Z| < 0.5σ |        4          |        4
0.5-1.0σ   |        3          |        5
1.0-1.5σ   |        2          |        6
1.5-2.0σ   |        1          |        7
|Z| ≥ 2.0σ |        0          |        8
```

### ZK Circuit

```noir
fn main(
    enrolled_template: [u8; 128],    // Private
    verify_template: [u8; 128],      // Private
    stored_commit: Field,            // Public
    threshold: u8                    // Public (default: 102)
) {
    // 1. Verify commitment matches enrolled template
    let commit = poseidon_hash(enrolled_template);
    assert(commit == stored_commit);

    // 2. Count matching codes
    let matches = count_matches(enrolled_template, verify_template);

    // 3. Assert threshold met (102/128 = 79.7%)
    assert(matches >= threshold);
}
```

---

## Quick Start

### Prerequisites

- Node.js v18+
- Noir (for circuit compilation)
- Webcam

### Installation

```bash
# 1. Install Noir
curl -L https://raw.githubusercontent.com/noir-lang/noirup/main/install | bash
noirup

# 2. Clone and install
git clone https://github.com/your-org/zk-biown.git
cd zk-biown
npm install

# 3. Download face-api.js models
mkdir -p public/models
cd public/models
# Download models from: https://github.com/vladmandic/face-api/tree/master/model
# Required: tiny_face_detector, face_landmark_68, face_recognition
cd ../..

# 4. Compile circuit
npm run compile:circuit

# 5. Start dev server
npm run dev
```

Open http://localhost:5173

---

## Project Structure

```
zk-biown/
├── circuit/                    # Noir ZK circuit
│   └── src/main.nr            # Biometric authentication circuit
│
├── src/
│   ├── lib/
│   │   ├── CancelableBiometric.ts  # Core algorithm implementation
│   │   ├── digestor.ts             # Biometric processing
│   │   └── noir.ts                 # ZK proof generation
│   │
│   ├── components/
│   │   └── BiometricCapture.tsx    # Camera + face detection
│   │
│   └── routes/                     # Application routes
│
├── experiments/                # Validation experiments
│   ├── core/                   # Core validation scripts
│   └── results/                # Experiment outputs
│
├── ../../docs/                 # Documentation (in repository root)
│   ├── INDEX.md               # Documentation guide
│   ├── paper/                 # Academic papers
│   │   ├── IEEE_ZK_BIOWN_Paper.md
│   │   └── DATA_SOURCE_VERIFICATION.md
│   ├── architecture/          # Implementation details
│   └── core/                  # Algorithm documentation
│
└── public/models/             # face-api.js models (download required)
```

---

## Documentation

**📚 All documentation is in the root `/docs` directory**

| Document | Description |
|----------|-------------|
| [docs/INDEX.md](../../docs/INDEX.md) | Complete documentation index |
| [docs/QUICK_REFERENCE.md](../../docs/QUICK_REFERENCE.md) | Algorithm quick reference |
| [docs/ARCHITECTURE.md](../../docs/ARCHITECTURE.md) | System architecture |
| [docs/paper/IEEE_ZK_BIOWN_Paper.md](../../docs/paper/IEEE_ZK_BIOWN_Paper.md) | Full IEEE paper |
| [docs/paper/DATA_SOURCE_VERIFICATION.md](../../docs/paper/DATA_SOURCE_VERIFICATION.md) | Metric verification |

---

## Running Experiments

```bash
# Core validation (3-library comparison)
npx tsx experiments/core/sweet-spot-comparison.ts

# Full 12-person analysis
npx tsx experiments/multi-person-uniqueness.ts

# Results in experiments/results/
```

See [experiments/README.md](experiments/README.md) for detailed instructions.

---

## Performance

| Component | Metric |
|-----------|--------|
| **Proof generation** | ~15 seconds (browser WASM) |
| **Proof size** | 15.88 KB |
| **Verification** | <100ms |
| **Face detection** | ~10ms per frame |
| **Template generation** | ~50ms |

---

## Security Considerations

### What's Private (Never Leaves Device)
- Raw biometric data
- User keys
- Enrolled templates (in ZK witness)

### What's Public
- Cryptographic commitments
- Nonce values
- Match result (pass/fail)

### Not Yet Implemented
- Liveness detection (recommended for production)
- Hardware-backed key storage
- Secure enclave integration

---

## Comparison with Alternatives

| Feature | Traditional | Apple Face ID | Worldcoin | **ZK BIOWN** |
|---------|------------|---------------|-----------|--------------|
| Biometric Storage | Cloud | Device | Orb data | **None** |
| Revocability | No | No | No | **Yes** |
| Cross-platform | Varies | iOS only | Orb only | **Any browser** |
| Privacy Proof | Trust | Trust | Partial ZK | **Full ZK** |
| Special Hardware | No | Yes | Yes | **No** |

---

## Research

This work is part of the ZTIZEN project at Kasetsart University, Department of Computer Engineering.

### Publications

- **IEEE ZK BIOWN Paper (2026)** - Full technical paper with validation
- **ECTI-CARD 2026** - Conference presentation

### Key Contributions

1. **Three-party key distribution** - No single entity can reconstruct templates
2. **SZQ algorithm** - Deterministic quantization without statistics storage
3. **Gap amplification** - 3.3× improvement in discrimination (7.6% → 24.8%)
4. **Browser-native ZK** - Full proof generation in WASM

---

## Privacy Notice

This repository does **NOT** contain:
- Real face images or biometric data
- Pre-generated embeddings from real people
- Personal identifying information

All biometric data is excluded via `.gitignore`. To run experiments, generate your own test data.

---

## License

MIT

---

## Contact

**ZK BIOWN - ZTIZEN Project**
Department of Computer Engineering
Faculty of Engineering, Kasetsart University
Bangkok, Thailand

---

> **"Prove who you are without revealing who you are."**
