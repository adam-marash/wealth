/**
 * Test TICKET-014: Investment Phase Detection
 * Run with: node test/test-phase-detection.js
 */

const API_BASE = 'http://localhost:8788/api';

async function testPhaseDetection() {
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('  TESTING INVESTMENT PHASE DETECTION (TICKET-014)');
  console.log('═══════════════════════════════════════════════════════════════\n');

  try {
    // Step 1: Get all investments
    console.log('📊 Step 1: Fetching all investments...\n');

    const investmentsResponse = await fetch(`${API_BASE}/test/investments`);
    const investmentsResult = await investmentsResponse.json();

    if (!investmentsResult.success) {
      console.error('   ❌ Failed to fetch investments:', investmentsResult.error);
      return false;
    }

    const investments = investmentsResult.data;
    console.log(`   ✅ Found ${investments.length} investments\n`);

    // Step 2: Test GET /api/investments/:id/phase for each investment
    console.log('🔍 Step 2: Testing GET /phase endpoint for each investment...\n');

    const phaseResults = [];

    for (const investment of investments) {
      console.log(`   Testing: ${investment.name} (ID: ${investment.id})`);

      const phaseResponse = await fetch(`${API_BASE}/investments/${investment.id}/phase`);
      const phaseResult = await phaseResponse.json();

      if (phaseResult.success) {
        const data = phaseResult.data;
        console.log(`      ✅ Phase: ${data.phase}`);
        console.log(`      📈 Capital Calls: $${data.capital_calls_total.toFixed(2)} (${data.capital_calls_count} transactions)`);
        console.log(`      📉 Distributions: $${data.distributions_total.toFixed(2)} (${data.distributions_count} transactions)`);
        console.log(`      🔢 Ratio: ${data.ratio === 999 ? 'Infinity' : data.ratio.toFixed(2)}`);
        console.log(`      📅 Analysis Period: ${data.analysis_start_date} to ${data.analysis_end_date}`);
        console.log(`      🎯 Confidence: ${data.confidence}`);

        phaseResults.push({
          investment,
          phase: data.phase,
          confidence: data.confidence,
        });
      } else {
        console.log(`      ℹ️  No phase data: ${phaseResult.error}`);
      }

      console.log('');
    }

    // Step 3: Test POST /api/investments/:id/detect-phase (manual update)
    console.log('🔄 Step 3: Testing POST /detect-phase endpoint (manual update)...\n');

    if (investments.length > 0) {
      const testInvestment = investments[0];
      console.log(`   Testing manual phase update for: ${testInvestment.name} (ID: ${testInvestment.id})\n`);

      const updateResponse = await fetch(`${API_BASE}/investments/${testInvestment.id}/detect-phase`, {
        method: 'POST',
      });

      const updateResult = await updateResponse.json();

      if (updateResult.success) {
        console.log(`   ✅ ${updateResult.message}`);
        console.log(`   Phase: ${updateResult.data.phase}`);
        console.log(`   Confidence: ${updateResult.data.confidence}\n`);
      } else {
        console.log(`   ❌ Failed: ${updateResult.error}\n`);
      }
    }

    // Step 4: Verify phases are stored in commitments table
    console.log('💾 Step 4: Verifying phases stored in commitments...\n');

    for (const result of phaseResults) {
      const commitmentsResponse = await fetch(`${API_BASE}/investments/${result.investment.id}/commitments`);
      const commitmentsResult = await commitmentsResponse.json();

      if (commitmentsResult.success && commitmentsResult.data.length > 0) {
        const commitment = commitmentsResult.data[0];
        console.log(`   ${result.investment.name}:`);
        console.log(`      Phase in DB: ${commitment.phase || 'null'}`);
        console.log(`      Expected: ${result.phase}`);
        console.log(`      Manual Override: ${commitment.manual_phase ? 'Yes' : 'No'}`);
        console.log('');
      } else {
        console.log(`   ${result.investment.name}: No commitments found\n`);
      }
    }

    // Summary
    console.log('═══════════════════════════════════════════════════════════════');
    console.log('  SUMMARY');
    console.log('═══════════════════════════════════════════════════════════════\n');

    const phaseBreakdown = phaseResults.reduce((acc, r) => {
      acc[r.phase] = (acc[r.phase] || 0) + 1;
      return acc;
    }, {});

    console.log('Phase Distribution:');
    Object.entries(phaseBreakdown).forEach(([phase, count]) => {
      const emoji = phase === 'building_up' ? '📈' : phase === 'drawing_down' ? '📉' : '➡️';
      console.log(`   ${emoji} ${phase}: ${count} investment(s)`);
    });

    console.log('\n✅ Phase detection testing complete!\n');
    console.log('═══════════════════════════════════════════════════════════════\n');

    return true;

  } catch (error) {
    console.error('❌ Fatal error:', error.message);
    if (error.stack) {
      console.error(error.stack);
    }
    return false;
  }
}

testPhaseDetection().then(success => {
  process.exit(success ? 0 : 1);
}).catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
