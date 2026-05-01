# Bibliography with Annotations

**Purpose:** This document provides properly formatted citations with explanatory notes.

---

## Cancelable Biometrics

### [1] Q. N. Tran, B. P. Turnbull, J. Hu

**Title:** "Biometrics and Privacy-Preservation: How Do They Evolve?"

**Venue:** IEEE Open Journal of the Computer Society, 2021

**Pages:** 179-191

**DOI:** 10.1109/OJCS.2021.3068385

**Why Cite This:**
PRIMARY survey paper. Comprehensive taxonomy of privacy-preserving biometrics: Non-invertible Transformation, Direct Biometric Key Generation, Information Hiding, Protocol-based Protection. Provides theoretical foundation for ZKBIOWN approach. References ISO/IEC 24745 standard for template protection.

---

### [2] V. M. Patel, N. K. Ratha, R. Chellappa

**Title:** "Cancelable Biometrics: A Review"

**Venue:** IEEE Signal Processing Magazine, 2015

**Pages:** 54-65

**DOI:** 10.1109/MSP.2015.2434151

**Why Cite This:**
Alternative survey paper (older but well-cited). Good for historical context of cancelable biometrics development.

---

### [3] Y. Dodis, L. Reyzin, A. Smith

**Title:** "Fuzzy Extractors: How to Generate Strong Keys from Biometrics and Other Noisy Data"

**Venue:** Advances in Cryptology – EUROCRYPT 2004, LNCS, 2004

**Pages:** 523-540

**DOI:** 10.1007/978-3-540-24676-3_31

**Why Cite This:**
Fuzzy Extractors - alternative biometric template protection. ONLY cite if explaining why NOT used (ZKBIOWN uses BioHashing instead).

---

## BioHashing

### [4] A. B. J. Teoh, A. Goh, D. C. L. Ngo

**Title:** "Random Multispace Quantization as an Analytic Mechanism for BioHashing of Biometric and Random Identity Inputs"

**Venue:** IEEE Transactions on Pattern Analysis and Machine Intelligence, 2006

**Pages:** 1892-1901

**DOI:** 10.1109/TPAMI.2006.250

**Why Cite This:**
⭐ PRIMARY BioHashing citation - MATCHES YOUR CODE IMPLEMENTATION! Your experimental/utils/biohashing.ts explicitly implements this methodology: Gaussian random projection with Gram-Schmidt orthogonalization. Code comments reference "Teoh, Ngo, Goh (IEEE TPAMI 2006)". This is THE paper to cite for your methodology section.

---

### [5] A. T. B. Jin, D. N. C. Ling, A. Goh

**Title:** "BioHashing: Two Factor Authentication Featuring Fingerprint Data and Tokenised Random Number"

**Venue:** Pattern Recognition, 2004

**Pages:** 2245-2255

**DOI:** 10.1016/j.patcog.2004.04.011

**Why Cite This:**
Original BioHashing paper (fingerprint-based). Cite for historical context, but Teoh 2006 is the primary methodology reference.

---

## Zero-Knowledge Proofs

### [6] L. Grassi, D. Khovratovich, C. Rechberger, A. Roy, M. Schofnegger

**Title:** "Poseidon: A New Hash Function for Zero-Knowledge Proof Systems"

**Venue:** Proceedings of the 30th USENIX Security Symposium, 2021

**Pages:** 519-535

**URL:** https://www.usenix.org/conference/usenixsecurity21/presentation/grassi

**Why Cite This:**
⭐ PRIMARY Poseidon citation. ZK-friendly hashing optimized for R1CS constraints. Achieves 0.2-0.5 constraints/bit vs Pedersen Hash (1.68 constraints/bit). Provides performance benchmarks for Groth16, Bulletproofs, PLONK, STARKs. Critical for explaining computational efficiency of ZKBIOWN.

---

### [7] C. Hudson

**Title:** "poseidon-lite: Lightweight JavaScript implementation of Poseidon hash"

**Venue:** GitHub, 2024

**URL:** https://github.com/chancehudson/poseidon-lite

**Why Cite This:**
Poseidon8 implementation used in ZKBIOWN for field element hashing (BN254 field). Cite as software dependency.

---

### [8] J. Groth

**Title:** "On the Size of Pairing-Based Non-Interactive Arguments"

**Venue:** Advances in Cryptology – EUROCRYPT 2016, LNCS, 2016

**Pages:** 305-326

**DOI:** 10.1007/978-3-662-49896-5_11

**Why Cite This:**
Groth16 SNARK system - the most widely used ZK proof system. Cite for explaining ZK proof generation/verification in ZKBIOWN.

---

### [9] B. Bünz, J. Bootle, D. Boneh, A. Poelstra, P. Wuille, G. Maxwell

**Title:** "Bulletproofs: Short Proofs for Confidential Transactions and More"

