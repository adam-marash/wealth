/**
 * Test normalization service with real data samples
 * Run with: node test/test-normalization.js
 */

const XLSX = require('xlsx');

console.log('═══════════════════════════════════════════════════════════════');
console.log('  NORMALIZATION SERVICE TEST');
console.log('═══════════════════════════════════════════════════════════════\n');

// Test date parsing with various formats
console.log('📅 Testing Date Parsing:');
console.log('');

const testDates = [
  '15/03/2024',      // DD/MM/YYYY
  '03/15/2024',      // MM/DD/YYYY (ambiguous)
  '25/12/2023',      // DD/MM/YYYY (unambiguous, day > 12)
  '2024-03-15',      // ISO 8601
  '45000',           // Excel serial date
  44927,             // Excel serial (number)
];

console.log('Sample dates to parse:');
testDates.forEach((date, i) => {
  console.log(`   ${i + 1}. ${date} (${typeof date})`);
});
console.log('');

// Test amount parsing
console.log('💰 Testing Amount Parsing:');
console.log('');

const testAmounts = [
  '1,234.56',        // With comma
  '-500.00',         // Negative
  '(250.50)',        // Accounting format
  1234.56,           // Number
  '  789.12  ',      // With spaces
];

console.log('Sample amounts to parse:');
testAmounts.forEach((amount, i) => {
  console.log(`   ${i + 1}. "${amount}" (${typeof amount})`);
});
console.log('');

// Read real data from Excel
console.log('📊 Loading Real Data:');
console.log('');

