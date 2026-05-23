# Group C: 3-Party Key Compromise Simulation — Findings

**Date:** 2026-05-02  
**Dataset:** FaceScrub (50 persons × 1 capture each)  
**Threshold:** 102/128 = 79.7% (ZK circuit match threshold)  
**Libraries tested:** face-api.js, FaceNet (128D), FaceNet512 (512D), ArcFace (512D)

## Executive Summary

The ZKBIOWN system requires **all three keys** (Kp, Kz, Ku) to generate a valid auth commitment.
Partial key compromise — holding 1/3 or 2/3 of keys — yields a match rate of **exactly 0%** across
all 6 compromise scenarios, all 3 attacker strategies, and all 4 biometric libraries.
Only an attacker with all 3 keys can reproduce a valid commitment (100% match, sanity check).

## Compromise Matrix (all 4 libraries combined)

| Keys held | Missing | Strategy | Attempts | Passed | Max match | Result |
|---|---|---|---|---|---|---|
| Kp only (1/3) | Kz, Ku | zero+random+dict | 3,200 | 0 | **0.00%** | **BLOCKED** |
| Kz only (1/3) | Kp, Ku | zero+random+dict | 3,200 | 0 | **0.00%** | **BLOCKED** |
| Ku only (1/3) | Kp, Kz | zero+random+dict | 3,200 | 0 | **0.00%** | **BLOCKED** |
| Kp + Kz (2/3) | Ku | zero+random+dict | 3,200 | 0 | **0.00%** | **BLOCKED** |
| Kp + Ku (2/3) | Kz | zero+random+dict | 3,200 | 0 | **0.00%** | **BLOCKED** |
| Kz + Ku (2/3) | Kp | zero+random+dict | 3,200 | 0 | **0.00%** | **BLOCKED** |
| Kp + Kz + Ku (3/3) | — | exact | 200 | **200** | **100.00%** | **PASSES** |

*800 attempts per library × 4 libraries = 3,200 per row (1/3 and 2/3 scenarios).*  
*50 persons × 4 libraries = 200 (3/3 sanity check).*

## Per-Library Results

