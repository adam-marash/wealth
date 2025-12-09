/**
 * Import real-movements.xlsx through the full workflow
 * Run with: node test/import-real-movements.js
 */

const fs = require('fs');
const path = require('path');

const API_BASE = 'http://localhost:8788/api';

async function importRealMovements() {
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('  IMPORTING REAL MOVEMENTS');
  console.log('═══════════════════════════════════════════════════════════════\n');

  try {
    // Step 1: Parse Excel file
    console.log('📄 Step 1: Parsing Excel file...\n');

    const filePath = path.join(__dirname, 'real-movements.xlsx');
    const fileBuffer = fs.readFileSync(filePath);
    const base64 = fileBuffer.toString('base64');

    const parseResponse = await fetch(`${API_BASE}/upload/parse-excel`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        file: base64,
        filename: 'real-movements.xlsx',
      }),
    });

    const parseResult = await parseResponse.json();

    if (!parseResult.success) {
      console.error('   ❌ Failed to parse Excel:', parseResult.error);
      return false;
    }

    console.log(`   ✅ Parsed ${parseResult.data.sheets.length} sheet(s)`);
    console.log(`   ✅ Found ${parseResult.data.sheets[0].columns.length} columns`);
    console.log(`   ✅ ${parseResult.data.sheets[0].rowCount} rows\n`);

    // Step 2: Configure column mappings (using standard mappings)
    console.log('🗺️  Step 2: Configuring column mappings...\n');

    const columns = parseResult.data.sheets[0].columns;

    const mappings = {
      date: columns.find(c => c.name.toLowerCase().includes('date') || c.name.toLowerCase().includes('תאריך'))?.letter,
      amount: columns.find(c => c.name.toLowerCase().includes('amount') || c.name.toLowerCase().includes('סכום'))?.letter,
      transaction_type: columns.find(c => c.name.toLowerCase().includes('type') || c.name.toLowerCase().includes('סוג'))?.letter,
      counterparty: columns.find(c => c.name.toLowerCase().includes('counterparty') || c.name.toLowerCase().includes('צד'))?.letter,
      investment_name: columns.find(c => c.name.toLowerCase().includes('investment') || c.name.toLowerCase().includes('השקעה'))?.letter,
      currency: columns.find(c => c.name.toLowerCase().includes('currency') || c.name.toLowerCase().includes('מטבע'))?.letter,
    };

    console.log('   Detected mappings:', mappings);

    const saveMappingsResponse = await fetch(`${API_BASE}/configure/save-mappings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mappings }),
    });

    const saveMappingsResult = await saveMappingsResponse.json();

    if (!saveMappingsResult.success) {
      console.error('   ❌ Failed to save mappings:', saveMappingsResult.error);
      return false;
    }

    console.log('   ✅ Column mappings saved\n');

    // Step 3: Preview and normalize
    console.log('🔍 Step 3: Previewing and normalizing data...\n');

    const previewResponse = await fetch(`${API_BASE}/upload/preview`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        file: base64,
        filename: 'real-movements.xlsx',
        sheet_index: 0,
      }),
    });

    const previewResult = await previewResponse.json();

    if (!previewResult.success) {
      console.error('   ❌ Failed to preview:', previewResult.error);
      return false;
    }

    const transactions = previewResult.data.transactions;
    console.log(`   ✅ Normalized ${transactions.length} transactions`);
    console.log(`   ✅ Found ${previewResult.data.summary.investment_count} unique investments`);
    console.log(`   ✅ ${previewResult.data.summary.needs_review_count} transactions need review\n`);

    // Step 4: Import transactions
    console.log('💾 Step 4: Importing transactions...\n');

    const importResponse = await fetch(`${API_BASE}/upload/commit`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        transactions,
        options: {
          source_file: 'real-movements.xlsx',
          skip_duplicates: true,
        },
      }),
    });

    const importResult = await importResponse.json();

    if (!importResult.success) {
      console.error('   ❌ Failed to import:', importResult.error);
      console.error('   Message:', importResult.message);
      return false;
    }

    console.log(`   ✅ Imported ${importResult.data.imported} transactions`);
    console.log(`   ✅ Skipped ${importResult.data.skipped} duplicates`);
    console.log(`   ✅ Failed ${importResult.data.failed} transactions\n`);

    if (importResult.data.errors.length > 0) {
      console.log('   ⚠️  Errors:');
      importResult.data.errors.slice(0, 5).forEach(err => {
        console.log(`      - Index ${err.index}: ${err.error}`);
      });
      if (importResult.data.errors.length > 5) {
        console.log(`      ... and ${importResult.data.errors.length - 5} more`);
      }
      console.log('');
    }

    return true;

  } catch (error) {
    console.error('❌ Fatal error:', error.message);
    if (error.stack) {
      console.error(error.stack);
    }
    return false;
  }
}

importRealMovements().then(success => {
  if (success) {
    console.log('═══════════════════════════════════════════════════════════════');
    console.log('✅ Import complete! Running trend analysis...\n');

    // Run the trend analysis
    require('./analyze-commitment-trends.js');
  } else {
    console.log('❌ Import failed');
    process.exit(1);
  }
}).catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