**Venue:** 2018 IEEE Symposium on Security and Privacy (SP), 2018

**Pages:** 315-334

**DOI:** 10.1109/SP.2018.00020

**Why Cite This:**
Bulletproofs - no trusted setup alternative to Groth16. Good for comparison in related work section.

---

### [10] A. Gabizon, Z. J. Williamson, O. Ciobotaru

**Title:** "PLONK: Permutations over Lagrange-bases for Oecumenical Noninteractive arguments of Knowledge"

**Venue:** Cryptology ePrint Archive, Report 2019/953, 2019

**URL:** https://eprint.iacr.org/2019/953

**Why Cite This:**
PLONK - universal setup SNARK system. Alternative to Groth16 with different tradeoffs. Good for related work comparison.

---

### [11] E. Ben-Sasson, I. Bentov, Y. Horesh, M. Riabzev

**Title:** "Scalable Zero Knowledge with No Trusted Setup"

**Venue:** Advances in Cryptology – CRYPTO 2019, LNCS, 2019

**Pages:** 701-732

**DOI:** 10.1007/978-3-030-26954-8_23

**Why Cite This:**
STARKs - post-quantum secure, no trusted setup. Good for discussing future-proofing in discussion section.

---

### [12] Aztec Protocol

**Title:** "Noir: A Domain Specific Language for SNARK Proving Systems"

**Venue:** GitHub, 2024

**URL:** https://github.com/noir-lang/noir

**Why Cite This:**
Noir DSL - domain-specific language for writing ZK circuits. Cite if discussing implementation tools.

---

### [13] D. Hopwood, S. Bowe, T. Hornby, N. Wilcox

**Title:** "Zcash Protocol Specification, Version 2020.1.14 [Overwinter+Sapling+Blossom+Heartwood+Canopy]"

**Venue:** Zerocoin Electric Coin Company, 2020

**URL:** https://github.com/zcash/zips/blob/master/protocol/protocol.pdf

**Why Cite This:**
Pedersen Hash - traditional ZK-friendly hash (1.68 constraints/bit). Cite for performance comparison with Poseidon (0.2-0.5 constraints/bit).

---

### [14] A. Aly, T. Ashur, E. Ben-Sasson, S. Dhooghe, A. Szepieniec

**Title:** "Design of Symmetric-Key Primitives for Advanced Cryptographic Protocols"

**Venue:** Cryptology ePrint Archive, Report 2019/426, 2019

**URL:** https://eprint.iacr.org/2019/426

**Why Cite This:**
Rescue Hash - alternative ZK-friendly hash using both x^5 and x^(1/5) S-boxes. Slower than Poseidon. Optional comparison baseline.

---

## Face Recognition

### [15] H. Ng, S. Winkler

**Title:** "A Data-Driven Approach to Cleaning Large Face Datasets"

**Venue:** 2014 IEEE International Conference on Image Processing (ICIP), 2014

**Pages:** 343-347

**DOI:** 10.1109/ICIP.2014.7025068

**URL:** https://malea.winkler.site/facescrub.html

**Why Cite This:**
FaceScrub dataset - 530 persons, 100k+ faces. ZKBIOWN uses filtered subset: 437 persons (≥2 captures per person) for intra-person validation. Baseline similarity: 63.94% same-person cosine similarity establishes dataset quality ceiling.

---

### [16] F. Schroff, D. Kalenichenko, J. Philbin

**Title:** "FaceNet: A Unified Embedding for Face Recognition and Clustering"

**Venue:** 2015 IEEE Conference on Computer Vision and Pattern Recognition (CVPR), 2015

**Pages:** 815-823

**DOI:** 10.1109/CVPR.2015.7298682

**Why Cite This:**
FaceNet - 128D and 512D embeddings used in ZKBIOWN experiments. Triplet loss training for face recognition. Implementation: https://github.com/davidsandberg/facenet

---

### [17] J. Deng, J. Guo, N. Xue, S. Zafeiriou

**Title:** "ArcFace: Additive Angular Margin Loss for Deep Face Recognition"

**Venue:** 2019 IEEE/CVF Conference on Computer Vision and Pattern Recognition (CVPR), 2019

**Pages:** 4690-4699

**DOI:** 10.1109/CVPR.2019.00482

**Why Cite This:**
ArcFace - 512D embeddings. State-of-the-art face recognition using additive angular margin loss. Implementation: https://github.com/deepinsight/insightface

---

### [18] V. Mühler

**Title:** "face-api.js: JavaScript API for Face Recognition in the Browser with tensorflow.js"

**Venue:** GitHub, 2024

**URL:** https://github.com/justadudewhohacks/face-api.js

**Why Cite This:**
face-api.js - 128D embeddings. Browser-based face recognition library used in ZKBIOWN experiments.

---

