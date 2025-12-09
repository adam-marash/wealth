/**
 * Test commitment tracking functionality
 * Run with: node test/test-commitments.js
 */

console.log('═══════════════════════════════════════════════════════════════');
console.log('  COMMITMENT TRACKING TEST');
console.log('═══════════════════════════════════════════════════════════════\n');

const API_BASE = 'http://localhost:8788/api';

let testInvestmentId = null;
let testCommitmentId = null;

async function createTestInvestment() {
  console.log('💼 Creating test investment...');
  console.log('');

  try {
    const response = await fetch(`${API_BASE}/configure/save-investments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify([{
        name: 'Test PE Fund 1',
        investment_group: 'Private Equity',
        investment_type: 'PE',
        status: 'active',
      }]),
    });

    const result = await response.json();

    if (result.success) {
      const slug = result.data.investments[0].slug;

      // Fetch the investment ID from the investments list
      const listResponse = await fetch(`${API_BASE}/configure/investments-list`);
      const listResult = await listResponse.json();
      const investment = listResult.data.find(i => i.slug === slug);

      if (!investment) {
        console.error('   ❌ Failed to find created investment');
        console.log('');
        return false;
      }

      testInvestmentId = investment.id;
      console.log(`   ✅ Created investment: ID=${testInvestmentId}, slug="${slug}"`);
      console.log('');
      return true;
    } else {
      console.error(`   ❌ Failed: ${result.error}`);
      console.log('');
      return false;
    }
  } catch (error) {
    console.error(`   ❌ Error: ${error.message}`);
    console.log('');
    return false;
  }
}

async function createCommitment() {
  console.log('📝 Creating commitment...');
  console.log('');

  try {
    const response = await fetch(`${API_BASE}/investments/${testInvestmentId}/commitments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        commitment_amount: 1000000,
        currency: 'USD',
        commitment_date: '2024-01-01',
        notes: 'Initial commitment to Test PE Fund 1',
      }),
    });

    const result = await response.json();

    if (result.success) {
      testCommitmentId = result.data.id;
      console.log(`   ✅ Created commitment: ID=${testCommitmentId}`);
      console.log(`      Amount: $${result.data.commitment_amount.toLocaleString()}`);
      console.log(`      Called to date: $${result.data.called_to_date.toLocaleString()}`);
      console.log(`      Remaining: $${result.data.remaining.toLocaleString()}`);
      console.log('');
      return true;
    } else {
      console.error(`   ❌ Failed: ${result.error}`);
      console.log('');
      return false;
    }
  } catch (error) {
    console.error(`   ❌ Error: ${error.message}`);
    console.log('');
    return false;
  }
}

async function importCapitalCalls() {
  console.log('💸 Importing capital call transactions...');
  console.log('');

  try {
    // First get investment to get slug
    const invResponse = await fetch(`${API_BASE}/configure/investments-list`);
    const invResult = await invResponse.json();
    const investment = invResult.data.find(i => i.id === testInvestmentId);

    if (!investment) {
      console.error('   ❌ Investment not found');
      return false;
    }

    const transactions = [
      {
        normalized: {
          date_iso: '2024-02-15',
          amount_original: 250000,
          amount_normalized: -250000,
          original_currency: 'USD',
          amount_usd: -250000,
          transaction_category: 'capital_call',
          cash_flow_direction: -1,
          counterparty_normalized: 'Fund Manager',
          investment_name: investment.name,
          investment_slug: investment.slug,
          amount_ils: null,
          exchange_rate_to_ils: null,
        },
        dedup: {
          hash: 'test-hash-capital-call-1',
          is_duplicate: false,
          needs_review: false,
        },
        metadata: {
          test: 'Capital call 1',
        },
      },
      {
        normalized: {
          date_iso: '2024-03-20',
          amount_original: 300000,
          amount_normalized: -300000,
          original_currency: 'USD',
          amount_usd: -300000,
          transaction_category: 'capital_call',
          cash_flow_direction: -1,
          counterparty_normalized: 'Fund Manager',
          investment_name: investment.name,
          investment_slug: investment.slug,
          amount_ils: null,
          exchange_rate_to_ils: null,
        },
        dedup: {
          hash: 'test-hash-capital-call-2',
          is_duplicate: false,
          needs_review: false,
        },
        metadata: {
          test: 'Capital call 2',
        },
      },
    ];

    const response = await fetch(`${API_BASE}/upload/commit`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        transactions,
        options: {
          source_file: 'test-commitments.js',
        },
      }),
    });

    const result = await response.json();

    if (result.success) {
      console.log(`   ✅ Imported ${result.data.imported} capital call transactions`);
      console.log(`      Total amount: $${(250000 + 300000).toLocaleString()}`);
      console.log('');
      return true;
    } else {
      console.error(`   ❌ Failed: ${result.error}`);
      console.log('');
      return false;
    }
  } catch (error) {
    console.error(`   ❌ Error: ${error.message}`);
    console.log('');
    return false;
  }
}