try {
  const workbook = XLSX.readFile('test/real-movements.xlsx');
  const sheetName = workbook.SheetNames[0];
  const worksheet = workbook.Sheets[sheetName];

  const data = XLSX.utils.sheet_to_json(worksheet, {
    header: 1,
    defval: null,
    blankrows: false,
    raw: false,
  });

  // Skip header row
  const rows = data.slice(1);

  console.log(`Loaded ${rows.length} transactions from real-movements.xlsx`);
  console.log('');

  // Column indices (based on our mapping)
  const COL_INVESTMENT = 4;  // E: תאור
  const COL_COUNTERPARTY = 6; // G: גוף מנהל
  const COL_TX_TYPE = 7;     // H: סוג תנועה
  const COL_DATE = 9;        // J: תאריך התנועה
  const COL_AMOUNT = 10;     // K: סכום תנועה במטבע
  const COL_CURRENCY = 11;   // L: מטבע התנועה
  const COL_RATE = 12;       // M: שער המרה
  const COL_AMOUNT_ILS = 13; // N: סכום בש\"ח

  // Sample first 5 transactions for detailed analysis
  console.log('📋 Sample Transactions (first 5):');
  console.log('');

  for (let i = 0; i < Math.min(5, rows.length); i++) {
    const row = rows[i];

    console.log(`Transaction #${i + 1}:`);
    console.log(`   Date (raw):         "${row[COL_DATE]}"`);
    console.log(`   Investment:         ${row[COL_INVESTMENT]}`);
    console.log(`   Counterparty (raw): "${row[COL_COUNTERPARTY]}"`);
    console.log(`   Type:               ${row[COL_TX_TYPE]}`);
    console.log(`   Amount (raw):       "${row[COL_AMOUNT]}" ${row[COL_CURRENCY]}`);
    console.log(`   Exchange Rate:      ${row[COL_RATE]}`);
    console.log(`   ILS Amount:         ${row[COL_AMOUNT_ILS]}`);
    console.log('');
  }

  // Analyze date formats
  console.log('📅 Date Format Analysis:');
  const dateFormats = new Set();
  rows.forEach(row => {
    const date = row[COL_DATE];
    if (date) {
      // Detect format
      if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(date)) {
        dateFormats.add('DD/MM/YYYY or MM/DD/YYYY');
      } else if (/^\d{4}-\d{2}-\d{2}$/.test(date)) {
        dateFormats.add('ISO 8601');
      } else if (/^\d+$/.test(date)) {
        dateFormats.add('Excel serial');
      } else {
        dateFormats.add('Unknown');
      }
    }
  });
  console.log(`   Detected formats: ${Array.from(dateFormats).join(', ')}`);
  console.log('');

  // Analyze amount formats
  console.log('💰 Amount Format Analysis:');
  const amountFormats = new Set();
  let hasCommas = 0;
  let hasParentheses = 0;
  let hasNegatives = 0;

  rows.forEach(row => {
    const amount = row[COL_AMOUNT];
    if (amount && typeof amount === 'string') {
      if (amount.includes(',')) hasCommas++;
      if (amount.startsWith('(') && amount.endsWith(')')) hasParentheses++;
      if (amount.startsWith('-')) hasNegatives++;
    }
  });

  console.log(`   With commas:       ${hasCommas} (${((hasCommas / rows.length) * 100).toFixed(1)}%)`);
  console.log(`   With parentheses:  ${hasParentheses} (${((hasParentheses / rows.length) * 100).toFixed(1)}%)`);
  console.log(`   With negatives:    ${hasNegatives} (${((hasNegatives / rows.length) * 100).toFixed(1)}%)`);
  console.log('');

  // Analyze counterparty names
  console.log('🏢 Counterparty Name Analysis:');
  const counterparties = new Set();
  let withWhitespace = 0;
  let empty = 0;

  rows.forEach(row => {
    const cp = row[COL_COUNTERPARTY];
    if (cp) {
      counterparties.add(cp);
      if (cp !== cp.trim()) {
        withWhitespace++;
      }
    } else {
      empty++;
    }
  });

  console.log(`   Unique counterparties: ${counterparties.size}`);
  console.log(`   With extra whitespace: ${withWhitespace}`);
  console.log(`   Empty/null:            ${empty}`);
  console.log('');

  console.log('Top 10 Counterparties:');
  const cpCounts = {};
  rows.forEach(row => {
    const cp = row[COL_COUNTERPARTY];
    if (cp) {
      cpCounts[cp] = (cpCounts[cp] || 0) + 1;
    }
  });

  Object.entries(cpCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .forEach(([cp, count], i) => {
      console.log(`   ${(i + 1).toString().padStart(2)}. ${cp.substring(0, 40).padEnd(42)} ${count} txs`);
    });
  console.log('');

  // Currency and amount stats
  console.log('💱 Currency & Amount Statistics:');
  const currencies = {};
  const amounts = [];

  rows.forEach(row => {
    const curr = row[COL_CURRENCY];
    const amt = row[COL_AMOUNT];

    if (curr) {
      currencies[curr] = (currencies[curr] || 0) + 1;
    }

    if (amt) {
      const parsed = typeof amt === 'number' ? amt : parseFloat(String(amt).replace(/,/g, ''));
      if (!isNaN(parsed)) {
        amounts.push(parsed);
      }
    }
  });

  console.log('Currencies:');
  Object.entries(currencies)
    .sort((a, b) => b[1] - a[1])
    .forEach(([curr, count]) => {
      const pct = ((count / rows.length) * 100).toFixed(1);
      console.log(`   ${curr.padEnd(10)} ${count.toString().padStart(3)} (${pct}%)`);
    });
  console.log('');

  if (amounts.length > 0) {
    const total = amounts.reduce((sum, a) => sum + a, 0);
    const avg = total / amounts.length;
    const min = Math.min(...amounts);
    const max = Math.max(...amounts);

    console.log('Amount Statistics:');
    console.log(`   Total:   ${total.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);
    console.log(`   Average: ${avg.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);
    console.log(`   Min:     ${min.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);
    console.log(`   Max:     ${max.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);
  }
  console.log('');

} catch (error) {
  console.error('Error reading Excel file:', error.message);
}

console.log('═══════════════════════════════════════════════════════════════');
console.log('');
console.log('✅ Test complete! Review the analysis above.');
console.log('');
console.log('Next: Test normalization API endpoint with real data');
console.log('');
