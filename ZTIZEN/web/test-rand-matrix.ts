/**
 * Test Script: Visualize Rand_Matrix Generation
 *
 * Run with: npx tsx test-rand-matrix.ts
 *
 * This shows how different keys produce different sparse matrices
 * and how the 67% sparsity (Achlioptas) works.
 */

// Simple seeded random number generator (same as in CancelableBiometric)
function seededRandom(seed: number): () => number {
  return function() {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    return seed / 0x7fffffff;
  };
}

// Hash function to convert string keys to numeric seed
async function hashKeysToSeed(productKey: string, ztizenKey: string, userKey: string, version: number): Promise<number> {
  const combined = `${productKey}:${ztizenKey}:${userKey}:${version}`;
  const encoder = new TextEncoder();
  const data = encoder.encode(combined);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = new Uint8Array(hashBuffer);

  // Convert first 4 bytes to number
  let seed = 0;
  for (let i = 0; i < 4; i++) {
    seed = (seed << 8) | hashArray[i];
  }
  return seed >>> 0; // Ensure unsigned
}

// Generate sparse Gaussian matrix (Achlioptas method)
// P(+1) = 1/6, P(0) = 2/3, P(-1) = 1/6
function generateSparseMatrix(rows: number, cols: number, rng: () => number): number[][] {
  const scale = Math.sqrt(3 / cols); // Scaling factor
  const matrix: number[][] = [];

  let zeroCount = 0;
  let positiveCount = 0;
  let negativeCount = 0;

  for (let i = 0; i < rows; i++) {
    const row: number[] = [];
    for (let j = 0; j < cols; j++) {
      const r = rng();
      let value: number;

      if (r < 1/6) {
        value = scale;  // +1 scaled
        positiveCount++;
      } else if (r < 5/6) {
        value = 0;      // 0 (67% probability)
        zeroCount++;
      } else {
        value = -scale; // -1 scaled
        negativeCount++;
      }
      row.push(value);
    }
    matrix.push(row);
  }

  console.log(`  Sparsity: ${(zeroCount / (rows * cols) * 100).toFixed(1)}% zeros`);
  console.log(`  Positive: ${positiveCount} (${(positiveCount / (rows * cols) * 100).toFixed(1)}%)`);
  console.log(`  Negative: ${negativeCount} (${(negativeCount / (rows * cols) * 100).toFixed(1)}%)`);

  return matrix;
}

// Visualize matrix (show pattern of zeros vs non-zeros)
function visualizeMatrix(matrix: number[][], label: string, showRows: number = 16, showCols: number = 32) {
  console.log(`\n${label}`);
  console.log('═'.repeat(showCols + 10));
  console.log('Legend: · = 0 (zero), + = positive, - = negative\n');

  for (let i = 0; i < Math.min(showRows, matrix.length); i++) {
    let rowStr = `Row ${String(i).padStart(2, '0')}: `;
    for (let j = 0; j < Math.min(showCols, matrix[i].length); j++) {
      const val = matrix[i][j];
      if (val === 0) {
        rowStr += '·';
      } else if (val > 0) {
        rowStr += '+';
      } else {
        rowStr += '-';
      }
    }
    console.log(rowStr);
  }

  if (matrix.length > showRows || matrix[0].length > showCols) {
    console.log(`... (showing ${showRows}x${showCols} of ${matrix.length}x${matrix[0].length})`);
  }
}

// Compare two matrices to see if zeros are in same positions
function compareMatrices(m1: number[][], m2: number[][], label1: string, label2: string) {
  console.log(`\n${'═'.repeat(60)}`);
  console.log(`COMPARISON: ${label1} vs ${label2}`);
  console.log('═'.repeat(60));

  let sameZeroPosition = 0;
  let differentZeroPosition = 0;
  let sameNonZeroPosition = 0;
  let total = m1.length * m1[0].length;

  for (let i = 0; i < m1.length; i++) {
    for (let j = 0; j < m1[i].length; j++) {
      const isZero1 = m1[i][j] === 0;
      const isZero2 = m2[i][j] === 0;

      if (isZero1 && isZero2) {
        sameZeroPosition++;
      } else if (!isZero1 && !isZero2) {
        sameNonZeroPosition++;
      } else {
        differentZeroPosition++;
      }
    }
  }

  console.log(`\nZero pattern comparison:`);
  console.log(`  Both zero at same position:     ${sameZeroPosition} (${(sameZeroPosition/total*100).toFixed(1)}%)`);
  console.log(`  Both non-zero at same position: ${sameNonZeroPosition} (${(sameNonZeroPosition/total*100).toFixed(1)}%)`);
  console.log(`  Different (one zero, one not):  ${differentZeroPosition} (${(differentZeroPosition/total*100).toFixed(1)}%)`);

  // Expected by chance: if both have 67% zeros independently
  // P(both zero) = 0.67 * 0.67 = 44.9%
  // P(both non-zero) = 0.33 * 0.33 = 10.9%
  // P(different) = 1 - 0.449 - 0.109 = 44.2%
  console.log(`\n  Expected by random chance:`);
  console.log(`    Both zero: ~44.9%`);
  console.log(`    Both non-zero: ~10.9%`);
  console.log(`    Different: ~44.2%`);

  // Side-by-side visualization (first 8 rows, 40 cols)
  console.log(`\nSide-by-side (first 8 rows, 40 cols):`);
  console.log(`  ${label1.padEnd(40)} | ${label2}`);
  console.log(`  ${'─'.repeat(40)} | ${'─'.repeat(40)}`);

  for (let i = 0; i < 8; i++) {
    let row1 = '';
    let row2 = '';
    for (let j = 0; j < 40; j++) {
      row1 += m1[i][j] === 0 ? '·' : (m1[i][j] > 0 ? '+' : '-');
      row2 += m2[i][j] === 0 ? '·' : (m2[i][j] > 0 ? '+' : '-');
    }
    console.log(`  ${row1} | ${row2}`);
  }
}