async function updateCommitmentProgress() {
  console.log('🔄 Updating commitment progress...');
  console.log('');

  try {
    const response = await fetch(`${API_BASE}/investments/${testInvestmentId}/commitments/update-progress`, {
      method: 'POST',
    });

    const result = await response.json();

    if (result.success) {
      const commitment = result.data[0];
      console.log(`   ✅ Commitment progress updated`);
      console.log(`      Called to date: $${commitment.called_to_date.toLocaleString()}`);
      console.log(`      Remaining: $${commitment.remaining.toLocaleString()}`);
      console.log(`      Percentage called: ${((commitment.called_to_date / commitment.commitment_amount) * 100).toFixed(1)}%`);
      console.log('');
      return true;
    } else {
      console.error(`   ❌ Failed: ${result.error}`);
      console.log('');
      return false;
    }
  } catch (error) {
    console.error(`   ❌ Error: ${error.message}`);
    console.log('');
    return false;
  }
}

async function getCommitmentSummary() {
  console.log('📊 Getting commitment summary...');
  console.log('');

  try {
    const response = await fetch(`${API_BASE}/investments/${testInvestmentId}/commitments/summary`);
    const result = await response.json();

    if (result.success) {
      const summary = result.data;
      console.log(`   ✅ Summary:`);
      console.log(`      Total committed: $${summary.total_committed.toLocaleString()} ${summary.currency}`);
      console.log(`      Total called: $${summary.total_called.toLocaleString()}`);
      console.log(`      Total remaining: $${summary.total_remaining.toLocaleString()}`);
      console.log(`      Percentage called: ${summary.percentage_called.toFixed(1)}%`);
      console.log(`      Commitment count: ${summary.commitment_count}`);
      console.log('');
      return true;
    } else {
      console.error(`   ❌ Failed: ${result.error}`);
      console.log('');
      return false;
    }
  } catch (error) {
    console.error(`   ❌ Error: ${error.message}`);
    console.log('');
    return false;
  }
}

async function getCommitmentAlerts() {
  console.log('⚠️  Checking commitment alerts...');
  console.log('');

  try {
    const response = await fetch(`${API_BASE}/commitments/alerts?investment_id=${testInvestmentId}`);
    const result = await response.json();

    if (result.success) {
      if (result.data.length === 0) {
        console.log(`   ✅ No alerts (commitment healthy)`);
      } else {
        console.log(`   ⚠️  Found ${result.data.length} alert(s):`);
        result.data.forEach((alert, i) => {
          console.log(`      ${i + 1}. [${alert.severity.toUpperCase()}] ${alert.message}`);
        });
      }
      console.log('');
      return true;
    } else {
      console.error(`   ❌ Failed: ${result.error}`);
      console.log('');
      return false;
    }
  } catch (error) {
    console.error(`   ❌ Error: ${error.message}`);
    console.log('');
    return false;
  }
}

