/**
 * Import Hebrew CSV file directly
 * Simpler than Excel - no sheets, merged cells, or header detection issues
 */

const fs = require('fs');
const readline = require('readline');

const API_BASE = 'http://localhost:8788/api';
const CSV_FILE = '/home/adam/wealth/test/fresh-transactions.csv';

// Parse CSV line respecting quoted fields
function parseCSVLine(line) {
  const result = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];

    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === ',' && !inQuotes) {
      result.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }
  result.push(current.trim());

  return result;
}

// Clean amount value (remove spaces, commas)
function cleanAmount(value) {
  if (!value) return null;
  const cleaned = value.replace(/\s/g, '').replace(/,/g, '');
  const num = parseFloat(cleaned);
  return isNaN(num) ? null : num;
}

// Parse date in DD/MM/YYYY format or MMM-YY format
function parseDate(value) {
  if (!value) return null;

  // Handle DD/MM/YYYY format
  const ddmmyyyy = value.match(/(\d{2})\/(\d{2})\/(\d{4})/);
  if (ddmmyyyy) {
    const [, day, month, year] = ddmmyyyy;
    return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
  }

  // Handle MMM-YY format (e.g., "Mar-21")
  const mmmyy = value.match(/([A-Za-z]{3})-(\d{2})/);
  if (mmmyy) {
    const [, monthStr, year] = mmmyy;
    const months = { Jan: 1, Feb: 2, Mar: 3, Apr: 4, May: 5, Jun: 6, Jul: 7, Aug: 8, Sep: 9, Oct: 10, Nov: 11, Dec: 12 };
    const month = months[monthStr];
    const fullYear = 2000 + parseInt(year);
    return `${fullYear}-${String(month).padStart(2, '0')}-01`;
  }

  return null;
}

