// ZTIZEN ZK BiOwn Circuit - Sign-Magnitude 128-value Variant
//
// This circuit verifies biometric authentication using 3-bit sign-magnitude binarization.
// Each projection value is encoded as: [Sign (1 bit)][Magnitude (2 bits)] = 3 bits
// Output values range from 0-7.
//
// Encoding:
//   - Sign: 1 = positive (value >= 0), 0 = negative (value < 0)
//   - Magnitude: 0-3 (2 bits), scaled from |projection| * 4
//   - Combined: (sign << 2) | magnitude
//
// Examples:
//   +0.7 -> sign=1, mag=2 -> (1 << 2) | 2 = 6
//   -0.3 -> sign=0, mag=1 -> (0 << 2) | 1 = 1
//   +0.0 -> sign=1, mag=0 -> (1 << 2) | 0 = 4
//
// Benefits over binary (128-bit) circuit:
// - Preserves magnitude information (confidence level)
// - More granular matching (8 possible values vs 2)
// - Better discrimination for similar faces
//
// Benefits over IoM (32-index) circuit:
// - More values for finer-grained matching (128 vs 32)
// - Direct encoding without grouping
//
// Trade-offs:
// - 4x more Poseidon hashes than IoM32 (128 vs 32)
// - Larger proof inputs than IoM32

use poseidon::poseidon::bn254::{hash_8};
use std::field::bn254::assert_lt;

// Match threshold: 102/128 = 79.7% match required
// This is equivalent to ~80% threshold, providing good security while allowing
// for natural biometric variation.
global MATCH_THRESHOLD: Field = 102;

fn main(
    // Private inputs (witness) - kept secret
    template: [Field; 128],           // 128 sign-mag values (each 0-7)
    product_key: Field,               // Seed 1: Product partial key
    ztizen_key: Field,                // Seed 2: ZTIZEN partial key
    user_key: Field,                  // Seed 3: User key from wallet signature
    version: Field,                   // Version number for revocation
    nonce: Field,                     // Current nonce (for uniqueness)
    product_usage_hash: Field,        // Hash of product_id:service_id:service_type

    // Public input - visible on-chain or off-chain
    auth_commit_stored: pub [Field; 128]  // Reference commitment from enrollment (128 elements)
) -> pub (Field, [Field; 128]) {

    // Step 1: Compute verify_commit from template using Poseidon
    // Each commit = Poseidon8(template[i], i, product_key, ztizen_key, user_key, version, nonce, product_usage_hash)
    let computed_commit = compute_auth_commit(
        template,
        product_key,
        ztizen_key,
        user_key,
        version,
        nonce,
        product_usage_hash
    );

    // Step 2: Count matching commits between computed and stored
    // For sign-mag, each template[i] is 0-7 (3-bit encoded value)
    // If enrollment and verification produce same encoding, commits match
    let mut match_count: Field = 0;
    for i in 0..128 {
        if computed_commit[i] == auth_commit_stored[i] {
            match_count += 1;
        }
    }

    // Step 3: Ensures biometric match is above acceptance threshold
    // assert_lt(a, b) asserts a < b, so assert_lt(101, match_count) means match_count >= 102
    assert_lt(MATCH_THRESHOLD - 1, match_count);

    // Step 4: Return match count and computed commitment as public outputs
    // - match_count: For on-chain verification and logging
    // - computed_commit: For nonce rolling (next enrollment uses these as reference)
    (match_count, computed_commit)
}

// Compute auth_commit array using Poseidon hash
//
// For each position i, compute:
//   commit[i] = Poseidon8(template[i], i, keys..., nonce, usage_hash)
//
// The 8 inputs to Poseidon are:
// 1. template[i]    - Sign-mag encoded value (0-7)
// 2. i              - Position index (0-127)
// 3. product_key    - Product-specific key
// 4. ztizen_key     - ZTIZEN credential key
// 5. user_key       - User-derived key from wallet signature
// 6. version        - Version number (for revocability)
// 7. nonce          - Random nonce (anti-replay)
// 8. product_usage_hash - Hash of service metadata
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
        let inputs: [Field; 8] = [
            template[i],          // Sign-mag value for position i (0-7)
            i as Field,           // position index (0-127)
            product_key,
            ztizen_key,
            user_key,
            version,
            nonce,
            product_usage_hash
        ];

        commits[i] = hash_8(inputs);
    }

    commits
}
