/**
 * Direct CSV Import - bypasses file upload, creates normalized transactions directly
 */

const fs = require('fs');
const readline = require('readline');
const crypto = require('crypto');

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

// Transliterate Hebrew to Latin (matches server's slug.ts)
function transliterateHebrew(text) {
  const hebrewToLatin = {
    'א': 'a', 'ב': 'b', 'ג': 'g', 'ד': 'd', 'ה': 'h', 'ו': 'v',
    'ז': 'z', 'ח': 'h', 'ט': 't', 'י': 'y', 'כ': 'k', 'ך': 'k',
    'ל': 'l', 'מ': 'm', 'ם': 'm', 'נ': 'n', 'ן': 'n', 'ס': 's',
    'ע': '', 'פ': 'p', 'ף': 'p', 'צ': 'ts', 'ץ': 'ts', 'ק': 'k',
    'ר': 'r', 'ש': 'sh', 'ת': 't'
  };

  return text.split('').map(char => hebrewToLatin[char] || char).join('');
}

// Create slug from name (matches server's generateSlug with transliteration)
function createSlug(name) {
  return transliterateHebrew(name)
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/\-\-+/g, '-')
    .replace(/^-+/, '')
    .replace(/-+$/, '');
}

// Map transaction type to category
function mapTransactionType(hebrewType) {
  const mappings = {
    'משיכת תשואה': { category: 'distribution', directionality: 'as_is', impact: 1 },
    'משיכה': { category: 'distribution', directionality: 'as_is', impact: 1 },
    'הפקדה': { category: 'capital_call', directionality: 'invert', impact: -1 },
    'עמלה': { category: 'fee', directionality: 'as_is', impact: -1 },
  };

  return mappings[hebrewType] || { category: 'other', directionality: 'as_is', impact: 1 };
}

// Create dedup hash
function createDedupHash(investment, date, amount, type) {
  const str = `${investment}|${date}|${amount}|${type}`.toLowerCase();
  return crypto.createHash('sha256').update(str).digest('hex');
}

async function importCSV() {
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('  HEBREW CSV DIRECT IMPORT');
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

    // Parse data rows (starting from row 4, index 3)
    const rawTransactions = [];
    const normalizedTransactions = [];

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

      const mapping = mapTransactionType(transaction_type);
      const investment_slug = createSlug(investment_name);
      const amount_normalized = Math.abs(amount) * (mapping.directionality === 'invert' ? -1 : 1);
      const dedup_hash = createDedupHash(investment_slug, date, Math.abs(amount), transaction_type);

      rawTransactions.push({
        investment_name,
        counterparty: counterparty || '',
        transaction_type,
        description: description || '',
        date,
        amount: Math.abs(amount),
        currency: currency || 'USD'
      });

      normalizedTransactions.push({
        normalized: {
          investment_slug,
          date_iso: date,
          transaction_category: mapping.category,
          amount_original: Math.abs(amount),
          amount_normalized,
          original_currency: currency || 'USD',
          normalized_currency: currency || 'USD',
          counterparty: counterparty || '',
          counterparty_normalized: counterparty || '',
          description: description || '',
          exchange_rate: 1.0,
          cash_flow_direction: amount_normalized > 0 ? 'inflow' : 'outflow',
          amount_usd: Math.abs(amount), // Assuming USD, will need proper conversion
          amount_ils: Math.abs(amount) * 3.5, // Rough estimate, will need proper conversion
          exchange_rate_to_ils: 3.5, // Placeholder exchange rate
          is_called: mapping.category === 'capital_call',
          is_distributed: mapping.category === 'distribution',
        },
        dedup: {
          hash: dedup_hash,
          dedup_hash,
          is_duplicate: false,
          duplicate_of: null,
        },
        metadata: {
          investment_name,
          counterparty: counterparty || '',
          transaction_type,
          description: description || '',
          date_original: date_str,
          amount_original: amount_str,
          currency,
        },
        status: 'clean',
        issues: []
      });
    }

    console.log(`   ✅ Parsed ${normalizedTransactions.length} transactions\n`);

    // Show sample
    if (normalizedTransactions.length > 0) {
      const sample = normalizedTransactions[0];
      console.log('   Sample normalized transaction:');
      console.log(`      Investment: ${sample.normalized.investment_slug}`);
      console.log(`      Category: ${sample.normalized.transaction_category}`);
      console.log(`      Date: ${sample.normalized.date_iso}`);
      console.log(`      Amount: ${sample.normalized.amount_normalized} ${sample.normalized.original_currency}`);
      console.log('');
    }

    // Step 2: Get unique investments
    const uniqueInvestments = [...new Set(rawTransactions.map(t => t.investment_name))];
    console.log(`💼 Step 2: Found ${uniqueInvestments.length} unique investments\n`);

    // Step 3: Save investments
    console.log('💼 Step 3: Saving investments...\n');

    const investments = uniqueInvestments.map(name => ({
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
    console.log('   Top 10:');
    saveInvestmentsResult.data.investments.slice(0, 10).forEach((inv, i) => {
      console.log(`      ${i + 1}. ${inv.name} → ${inv.slug}`);
    });
    if (saveInvestmentsResult.data.investments.length > 10) {
      console.log(`      ... and ${saveInvestmentsResult.data.investments.length - 10} more`);
    }
    console.log('');

    // Step 4: Import transactions
    console.log('📥 Step 4: Importing transactions...\n');

    const commitResponse = await fetch(`${API_BASE}/upload/commit`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        transactions: normalizedTransactions,
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

    // Step 5: Verify investment linkage
    console.log('🔗 Step 5: Verifying investment linkage...\n');

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
        items.filter(t => t.investment_id !== null).slice(0, 5).forEach(tx => {
          console.log(`      • ${tx.investment_name}: ${tx.amount_normalized} ${tx.original_currency} (${tx.transaction_category})`);
        });
      }

      if (withoutInvestment > 0) {
        console.log(`\n   ⚠️  Unlinked transactions:`);
        items.filter(t => t.investment_id === null).slice(0, 3).forEach(tx => {
          console.log(`      • Slug: ${tx.counterparty || 'unknown'}`);
        });
      }
    }

    console.log('\n═══════════════════════════════════════════════════════════════');
    console.log('  SUMMARY');
    console.log('═══════════════════════════════════════════════════════════════\n');

    console.log('✅ CSV import completed successfully!');
    console.log(`   • Parsed ${normalizedTransactions.length} transactions from CSV`);
    console.log(`   • Identified ${uniqueInvestments.length} unique investments`);
    console.log(`   • Saved ${investments.length} investment records`);
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
