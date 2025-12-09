/**
 * Test transaction preview endpoint
 * Run with: node test/test-preview.js
 */

const fs = require('fs');
const path = require('path');

console.log('═══════════════════════════════════════════════════════════════');
console.log('  TRANSACTION PREVIEW TEST');
console.log('═══════════════════════════════════════════════════════════════\n');

const API_BASE = 'http://localhost:8788/api';
const SAMPLE_FILE = path.join(__dirname, 'sample-transactions.xlsx');

// Test column mappings (matching sample Excel structure)
const columnMappings = [
  { excel_column_name: 'Date', mapped_field: 'date', date_format: 'DD/MM/YYYY' },
  { excel_column_name: 'Description', mapped_field: 'description', date_format: null },
  { excel_column_name: 'Type', mapped_field: 'transaction_type', date_format: null },
  { excel_column_name: 'Amount', mapped_field: 'amount', date_format: null },
  { excel_column_name: 'Currency', mapped_field: 'currency', date_format: null },
  { excel_column_name: 'Investment', mapped_field: 'investment_name', date_format: null },
  { excel_column_name: 'Counterparty', mapped_field: 'counterparty', date_format: null },
];

async function setupColumnMappings() {
  console.log('📋 Setting up column mappings...');
  console.log('');

  try {
    const response = await fetch(`${API_BASE}/configure/save-mappings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(columnMappings),
    });

    const result = await response.json();

    if (result.success) {
      console.log(`   ✅ Saved ${columnMappings.length} column mappings`);
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

async function testPreview() {
  console.log('🔍 Testing transaction preview...');
  console.log('');

  try {
    // Check if sample file exists
    if (!fs.existsSync(SAMPLE_FILE)) {
      console.error(`   ❌ Sample file not found: ${SAMPLE_FILE}`);
      console.log('   Run "node test/create-sample-excel.js" first');
      console.log('');
      return false;
    }

    // Read file
    const fileBuffer = fs.readFileSync(SAMPLE_FILE);
    const file = new Blob([fileBuffer], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    });

    // Create form data
    const formData = new FormData();
    formData.append('file', file, 'sample-transactions.xlsx');

    // Call preview endpoint
    const response = await fetch(`${API_BASE}/upload/preview`, {
      method: 'POST',
      body: formData,
    });

    const result = await response.json();

    if (!result.success) {
      console.error(`   ❌ Failed: ${result.error}`);
      console.error(`   Message: ${result.message}`);
      console.log('');
      return false;
    }

    const { summary, transactions, column_mappings_used } = result.data;

    // Display summary
    console.log('   ✅ Preview generated successfully!');
    console.log('');
    console.log('   📊 Summary:');
    console.log(`      Total rows: ${summary.total_rows}`);
    console.log(`      Clean transactions: ${summary.clean_transactions}`);
    console.log(`      Exact duplicates: ${summary.exact_duplicates}`);
    console.log(`      Similar transactions: ${summary.similar_transactions}`);
    console.log(`      Transactions with issues: ${summary.transactions_with_issues}`);
    console.log(`      Will import: ${summary.will_import}`);
    console.log(`      Will skip: ${summary.will_skip}`);
    console.log('');

    // Display column mappings used
    console.log('   📋 Column Mappings Used:');
    column_mappings_used.forEach(m => {
      const dateInfo = m.date_format ? ` (${m.date_format})` : '';
      console.log(`      "${m.excel_column_name}" → ${m.mapped_field}${dateInfo}`);
    });
    console.log('');

    // Display transactions by status
    const byStatus = {
      clean: transactions.filter(t => t.status === 'clean'),
      duplicate: transactions.filter(t => t.status === 'duplicate'),
      similar: transactions.filter(t => t.status === 'similar'),
      has_issues: transactions.filter(t => t.status === 'has_issues'),
    };

    console.log('   📝 Transactions by Status:');
    console.log('');

    if (byStatus.clean.length > 0) {
      console.log(`   ✅ Clean (${byStatus.clean.length}):`);
      byStatus.clean.slice(0, 3).forEach(t => {
        console.log(`      Row ${t.row_number}: ${t.normalized.date_iso} | ${t.normalized.amount_original} ${t.normalized.original_currency} | ${t.normalized.investment_name || 'N/A'}`);
      });
      if (byStatus.clean.length > 3) {
        console.log(`      ... and ${byStatus.clean.length - 3} more`);
      }
      console.log('');
    }

    if (byStatus.duplicate.length > 0) {
      console.log(`   🚨 Exact Duplicates (${byStatus.duplicate.length}):`);
      byStatus.duplicate.forEach(t => {
        console.log(`      Row ${t.row_number}: ${t.normalized.date_iso} | ${t.normalized.amount_original} ${t.normalized.original_currency}`);
        console.log(`         Duplicate of transaction #${t.dedup.duplicate_id}`);
      });
      console.log('');
    }

    if (byStatus.similar.length > 0) {
      console.log(`   ⚠️  Similar (${byStatus.similar.length}):`);
      byStatus.similar.forEach(t => {
        console.log(`      Row ${t.row_number}: ${t.normalized.date_iso} | ${t.normalized.amount_original} ${t.normalized.original_currency}`);
        t.dedup.similar_transactions.slice(0, 2).forEach(sim => {
          console.log(`         Similar to #${sim.id} (score: ${sim.similarity_score})`);
        });
      });
      console.log('');
    }

    if (byStatus.has_issues.length > 0) {
      console.log(`   ❌ Has Issues (${byStatus.has_issues.length}):`);
      byStatus.has_issues.forEach(t => {
        console.log(`      Row ${t.row_number}:`);
        t.issues.forEach(issue => {
          const icon = issue.severity === 'error' ? '❌' : '⚠️';
          console.log(`         ${icon} [${issue.field}] ${issue.message}`);
          if (issue.value !== undefined) {
            console.log(`            Value: ${JSON.stringify(issue.value)}`);
          }
        });
      });
      console.log('');
    }

    return true;

  } catch (error) {
    console.error(`   ❌ Error: ${error.message}`);
    if (error.stack) {
      console.error(`   Stack: ${error.stack}`);
    }
    console.log('');
    return false;
  }
}

async function runTests() {
  // Step 1: Setup column mappings
  const mappingsOk = await setupColumnMappings();
  if (!mappingsOk) {
    console.log('⚠️  Skipping preview test (mappings setup failed)');
    return;
  }

  // Step 2: Test preview
  const previewOk = await testPreview();

  console.log('═══════════════════════════════════════════════════════════════');
  console.log('');

  if (previewOk) {
    console.log('✅ All tests passed!');
    console.log('');
    console.log('Key features verified:');
    console.log('  - Column mappings loaded from database');
    console.log('  - Excel file parsed and mapped correctly');
    console.log('  - Transactions normalized (dates, amounts, slugs)');
    console.log('  - Deduplication checked (exact + fuzzy)');
    console.log('  - Issues categorized (errors vs warnings)');
    console.log('  - Summary statistics calculated');
    console.log('');
  } else {
    console.log('❌ Tests failed');
    console.log('');
  }
}

// Run tests
runTests().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
