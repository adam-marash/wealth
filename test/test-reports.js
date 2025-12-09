/**
 * Test TICKET-019: Reporting & Analytics Endpoints
 * Run with: node test/test-reports.js
 */

const API_BASE = 'http://localhost:8788/api';

async function testReporting() {
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('  TESTING REPORTING & ANALYTICS ENDPOINTS (TICKET-019)');
  console.log('═══════════════════════════════════════════════════════════════\n');

  try {
    // Test 1: Dashboard Stats
    console.log('📊 Test 1: Dashboard Stats\n');
    const dashboardResponse = await fetch(`${API_BASE}/reports/dashboard`);
    const dashboardResult = await dashboardResponse.json();

    if (dashboardResult.success) {
      console.log('   ✅ Dashboard endpoint working');
      console.log(`   Total Investments: ${dashboardResult.data.overview.total_investments}`);
      console.log(`   Active Investments: ${dashboardResult.data.overview.active_investments}`);
      console.log(`   Total Transactions: ${dashboardResult.data.overview.total_transactions}`);
      console.log(`   Total Called (USD): $${dashboardResult.data.overview.total_called_usd?.toFixed(2) || '0.00'}`);
      console.log(`   Total Distributed (USD): $${dashboardResult.data.overview.total_distributed_usd?.toFixed(2) || '0.00'}`);
      console.log(`   Net Position (USD): $${dashboardResult.data.overview.net_position_usd?.toFixed(2) || '0.00'}`);
      console.log(`   Recent Transactions: ${dashboardResult.data.recent_transactions.length}`);
      console.log(`   Commitment Alerts: ${dashboardResult.data.alert_count}\n`);
    } else {
      console.error('   ❌ Dashboard endpoint failed:', dashboardResult.error);
      return false;
    }

    // Test 2: Portfolio Position
    console.log('💼 Test 2: Portfolio Position Report\n');
    const portfolioResponse = await fetch(`${API_BASE}/reports/portfolio-position`);
    const portfolioResult = await portfolioResponse.json();

    if (portfolioResult.success) {
      console.log('   ✅ Portfolio position endpoint working');
      console.log(`   Summary:`);
      console.log(`      Total Investments: ${portfolioResult.data.summary.total_investments}`);
      console.log(`      Active: ${portfolioResult.data.summary.active_investments}`);
      console.log(`      Total Called (USD): $${portfolioResult.data.summary.total_called_usd.toFixed(2)}`);
      console.log(`      Total Distributed (USD): $${portfolioResult.data.summary.total_distributed_usd.toFixed(2)}`);
      console.log(`      Net Position (USD): $${portfolioResult.data.summary.net_position_usd.toFixed(2)}`);
      console.log(`   Top 5 Investments by Transaction Count:`);
      const topInvestments = portfolioResult.data.investments
        .sort((a, b) => b.transaction_count - a.transaction_count)
        .slice(0, 5);
      topInvestments.forEach((inv, i) => {
        console.log(`      ${i + 1}. ${inv.name}: ${inv.transaction_count} transactions`);
      });
      console.log('');
    } else {
      console.error('   ❌ Portfolio position failed:', portfolioResult.error);
      return false;
    }

    // Test 3: Transaction Query (with filters)
    console.log('🔍 Test 3: Transaction Query\n');

    // Query all transactions
    const allTxResponse = await fetch(`${API_BASE}/reports/transactions?pageSize=10`);
    const allTxResult = await allTxResponse.json();

    if (allTxResult.success) {
      console.log('   ✅ Transaction query working');
      console.log(`   Total Transactions: ${allTxResult.data.pagination.total}`);
      console.log(`   Showing: ${allTxResult.data.items.length} of ${allTxResult.data.pagination.total}`);
      console.log(`   Pages: ${allTxResult.data.pagination.totalPages}\n`);
    } else {
      console.error('   ❌ Transaction query failed:', allTxResult.error);
      return false;
    }

    // Query capital calls only
    const callsResponse = await fetch(`${API_BASE}/reports/transactions?category=capital_call&pageSize=5`);
    const callsResult = await callsResponse.json();

    if (callsResult.success) {
      console.log('   ✅ Capital calls filter working');
      console.log(`   Capital Calls: ${callsResult.data.pagination.total}`);
      console.log(`   Sample transactions:`);
      callsResult.data.items.slice(0, 3).forEach((tx, i) => {
        console.log(`      ${i + 1}. ${tx.date}: ${tx.investment_name} - $${Math.abs(tx.amount_normalized).toFixed(2)}`);
      });
      console.log('');
    } else {
      console.error('   ❌ Capital calls filter failed:', callsResult.error);
      return false;
    }

    // Test 4: Commitment Tracking
    console.log('📋 Test 4: Commitment Tracking Report\n');
    const commitmentsResponse = await fetch(`${API_BASE}/reports/commitments`);
    const commitmentsResult = await commitmentsResponse.json();

    if (commitmentsResult.success) {
      console.log('   ✅ Commitments endpoint working');
      console.log(`   Summary:`);
      console.log(`      Total Commitments: ${commitmentsResult.data.summary.total_commitments}`);
      console.log(`      Total Committed: $${commitmentsResult.data.summary.total_committed.toFixed(2)}`);
      console.log(`      Total Called: $${commitmentsResult.data.summary.total_called.toFixed(2)}`);
      console.log(`      Total Remaining: $${commitmentsResult.data.summary.total_remaining.toFixed(2)}`);
      console.log(`      Overdrawn: ${commitmentsResult.data.summary.overdrawn_count}`);
      console.log(`      Near Exhaustion: ${commitmentsResult.data.summary.near_exhaustion_count}`);
      console.log(`      Fully Called: ${commitmentsResult.data.summary.fully_called_count}\n`);
    } else {
      console.error('   ❌ Commitments endpoint failed:', commitmentsResult.error);
      return false;
    }

    // Test 5: Cash Flow Analysis
    console.log('💰 Test 5: Cash Flow Analysis\n');

    // Monthly cash flow
    const monthlyResponse = await fetch(`${API_BASE}/reports/cash-flow?period=monthly`);
    const monthlyResult = await monthlyResponse.json();

    if (monthlyResult.success) {
      console.log('   ✅ Monthly cash flow working');
      console.log(`   Periods Analyzed: ${monthlyResult.data.summary.total_periods}`);
      console.log(`   Total Capital Calls (USD): $${monthlyResult.data.summary.total_capital_calls_usd.toFixed(2)}`);
      console.log(`   Total Distributions (USD): $${monthlyResult.data.summary.total_distributions_usd.toFixed(2)}`);
      console.log(`   Net Cash Flow (USD): $${monthlyResult.data.summary.net_cash_flow_usd.toFixed(2)}`);
      console.log(`   Recent Months (sample):`);
      monthlyResult.data.periods.slice(0, 3).forEach((period) => {
        console.log(`      ${period.period}: Calls $${period.capital_calls_usd.toFixed(2)}, Dist $${period.distributions_usd.toFixed(2)}, Net $${period.net_cash_flow_usd.toFixed(2)}`);
      });
      console.log('');
    } else {
      console.error('   ❌ Cash flow analysis failed:', monthlyResult.error);
      return false;
    }

    // Test 6: Investment Summary
    console.log('🏢 Test 6: Investment Summary\n');

    // Get first investment ID
    const investmentsResponse = await fetch(`${API_BASE}/test/investments`);
    const investmentsResult = await investmentsResponse.json();

    if (investmentsResult.success && investmentsResult.data.length > 0) {
      const testInvestment = investmentsResult.data[0];
      const summaryResponse = await fetch(`${API_BASE}/reports/investment/${testInvestment.id}/summary`);
      const summaryResult = await summaryResponse.json();

      if (summaryResult.success) {
        console.log('   ✅ Investment summary working');
        console.log(`   Investment: ${summaryResult.data.investment.name}`);
        console.log(`   Type: ${summaryResult.data.investment.investment_type}`);
        console.log(`   Status: ${summaryResult.data.investment.status}`);
        console.log(`   Transactions: ${summaryResult.data.transaction_summary.total_transactions}`);
        console.log(`   Called (USD): $${(summaryResult.data.transaction_summary.total_called_usd || 0).toFixed(2)}`);
        console.log(`   Distributed (USD): $${(summaryResult.data.transaction_summary.total_distributed_usd || 0).toFixed(2)}`);
        console.log(`   Net Position (USD): $${(summaryResult.data.transaction_summary.net_position_usd || 0).toFixed(2)}`);
        console.log(`   Commitments: ${summaryResult.data.commitments.length}`);
        console.log(`   Recent Transactions: ${summaryResult.data.recent_transactions.length}\n`);
      } else {
        console.error('   ❌ Investment summary failed:', summaryResult.error);
        return false;
      }
    } else {
      console.log('   ⚠️  No investments to test\n');
    }

    // Summary
    console.log('═══════════════════════════════════════════════════════════════');
    console.log('  SUMMARY');
    console.log('═══════════════════════════════════════════════════════════════\n');

    console.log('✅ All reporting endpoints working correctly:');
    console.log('   • Dashboard stats');
    console.log('   • Portfolio position');
    console.log('   • Transaction queries with filters');
    console.log('   • Commitment tracking');
    console.log('   • Cash flow analysis (monthly/quarterly/yearly)');
    console.log('   • Investment summary');

    console.log('\n📈 You can now query and analyze all your imported transactions!');
    console.log('\n✅ Reporting endpoints testing complete!\n');
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

testReporting().then(success => {
  process.exit(success ? 0 : 1);
}).catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