async function importCSV() {
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('  HEBREW CSV IMPORT');
  console.log('═══════════════════════════════════════════════════════════════\n');

  try {
    // Step 1: Read and parse CSV
    console.log('📄 Step 1: Reading CSV file...\n');

    const fileStream = fs.createReadStream(CSV_FILE);
    const rl = readline.createInterface({
      input: fileStream,
      crlfDelay: Infinity
    });

    const lines = [];
    for await (const line of rl) {
      if (line.trim()) {
        lines.push(line);
      }
    }

    console.log(`   ✅ Read ${lines.length} lines\n`);

    // Parse headers (row 3, index 2)
    const headers = parseCSVLine(lines[2]);
    console.log('   Column headers:');
    headers.forEach((h, i) => {
      if (i < 14) console.log(`      ${i + 1}. ${h}`);
    });
    console.log('');

    // Parse data rows (starting from row 4, index 3)
    const transactions = [];
    for (let i = 3; i < lines.length; i++) {
      const values = parseCSVLine(lines[i]);

      // Map to our field structure
      const investment_name = values[4]; // תאור
      const counterparty = values[6]; // גוף מנהל
      const transaction_type = values[7]; // סוג תנועה
      const description = values[8]; // סוג תנועה מורחב
      const date_str = values[9]; // תאריך התנועה
      const amount_str = values[10]; // סכום תנועה במטבע
      const currency = values[11]; // מטבע התנועה

      const date = parseDate(date_str);
      const amount = cleanAmount(amount_str);

      if (!investment_name || !date || amount === null) {
        console.log(`   ⚠️  Skipping row ${i + 1}: missing required fields`);
        continue;
      }

      transactions.push({
        investment_name,
        counterparty: counterparty || '',
        transaction_type,
        description: description || '',
        date,
        amount: Math.abs(amount),
        currency: currency || 'USD'
      });
    }

    console.log(`   ✅ Parsed ${transactions.length} valid transactions\n`);

    // Show sample
    if (transactions.length > 0) {
      const sample = transactions[0];
      console.log('   Sample transaction:');
      console.log(`      Investment: ${sample.investment_name}`);
      console.log(`      Counterparty: ${sample.counterparty}`);
      console.log(`      Type: ${sample.transaction_type}`);
      console.log(`      Date: ${sample.date}`);
      console.log(`      Amount: ${sample.amount} ${sample.currency}`);
      console.log('');
    }

    // Step 2: Get unique investments
    const uniqueInvestments = [...new Set(transactions.map(t => t.investment_name))];
    console.log(`💼 Step 2: Found ${uniqueInvestments.length} unique investments\n`);
    console.log('   Top 10:');
    uniqueInvestments.slice(0, 10).forEach((name, i) => {
      console.log(`      ${i + 1}. ${name}`);
    });
    if (uniqueInvestments.length > 10) {
      console.log(`      ... and ${uniqueInvestments.length - 10} more`);
    }
    console.log('');

    // Step 3: Send to preview endpoint (which will apply mappings and categorize)
    console.log('🔍 Step 3: Generating preview with normalization...\n');

    const previewResponse = await fetch(`${API_BASE}/upload/preview`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        raw_transactions: transactions,
        from_csv: true
      }),
    });

    const previewResult = await previewResponse.json();

    if (!previewResult.success) {
      console.error('   ❌ Preview failed:', previewResult.error);
      return false;
    }

    console.log(`   ✅ Preview generated`);
    console.log(`   Total: ${previewResult.data.summary.total_rows}`);
    console.log(`   Clean: ${previewResult.data.summary.clean_transactions}`);
    console.log(`   Issues: ${previewResult.data.summary.transactions_with_issues}`);
    console.log('');

    if (previewResult.data.transactions.length > 0) {
      const sample = previewResult.data.transactions[0];
      console.log('   Sample normalized transaction:');
      console.log(`      Investment slug: ${sample.normalized.investment_slug}`);
      console.log(`      Category: ${sample.normalized.transaction_category}`);
      console.log(`      Amount: ${sample.normalized.amount_normalized}`);
      console.log('');
    }

    // Step 4: Save investments
    console.log('💼 Step 4: Saving investments...\n');

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

    // Step 5: Import transactions
    console.log('📥 Step 5: Importing transactions...\n');

    const commitResponse = await fetch(`${API_BASE}/upload/commit`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        transactions: previewResult.data.transactions,
        options: {
          source_file: 'fresh-transactions.csv',
          skip_duplicates: true,
          force_import: false
        }
      }),
    });

    const commitResult = await commitResponse.json();

    if (!commitResult.success) {
      console.error('   ❌ Import failed:', commitResult.error);
      console.error('   Message:', commitResult.message);
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

    // Step 6: Verify investment linkage
    console.log('🔗 Step 6: Verifying investment linkage...\n');

    const txResponse = await fetch(`${API_BASE}/reports/transactions?pageSize=50`);
    const txResult = await txResponse.json();

    if (txResult.success) {
      const items = txResult.data.items;
      const withInvestment = items.filter(t => t.investment_id !== null).length;
      const withoutInvestment = items.filter(t => t.investment_id === null).length;
      const totalCount = items.length;

      console.log(`   Sample of ${totalCount} transactions:`);
      console.log(`      ✅ With investment: ${withInvestment} (${(withInvestment/totalCount*100).toFixed(1)}%)`);
      console.log(`      ❌ Without investment: ${withoutInvestment} (${(withoutInvestment/totalCount*100).toFixed(1)}%)`);

      if (withInvestment > 0) {
        console.log(`\n   Sample linked transactions:`);
        items.filter(t => t.investment_id !== null).slice(0, 3).forEach(tx => {
          console.log(`      • ${tx.investment_name}: ${tx.amount_normalized} ${tx.original_currency} (${tx.transaction_category})`);
        });
      }

      if (withoutInvestment > 0) {
        console.log(`\n   ⚠️  Unlinked transactions:`);
        items.filter(t => t.investment_id === null).slice(0, 3).forEach(tx => {
          console.log(`      • Counterparty: ${tx.counterparty}`);
        });
      }
    }

    console.log('\n═══════════════════════════════════════════════════════════════');
    console.log('  SUMMARY');
    console.log('═══════════════════════════════════════════════════════════════\n');

    console.log('✅ CSV import completed!');
    console.log(`   • Parsed ${transactions.length} transactions from CSV`);
    console.log(`   • Found ${uniqueInvestments.length} unique investments`);
    console.log(`   • Imported ${commitResult.data.imported} transactions`);
    console.log(`   • Skipped ${commitResult.data.skipped} duplicates`);
    console.log('');

    return true;

  } catch (error) {
    console.error('❌ Fatal error:', error.message);
    if (error.stack) {
      console.error(error.stack);
    }
    return false;
  }
}

importCSV().then(success => {
  process.exit(success ? 0 : 1);
}).catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
