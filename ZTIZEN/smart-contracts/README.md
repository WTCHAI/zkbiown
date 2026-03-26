# ZTIZEN Smart Contracts

Ethereum smart contracts for ZTIZEN cancelable biometric authentication platform.

## Overview

The ZTIZEN smart contract provides:
- **On-chain nonce tracking** for credential revocation
- **Credential registration** with version management
- **Verification tracking** with event logs
- **ZK proof verification** (Phase 5)
- **Audit trail** for all authentication events

## Contract Architecture

### ZTIZEN.sol

Main contract implementing cancelable biometric authentication.

**Key Features**:
- Credential registration (single & batch)
- Nonce-based revocation mechanism
- Verification with nonce replay protection
- ZK proof support (Phase 5)
- Owner-based access control
- Event emission for audit trail

**State Variables**:
```solidity
struct Credential {
    bytes32 credentialId;     // Unique identifier
    address owner;            // Credential owner
    uint256 version;          // Protocol version
    uint256 nonce;            // Current nonce (for revocation)
    bool isActive;            // Active status
    uint256 registeredAt;     // Registration timestamp
    uint256 lastVerifiedAt;   // Last verification timestamp
}
```

## Setup

### 1. Install Dependencies

```bash
npm install
```

### 2. Configure Environment

```bash
cp .env.example .env
# Edit .env with your configuration
```

Required variables:
```bash
SEPOLIA_RPC_URL=https://rpc.sepolia.org
DEPLOYER_PRIVATE_KEY=<your-private-key>
ETHERSCAN_API_KEY=<your-api-key>
```

### 3. Compile Contracts

```bash
npm run compile
```

This generates:
- `artifacts/` - Compiled contract artifacts
- `typechain-types/` - TypeScript type definitions
- `cache/` - Compilation cache

## Testing

### Run All Tests

```bash
npm test
```

### Test Coverage

The test suite covers:
- ✅ Deployment and initialization
- ✅ Single credential registration
- ✅ Batch credential registration
- ✅ Simple verification (Phase 3)
- ✅ ZK proof verification structure (Phase 5)
- ✅ Nonce management and revocation
- ✅ Credential deactivation/reactivation
- ✅ Access control (owner-only functions)
- ✅ Multi-user scenarios
- ✅ Replay attack prevention

**Test Results** (Expected):
```
  ZTIZEN
    Deployment
      ✓ Should set the correct owner
      ✓ Should initialize with ZK verification disabled
      ✓ Should initialize with zero total credentials
    Credential Registration
      Single Registration
        ✓ Should register a new credential
        ✓ Should increment total credentials
        ✓ Should add credential to owner's list
        ✓ Should reject duplicate credential ID
        ✓ Should reject invalid version
      Batch Registration
        ✓ Should register multiple credentials in batch
        ✓ Should reject empty batch
        ✓ Should reject batch too large
        ✓ Should reject if any credential already exists
    Credential Verification
      Simple Verification (Phase 3)
        ✓ Should verify with correct nonce
        ✓ Should reject wrong nonce
        ✓ Should reject reused nonce
        ✓ Should reject if credential not active
        ✓ Should update lastVerifiedAt timestamp
      ZK Proof Verification (Phase 5)
        ✓ Should reject when ZK verification not enabled
        ✓ Should verify with proof when enabled
        ✓ Should reject empty proof
    Nonce Management
      ✓ Should get current nonce
      ✓ Should increment nonce
      ✓ Should only allow owner to increment nonce
      ✓ Should check if nonce is used
      ✓ Should invalidate old nonce after increment
    Credential Management
      Deactivation
        ✓ Should deactivate credential
        ✓ Should only allow owner to deactivate
      Reactivation
        ✓ Should reactivate credential
        ✓ Should only allow owner to reactivate
      Query Functions
        ✓ Should get credential details
        ✓ Should get owner credentials
        ✓ Should reject query for non-existent credential
    Admin Functions
      ✓ Should allow owner to enable ZK verification
      ✓ Should reject non-owner from enabling ZK verification
      ✓ Should return correct stats
    Multi-User Scenarios
      ✓ Should handle multiple users with multiple credentials
      ✓ Should maintain independent nonces per credential

  38 passing
```

## Deployment

### Deploy to Local Hardhat Network

```bash
# Terminal 1: Start local node
npx hardhat node

# Terminal 2: Deploy
npm run deploy:local
```

### Deploy to Sepolia Testnet

```bash
npm run deploy:sepolia
```

