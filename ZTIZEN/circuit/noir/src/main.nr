// ZTIZEN ZK BiOwn Circuit - Binary BioHash Variant
//
// Verifies biometric authentication using binary BioHash templates.
// Each template value is 0 or 1 (produced by BioHashing: Gaussian projection + threshold at 0).
//
// Pipeline:
//   Face embedding -> Gaussian random projection (seeded by 3-party HKDF key)
//                  -> Binarize: value >= 0 -> 1, value < 0 -> 0
//                  -> 128-bit binary template
//                  -> Poseidon8 commitment per position
//
// Circuit logic:
//   For each i in 0..128:
//     computed_commit[i] = Poseidon8(template[i], i, product_key, ztizen_key, user_key, version, nonce, product_usage_hash)
//   Match count = #{i : computed_commit[i] == auth_commit_stored[i]}
//   Assert match_count >= MATCH_THRESHOLD (102/128 = 79.7%)
//
// Inputs:
//   Private: template[128] (0 or 1), 3-party keys, version, nonce, usage_hash
//   Public:  auth_commit_stored[128] (reference commitment from enrollment)
// Outputs (public):
//   match_count          - for on-chain logging
//   computed_commit[128] - for nonce rolling (next enrollment anchor)

use poseidon::poseidon::bn254::{hash_8};

// 102/128 = 79.7% match required
global MATCH_THRESHOLD: u32 = 102;

fn main(
    // Private inputs (witness)
    template: [Field; 128],          // Binary BioHash values: 0 or 1
    product_key: Field,              // Seed 1: product partial key (from product service)
    ztizen_key: Field,               // Seed 2: ZTIZEN partial key (from ZTIZEN service)
    user_key: Field,                 // Seed 3: user key (derived from wallet signature, never leaves browser)
    version: Field,                  // Version number (incremented on revocation/key rotation)
    nonce: Field,                    // Current nonce (from on-chain, rolled after every auth)
    product_usage_hash: Field,       // Hash of product_id:service_id:service_type

    // Public input
    auth_commit_stored: pub [Field; 128]  // Reference commitment stored off-chain by ZTIZEN service
) -> pub (u32, [Field; 128]) {
    // Step 1: Recompute commitments from the live template + current session inputs
    let computed_commit = compute_auth_commit(
        template,
        product_key,
        ztizen_key,
        user_key,
        version,
        nonce,
        product_usage_hash
    );

    // Step 2: Count matching positions against the stored enrollment commitment
    let mut match_count: u32 = 0;
    for i in 0..128 {
        if computed_commit[i] == auth_commit_stored[i] {
            match_count += 1;
        }
    }

    // Step 3: Enforce match threshold: assert match_count >= 102
    assert(match_count >= MATCH_THRESHOLD, "Biometric match below threshold");

    // Step 4: Return public outputs
    // match_count     -> on-chain event log
    // computed_commit -> ZTIZEN service uses this as next enrollment anchor (nonce rotation)
    (match_count, computed_commit)
}

// Compute per-position Poseidon8 commitments
// commit[i] = Poseidon8(template[i], i, product_key, ztizen_key, user_key, version, nonce, product_usage_hash)
fn compute_auth_commit(
    template: [Field; 128],
    product_key: Field,
    ztizen_key: Field,
    user_key: Field,
    version: Field,
    nonce: Field,
    product_usage_hash: Field
) -> [Field; 128] {
    let mut commits: [Field; 128] = [0; 128];

    for i in 0..128 {
        commits[i] = hash_8([
            template[i],
            i as Field,
            product_key,
            ztizen_key,
            user_key,
            version,
            nonce,
            product_usage_hash
        ]);
    }

    commits
}