// Main test
async function main() {
  console.log('╔═══════════════════════════════════════════════════════════════════════════════╗');
  console.log('║           RAND_MATRIX VISUALIZATION - Sparse Gaussian (Achlioptas)           ║');
  console.log('╚═══════════════════════════════════════════════════════════════════════════════╝\n');

  // User A keys
  const userA = {
    productKey: 'product_key_abc123_user_a_example',
    ztizenKey: 'ztizen_key_xyz789_user_a_example',
    userKey: 'user_signature_key_a_from_wallet',
    version: 1,
  };

  // User B keys (different)
  const userB = {
    productKey: 'product_key_abc123_user_b_different',
    ztizenKey: 'ztizen_key_xyz789_user_b_different',
    userKey: 'user_signature_key_b_from_wallet',
    version: 1,
  };

  // Same user, different version (simulates key rotation)
  const userA_v2 = {
    ...userA,
    version: 2,
  };

  console.log('═══════════════════════════════════════════════════════════════════════════════');
  console.log('USER A - Matrix Generation');
  console.log('═══════════════════════════════════════════════════════════════════════════════');
  console.log(`Keys: productKey="${userA.productKey.slice(0, 20)}..."`);
  console.log(`      ztizenKey="${userA.ztizenKey.slice(0, 20)}..."`);
  console.log(`      version=${userA.version}`);

  const seedA = await hashKeysToSeed(userA.productKey, userA.ztizenKey, userA.userKey, userA.version);
  console.log(`\nSeed (from SHA256): ${seedA}`);

  const rngA = seededRandom(seedA);
  const matrixA = generateSparseMatrix(128, 128, rngA);
  visualizeMatrix(matrixA, 'USER A - Rand Matrix Pattern:', 16, 64);

  console.log('\n\n═══════════════════════════════════════════════════════════════════════════════');
  console.log('USER B - Matrix Generation (DIFFERENT KEYS)');
  console.log('═══════════════════════════════════════════════════════════════════════════════');
  console.log(`Keys: productKey="${userB.productKey.slice(0, 20)}..."`);
  console.log(`      ztizenKey="${userB.ztizenKey.slice(0, 20)}..."`);
  console.log(`      version=${userB.version}`);

  const seedB = await hashKeysToSeed(userB.productKey, userB.ztizenKey, userB.userKey, userB.version);
  console.log(`\nSeed (from SHA256): ${seedB}`);

  const rngB = seededRandom(seedB);
  const matrixB = generateSparseMatrix(128, 128, rngB);
  visualizeMatrix(matrixB, 'USER B - Rand Matrix Pattern:', 16, 64);

  // Compare A vs B
  compareMatrices(matrixA, matrixB, 'User A', 'User B');

  console.log('\n\n═══════════════════════════════════════════════════════════════════════════════');
  console.log('USER A - Version 2 (KEY ROTATION / CANCELABILITY)');
  console.log('═══════════════════════════════════════════════════════════════════════════════');
  console.log(`Same keys, but version=${userA_v2.version}`);

  const seedA_v2 = await hashKeysToSeed(userA_v2.productKey, userA_v2.ztizenKey, userA_v2.userKey, userA_v2.version);
  console.log(`\nSeed (from SHA256): ${seedA_v2}`);

  const rngA_v2 = seededRandom(seedA_v2);
  const matrixA_v2 = generateSparseMatrix(128, 128, rngA_v2);
  visualizeMatrix(matrixA_v2, 'USER A v2 - Rand Matrix Pattern:', 16, 64);

  // Compare A v1 vs A v2
  compareMatrices(matrixA, matrixA_v2, 'User A v1', 'User A v2');

  // Show that SAME keys = SAME matrix
  console.log('\n\n═══════════════════════════════════════════════════════════════════════════════');
  console.log('DETERMINISM CHECK: Same keys should produce IDENTICAL matrix');
  console.log('═══════════════════════════════════════════════════════════════════════════════');

  const seedA_again = await hashKeysToSeed(userA.productKey, userA.ztizenKey, userA.userKey, userA.version);
  const rngA_again = seededRandom(seedA_again);
  const matrixA_again = generateSparseMatrix(128, 128, rngA_again);

  let identical = true;
  for (let i = 0; i < 128 && identical; i++) {
    for (let j = 0; j < 128 && identical; j++) {
      if (matrixA[i][j] !== matrixA_again[i][j]) {
        identical = false;
      }
    }
  }

  console.log(`\nMatrix A regenerated with same keys: ${identical ? '✅ IDENTICAL' : '❌ DIFFERENT'}`);

  console.log('\n\n═══════════════════════════════════════════════════════════════════════════════');
  console.log('SUMMARY');
  console.log('═══════════════════════════════════════════════════════════════════════════════');
  console.log(`
Key Findings:
1. Each unique set of keys produces a UNIQUE rand_matrix
2. The 67% zeros follow Achlioptas distribution: P(0)=2/3, P(+1)=1/6, P(-1)=1/6
3. Zero positions are DIFFERENT between different keys
4. Same keys ALWAYS produce the SAME matrix (deterministic)
5. Changing version (key rotation) produces completely different matrix

Security Implications:
- Without knowing the keys, an attacker cannot reconstruct the matrix
- Even if they have the face embedding, they can't compute projections
- Changing version "cancels" the old template (new random projections)
`);
}

main().catch(console.error);
