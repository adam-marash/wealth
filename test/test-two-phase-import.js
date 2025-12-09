/**
 * Test Two-Phase Import Flow
 * Tests the new investment discovery and transaction import endpoints
 */

const fs = require('fs');
const path = require('path');

const API_BASE = 'http://localhost:8787';
const CSV_FILE = path.join(__dirname, 'sample-transactions.csv');

async function testTwoPhaseImport() {
  console.log('=== Testing Two-Phase Import Flow ===\n');

  // Check if CSV file exists
  if (!fs.existsSync(CSV_FILE)) {
    console.error(`❌ CSV file not found: ${CSV_FILE}`);
    console.log('Please create a sample CSV file first.');
    return;
  }

  try {
    // Phase 1: Discover investments
    console.log('Phase 1: Discovering investments...');
    const fileBuffer = fs.readFileSync(CSV_FILE);
    const formData = new FormData();
    formData.append('file', new Blob([fileBuffer]), 'sample-transactions.csv');

    const discoverResponse = await fetch(`${API_BASE}/api/upload/discover-investments`, {
      method: 'POST',
      body: formData,
    });

    if (!discoverResponse.ok) {
      throw new Error(`Discovery failed: ${discoverResponse.statusText}`);
    }

    const discoverResult = await discoverResponse.json();
    console.log('✓ Discovery result:', JSON.stringify(discoverResult, null, 2));

    // Phase 1b: Create new investments (if any)
    if (discoverResult.data?.newInvestments?.length > 0) {
      console.log(`\nPhase 1b: Creating ${discoverResult.data.newInvestments.length} new investments...`);

      const createResponse = await fetch(`${API_BASE}/api/upload/create-investments`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          investments: discoverResult.data.newInvestments,
        }),
      });

      if (!createResponse.ok) {
        throw new Error(`Create investments failed: ${createResponse.statusText}`);
      }

      const createResult = await createResponse.json();
      console.log('✓ Created investments:', JSON.stringify(createResult, null, 2));
    } else {
      console.log('\n✓ No new investments to create');
    }

    // Phase 2: Import transactions
    console.log('\nPhase 2: Importing transactions...');
    const formData2 = new FormData();
    formData2.append('file', new Blob([fileBuffer]), 'sample-transactions.csv');

    const importResponse = await fetch(`${API_BASE}/api/upload/import-transactions`, {
      method: 'POST',
      body: formData2,
    });

    if (!importResponse.ok) {
      throw new Error(`Import failed: ${importResponse.statusText}`);
    }

    const importResult = await importResponse.json();
    console.log('✓ Import result:', JSON.stringify(importResult, null, 2));

    console.log('\n✅ Two-phase import test completed successfully!');

  } catch (error) {
    console.error('\n❌ Test failed:', error.message);
    if (error.cause) {
      console.error('Cause:', error.cause);
    }
  }
}

// Run the test
testTwoPhaseImport();