**Output**:
```
============================================================
🚀 Deploying ZTIZEN Contract
============================================================

Deploying from address: 0x...
Account balance: 1.5 ETH

📝 Deploying ZTIZEN...
✅ ZTIZEN deployed to: 0x...

📊 Contract Info:
   Owner: 0x...
   Total Credentials: 0
   ZK Verification: Disabled

============================================================
✨ Deployment Complete!
============================================================
```

### Verify Contract on Etherscan

```bash
npx hardhat verify --network sepolia <CONTRACT_ADDRESS>
```

## Contract Interaction

### Using Scripts

```bash
# Set contract address in .env
echo "ZTIZEN_CONTRACT_ADDRESS=0x..." >> .env

# Run interaction script
npx hardhat run scripts/interact.ts --network sepolia
```

### Using Hardhat Console

```bash
npx hardhat console --network sepolia
```

```javascript
const ztizen = await ethers.getContractAt("ZTIZEN", "0x...");

// Register credential
const credId = ethers.id("my-credential");
await ztizen.registerCredential(credId, 1);

// Verify credential
await ztizen.verifyCredential(credId, 0);

// Get nonce
const nonce = await ztizen.getNonce(credId);

// Increment nonce (revoke)
await ztizen.incrementNonce(credId);

// Get stats
const [total, zkEnabled] = await ztizen.getStats();
```

## API Reference

### Write Functions

#### `registerCredential(bytes32 _credentialId, uint256 _version)`
Register a new biometric credential.

**Parameters**:
- `_credentialId`: Unique credential identifier (keccak256 hash)
- `_version`: Protocol version (must be > 0)

**Returns**: `bool` - Success status

**Events**: `CredentialRegistered`

---

#### `registerCredentialBatch(bytes32[] _credentialIds, uint256 _version)`
Register multiple credentials in a single transaction.

**Parameters**:
- `_credentialIds`: Array of credential IDs (max 10)
- `_version`: Protocol version

**Gas Optimization**: More efficient than multiple single registrations

---

#### `verifyCredential(bytes32 _credentialId, uint256 _nonce)`
Verify biometric authentication with nonce check.

**Parameters**:
- `_credentialId`: Credential to verify
- `_nonce`: Current nonce (must match on-chain value)

**Requirements**:
- Credential must exist
- Credential must be active
- Nonce must match current value
- Nonce must not be used (prevents replay attacks)

**Events**: `CredentialVerified`

---

#### `verifyWithProof(bytes32 _credentialId, uint256 _nonce, bytes _proof)`
Verify with ZK proof (Phase 5).

**Parameters**:
- `_credentialId`: Credential to verify
- `_nonce`: Nonce used in proof
- `_proof`: ZK proof data

**Requirements**:
- ZK verification must be enabled
- All requirements from `verifyCredential`

---

#### `incrementNonce(bytes32 _credentialId)`
Increment nonce to revoke current credential version.

**Access**: Owner only

**Effect**: Invalidates all previous verifications with old nonce

**Events**: `CredentialRevoked`

---

#### `deactivateCredential(bytes32 _credentialId)`
Deactivate credential (soft delete).

**Access**: Owner only

**Events**: `CredentialDeactivated`

---

#### `reactivateCredential(bytes32 _credentialId)`
Reactivate deactivated credential.

**Access**: Owner only

**Events**: `CredentialReactivated`

---

### Read Functions

#### `getNonce(bytes32 _credentialId) → uint256`
Get current nonce for a credential.

---

#### `getCredential(bytes32 _credentialId) → Credential`
Get full credential details.

**Returns**:
```solidity
struct Credential {
    bytes32 credentialId;
    address owner;
    uint256 version;
    uint256 nonce;
    bool isActive;
    uint256 registeredAt;
    uint256 lastVerifiedAt;
}
```

---

#### `getOwnerCredentials(address _owner) → bytes32[]`
Get all credential IDs owned by an address.

---

#### `isNonceUsed(bytes32 _credentialId, uint256 _nonce) → bool`
Check if a nonce has been used (for replay attack prevention).

---

#### `getStats() → (uint256 total, bool zkEnabled)`
Get contract statistics.

---

### Admin Functions

#### `setZKVerificationEnabled(bool _enabled)`
Enable/disable ZK proof verification.

**Access**: Owner only

---

## Events

### `CredentialRegistered`
```solidity
event CredentialRegistered(
    bytes32 indexed credentialId,
    address indexed owner,
    uint256 version,
    uint256 timestamp
);
```

### `CredentialVerified`
```solidity
event CredentialVerified(
    bytes32 indexed credentialId,
    address indexed verifier,
    uint256 nonce,
    bool success,
    uint256 timestamp
);
```

