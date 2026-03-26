# ZTIZEN Service

> **⚠️ UPDATED 2025-12-01**: New Docker + Makefile setup available!
>
> **Quick Start**: See [QUICKSTART.md](./QUICKSTART.md) for Docker setup
>
> ```bash
> make setup    # Setup database in Docker
> npm run dev   # Start API server
> ```

Cancelable Biometric Authentication Platform with multi-credential identity management.

---

## 🚀 Quick Setup (Docker)

**2 commands to get started:**

```bash
# 1. Setup database (Docker + schema)
make setup

# 2. Start API server
npm run dev
```

✅ Database runs in Docker (no local PostgreSQL needed)
✅ Schema automatically applied
✅ Ready to develop!

**See [QUICKSTART.md](./QUICKSTART.md) for full documentation**

---

## 📚 Important Documentation

- **[QUICKSTART.md](./QUICKSTART.md)** - Docker setup with Makefile
- **[../ALIGNMENT_REPORT.md](../ALIGNMENT_REPORT.md)** - Schema fixes
- **[../FIXES_COMPLETED.md](../FIXES_COMPLETED.md)** - What was fixed
- **[../DATABASE_RESET.md](../DATABASE_RESET.md)** - Database reset guide
- **[../THESIS.md](../THESIS.md)** - Complete thesis documentation

---

## Original Documentation (Legacy)

## Architecture

ZTIZEN is the core biometric authentication platform that manages:
- User identity credentials (like credit cards)
- Biometric enrollment and verification
- Multi-party seed generation (ZTIZEN partial key)
- Verification audit logs

Each user can have **multiple identity credentials**, each with:
- Own service name and purpose
- Own PIN (like credit card PIN)
- Own Poseidon commitments (128 field elements)
- Independent revocation capability

## Setup

### 1. Install Dependencies

```bash
npm install
```

### 2. Setup PostgreSQL Database

```bash
# Create database
createdb ztizen_db

# Run schema migration
psql ztizen_db < sql/schema.sql

# Or use the setup script
npm run db:setup
```

### 3. Configure Environment

```bash
cp .env.example .env
# Edit .env with your configuration
```

**Required environment variables**:
```bash
PORT=3000
DATABASE_URL=postgresql://username:password@localhost:5432/ztizen_db
ZTIZEN_PARTIAL_KEY=<generated-key>
```

**Generate ZTIZEN partial key**:
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

### 4. Start Server

```bash
# Development mode (with auto-reload)
npm run dev

# Production mode
npm start
```

## API Endpoints

### Health Check

```
GET /health
```

Response:
```json
{
  "status": "ok",
  "service": "ZTIZEN Platform",
  "version": "1.0.0",
  "database": "connected",
  "timestamp": "2025-01-30T12:00:00.000Z"
}
```

---

## Enrollment Flow

### 1. Initiate Enrollment

```
POST /api/enroll/initiate
Content-Type: application/json

{
  "user_email": "alice@example.com",
  "service_name": "Bank Login",
  "purpose": "Authentication",
  "callback_url": "http://localhost:3001/api/auth/callback"
}
```

Response:
```json
{
  "success": true,
  "session_id": "session-uuid",
  "user_id": "user-uuid",
  "message": "Enrollment initiated..."
}
```

### 2. Complete Enrollment

```
POST /api/enroll/complete
Content-Type: application/json

{
  "session_id": "session-uuid",
  "credential_pin": "1234",
  "auth_commit": ["hex1", "hex2", ..., "hex128"],
  "icon": "🏢",
  "version": 1,
  "nonce": 0
}
```

**Requirements**:
- `auth_commit`: Array of 128 hex strings (64 chars each, 32 bytes)
- `credential_pin`: PIN for this specific credential
- Each hex string represents a Poseidon commitment

Response:
```json
{
  "success": true,
  "message": "Enrollment completed successfully",
  "credential": {
    "id": "credential-uuid",
    "service_name": "Bank Login",
    "purpose": "Authentication",
    "last_4_digits": "1234",
    "icon": "🏢",
    "created_at": "2025-01-30T12:00:00.000Z"
  },
  "auth_token": "auth-token-hex",
  "callback_url": "http://localhost:3001/api/auth/callback"
}
```

### 3. Get Session Details

```
GET /api/enroll/session/:sessionId
```

---

## Verification Flow

### 1. Initiate Verification

```
POST /api/verify/initiate
Content-Type: application/json

{
  "credential_id": "credential-uuid",
  "callback_url": "http://localhost:3001/api/auth/callback"
}
```

