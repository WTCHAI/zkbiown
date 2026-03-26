/**
 * Race Condition Test for /api/enrollment/verify
 *
 * This test verifies that concurrent verification requests are handled correctly:
 * - Only ONE concurrent request should succeed
 * - All other concurrent requests should receive 409 Conflict (NONCE_MISMATCH)
 *
 * This is critical for security: prevents replay attacks and double-spending of nonces.
 *
 * Usage:
 *   node tests/verify-race-condition.test.js
 *
 * Prerequisites:
 *   - ztizen-service running on localhost:3000
 *   - PostgreSQL running with credentials table
 *   - At least one enrolled credential
 */

import { randomUUID } from 'crypto';

// Configuration
const BASE_URL = process.env.ZTIZEN_SERVICE_URL || 'http://localhost:3000';
const CONCURRENT_REQUESTS = 10; // Number of concurrent verify requests

/**
 * Generate mock auth_commit array (128 BigInt strings)
 */
function generateMockAuthCommit() {
  return Array.from({ length: 128 }, () =>
    BigInt(Math.floor(Math.random() * Number.MAX_SAFE_INTEGER)).toString()
  );
}

/**
 * Generate random nonce string
 */
function generateNonce() {
  return BigInt(Math.floor(Math.random() * Number.MAX_SAFE_INTEGER)).toString();
}

/**
 * Create a test credential for race condition testing
 */
async function createTestCredential() {
  const userId = `test-user-${randomUUID().slice(0, 8)}`;

  // Step 1: Create credential
  const createRes = await fetch(`${BASE_URL}/api/enrollment/create`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      user_id: userId,
      product_id: 'race-test',
      product_name: 'Race Condition Test',
      service_name: 'Test Service',
      service_type: 'authentication',
    }),
  });

  const createData = await createRes.json();
  if (!createData.success) {
    throw new Error(`Failed to create credential: ${createData.error}`);
  }

  const credentialId = createData.credential_id;
  const initialNonce = generateNonce();

  // Step 2: Store initial auth_commit (enroll)
  const storeRes = await fetch(`${BASE_URL}/api/enrollment/store`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      credential_id: credentialId,
      auth_commit: generateMockAuthCommit(),
      template_type: 'gaussian',
      nonce: initialNonce,
      version: 1,
      pin_hash: 'test-pin-hash',
    }),
  });

  const storeData = await storeRes.json();
  if (!storeData.success) {
    throw new Error(`Failed to store auth_commit: ${storeData.error}`);
  }

  console.log(`✅ Created test credential: ${credentialId}`);
  console.log(`   Initial nonce: ${initialNonce.slice(0, 20)}...`);

  return { credentialId, initialNonce, userId };
}

/**
 * Fire N concurrent verification requests
 */
async function fireConcurrentVerifications(credentialId, currentNonce, n) {
  const requests = [];

  for (let i = 0; i < n; i++) {
    const newNonce = generateNonce();
    const newAuthCommit = generateMockAuthCommit();

    const request = fetch(`${BASE_URL}/api/enrollment/verify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        credential_id: credentialId,
        nonce_current: currentNonce,
        auth_commit_next: newAuthCommit,
        nonce_next: newNonce,
      }),
    }).then(async (res) => {
      const data = await res.json();
      return {
        status: res.status,
        success: data.success,
        error: data.error,
        code: data.code,
        requestIndex: i,
        newNonce,
      };
    });

    requests.push(request);
  }

  // Wait for all requests to complete
  return Promise.all(requests);
}

/**
 * Run the race condition test
 */
async function runTest() {
  console.log('═'.repeat(60));
  console.log('ZTIZEN Race Condition Test');
  console.log('═'.repeat(60));
  console.log(`Server: ${BASE_URL}`);
  console.log(`Concurrent requests: ${CONCURRENT_REQUESTS}`);
  console.log('');

  try {
    // Step 1: Create test credential
    console.log('📝 Creating test credential...');
    const { credentialId, initialNonce } = await createTestCredential();

    // Step 2: Fire concurrent verification requests
    console.log(`\n🚀 Firing ${CONCURRENT_REQUESTS} concurrent verification requests...`);
    const startTime = Date.now();
    const results = await fireConcurrentVerifications(credentialId, initialNonce, CONCURRENT_REQUESTS);
    const duration = Date.now() - startTime;

    // Step 3: Analyze results
    console.log(`\n📊 Results (completed in ${duration}ms):`);
    console.log('-'.repeat(60));

    const successes = results.filter((r) => r.success);
    const conflicts = results.filter((r) => r.status === 409);
    const otherErrors = results.filter((r) => !r.success && r.status !== 409);

    console.log(`   ✅ Successful: ${successes.length}`);
    console.log(`   ⚠️  Conflicts (409): ${conflicts.length}`);
    console.log(`   ❌ Other errors: ${otherErrors.length}`);

    // Log individual results
    console.log('\nDetailed Results:');
    results.forEach((r, i) => {
      const statusIcon = r.success ? '✅' : r.status === 409 ? '⚠️' : '❌';
      console.log(`   [${i}] ${statusIcon} Status: ${r.status}, Success: ${r.success}, Error: ${r.error || 'none'}`);
    });

    // Step 4: Verify exactly one success
    console.log('\n' + '═'.repeat(60));
    console.log('TEST VERDICT');
    console.log('═'.repeat(60));

    if (successes.length === 1 && conflicts.length === CONCURRENT_REQUESTS - 1) {
      console.log('✅ PASS: Exactly 1 request succeeded, all others got 409 Conflict');
      console.log('   Race condition is properly handled!');
      console.log('   Nonce rolling is atomic and secure.');
      process.exit(0);
    } else if (successes.length === 0) {
      console.log('❌ FAIL: No requests succeeded');
      console.log('   This could indicate a bug in the verify endpoint.');
      process.exit(1);
    } else if (successes.length > 1) {
      console.log(`❌ FAIL: ${successes.length} requests succeeded (expected 1)`);
      console.log('   CRITICAL: Race condition vulnerability detected!');
      console.log('   Multiple concurrent verifications consumed the same nonce.');
      process.exit(1);
    } else {
      console.log(`⚠️  UNEXPECTED: ${successes.length} successes, ${conflicts.length} conflicts, ${otherErrors.length} errors`);
      console.log('   Review the results above for details.');
      process.exit(1);
    }
  } catch (error) {
    console.error('❌ Test failed with error:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

// Run the test
runTest();