### `CredentialRevoked`
```solidity
event CredentialRevoked(
    bytes32 indexed credentialId,
    address indexed owner,
    uint256 newNonce,
    uint256 timestamp
);
```

### `CredentialDeactivated`
```solidity
event CredentialDeactivated(
    bytes32 indexed credentialId,
    address indexed owner,
    uint256 timestamp
);
```

### `CredentialReactivated`
```solidity
event CredentialReactivated(
    bytes32 indexed credentialId,
    address indexed owner,
    uint256 timestamp
);
```

## Integration with ZTIZEN Service

### Backend Integration (Node.js)

```javascript
import { ethers } from 'ethers';
import ZTIZEN_ABI from './artifacts/contracts/ZTIZEN.sol/ZTIZEN.json';

// Setup
const provider = new ethers.JsonRpcProvider(process.env.RPC_URL);
const signer = new ethers.Wallet(process.env.PRIVATE_KEY, provider);
const contract = new ethers.Contract(
  process.env.ZTIZEN_CONTRACT_ADDRESS,
  ZTIZEN_ABI.abi,
  signer
);

// Register credential
async function registerCredential(credentialId, version) {
  const tx = await contract.registerCredential(
    ethers.id(credentialId), // Convert to bytes32
    version
  );
  await tx.wait();
  return tx.hash;
}

// Verify credential
async function verifyCredential(credentialId, nonce) {
  const tx = await contract.verifyCredential(
    ethers.id(credentialId),
    nonce
  );
  await tx.wait();
  return tx.hash;
}

// Get nonce
async function getNonce(credentialId) {
  return await contract.getNonce(ethers.id(credentialId));
}

// Listen to events
contract.on('CredentialVerified', (credId, verifier, nonce, success, timestamp) => {
  console.log('Verification:', {
    credentialId: credId,
    verifier,
    nonce,
    success,
    timestamp
  });
});
```

## Gas Costs (Estimated)

| Operation | Gas Cost | USD (at 50 gwei, $2000 ETH) |
|-----------|----------|------------------------------|
| Deploy Contract | ~1,500,000 | ~$150 |
| Register Credential | ~100,000 | ~$10 |
| Register Batch (10) | ~700,000 | ~$70 |
| Verify Credential | ~60,000 | ~$6 |
| Increment Nonce | ~40,000 | ~$4 |
| Deactivate Credential | ~30,000 | ~$3 |

**Note**: Gas costs are estimates and will vary based on network conditions.

## Security Considerations

### ✅ Implemented

- **ReentrancyGuard**: Prevents reentrancy attacks
- **Access Control**: Owner-only admin functions
- **Nonce Replay Protection**: Used nonces tracked on-chain
- **Input Validation**: All inputs validated
- **Event Logging**: Comprehensive audit trail

### 🔄 Phase 5 (ZK Proofs)

- ZK proof verification
- Proof validity checking
- On-chain proof storage (optional)

### ⚠️ Important Notes

1. **Credential ID Privacy**: Credential IDs are public on-chain
2. **Owner Address**: Owner addresses are visible
3. **Verification Events**: All verifications logged publicly
4. **Gas Costs**: Users pay gas for all transactions
5. **Nonce Management**: Incrementing nonce is irreversible

## Development

### Project Structure

```
smart-contracts/
├── contracts/
│   └── ZTIZEN.sol          # Main contract
├── test/
│   └── ZTIZEN.test.ts      # Test suite
├── scripts/
│   ├── deploy.ts           # Deployment script
│   └── interact.ts         # Interaction script
├── hardhat.config.ts       # Hardhat configuration
├── package.json            # Dependencies
└── README.md               # This file
```

### Running Tests with Coverage

```bash
npx hardhat coverage
```

### Local Development

```bash
# Start local node
npx hardhat node

# Deploy locally
npx hardhat run scripts/deploy.ts --network localhost

# Run tests against local node
npx hardhat test --network localhost
```

## Roadmap

### Phase 4 (Current)
- ✅ Basic contract with nonce management
- ✅ Registration and verification
- ✅ Comprehensive tests
- ✅ Deployment scripts

### Phase 5 (Next)
- ⏳ ZK proof verification integration
- ⏳ Noir circuit integration
- ⏳ Proof validity checks
- ⏳ Gas optimization for ZK verification

### Future Enhancements
- Multi-signature admin control
- Credential delegation
- On-chain credential metadata
- Cross-chain credential verification
- Credential recovery mechanism

## License

MIT
