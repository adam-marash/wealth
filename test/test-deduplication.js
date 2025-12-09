/**
 * Test deduplication service
 * Run with: node test/test-deduplication.js
 */

console.log('═══════════════════════════════════════════════════════════════');
console.log('  DEDUPLICATION SERVICE TEST');
console.log('═══════════════════════════════════════════════════════════════\n');

// Test hash generation (simulating the server logic)
async function testHashGeneration() {
  console.log('🔐 Testing Hash Generation:');
  console.log('');

  const testCases = [
    {
      name: 'Valid transaction',
      tx: {
        date_iso: '2024-03-15',
        amount_original: 1000.50,
        investment_slug: 'faropoint-frg-x',
      },
      expected_valid: true,
    },
    {
      name: 'Missing date',
      tx: {
        date_iso: null,
        amount_original: 1000.50,
        investment_slug: 'faropoint-frg-x',
      },
      expected_valid: false,
    },
    {
      name: 'Missing amount',
      tx: {
        date_iso: '2024-03-15',
        amount_original: null,
        investment_slug: 'faropoint-frg-x',
      },
      expected_valid: false,
    },
    {
      name: 'Missing slug',
      tx: {
        date_iso: '2024-03-15',
        amount_original: 1000.50,
        investment_slug: null,
      },
      expected_valid: false,
    },
  ];

  for (const testCase of testCases) {
    const { date_iso, amount_original, investment_slug } = testCase.tx;

    if (!date_iso || amount_original === null || !investment_slug) {
      console.log(`   ${testCase.name}: ⚠️  Hash = null (missing fields)`);
      continue;
    }

    // Simulate hash generation
    const hashInput = `${date_iso}|${amount_original}|${investment_slug}`;
    const encoder = new TextEncoder();
    const data = encoder.encode(hashInput);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const hash = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');

    console.log(`   ${testCase.name}:`);
    console.log(`      Input: ${hashInput}`);
    console.log(`      Hash:  ${hash.substring(0, 16)}...`);
  }
  console.log('');
}

// Test similarity scoring
function testSimilarityScoring() {
  console.log('🎯 Testing Similarity Scoring:');
  console.log('');

  const baseTx = {
    date_iso: '2024-03-15',
    amount_original: 1000.00,
    investment_slug: 'faropoint-frg-x',
  };

  const testCases = [
    {
      name: 'Exact match',
      tx: {
        date_iso: '2024-03-15',
        amount_original: 1000.00,
        investment_slug: 'faropoint-frg-x',
      },
      expected_score: 100,
    },
    {
      name: 'Same date & investment, amount within 1%',
      tx: {
        date_iso: '2024-03-15',
        amount_original: 1005.00,
        investment_slug: 'faropoint-frg-x',
      },
      expected_score: 100,
    },
    {
      name: 'Different date, same amount & investment',
      tx: {
        date_iso: '2024-03-16',
        amount_original: 1000.00,
        investment_slug: 'faropoint-frg-x',
      },
      expected_score: 60, // 40 (amount) + 20 (investment)
    },
    {
      name: 'Same date, different investment',
      tx: {
        date_iso: '2024-03-15',
        amount_original: 1000.00,
        investment_slug: 'migdal-insurance',
      },
      expected_score: 80, // 40 (date) + 40 (amount)
    },
    {
      name: 'Completely different',
      tx: {
        date_iso: '2024-04-01',
        amount_original: 2500.00,
        investment_slug: 'migdal-insurance',
      },
      expected_score: 0,
    },
  ];

  for (const testCase of testCases) {
    let score = 0;

    // Same date: +40
    if (baseTx.date_iso === testCase.tx.date_iso) {
      score += 40;
    }

    // Amount similarity
    const diff = Math.abs(baseTx.amount_original - testCase.tx.amount_original);
    const avg = (Math.abs(baseTx.amount_original) + Math.abs(testCase.tx.amount_original)) / 2;
    const percentDiff = (diff / avg) * 100;

    if (percentDiff < 1) {
      score += 40;
    } else if (percentDiff < 5) {
      score += 20;
    } else if (percentDiff < 10) {
      score += 10;
    }

    // Same investment: +20
    if (baseTx.investment_slug === testCase.tx.investment_slug) {
      score += 20;
    }

    const match = score === testCase.expected_score ? '✅' : '❌';
    console.log(`   ${testCase.name}:`);
    console.log(`      Score: ${score}/100 (expected: ${testCase.expected_score}) ${match}`);
  }
  console.log('');
}

// Test with sample data
async function testSampleTransactions() {
  console.log('📊 Testing Sample Transactions:');
  console.log('');

  const samples = [
    {
      date_iso: '2024-01-15',
      amount_original: 5000.00,
      investment_slug: 'faropoint-frg-x',
    },
    {
      date_iso: '2024-01-15',
      amount_original: 5000.00,
      investment_slug: 'faropoint-frg-x', // Exact duplicate
    },
    {
      date_iso: '2024-01-15',
      amount_original: 5025.00,
      investment_slug: 'faropoint-frg-x', // Similar (0.5% diff)
    },
    {
      date_iso: '2024-01-16',
      amount_original: 5000.00,
      investment_slug: 'faropoint-frg-x', // Different date
    },
  ];

  const hashes = [];
  for (let i = 0; i < samples.length; i++) {
    const tx = samples[i];
    const hashInput = `${tx.date_iso}|${tx.amount_original}|${tx.investment_slug}`;
    const encoder = new TextEncoder();
    const data = encoder.encode(hashInput);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const hash = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');

    hashes.push(hash);

    console.log(`   Transaction #${i + 1}:`);
    console.log(`      Date: ${tx.date_iso}, Amount: ${tx.amount_original}, Investment: ${tx.investment_slug}`);
    console.log(`      Hash: ${hash.substring(0, 32)}...`);

    // Check for duplicates in previous transactions
    const dupIndex = hashes.slice(0, i).indexOf(hash);
    if (dupIndex >= 0) {
      console.log(`      🚨 DUPLICATE of Transaction #${dupIndex + 1}`);
    }
  }
  console.log('');

  console.log('Hash Comparison:');
  console.log(`   Tx #1 vs Tx #2: ${hashes[0] === hashes[1] ? '✅ IDENTICAL (exact duplicate)' : '❌ Different'}`);
  console.log(`   Tx #1 vs Tx #3: ${hashes[0] === hashes[2] ? '✅ IDENTICAL' : '❌ Different (amount differs by 0.5%)'}`);
  console.log(`   Tx #1 vs Tx #4: ${hashes[0] === hashes[3] ? '✅ IDENTICAL' : '❌ Different (date differs by 1 day)'}`);
  console.log('');
}

async function runTests() {
  await testHashGeneration();
  testSimilarityScoring();
  await testSampleTransactions();

  console.log('═══════════════════════════════════════════════════════════════');
  console.log('');
  console.log('✅ All deduplication tests complete!');
  console.log('');
  console.log('Key takeaways:');
  console.log('  - Hash generated from: date_iso|amount_original|investment_slug');
  console.log('  - Missing any field → hash = null (flagged for review)');
  console.log('  - Exact duplicates have identical hashes');
  console.log('  - Similar transactions scored by date, amount, investment');
  console.log('  - Similarity threshold: 80/100 for "needs review"');
  console.log('');
}

// Run tests
runTests().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
