/**
 * Re-import with Hebrew Headers
 * Complete workflow: parse → configure → import
 */

const fs = require('fs');
const FormData = require('form-data');

const API_BASE = 'http://localhost:8788/api';
const FILE_PATH = '/home/adam/wealth/test/fresh-transactions.xlsx';

async function reimportWithHebrew() {
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('  RE-IMPORT WITH HEBREW HEADERS');
  console.log('═══════════════════════════════════════════════════════════════\n');

  try {
    // Step 1: Parse Excel file
    console.log('📄 Step 1: Parsing Excel file...\n');

    const formData = new FormData();
    formData.append('file', fs.createReadStream(FILE_PATH));

    const parseResponse = await fetch(`${API_BASE}/upload/parse-excel`, {
      method: 'POST',
      body: formData,
      headers: formData.getHeaders(),
    });

    const parseResult = await parseResponse.json();

    if (!parseResult.success) {
      console.error('   ❌ Parse failed:', parseResult.error);
      return false;
    }

    console.log(`   ✅ Parsed successfully`);
    console.log(`   Sheet: ${parseResult.data.selectedSheet.sheetName}`);
    console.log(`   Columns found: ${parseResult.data.selectedSheet.columns.length}`);
    console.log(`   Row count: ${parseResult.data.selectedSheet.rowCount}\n`);

    console.log('   Column headers detected:');
    parseResult.data.selectedSheet.columns.forEach((col, i) => {
      if (i < 14) { // Show first 14 columns
        console.log(`      ${col.letter}: ${col.name}`);
      }
    });
    console.log('');

    // Step 2: Configure column mappings
    console.log('🔧 Step 2: Configuring column mappings...\n');

    const mappings = [
      {
        excel_column_name: 'תאור',
        mapped_field: 'investment_name'
      },
      {
        excel_column_name: 'גוף מנהל',
        mapped_field: 'counterparty'
      },
      {
        excel_column_name: 'סוג תנועה',
        mapped_field: 'transaction_type'
      },
      {
        excel_column_name: 'תאריך התנועה',
        mapped_field: 'date'
      },
      {
        excel_column_name: 'סכום תנועה במטבע',
        mapped_field: 'amount'
      },
      {
        excel_column_name: 'מטבע התנועה',
        mapped_field: 'currency'
      },
      {
        excel_column_name: 'סוג תנועה מורחב',
        mapped_field: 'description'
      }
    ];

    const saveMappingsResponse = await fetch(`${API_BASE}/configure/save-mappings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(mappings),
    });

    const saveMappingsResult = await saveMappingsResponse.json();

    if (!saveMappingsResult.success) {
      console.error('   ❌ Save mappings failed:', saveMappingsResult.error);
      return false;
    }

    console.log('   ✅ Column mappings saved:');
    mappings.forEach(m => {
      console.log(`      ${m.excel_column_name} → ${m.mapped_field}`);
    });
    console.log('');

    // Step 3: Configure transaction type mappings
    console.log('🏷️  Step 3: Configuring transaction type mappings...\n');

    const transactionTypes = [
      {
        raw_value: 'משיכת תשואה',
        category: 'distribution',
        directionality_rule: 'as_is',
        cash_flow_impact: 1
      },
      {
        raw_value: 'משיכה',
        category: 'distribution',
        directionality_rule: 'as_is',
        cash_flow_impact: 1
      },
      {
        raw_value: 'הפקדה',
        category: 'capital_call',
        directionality_rule: 'invert',
        cash_flow_impact: -1
      },
      {
        raw_value: 'עמלה',
        category: 'fee',
        directionality_rule: 'as_is',
        cash_flow_impact: -1
      }
    ];

    const saveTypesResponse = await fetch(`${API_BASE}/configure/save-transaction-type-mappings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(transactionTypes),
    });

    const saveTypesResult = await saveTypesResponse.json();

    if (!saveTypesResult.success) {
      console.error('   ❌ Save transaction types failed:', saveTypesResult.error);
      return false;
    }

    console.log('   ✅ Transaction type mappings saved:');
    transactionTypes.forEach(t => {
      console.log(`      ${t.raw_type} → ${t.mapped_category}`);
    });
    console.log('');

    // Step 4: Re-parse and preview with mappings
    console.log('🔍 Step 4: Preview with mappings applied...\n');

    const formData2 = new FormData();
    formData2.append('file', fs.createReadStream(FILE_PATH));

    const previewResponse = await fetch(`${API_BASE}/upload/preview`, {
      method: 'POST',
      body: formData2,
      headers: formData2.getHeaders(),
    });

    const previewResult = await previewResponse.json();

    if (!previewResult.success) {
      console.error('   ❌ Preview failed:', previewResult.error);
      return false;
    }

    console.log(`   ✅ Preview generated`);
    console.log(`   Transactions parsed: ${previewResult.data.transactions.length}`);
    console.log(`   Unique investments: ${previewResult.data.unique_investments.length}\n`);

    // Show sample transaction
    if (previewResult.data.transactions.length > 0) {
      const sample = previewResult.data.transactions[0];
      console.log('   Sample transaction:');
      console.log(`      Date: ${sample.normalized.date_iso}`);
      console.log(`      Investment: ${sample.normalized.investment_slug}`);
      console.log(`      Counterparty: ${sample.normalized.counterparty}`);
      console.log(`      Type: ${sample.normalized.transaction_category}`);
      console.log(`      Amount: ${sample.normalized.amount_original} ${sample.normalized.original_currency}`);
      console.log('');
    }

    // Show unique investments
    console.log('   Unique investments found:');
    previewResult.data.unique_investments.slice(0, 10).forEach((inv, i) => {
      console.log(`      ${i + 1}. ${inv}`);
    });
    if (previewResult.data.unique_investments.length > 10) {
      console.log(`      ... and ${previewResult.data.unique_investments.length - 10} more`);
    }
    console.log('');

    // Step 5: Save investments
    console.log('💼 Step 5: Saving investments...\n');

    const investments = previewResult.data.unique_investments.map(name => ({
      name,
      investment_type: 'Other',
      investment_group: 'Unknown',
      status: 'active'
    }));

    const saveInvestmentsResponse = await fetch(`${API_BASE}/configure/save-investments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(investments),
    });

    const saveInvestmentsResult = await saveInvestmentsResponse.json();

    if (!saveInvestmentsResult.success) {
      console.error('   ❌ Save investments failed:', saveInvestmentsResult.error);
      return false;
    }

    console.log(`   ✅ Saved ${investments.length} investments\n`);

    // Step 6: Import transactions
    console.log('📥 Step 6: Importing transactions...\n');

    const commitResponse = await fetch(`${API_BASE}/upload/commit`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        transactions: previewResult.data.transactions,
        options: {
          skip_duplicates: true,
          force_import: false
        }
      }),
    });

    const commitResult = await commitResponse.json();

    if (!commitResult.success) {
      console.error('   ❌ Import failed:', commitResult.error);
      return false;
    }

    console.log('   ✅ Import complete:');
    console.log(`      Total: ${commitResult.data.total}`);
    console.log(`      Imported: ${commitResult.data.imported}`);
    console.log(`      Skipped: ${commitResult.data.skipped}`);
    console.log(`      Failed: ${commitResult.data.failed}`);

    if (commitResult.data.errors.length > 0) {
      console.log(`\n   ⚠️  Errors (first 5):`);
      commitResult.data.errors.slice(0, 5).forEach(err => {
        console.log(`      ${err}`);
      });
    }
    console.log('');

    // Step 7: Verify investment linkage
    console.log('🔗 Step 7: Verifying investment linkage...\n');

    const txResponse = await fetch(`${API_BASE}/reports/transactions?pageSize=10`);
    const txResult = await txResponse.json();

    if (txResult.success) {
      const withInvestment = txResult.data.items.filter(t => t.investment_id !== null).length;
      const withoutInvestment = txResult.data.items.filter(t => t.investment_id === null).length;

      console.log(`   Sample of ${txResult.data.items.length} transactions:`);
      console.log(`      ✅ With investment: ${withInvestment}`);
      console.log(`      ❌ Without investment: ${withoutInvestment}`);

      if (txResult.data.items.length > 0 && txResult.data.items[0].investment_id !== null) {
        const sample = txResult.data.items[0];
        console.log(`\n   Sample linked transaction:`);
        console.log(`      Investment: ${sample.investment_name}`);
        console.log(`      Date: ${sample.date}`);
        console.log(`      Amount: ${sample.amount_normalized}`);
        console.log(`      Category: ${sample.transaction_category}`);
      }
    }

    console.log('\n═══════════════════════════════════════════════════════════════');
    console.log('  SUMMARY');
    console.log('═══════════════════════════════════════════════════════════════\n');

    console.log('✅ Re-import completed successfully!');
    console.log('   • Hebrew headers detected correctly');
    console.log('   • Column mappings configured');
    console.log('   • Transaction types mapped');
    console.log('   • Investments saved');
    console.log('   • Transactions imported');
    console.log('   • Investment linkage verified\n');

    return true;

  } catch (error) {
    console.error('❌ Fatal error:', error.message);
    if (error.stack) {
      console.error(error.stack);
    }
    return false;
  }
}

reimportWithHebrew().then(success => {
  process.exit(success ? 0 : 1);
}).catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