Response:
```json
{
  "success": true,
  "session_id": "session-uuid",
  "credential_id": "credential-uuid",
  "service_name": "Bank Login",
  "purpose": "Authentication",
  "nonce": 0,
  "version": 1,
  "message": "Verification initiated..."
}
```

### 2. Complete Verification

```
POST /api/verify/complete
Content-Type: application/json

{
  "session_id": "session-uuid",
  "credential_pin": "1234",
  "verify_commit": ["hex1", "hex2", ..., "hex128"],
  "zk_proof": null
}
```

**Current Implementation** (Phase 3):
- Compares `verify_commit` with stored `auth_commit`
- Calculates match rate (must be ≥95%)
- Verifies credential PIN

**Future Implementation** (Phase 5):
- Will use ZK proof verification
- On-chain nonce verification
- Poseidon hash proof

Response (Success):
```json
{
  "success": true,
  "message": "Verification successful",
  "match_rate": "98.44",
  "credential_id": "credential-uuid",
  "auth_token": "auth-token-hex",
  "callback_url": "http://localhost:3001/api/auth/callback"
}
```

Response (Failure):
```json
{
  "success": false,
  "error": "Biometric verification failed",
  "match_rate": "87.50"
}
```

### 3. PIN-Only Verification

Quick PIN check without biometric (for low-security operations):

```
POST /api/verify/pin-only
Content-Type: application/json

{
  "credential_id": "credential-uuid",
  "credential_pin": "1234"
}
```

---

## Credential Management

### List User Credentials

```
GET /api/credentials/:userId?active_only=true
```

Response:
```json
{
  "success": true,
  "credentials": [
    {
      "id": "credential-uuid",
      "service_name": "Bank Login",
      "purpose": "Authentication",
      "last_4_digits": "1234",
      "icon": "🏢",
      "version": 1,
      "nonce": 0,
      "is_active": true,
      "created_at": "2025-01-30T12:00:00.000Z"
    }
  ],
  "count": 1
}
```

### Get Credential Details

```
GET /api/credentials/detail/:credentialId
```

Returns full credential including `auth_commit` (128 hex strings).

### Update Credential

```
PATCH /api/credentials/:credentialId
Content-Type: application/json

{
  "service_name": "New Service Name",
  "purpose": "New Purpose",
  "icon": "💳"
}
```

### Deactivate Credential

```
PATCH /api/credentials/:credentialId/deactivate
```

### Reactivate Credential

```
PATCH /api/credentials/:credentialId/reactivate
```

### Delete Credential

```
DELETE /api/credentials/:credentialId
```

**Warning**: Permanent deletion. Cannot be undone.

### Get Verification Logs

```
GET /api/credentials/:credentialId/logs?limit=50&offset=0
```

Response:
```json
{
  "success": true,
  "logs": [
    {
      "id": "log-uuid",
      "success": true,
      "match_rate": "98.44",
      "nonce_used": 0,
      "timestamp": "2025-01-30T12:00:00.000Z"
    }
  ],
  "total": 10,
  "limit": 50,
  "offset": 0
}
```

---

## Keys API

### Get ZTIZEN Partial Key

```
GET /api/keys/partial
```

Response:
```json
{
  "success": true,
  "partial_key": "hex-encoded-32-bytes",
  "service_name": "ZTIZEN Platform",
  "message": "ZTIZEN partial key retrieved"
}
```

This key is used in **multi-party seed generation**:

```
seed = HKDF(
    ikm = product_partial_key || ZTIZEN_partial_key || credential_secret,
    salt = version || nonce || credential_id,
    info = "ZTIZEN_SEED_v1 || " + service_name + " || " + purpose
)
```

---

## Multi-Credential System

### Concept

Similar to credit cards:
- Each user has multiple identity credentials
- Each credential has its own PIN (like credit card PIN)
- Each credential is independent and revocable
- Each credential has its own seed and commitments

### Example Use Cases

**User: Alice**

1. **Credential 1**:
   - Service: "Bank XYZ"
   - Purpose: "Account Login"
   - PIN: 1234
   - Icon: 🏢
   - Last 4: ** 1234

2. **Credential 2**:
   - Service: "Shopping Platform"
   - Purpose: "Purchase Verification"
   - PIN: 5678
   - Icon: 🛒
   - Last 4: ** 5678

3. **Credential 3**:
   - Service: "Government ID"
   - Purpose: "Identity Proof"
   - PIN: 9012
   - Icon: 🆔
   - Last 4: ** 9012

### PIN vs Password

**Master Password**: ZTIZEN account password
- Used to login to ZTIZEN platform
- NOT used in seed generation

**Credential PIN**: Per-credential PIN
- Different for each credential
- Used in seed generation: `credential_secret = PBKDF2(credential_pin)`
- Like credit card PIN

