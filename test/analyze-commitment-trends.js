/**
 * Analyze commitment trends for all investments
 * Run with: node test/analyze-commitment-trends.js
 */

const API_BASE = 'http://localhost:8788/api';

async function analyzeCommitmentTrends() {
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('  COMMITMENT TREND ANALYSIS');
  console.log('═══════════════════════════════════════════════════════════════\n');

  try {
    // Get all investments
    const invResponse = await fetch(`${API_BASE}/configure/investments-list`);
    const invResult = await invResponse.json();
    const investments = invResult.data;

    console.log(`Found ${investments.length} investments\n`);

    // Get all transactions
    const txResponse = await fetch(`${API_BASE}/test/transactions`);
    const txResult = await txResponse.json();
    const transactions = txResult.data || [];

    console.log(`Found ${transactions.length} transactions\n`);

    // Analyze each investment
    const results = [];

    for (const investment of investments) {
      // Get transactions for this investment
      const invTransactions = transactions.filter(tx => tx.investment_id === investment.id);

      if (invTransactions.length === 0) {
        continue; // Skip investments with no transactions
      }

      // Separate by category
      const capitalCalls = invTransactions.filter(tx => tx.transaction_category === 'capital_call');
      const distributions = invTransactions.filter(tx => tx.transaction_category === 'distribution');

      // Calculate totals
      const totalCapitalCalls = capitalCalls.reduce((sum, tx) => sum + Math.abs(tx.amount_normalized), 0);
      const totalDistributions = distributions.reduce((sum, tx) => sum + Math.abs(tx.amount_normalized), 0);
      const netCashFlow = totalDistributions - totalCapitalCalls;

      // Sort transactions by date to analyze trend
      const sortedTx = invTransactions.sort((a, b) => new Date(a.date) - new Date(b.date));

      // Calculate 6-month rolling average to detect trend
      const recentMonths = 6;
      const recentDate = new Date();
      recentDate.setMonth(recentDate.getMonth() - recentMonths);

      const recentTx = sortedTx.filter(tx => new Date(tx.date) >= recentDate);
      const recentCapitalCalls = recentTx.filter(tx => tx.transaction_category === 'capital_call');
      const recentDistributions = recentTx.filter(tx => tx.transaction_category === 'distribution');

      // Determine phase
      let phase = 'unknown';
      let phaseReason = '';

      if (recentCapitalCalls.length > 0 && recentDistributions.length === 0) {
        phase = 'building_up';
        phaseReason = 'Recent capital calls, no distributions';
      } else if (recentCapitalCalls.length === 0 && recentDistributions.length > 0) {
        phase = 'drawing_down';
        phaseReason = 'Recent distributions, no capital calls';
      } else if (recentCapitalCalls.length > 0 && recentDistributions.length > 0) {
        const recentCallsTotal = recentCapitalCalls.reduce((sum, tx) => sum + Math.abs(tx.amount_normalized), 0);
        const recentDistTotal = recentDistributions.reduce((sum, tx) => sum + Math.abs(tx.amount_normalized), 0);

        if (recentCallsTotal > recentDistTotal * 1.5) {
          phase = 'building_up';
          phaseReason = `More capital calls than distributions (${recentCapitalCalls.length} calls vs ${recentDistributions.length} dists)`;
        } else if (recentDistTotal > recentCallsTotal * 1.5) {
          phase = 'drawing_down';
          phaseReason = `More distributions than capital calls (${recentDistributions.length} dists vs ${recentCapitalCalls.length} calls)`;
        } else {
          phase = 'stable';
          phaseReason = `Balanced activity (${recentCapitalCalls.length} calls, ${recentDistributions.length} dists)`;
        }
      } else {
        phase = 'stable';
        phaseReason = 'No recent activity';
      }

      results.push({
        investment,
        capitalCalls: capitalCalls.length,
        distributions: distributions.length,
        totalCapitalCalls,
        totalDistributions,
        netCashFlow,
        phase,
        phaseReason,
        firstDate: sortedTx[0]?.date,
        lastDate: sortedTx[sortedTx.length - 1]?.date,
      });
    }

    // Sort by total capital calls (descending)
    results.sort((a, b) => b.totalCapitalCalls - a.totalCapitalCalls);

    // Display results
    console.log('═══════════════════════════════════════════════════════════════');
    console.log('  INVESTMENT TRENDS');
    console.log('═══════════════════════════════════════════════════════════════\n');

    for (const result of results) {
      const phaseEmoji = {
        building_up: '📈',
        stable: '➡️',
        drawing_down: '📉',
        unknown: '❓',
      }[result.phase];

      console.log(`${phaseEmoji} ${result.investment.name}`);
      console.log(`   Type: ${result.investment.investment_type} | Group: ${result.investment.investment_group}`);
      console.log(`   Phase: ${result.phase.toUpperCase()} - ${result.phaseReason}`);
      console.log(`   Period: ${result.firstDate} to ${result.lastDate}`);
      console.log(`   Capital Calls: ${result.capitalCalls} transactions, $${result.totalCapitalCalls.toLocaleString()}`);
      console.log(`   Distributions: ${result.distributions} transactions, $${result.totalDistributions.toLocaleString()}`);
      console.log(`   Net Cash Flow: $${result.netCashFlow.toLocaleString()}`);
      console.log('');
    }

    // Summary by phase
    console.log('═══════════════════════════════════════════════════════════════');
    console.log('  SUMMARY BY PHASE');
    console.log('═══════════════════════════════════════════════════════════════\n');

    const phaseCounts = {
      building_up: results.filter(r => r.phase === 'building_up').length,
      stable: results.filter(r => r.phase === 'stable').length,
      drawing_down: results.filter(r => r.phase === 'drawing_down').length,
      unknown: results.filter(r => r.phase === 'unknown').length,
    };

    console.log(`📈 Building Up: ${phaseCounts.building_up} investments`);
    console.log(`➡️  Stable: ${phaseCounts.stable} investments`);
    console.log(`📉 Drawing Down: ${phaseCounts.drawing_down} investments`);
    console.log(`❓ Unknown: ${phaseCounts.unknown} investments`);
    console.log('');

  } catch (error) {
    console.error('Error:', error.message);
    if (error.stack) {
      console.error(error.stack);
    }
  }
}

analyzeCommitmentTrends().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
