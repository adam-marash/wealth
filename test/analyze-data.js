/**
 * Analyze real-movements.xlsx data
 * Run with: node test/analyze-data.js
 */

const XLSX = require('xlsx');

// Read the Excel file
const workbook = XLSX.readFile('test/real-movements.xlsx');
const sheetName = workbook.SheetNames[0];
const worksheet = workbook.Sheets[sheetName];

// Convert to array of arrays
const data = XLSX.utils.sheet_to_json(worksheet, {
  header: 1,
  defval: null,
  blankrows: false,
  raw: false,
});

// Skip header row
const rows = data.slice(1);

console.log('═══════════════════════════════════════════════════════════════');
console.log('  WEALTH MANAGEMENT DATA ANALYSIS');
console.log('═══════════════════════════════════════════════════════════════\n');

// Basic stats
console.log(`📊 Dataset Overview:`);
console.log(`   Total Transactions: ${rows.length}`);
console.log(`   Total Columns: ${data[0].length}`);
console.log('');

// Column mapping (based on our configuration)
const COL_INVESTMENT = 4;  // E: תאור
const COL_TX_TYPE = 7;     // H: סוג תנועה
const COL_DATE = 9;        // J: תאריך התנועה
const COL_AMOUNT = 10;     // K: סכום תנועה במטבע
const COL_CURRENCY = 11;   // L: מטבע התנועה
const COL_RATE = 12;       // M: שער המרה
const COL_AMOUNT_ILS = 13; // N: סכום בש"ח

// Analyze transaction types
const txTypes = {};
rows.forEach(row => {
  const type = row[COL_TX_TYPE];
  if (type) {
    txTypes[type] = (txTypes[type] || 0) + 1;
  }
});

console.log(`💸 Transaction Types:`);
Object.entries(txTypes)
  .sort((a, b) => b[1] - a[1])
  .forEach(([type, count]) => {
    const pct = ((count / rows.length) * 100).toFixed(1);
    console.log(`   ${type.padEnd(25)} ${count.toString().padStart(3)} (${pct}%)`);
  });
console.log('');

// Analyze investments
const investments = {};
rows.forEach(row => {
  const inv = row[COL_INVESTMENT];
  if (inv && inv !== 'תאור') {
    investments[inv] = (investments[inv] || 0) + 1;
  }
});

console.log(`🏢 Top 10 Investments by Transaction Count:`);
Object.entries(investments)
  .sort((a, b) => b[1] - a[1])
  .slice(0, 10)
  .forEach(([inv, count], i) => {
    console.log(`   ${(i + 1).toString().padStart(2)}. ${inv.substring(0, 40).padEnd(42)} ${count.toString().padStart(3)} txs`);
  });
console.log(`   ... and ${Object.keys(investments).length - 10} more`);
console.log('');

// Analyze currencies
const currencies = {};
rows.forEach(row => {
  const curr = row[COL_CURRENCY];
  if (curr) {
    currencies[curr] = (currencies[curr] || 0) + 1;
  }
});

console.log(`💱 Currencies:`);
Object.entries(currencies)
  .sort((a, b) => b[1] - a[1])
  .forEach(([curr, count]) => {
    const pct = ((count / rows.length) * 100).toFixed(1);
    console.log(`   ${curr.padEnd(10)} ${count.toString().padStart(3)} (${pct}%)`);
  });
console.log('');

// Analyze date range
const dates = rows
  .map(row => row[COL_DATE])
  .filter(d => d)
  .map(d => {
    // Parse DD/MM/YYYY format
    const parts = d.split('/');
    if (parts.length === 3) {
      return new Date(parts[2], parts[1] - 1, parts[0]);
    }
    return null;
  })
  .filter(d => d && !isNaN(d.getTime()))
  .sort((a, b) => a - b);

if (dates.length > 0) {
  const earliest = dates[0];
  const latest = dates[dates.length - 1];
  console.log(`📅 Date Range:`);
  console.log(`   Earliest: ${earliest.toISOString().split('T')[0]}`);
  console.log(`   Latest:   ${latest.toISOString().split('T')[0]}`);

  const years = {};
  dates.forEach(d => {
    const year = d.getFullYear();
    years[year] = (years[year] || 0) + 1;
  });

  console.log(`\n   Transactions by Year:`);
  Object.entries(years)
    .sort((a, b) => a[0] - b[0])
    .forEach(([year, count]) => {
      const pct = ((count / rows.length) * 100).toFixed(1);
      console.log(`   ${year}: ${count.toString().padStart(3)} (${pct}%)`);
    });
}
console.log('');

// Analyze amounts (in original currency)
const amounts = rows
  .map(row => {
    const amt = row[COL_AMOUNT];
    if (typeof amt === 'string') {
      // Remove commas and spaces
      return parseFloat(amt.replace(/,/g, '').replace(/\s/g, ''));
    }
    return parseFloat(amt);
  })
  .filter(a => !isNaN(a));

if (amounts.length > 0) {
  const total = amounts.reduce((sum, a) => sum + a, 0);
  const avg = total / amounts.length;
  const min = Math.min(...amounts);
  const max = Math.max(...amounts);

  console.log(`💰 Amount Statistics (in source currencies):`);
  console.log(`   Total:   ${total.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);
  console.log(`   Average: ${avg.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);
  console.log(`   Min:     ${min.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);
  console.log(`   Max:     ${max.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);
}
console.log('');

// Sample transactions
console.log(`📋 Sample Transactions (first 5):`);
console.log('');
for (let i = 0; i < Math.min(5, rows.length); i++) {
  const row = rows[i];
  console.log(`   Transaction #${i + 1}:`);
  console.log(`   Date:       ${row[COL_DATE] || 'N/A'}`);
  console.log(`   Investment: ${row[COL_INVESTMENT] || 'N/A'}`);
  console.log(`   Type:       ${row[COL_TX_TYPE] || 'N/A'}`);
  console.log(`   Amount:     ${row[COL_AMOUNT] || 'N/A'} ${row[COL_CURRENCY] || ''}`);
  console.log(`   ILS Amount: ${row[COL_AMOUNT_ILS] || 'N/A'} ₪`);
  console.log('');
}

console.log('═══════════════════════════════════════════════════════════════');