| Library | Scenario | Strategy | Attempts | Passed | Max match |
|---|---|---|---|---|---|
| face-api.js | 1of3-only-Kp | zero | 50 | 0 | 0.00% |
| face-api.js | 1of3-only-Kp | random | 250 | 0 | 0.00% |
| face-api.js | 1of3-only-Kp | dict | 500 | 0 | 0.00% |
| face-api.js | 1of3-only-Kz | zero | 50 | 0 | 0.00% |
| face-api.js | 1of3-only-Kz | random | 250 | 0 | 0.00% |
| face-api.js | 1of3-only-Kz | dict | 500 | 0 | 0.00% |
| face-api.js | 1of3-only-Ku | zero | 50 | 0 | 0.00% |
| face-api.js | 1of3-only-Ku | random | 250 | 0 | 0.00% |
| face-api.js | 1of3-only-Ku | dict | 500 | 0 | 0.00% |
| face-api.js | 2of3-missing-Ku | zero | 50 | 0 | 0.00% |
| face-api.js | 2of3-missing-Ku | random | 250 | 0 | 0.00% |
| face-api.js | 2of3-missing-Ku | dict | 500 | 0 | 0.00% |
| face-api.js | 2of3-missing-Kz | zero | 50 | 0 | 0.00% |
| face-api.js | 2of3-missing-Kz | random | 250 | 0 | 0.00% |
| face-api.js | 2of3-missing-Kz | dict | 500 | 0 | 0.00% |
| face-api.js | 2of3-missing-Kp | zero | 50 | 0 | 0.00% |
| face-api.js | 2of3-missing-Kp | random | 250 | 0 | 0.00% |
| face-api.js | 2of3-missing-Kp | dict | 500 | 0 | 0.00% |
| face-api.js | 3of3-full-knowledge | exact | 50 | 50 | 100.00% |
| FaceNet | 1of3-only-Kp | zero | 50 | 0 | 0.00% |
| FaceNet | 1of3-only-Kp | random | 250 | 0 | 0.00% |
| FaceNet | 1of3-only-Kp | dict | 500 | 0 | 0.00% |
| FaceNet | 1of3-only-Kz | zero | 50 | 0 | 0.00% |
| FaceNet | 1of3-only-Kz | random | 250 | 0 | 0.00% |
| FaceNet | 1of3-only-Kz | dict | 500 | 0 | 0.00% |
| FaceNet | 1of3-only-Ku | zero | 50 | 0 | 0.00% |
| FaceNet | 1of3-only-Ku | random | 250 | 0 | 0.00% |
| FaceNet | 1of3-only-Ku | dict | 500 | 0 | 0.00% |
| FaceNet | 2of3-missing-Ku | zero | 50 | 0 | 0.00% |
| FaceNet | 2of3-missing-Ku | random | 250 | 0 | 0.00% |
| FaceNet | 2of3-missing-Ku | dict | 500 | 0 | 0.00% |
| FaceNet | 2of3-missing-Kz | zero | 50 | 0 | 0.00% |
| FaceNet | 2of3-missing-Kz | random | 250 | 0 | 0.00% |
| FaceNet | 2of3-missing-Kz | dict | 500 | 0 | 0.00% |
| FaceNet | 2of3-missing-Kp | zero | 50 | 0 | 0.00% |
| FaceNet | 2of3-missing-Kp | random | 250 | 0 | 0.00% |
| FaceNet | 2of3-missing-Kp | dict | 500 | 0 | 0.00% |
| FaceNet | 3of3-full-knowledge | exact | 50 | 50 | 100.00% |
| FaceNet512 | 1of3-only-Kp | zero | 50 | 0 | 0.00% |
| FaceNet512 | 1of3-only-Kp | random | 250 | 0 | 0.00% |
| FaceNet512 | 1of3-only-Kp | dict | 500 | 0 | 0.00% |
| FaceNet512 | 1of3-only-Kz | zero | 50 | 0 | 0.00% |
| FaceNet512 | 1of3-only-Kz | random | 250 | 0 | 0.00% |
| FaceNet512 | 1of3-only-Kz | dict | 500 | 0 | 0.00% |
| FaceNet512 | 1of3-only-Ku | zero | 50 | 0 | 0.00% |
| FaceNet512 | 1of3-only-Ku | random | 250 | 0 | 0.00% |
| FaceNet512 | 1of3-only-Ku | dict | 500 | 0 | 0.00% |
| FaceNet512 | 2of3-missing-Ku | zero | 50 | 0 | 0.00% |
| FaceNet512 | 2of3-missing-Ku | random | 250 | 0 | 0.00% |
| FaceNet512 | 2of3-missing-Ku | dict | 500 | 0 | 0.00% |
| FaceNet512 | 2of3-missing-Kz | zero | 50 | 0 | 0.00% |
| FaceNet512 | 2of3-missing-Kz | random | 250 | 0 | 0.00% |
| FaceNet512 | 2of3-missing-Kz | dict | 500 | 0 | 0.00% |
| FaceNet512 | 2of3-missing-Kp | zero | 50 | 0 | 0.00% |
| FaceNet512 | 2of3-missing-Kp | random | 250 | 0 | 0.00% |
| FaceNet512 | 2of3-missing-Kp | dict | 500 | 0 | 0.00% |
| FaceNet512 | 3of3-full-knowledge | exact | 50 | 50 | 100.00% |
| ArcFace | 1of3-only-Kp | zero | 50 | 0 | 0.00% |
| ArcFace | 1of3-only-Kp | random | 250 | 0 | 0.00% |
| ArcFace | 1of3-only-Kp | dict | 500 | 0 | 0.00% |
| ArcFace | 1of3-only-Kz | zero | 50 | 0 | 0.00% |
| ArcFace | 1of3-only-Kz | random | 250 | 0 | 0.00% |
| ArcFace | 1of3-only-Kz | dict | 500 | 0 | 0.00% |
| ArcFace | 1of3-only-Ku | zero | 50 | 0 | 0.00% |
| ArcFace | 1of3-only-Ku | random | 250 | 0 | 0.00% |
| ArcFace | 1of3-only-Ku | dict | 500 | 0 | 0.00% |
| ArcFace | 2of3-missing-Ku | zero | 50 | 0 | 0.00% |
| ArcFace | 2of3-missing-Ku | random | 250 | 0 | 0.00% |
| ArcFace | 2of3-missing-Ku | dict | 500 | 0 | 0.00% |
| ArcFace | 2of3-missing-Kz | zero | 50 | 0 | 0.00% |
| ArcFace | 2of3-missing-Kz | random | 250 | 0 | 0.00% |
| ArcFace | 2of3-missing-Kz | dict | 500 | 0 | 0.00% |
| ArcFace | 2of3-missing-Kp | zero | 50 | 0 | 0.00% |
| ArcFace | 2of3-missing-Kp | random | 250 | 0 | 0.00% |
| ArcFace | 2of3-missing-Kp | dict | 500 | 0 | 0.00% |
| ArcFace | 3of3-full-knowledge | exact | 50 | 50 | 100.00% |

