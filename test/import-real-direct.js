/**
 * Direct import of real-movements.xlsx using local file reading
 * Run with: node test/import-real-direct.js
 */

const XLSX = require('xlsx');
const path = require('path');

const API_BASE = 'http://localhost:8788/api';

async function importRealMovements() {
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('  IMPORTING REAL MOVEMENTS (DIRECT)');
  console.log('═══════════════════════════════════════════════════════════════\n');

  try {
    // Step 1: Read and parse Excel file locally
    console.log('📄 Step 1: Reading Excel file locally...\n');

    const filePath = path.join(__dirname, 'real-movements.xlsx');
    const workbook = XLSX.readFile(filePath);
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    const data = XLSX.utils.sheet_to_json(worksheet, { raw: false, defval: '' });

    console.log(`   ✅ Parsed sheet "${sheetName}"`);
    console.log(`   ✅ Found ${data.length} rows (including header)\n`);

    if (data.length === 0) {
      console.error('   ❌ No data found in Excel file');
      return false;
    }

    // Skip header row (first row contains column labels)
    const dataRows = data.slice(1);
    console.log(`   ✅ Processing ${dataRows.length} data rows (skipped header)\n`);

    // Step 3: Transform to transaction format
    console.log('🔄 Step 2: Transforming to transaction format...\n');

    const transactions = dataRows.map((row, index) => {
      // Known column mappings from the real file structure:
      // __EMPTY_8 = תאריך התנועה (date)
      // __EMPTY_9 = סכום תנועה במטבע (amount)
      // __EMPTY_10 = מטבע התנועה (currency symbol)
      // __EMPTY_6 = סוג תנועה (transaction type in Hebrew)
      // __EMPTY_5 = גוף מנהל (managing body - THIS IS THE INVESTMENT NAME)
      // __EMPTY_4 = תאור (account description/number)

      const dateStr = row['__EMPTY_8'] || '';
      const amountStr = String(row['__EMPTY_9'] || '0').replace(/[^0-9.-]/g, '');
      const amount = parseFloat(amountStr);
      const currencySymbol = row['__EMPTY_10'] || '$';
      const transactionType = row['__EMPTY_6'] || '';
      const investmentName = row['__EMPTY_5'] || ''; // This is the correct column!
      const accountDesc = row['__EMPTY_4'] || '';

      // Convert DD/MM/YYYY to YYYY-MM-DD (ISO format)
      let date = dateStr;
      if (dateStr && dateStr.includes('/')) {
        const parts = dateStr.split('/');
        if (parts.length === 3) {
          const day = parts[0].padStart(2, '0');
          const month = parts[1].padStart(2, '0');
          const year = parts[2];
          date = `${year}-${month}-${day}`; // ISO format
        }
      }

      // Map currency symbol to code
      const currency = currencySymbol.includes('$') ? 'USD' :
                       currencySymbol.includes('€') ? 'EUR' :
                       currencySymbol.includes('₪') ? 'ILS' : 'USD';

      // Create a simple slug from investment name
      const investmentSlug = investmentName
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '');

      // Determine transaction category based on Hebrew type
      let transactionCategory = 'other';
      const typeLower = transactionType.toLowerCase();

      // משיכת תשואה = yield/distribution withdrawal
      // קריאה = call
      // הפקדה = deposit/capital call
      if (typeLower.includes('משיכת') || typeLower.includes('distribution')) {
        transactionCategory = 'distribution';
      } else if (typeLower.includes('קריאה') || typeLower.includes('call') || typeLower.includes('הפקדה')) {
        transactionCategory = 'capital_call';
      }

      // Cash flow direction: negative for capital calls, positive for distributions
      const cashFlowDirection = transactionCategory === 'capital_call' ? -1 : 1;
      const amountNormalized = Math.abs(amount) * cashFlowDirection;

      return {
        normalized: {
          date_iso: date,
          amount_original: amount,
          amount_normalized: amountNormalized,
          original_currency: currency,
          amount_usd: amountNormalized, // Will be converted by the API
          transaction_category: transactionCategory,
          cash_flow_direction: cashFlowDirection,
          counterparty_normalized: accountDesc,
          investment_name: investmentName,
          investment_slug: investmentSlug,
          amount_ils: null,
          exchange_rate_to_ils: null,
        },
        dedup: {
          hash: `real-${index}-${date}-${amount}-${investmentName}-${accountDesc}`.replace(/\s+/g, '-'),
          is_duplicate: false,
          needs_review: false,
        },
        metadata: {
          source: 'real-movements.xlsx',
          row_index: index + 2, // +2 because we skipped header and arrays are 0-indexed
          original_type: transactionType,
          account: accountDesc,
        },
      };
    });

    console.log(`   ✅ Transformed ${transactions.length} transactions\n`);

    // Step 3: Extract unique investments and create them first
    console.log('🏢 Step 3: Creating investments from transaction data...\n');

    const uniqueInvestments = new Map();
    transactions.forEach(tx => {
      const name = tx.normalized.investment_name;
      const slug = tx.normalized.investment_slug;
      if (name && !uniqueInvestments.has(slug)) {
        uniqueInvestments.set(slug, {
          name,
          slug,
          investment_group: 'Unknown', // Will be categorized later
          investment_type: 'Other',
          status: 'active',
        });
      }
    });

    const investmentsList = Array.from(uniqueInvestments.values());
    console.log(`   Found ${investmentsList.length} unique investments:`);
    investmentsList.forEach((inv, i) => {
      console.log(`      ${i + 1}. ${inv.name} (${inv.slug})`);
    });
    console.log('');

    // Create investments in database
    const saveInvResponse = await fetch(`${API_BASE}/configure/save-investments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(investmentsList),
    });

    const saveInvResult = await saveInvResponse.json();

    if (!saveInvResult.success) {
      console.error('   ❌ Failed to save investments:', saveInvResult.error);
      return false;
    }

    console.log(`   ✅ Saved investments to database\n`);

    // Step 4: Import transactions
    console.log('💾 Step 4: Importing transactions...\n');

    const importResponse = await fetch(`${API_BASE}/upload/commit`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        transactions,
        options: {
          source_file: 'real-movements.xlsx',
          skip_duplicates: false, // Don't skip since we cleared the table
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
      importResult.data.errors.slice(0, 10).forEach(err => {
        console.log(`      - Index ${err.index}: ${err.error}`);
      });
      if (importResult.data.errors.length > 10) {
        console.log(`      ... and ${importResult.data.errors.length - 10} more`);
      }
      console.log('');
    }

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

// Run import and then trend analysis
importRealMovements().then(success => {
  if (success) {
    console.log('✅ Import complete! Running trend analysis...\n');
    console.log('═══════════════════════════════════════════════════════════════\n');

    // Run the trend analysis
    const { execSync } = require('child_process');
    execSync('node test/analyze-commitment-trends.js', { stdio: 'inherit' });
  } else {
    console.log('❌ Import failed');
    process.exit(1);
  }
}).catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
