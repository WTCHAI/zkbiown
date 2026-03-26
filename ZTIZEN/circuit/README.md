# ZK BIOWN Circuit

Noir zero-knowledge circuit for biometric authentication.

## Circuit Overview

This circuit proves that two biometric templates match without revealing the templates themselves.

### Inputs

- `enrolled_template: [u8; 128]` - The enrolled biometric template (private)
- `verify_template: [u8; 128]` - The verification biometric template (private)
- `stored_commit: Field` - Public commitment to enrolled template
- `threshold: u8` - Minimum matching codes required (default: 102/128 = 79.7%)

### Verification Logic

1. **Commitment Verification**: Verify `stored_commit` matches `Poseidon(enrolled_template)`
2. **Fuzzy Matching**: Count matching codes between templates
3. **Threshold Check**: Assert `matches >= threshold`

## Compilation

```bash
# Install Noir
curl -L https://raw.githubusercontent.com/noir-lang/noirup/main/install | bash
noirup

# Compile circuit
nargo compile

# Test circuit
nargo test

# Generate Solidity verifier
nargo codegen-verifier
```

## Output

- `target/ztizen_circuit_signmag128.json` - Compiled circuit (used by web app)
- `target/Verifier.sol` - Solidity verifier contract
- `target/vk` - Verification key

## Integration

The compiled circuit is automatically copied to `web/public/circuits/` for use in the React application.

See `../web/src/lib/noir.ts` for proof generation implementation.