## Why Partial-Key Attacks Fail

The Poseidon commitment is computed per-bit as:

```
poseidon8(bit_i, i, productKeySeed, ztizenKeySeed, userKeySeed, version, nonce, usageHash)
```

Each of the 128 output hashes is a BN254 field element (~2^254 possible values). Due to Poseidon's
**full-round algebraic diffusion**, substituting even a single wrong key produces an output
statistically indistinguishable from a uniformly random field element. The probability that a random
guess matches any one of the 128 stored hashes is 2^{-254} per slot — negligible even with 2/3 known keys.

This means the **key search space is not reduced** by knowing 2 of 3 keys: the missing key
contributes a full 256-bit independent factor to each Poseidon output.

## Attacker Strategies Tested

| Strategy | Description | # guesses per person |
|---|---|---|
| zero-fill | Replace missing key(s) with 64 zero hex chars | 1 |
| random-fill | 5 independently random 256-bit hex keys | 5 |
| dict-fill | All 10 keys from the system's `DIFFERENT_USER_KEYS` pool | 10 |

The dict-fill strategy represents an **insider threat**: an attacker who has exfiltrated the
complete pool of known user keys from the ZTIZEN database, yet still cannot forge auth without
the victim's specific key (which is distinct from any key in the leaked pool).

## Threat Model Interpretation

| Threat | Keys compromised | Auth possible? | Reason |
|---|---|---|---|
| Product service breach only | Kp | No | Still missing Kz and Ku |
| ZTIZEN service breach only | Kz | No | Still missing Kp and Ku |
| User device/PIN compromise | Ku | No | Still missing Kp and Kz |
| Product + ZTIZEN collude | Kp + Kz | No | Poseidon avalanche on missing Ku |
| Product service + user | Kp + Ku | No | Poseidon avalanche on missing Kz |
| ZTIZEN service + user | Kz + Ku | No | Poseidon avalanche on missing Kp |
| All three parties collude | Kp + Kz + Ku | **Yes** | 100% match — full knowledge |

## Conclusion

**Across 19,200 attack attempts (4 libraries × 6 compromise scenarios × 800 attempts each),
zero partial-key attacks passed the 79.7% threshold.** The maximum observed match rate for any
partial-key attempt was 0.00% — not a single one of 128 Poseidon hash slots was accidentally
matched. This provides empirical confirmation that the 3-party key split enforces strict
all-or-nothing security: authentication is impossible without simultaneous access to all three keys.
