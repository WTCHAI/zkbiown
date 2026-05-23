pragma circom 2.1.6;

include "node_modules/circomlib/circuits/poseidon.circom";
include "node_modules/circomlib/circuits/comparators.circom";

// ZTIZEN biometric authentication circuit — Circom/Groth16 port of main.nr
//
// Pipeline:
//   BioHash output (128 bits, 0/1) → Poseidon8 per position → match against enrollment commitment
//
// For each position i (0..128):
//   computed_commit[i] = Poseidon8(template[i], i, product_key, ztizen_key, user_key, version, nonce, product_usage_hash)
//
// Match count = number of positions where computed_commit[i] == auth_commit_stored[i]
// Constraint: match_count >= 102  (79.7% threshold, matching Noir circuit)
template ZTIZEN() {
    // --- Private inputs ---
    signal input bio_template[128];    // BioHash binary output (0 or 1 per position)
    signal input product_key;          // stringToFieldElement(CRYPTO_KEYS.PRODUCT_KEY)
    signal input ztizen_key;           // stringToFieldElement(CRYPTO_KEYS.ZTIZEN_KEY)
    signal input user_key;             // stringToFieldElement(CRYPTO_KEYS.SHARED_USER_KEY)
    signal input version;              // Revocation version (default: 1)
    signal input nonce;                // Anti-replay nonce (default: 0)
    signal input product_usage_hash;   // Hash of product_id:service_id:service_type (default: 0)

    // --- Public inputs ---
    signal input auth_commit_stored[128];  // Enrollment Poseidon hashes (128 field elements)

    // --- Public output ---
    signal output match_count;  // Number of matching positions (must be >= 102)

    // --- Compute Poseidon8 for each template position ---
    component hashers[128];
    signal computed_commit[128];

    // --- Compare each computed hash against stored enrollment hash ---
    component eq[128];
    signal is_match[128];

    // Running sum accumulates match count
    signal running_sum[129];
    running_sum[0] <== 0;

    for (var i = 0; i < 128; i++) {
        // Poseidon8: 8 inputs matching poseidon.ts generatePoseidonBitHashes() ordering
        hashers[i] = Poseidon(8);
        hashers[i].inputs[0] <== bio_template[i];      // bit value (0 or 1)
        hashers[i].inputs[1] <== i;                    // position index
        hashers[i].inputs[2] <== product_key;
        hashers[i].inputs[3] <== ztizen_key;
        hashers[i].inputs[4] <== user_key;
        hashers[i].inputs[5] <== version;
        hashers[i].inputs[6] <== nonce;
        hashers[i].inputs[7] <== product_usage_hash;

        computed_commit[i] <== hashers[i].out;

        // IsEqual returns 1 if computed matches stored, 0 otherwise
        eq[i] = IsEqual();
        eq[i].in[0] <== computed_commit[i];
        eq[i].in[1] <== auth_commit_stored[i];
        is_match[i] <== eq[i].out;

        running_sum[i + 1] <== running_sum[i] + is_match[i];
    }

    match_count <== running_sum[128];

    // Enforce match_count >= 102 (same threshold as Noir circuit: assert_lt(101, match_count))
    // GreaterEqThan(n) requires n bits sufficient to represent max value; 7 bits covers 0-128
    component gte = GreaterEqThan(8);
    gte.in[0] <== match_count;
    gte.in[1] <== 102;
    gte.out === 1;
}

component main {public [auth_commit_stored]} = ZTIZEN();
