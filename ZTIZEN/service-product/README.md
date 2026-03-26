# ZTIZEN Product Service

Simulated business provider that uses ZTIZEN platform for biometric authentication.

## Architecture

This service represents a business (e.g., shopping platform, banking app) that wants to authenticate users using ZTIZEN's cancelable biometric system.

## Setup

1. **Install dependencies**:
   ```bash
   npm install
   ```

2. **Configure environment**:
   ```bash
   cp .env.example .env
   # Edit .env and set your configuration
   ```

3. **Generate product partial key** (if not set):
   The server will auto-generate on first run and display it.
   Add it to your `.env` file.

4. **Start server**:
   ```bash
   npm run dev
   ```

   Server will start on port 3001 by default.

## API Endpoints

### Health Check
```
GET /health
```

Response:
```json
{
  "status": "ok",
  "service": "ZTIZEN Product Service",
  "product_name": "Demo Product",
  "version": "1.0.0"
}
```

### Register User
```
POST /api/auth/register
Content-Type: application/json

{
  "username": "alice",
  "email": "alice@example.com",
  "service_name": "Shopping Platform",
  "purpose": "Purchase Verification"
}
```

Response:
```json
{
  "success": true,
  "user_id": "uuid-here",
  "redirect_url": "http://localhost:5173?action=enroll&session_id=...",
  "session_id": "session-id-here",
  "message": "User registered. Please complete biometric enrollment."
}
```

**Flow**:
1. Product Service creates user
2. Returns redirect URL to ZTIZEN enrollment page
3. User completes biometric enrollment on ZTIZEN
4. ZTIZEN calls back to `/api/auth/callback`

### Initiate Login
```
POST /api/auth/login-request
Content-Type: application/json

{
  "email": "alice@example.com",
  "credential_id": "credential-uuid"
}
```

Response:
```json
{
  "success": true,
  "redirect_url": "http://localhost:5173?action=verify&session_id=...",
  "session_id": "session-id-here",
  "message": "Please complete biometric verification."
}
```

**Flow**:
1. User initiates login
2. Product Service creates verification session
3. Returns redirect URL to ZTIZEN verification page
4. User completes biometric verification on ZTIZEN
5. ZTIZEN calls back to `/api/auth/callback`

### Handle Callback
```
POST /api/auth/callback
Content-Type: application/json

{
  "session_id": "session-id-here",
  "auth_token": "ztizen-auth-token",
  "credential_id": "credential-uuid"
}
```

Response (Enrollment):
```json
{
  "success": true,
  "message": "Enrollment successful",
  "user": {
    "id": "uuid",
    "username": "alice",
    "email": "alice@example.com"
  },
  "credential_id": "credential-uuid",
  "access_token": "product-access-token"
}
```

Response (Verification):
```json
{
  "success": true,
  "message": "Verification successful",
  "user": {
    "id": "uuid",
    "username": "alice",
    "email": "alice@example.com"
  },
  "access_token": "product-access-token"
}
```

### Get Product Partial Key
```
GET /api/keys/partial
```

Response:
```json
{
  "success": true,
  "partial_key": "hex-encoded-32-bytes",
  "product_name": "Demo Product",
  "message": "Product partial key retrieved"
}
```

**Note**: This key is used in multi-party seed generation (HKDF).

## Multi-Party Seed Generation

The product partial key is one of three components in seed generation:

```
seed = HKDF(
    ikm = product_partial_key || ZTIZEN_partial_key || credential_secret,
    salt = version || nonce || credential_id,
    info = "ZTIZEN_SEED_v1 || " + service_name + " || " + purpose
)
```

This ensures:
- ✅ Trust distribution (requires all 3 parties)
- ✅ Revocability (change any key → new seed)
- ✅ Service-specific credentials

## Storage

Currently uses in-memory storage (Map) for demo purposes.

**In production, replace with**:
- PostgreSQL/MySQL for user data
- Redis for session management
- Proper authentication middleware

## Security Considerations

**Demo Limitations**:
- ❌ No authentication on `/api/keys/partial` (should require auth)
- ❌ No rate limiting
- ❌ In-memory session storage (not persistent)
- ❌ Simple access tokens (should use JWT)
- ❌ No HTTPS enforcement

**Production Requirements**:
- ✅ Authenticate `/api/keys/partial` endpoint
- ✅ Rate limit all endpoints
- ✅ Use Redis for session storage
- ✅ Use JWT for access tokens
- ✅ Enforce HTTPS
- ✅ Add request validation
- ✅ Implement logging and monitoring
- ✅ Add audit trail for key access

## Integration with ZTIZEN

1. **Enrollment Flow**:
   ```
   User → Product Service → ZTIZEN Enrollment → Callback → Product Service
   ```

2. **Verification Flow**:
   ```
   User → Product Service → ZTIZEN Verification → Callback → Product Service
   ```

3. **Seed Generation** (client-side):
   ```javascript
   const productKey = await fetch('http://localhost:3001/api/keys/partial');
   const ztizenKey = await fetch('http://localhost:3000/api/keys/partial');
   const credentialSecret = PBKDF2(credentialPin, salt);

   const seed = HKDF(
     productKey.partial_key + ztizenKey.partial_key + credentialSecret,
     versionBytes + nonceBytes + credentialIdBytes,
     "ZTIZEN_SEED_v1" + serviceName + purpose
   );
   ```

## Testing

```bash
# Start server
npm run dev

# Test health check
curl http://localhost:3001/health

# Test registration
curl -X POST http://localhost:3001/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "username": "alice",
    "email": "alice@example.com",
    "service_name": "Shopping Platform",
    "purpose": "Purchase Verification"
  }'

# Test get partial key
curl http://localhost:3001/api/keys/partial
```

## License

MIT
