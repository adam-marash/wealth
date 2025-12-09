/**
 * Create Sample Excel File for Testing
 * Run with: node test/create-sample-excel.js
 */

const XLSX = require('xlsx');

// Sample transaction data
const data = [
  ['Date', 'Description', 'Transaction Type', 'Amount', 'Currency', 'Counterparty', 'Investment Name'],
  ['2024-01-15', 'Capital Call Q1', 'Capital Call', -50000, 'USD', 'Fund Manager ABC', 'PE Fund Alpha'],
  ['2024-02-20', 'Quarterly Distribution', 'Distribution', 15000, 'USD', 'Fund Manager ABC', 'PE Fund Alpha'],
  ['2024-03-10', 'Management Fee', 'Fee', -2000, 'USD', 'Fund Manager ABC', 'PE Fund Alpha'],
  ['2024-04-05', 'Capital Call Q2', 'Capital Call', -75000, 'USD', 'VC Fund Beta', 'VC Fund Beta'],
  ['2024-05-12', 'Dividend Income', 'Income', 5000, 'USD', 'Public Equity XYZ', 'Public Markets Portfolio'],
];

// Create workbook and worksheet
const wb = XLSX.utils.book_new();
const ws = XLSX.utils.aoa_to_sheet(data);

// Add the worksheet to the workbook
XLSX.utils.book_append_sheet(wb, ws, 'Transactions');

// Write file
XLSX.writeFile(wb, 'test/sample-transactions.xlsx');

console.log('✅ Sample Excel file created: test/sample-transactions.xlsx');
console.log('File contains', data.length - 1, 'sample transactions');