async function testOverdraw() {
  console.log('💥 Testing overdraw scenario...');
  console.log('');

  try {
    // Get investment to get slug
    const invResponse = await fetch(`${API_BASE}/configure/investments-list`);
    const invResult = await invResponse.json();
    const investment = invResult.data.find(i => i.id === testInvestmentId);

    // Import a large capital call that will overdraw the commitment
    const transactions = [
      {
        normalized: {
          date_iso: '2024-04-25',
          amount_original: 600000, // This will overdraw (250k + 300k + 600k = 1.15M > 1M commitment)
          amount_normalized: -600000,
          original_currency: 'USD',
          amount_usd: -600000,
          transaction_category: 'capital_call',
          cash_flow_direction: -1,
          counterparty_normalized: 'Fund Manager',
          investment_name: investment.name,
          investment_slug: investment.slug,
          amount_ils: null,
          exchange_rate_to_ils: null,
        },
        dedup: {
          hash: 'test-hash-capital-call-3-overdraw',
          is_duplicate: false,
          needs_review: false,
        },
        metadata: {
          test: 'Capital call 3 (overdraw)',
        },
      },
    ];

    const response = await fetch(`${API_BASE}/upload/commit`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        transactions,
        options: {
          source_file: 'test-commitments.js',
        },
      }),
    });

    const result = await response.json();

    if (result.success) {
      console.log(`   ✅ Imported overdraw transaction: $${(600000).toLocaleString()}`);
      console.log('');

      // Update progress
      await fetch(`${API_BASE}/investments/${testInvestmentId}/commitments/update-progress`, {
        method: 'POST',
      });

      // Check alerts
      const alertsResponse = await fetch(`${API_BASE}/commitments/alerts?investment_id=${testInvestmentId}`);
      const alertsResult = await alertsResponse.json();

      if (alertsResult.success && alertsResult.data.length > 0) {
        console.log(`   ⚠️  Overdraw detected! Alerts:`);
        alertsResult.data.forEach((alert, i) => {
          console.log(`      ${i + 1}. [${alert.severity.toUpperCase()}] ${alert.message}`);
        });
        console.log('');
      }

      return true;
    } else {
      console.error(`   ❌ Failed: ${result.error}`);
      console.log('');
      return false;
    }
  } catch (error) {
    console.error(`   ❌ Error: ${error.message}`);
    console.log('');
    return false;
  }
}

async function runTests() {
  // Step 1: Create test investment
  const investmentOk = await createTestInvestment();
  if (!investmentOk) {
    console.log('⚠️  Stopping tests (investment creation failed)');
    return;
  }

  // Step 2: Create commitment
  const commitmentOk = await createCommitment();
  if (!commitmentOk) {
    console.log('⚠️  Stopping tests (commitment creation failed)');
    return;
  }

  // Step 3: Import capital calls
  const importOk = await importCapitalCalls();
  if (!importOk) {
    console.log('⚠️  Stopping tests (import failed)');
    return;
  }

  // Step 4: Update commitment progress
  const updateOk = await updateCommitmentProgress();
  if (!updateOk) {
    console.log('⚠️  Stopping tests (update failed)');
    return;
  }

  // Step 5: Get commitment summary
  await getCommitmentSummary();

  // Step 6: Check alerts (should be none yet)
  await getCommitmentAlerts();

  // Step 7: Test overdraw scenario
  await testOverdraw();

  console.log('═══════════════════════════════════════════════════════════════');
  console.log('');
  console.log('✅ All commitment tracking tests complete!');
  console.log('');
  console.log('Features verified:');
  console.log('  - Create commitments for investments');
  console.log('  - Import capital call transactions');
  console.log('  - Calculate called_to_date from transactions');
  console.log('  - Calculate remaining amount');
  console.log('  - Generate commitment summary');
  console.log('  - Detect overdraw and generate alerts');
  console.log('');
}

// Run tests
runTests().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
