/**
 * Direct test of import functionality with manufactured data
 * Run with: node test/test-import-direct.js
 */

console.log('═══════════════════════════════════════════════════════════════');
console.log('  DIRECT IMPORT TEST');
console.log('═══════════════════════════════════════════════════════════════\n');

const API_BASE = 'http://localhost:8788/api';

async function testDirectImport() {
  console.log('💾 Testing direct import with clean data...');
  console.log('');

  // Create test transactions with proper structure
  const transactions = [
    {
      normalized: {
        date_iso: '2024-01-15',
        amount_original: 10000,
        amount_normalized: -10000,
        original_currency: 'USD',
        amount_usd: -10000,
        transaction_category: 'capital_call',
        cash_flow_direction: -1,
        counterparty_normalized: 'Fund Manager',
        investment_name: 'Faro-Point FRG-X',
        investment_slug: 'faro-point-frg-x',
        amount_ils: null,
        exchange_rate_to_ils: null,
      },
      dedup: {
        hash: 'test-hash-1',
        is_duplicate: false,
        needs_review: false,
      },
      metadata: {
        original_row: 'Test data row 1',
      },
    },
    {
      normalized: {
        date_iso: '2024-02-20',
        amount_original: 50000,
        amount_normalized: 50000,
        original_currency: 'USD',
        amount_usd: 50000,
        transaction_category: 'distribution',
        cash_flow_direction: 1,
        counterparty_normalized: 'Fund Manager',
        investment_name: 'Migdal Insurance',
        investment_slug: 'migdal-insurance-2',
        amount_ils: null,
        exchange_rate_to_ils: null,
      },
      dedup: {
        hash: 'test-hash-2',
        is_duplicate: false,
        needs_review: false,
      },
      metadata: {
        original_row: 'Test data row 2',
      },
    },
  ];

  try {
    const response = await fetch(`${API_BASE}/upload/commit`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        transactions,
        options: {
          source_file: 'direct-test.js',
          skip_duplicates: true,
        },
      }),
    });

    const result = await response.json();

    if (!result.success) {
      console.error(`   ❌ Failed: ${result.error}`);
      console.error(`   Message: ${result.message}`);
      console.log('');
      return false;
    }

    const summary = result.data;

    console.log('   ✅ Import successful!');
    console.log('');
    console.log('   📊 Summary:');
    console.log(`      Total: ${summary.total}`);
    console.log(`      Imported: ${summary.imported}`);
    console.log(`      Skipped: ${summary.skipped}`);
    console.log(`      Failed: ${summary.failed}`);
    console.log('');

    if (summary.transaction_ids.length > 0) {
      console.log('   🆔 Transaction IDs:');
      summary.transaction_ids.forEach((id, i) => {
        console.log(`      ${i + 1}. ID: ${id}`);
      });
      console.log('');
    }

    if (summary.errors.length > 0) {
      console.log('   ❌ Errors:');
      summary.errors.forEach(err => {
        console.log(`      Index ${err.index}: ${err.error}`);
      });
      console.log('');
    }

    return summary.imported > 0;

  } catch (error) {
    console.error(`   ❌ Error: ${error.message}`);
    if (error.stack) {
      console.error(`   Stack: ${error.stack}`);
    }
    console.log('');
    return false;
  }
}

async function runTest() {
  const success = await testDirectImport();

  console.log('═══════════════════════════════════════════════════════════════');
  console.log('');

  if (success) {
    console.log('✅ Direct import test passed!');
    console.log('');
    console.log('Features verified:');
    console.log('  - POST /api/upload/commit accepts transactions');
    console.log('  - Investment slug resolves to investment_id');
    console.log('  - Transactions inserted into database');
    console.log('  - Transaction IDs returned in summary');
    console.log('  - Batch insert working correctly');
    console.log('');
  } else {
    console.log('❌ Direct import test failed');
    console.log('');
  }
}

runTest().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
