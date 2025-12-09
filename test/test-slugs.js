/**
 * Test slug generation and investment name resolution
 * Run with: node test/test-slugs.js
 */

console.log('═══════════════════════════════════════════════════════════════');
console.log('  SLUG GENERATION & RESOLUTION TEST');
console.log('═══════════════════════════════════════════════════════════════\n');

const API_BASE = 'http://localhost:8788/api';

// Test investment names (includes Hebrew, English, mixed, special chars)
const testInvestments = [
  { name: 'Faro-Point FRG-X', expected_slug: 'faro-point-frg-x' },
  { name: 'פארופוינט FRG-X', expected_slug: 'frg-x' }, // Hebrew removed
  { name: 'Migdal Insurance', expected_slug: 'migdal-insurance' },
  { name: 'IBI  ', expected_slug: 'ibi' }, // Whitespace trimmed
  { name: 'Real-Estate Fund #1', expected_slug: 'real-estate-fund-1' },
];

async function testSlugGeneration() {
  console.log('📝 Testing Slug Generation:');
  console.log('');

  // Generate slugs locally (simulating the server logic)
  testInvestments.forEach((inv, i) => {
    const slug = inv.name
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, '')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-+|-+$/g, '');

    const match = slug === inv.expected_slug ? '✅' : '❌';
    console.log(`   ${i + 1}. "${inv.name}"`);
    console.log(`      → Generated: "${slug}"`);
    console.log(`      → Expected:  "${inv.expected_slug}" ${match}`);
    console.log('');
  });
}

async function testSaveInvestments() {
  console.log('💾 Testing Save Investments with Slug Generation:');
  console.log('');

  try {
    const response = await fetch(`${API_BASE}/configure/save-investments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(
        testInvestments.map(inv => ({
          name: inv.name,
          investment_group: 'Test Group',
          investment_type: 'Test',
          status: 'active',
        }))
      ),
    });

    const result = await response.json();

    if (result.success) {
      console.log(`   ✅ Saved ${testInvestments.length} investments`);
      console.log('');
      console.log('   Investments with generated slugs:');
      result.data.investments.forEach((inv, i) => {
        console.log(`      ${i + 1}. "${inv.name}" → "${inv.slug}"`);
      });
      console.log('');
      return result.data.investments;
    } else {
      console.error(`   ❌ Failed: ${result.error}`);
      console.error(`   Message: ${result.message}`);
      console.log('');
      return [];
    }
  } catch (error) {
    console.error(`   ❌ Error: ${error.message}`);
    console.log('');
    return [];
  }
}

async function testNameMapping(rawName, slug) {
  console.log(`🔗 Testing Name Mapping: "${rawName}" → "${slug}"`);
  console.log('');

  try {
    const response = await fetch(`${API_BASE}/configure/map-investment-name`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ raw_name: rawName, slug }),
    });

    const result = await response.json();

    if (result.success) {
      console.log(`   ✅ ${result.message}`);
      console.log('');
      return true;
    } else {
      console.error(`   ❌ Failed: ${result.error}`);
      console.error(`   Message: ${result.message}`);
      console.log('');
      return false;
    }
  } catch (error) {
    console.error(`   ❌ Error: ${error.message}`);
    console.log('');
    return false;
  }
}

async function testSlugResolution(rawName) {
  console.log(`🔍 Testing Slug Resolution: "${rawName}"`);
  console.log('');

  try {
    const response = await fetch(`${API_BASE}/configure/resolve-investment-slug`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ raw_name: rawName }),
    });

    const result = await response.json();

    if (result.success) {
      if (result.data.slug) {
        console.log(`   ✅ Resolved: "${rawName}" → "${result.data.slug}"`);
        console.log(`   Canonical name: "${result.data.canonical_name}"`);
      } else {
        console.log(`   ⚠️  Unmapped: "${rawName}" (flag for review)`);
      }
      console.log('');
      return result.data.slug;
    } else {
      console.error(`   ❌ Failed: ${result.error}`);
      console.log('');
      return null;
    }
  } catch (error) {
    console.error(`   ❌ Error: ${error.message}`);
    console.log('');
    return null;
  }
}

async function testGetVariations(slug) {
  console.log(`📋 Testing Get Variations for slug: "${slug}"`);
  console.log('');

  try {
    const response = await fetch(`${API_BASE}/configure/investment-variations/${slug}`);
    const result = await response.json();

    if (result.success) {
      console.log(`   ✅ Canonical name: "${result.data.canonical_name}"`);
      console.log(`   Name variations (${result.data.variations.length}):`);
      result.data.variations.forEach((name, i) => {
        console.log(`      ${i + 1}. "${name}"`);
      });
      console.log('');
      return result.data.variations;
    } else {
      console.error(`   ❌ Failed: ${result.error}`);
      console.log('');
      return [];
    }
  } catch (error) {
    console.error(`   ❌ Error: ${error.message}`);
    console.log('');
    return [];
  }
}

async function runTests() {
  // Test 1: Slug generation logic
  await testSlugGeneration();

  // Test 2: Save investments (generates slugs automatically)
  const savedInvestments = await testSaveInvestments();

  if (savedInvestments.length === 0) {
    console.log('⚠️  Skipping remaining tests (save failed)');
    return;
  }

  // Test 3: Map Hebrew variation to English canonical slug
  const englishSlug = savedInvestments.find(inv => inv.name === 'Faro-Point FRG-X')?.slug;
  if (englishSlug) {
    await testNameMapping('פארופוינט FRG-X', englishSlug);
  }

  // Test 4: Map name with extra whitespace
  const ibiSlug = savedInvestments.find(inv => inv.name.startsWith('IBI'))?.slug;
  if (ibiSlug) {
    await testNameMapping('IBI', ibiSlug);
  }

  // Test 5: Test resolution for canonical name
  await testSlugResolution('Faro-Point FRG-X');

  // Test 6: Test resolution for Hebrew variation
  await testSlugResolution('פארופוינט FRG-X');

  // Test 7: Test resolution for unmapped name
  await testSlugResolution('Unknown Investment XYZ');

  // Test 8: Get all variations for a slug
  if (englishSlug) {
    await testGetVariations(englishSlug);
  }

  console.log('═══════════════════════════════════════════════════════════════');
  console.log('');
  console.log('✅ All tests complete!');
  console.log('');
  console.log('Key takeaways:');
  console.log('  - Slugs are generated automatically on investment save');
  console.log('  - Hebrew characters are removed (only alphanumeric kept)');
  console.log('  - Name variations can be mapped to canonical slugs');
  console.log('  - Unmapped names return null (flag for review)');
  console.log('  - Slug resolution enables accurate deduplication');
  console.log('');
}

// Run tests
runTests().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