---

## Database Schema

### Users Table
```sql
CREATE TABLE users (
    id UUID PRIMARY KEY,
    email VARCHAR(255) UNIQUE,
    password_hash VARCHAR(255),
    created_at TIMESTAMP,
    updated_at TIMESTAMP
);
```

### Credentials Table
```sql
CREATE TABLE credentials (
    id UUID PRIMARY KEY,
    user_id UUID REFERENCES users(id),
    service_name VARCHAR(255),
    purpose VARCHAR(255),
    credential_pin_hash VARCHAR(255),
    last_4_digits VARCHAR(4),
    icon VARCHAR(10),
    auth_commit BYTEA[128],  -- Poseidon commitments
    version INTEGER DEFAULT 1,
    nonce INTEGER DEFAULT 0,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP,
    updated_at TIMESTAMP
);
```

### Verification Logs Table
```sql
CREATE TABLE verification_logs (
    id UUID PRIMARY KEY,
    credential_id UUID REFERENCES credentials(id),
    success BOOLEAN,
    match_rate DECIMAL(5,2),
    nonce_used INTEGER,
    timestamp TIMESTAMP
);
```

---

## Integration Example

### Complete Enrollment Flow

1. **Product Service** calls `/api/enroll/initiate`
2. **Frontend** redirects user to ZTIZEN enrollment page
3. **Frontend** captures face, generates BioHash, creates Poseidon commitments
4. **Frontend** calls `/api/enroll/complete` with commitments
5. **ZTIZEN Service** stores credential in database
6. **ZTIZEN Service** calls Product Service callback
7. **Product Service** receives auth token and credential ID

### Complete Verification Flow

1. **Product Service** calls `/api/verify/initiate`
2. **Frontend** redirects user to ZTIZEN verification page
3. **Frontend** captures face, generates BioHash, creates Poseidon commitments
4. **Frontend** calls `/api/verify/complete` with commitments
5. **ZTIZEN Service** verifies commitments match stored values
6. **ZTIZEN Service** calls Product Service callback
7. **Product Service** receives auth token and grants access

---

## Security Considerations

### Current Limitations (Demo)

- ❌ In-memory session storage (use Redis in production)
- ❌ No rate limiting
- ❌ Simple commitment comparison (Phase 5 will use ZK proofs)
- ❌ No HTTPS enforcement
- ❌ Placeholder password hashing

### Production Requirements

- ✅ Use Redis for session management
- ✅ Implement rate limiting (e.g., 5 verification attempts per minute)
- ✅ Add ZK proof verification (Phase 5)
- ✅ Enforce HTTPS
- ✅ Implement proper password hashing (bcrypt/argon2)
- ✅ Add request validation middleware
- ✅ Implement comprehensive logging and monitoring
- ✅ Add audit trail for all operations
- ✅ Implement credential revocation mechanism
- ✅ Add nonce management with smart contract (Phase 4)

---

## Testing

### Quick Test

```bash
# Start server
npm run dev

# Test health check
curl http://localhost:3000/health

# Test enrollment initiation
curl -X POST http://localhost:3000/api/enroll/initiate \
  -H "Content-Type: application/json" \
  -d '{
    "user_email": "alice@example.com",
    "service_name": "Test Service",
    "purpose": "Testing",
    "callback_url": "http://localhost:3001/callback"
  }'

# Test get partial key
curl http://localhost:3000/api/keys/partial
```

### Database Verification

```bash
# Connect to database
psql ztizen_db

# Check tables
\dt

# View users
SELECT * FROM users;

# View credentials
SELECT id, service_name, purpose, last_4_digits, icon, is_active FROM credentials;

# View verification logs
SELECT * FROM verification_logs ORDER BY timestamp DESC LIMIT 10;
```

---

## Development Roadmap

### Phase 3 (Current) - Backend Services ✅
- [x] Database schema
- [x] Credential enrollment API
- [x] Credential verification API
- [x] Credential management API
- [x] ZTIZEN partial key API

### Phase 4 - Smart Contract
- [ ] Solidity contract for nonce tracking
- [ ] On-chain verification log
- [ ] Deploy to testnet
- [ ] Integration with ZTIZEN service

### Phase 5 - ZK Circuit
- [ ] Noir circuit implementation
- [ ] Poseidon hash proof generation
- [ ] Proof verification in backend
- [ ] Replace commitment comparison with ZK proof

### Phase 6 - Integration Testing
- [ ] End-to-end enrollment flow
- [ ] End-to-end verification flow
- [ ] Multi-credential testing
- [ ] Performance benchmarking

---

## License

MIT
