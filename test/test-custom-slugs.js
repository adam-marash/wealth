/**
 * Test custom slug support for operators
 * Tests both auto-generation and custom slug assignment
 */

const API_BASE = 'http://localhost:8788/api';

async function testCustomSlugs() {
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('  CUSTOM SLUG TEST');
  console.log('═══════════════════════════════════════════════════════════════\n');

  try {
    // Clear database
    console.log('🗑️  Step 1: Clear database...\n');

    // Test 1: Auto-generated slugs (no slug provided)
    console.log('📝 Test 1: Auto-generated slugs (Hebrew names)...\n');

    const autoGenInvestments = [
      { name: 'אימפקט חוב', investment_type: 'Other', status: 'active' },
      { name: 'Faro-Point FRG-X', investment_type: 'Other', status: 'active' }
    ];

    const autoResponse = await fetch(`${API_BASE}/configure/save-investments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(autoGenInvestments),
    });

    const autoResult = await autoResponse.json();

    if (!autoResult.success) {
      console.error('   ❌ Failed:', autoResult.error);
      return false;
    }

    console.log('   ✅ Auto-generated slugs:');
    autoResult.data.investments.forEach((inv, i) => {
      console.log(`      ${i + 1}. "${inv.name}" → "${inv.slug}" (custom: ${inv.slug_was_custom})`);
    });
    console.log('');

    // Verify slugs were transliterated properly
    const expectedSlugs = {
      'אימפקט חוב': 'aympkt-hvb',
      'Faro-Point FRG-X': 'faro-point-frg-x'
    };

    for (const inv of autoResult.data.investments) {
      if (expectedSlugs[inv.name] !== inv.slug) {
        console.error(`   ❌ Slug mismatch: "${inv.name}" → "${inv.slug}" (expected "${expectedSlugs[inv.name]}")`);
        return false;
      }
    }

    console.log('   ✅ All slugs match expected transliterations\n');

    // Test 2: Custom slugs (operator-provided)
    console.log('📝 Test 2: Custom slugs (operator overrides)...\n');

    const customInvestments = [
      { name: 'אימפקט חוב מורחב', slug: 'impact-debt', investment_type: 'Other', status: 'active' },
      { name: 'Another Hebrew Fund שקלים', slug: 'shekel-fund', investment_type: 'Other', status: 'active' }
    ];

    const customResponse = await fetch(`${API_BASE}/configure/save-investments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(customInvestments),
    });

    const customResult = await customResponse.json();

    if (!customResult.success) {
      console.error('   ❌ Failed:', customResult.error);
      return false;
    }

    console.log('   ✅ Custom slugs:');
    customResult.data.investments.forEach((inv, i) => {
      console.log(`      ${i + 1}. "${inv.name}" → "${inv.slug}" (custom: ${inv.slug_was_custom})`);
    });
    console.log('');

    // Verify custom slugs were used
    for (const inv of customResult.data.investments) {
      if (!inv.slug_was_custom) {
        console.error(`   ❌ Expected custom slug but got auto-generated for "${inv.name}"`);
        return false;
      }
    }

    console.log('   ✅ All custom slugs were accepted\n');

    // Test 3: Custom slug with special characters (should be sanitized)
    console.log('📝 Test 3: Custom slug sanitization...\n');

    const dirtyInvestments = [
      { name: 'Test Fund', slug: 'My Custom Slug!@# 123', investment_type: 'Other', status: 'active' }
    ];

    const dirtyResponse = await fetch(`${API_BASE}/configure/save-investments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(dirtyInvestments),
    });

    const dirtyResult = await dirtyResponse.json();

    if (!dirtyResult.success) {
      console.error('   ❌ Failed:', dirtyResult.error);
      return false;
    }

    console.log('   ✅ Sanitized slug:');
    console.log(`      Original: "My Custom Slug!@# 123"`);
    console.log(`      Sanitized: "${dirtyResult.data.investments[0].slug}"`);
    console.log(`      Custom: ${dirtyResult.data.investments[0].slug_was_custom}`);
    console.log('');

    // Verify slug was sanitized to "my-custom-slug-123"
    if (dirtyResult.data.investments[0].slug !== 'my-custom-slug-123') {
      console.error(`   ❌ Expected "my-custom-slug-123" but got "${dirtyResult.data.investments[0].slug}"`);
      return false;
    }

    console.log('   ✅ Slug was properly sanitized\n');

    // Test 4: Duplicate custom slug (should get numbered)
    console.log('📝 Test 4: Duplicate slug handling...\n');

    const duplicateInvestments = [
      { name: 'Another Impact Fund', slug: 'impact-debt', investment_type: 'Other', status: 'active' }
    ];

    const dupResponse = await fetch(`${API_BASE}/configure/save-investments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(duplicateInvestments),
    });

    const dupResult = await dupResponse.json();

    if (!dupResult.success) {
      console.error('   ❌ Failed:', dupResult.error);
      return false;
    }

    console.log('   ✅ Duplicate slug resolution:');
    console.log(`      Requested: "impact-debt"`);
    console.log(`      Assigned: "${dupResult.data.investments[0].slug}"`);
    console.log(`      Custom: ${dupResult.data.investments[0].slug_was_custom}`);
    console.log('');

    // Verify slug was made unique by adding -2
    if (dupResult.data.investments[0].slug !== 'impact-debt-2') {
      console.error(`   ❌ Expected "impact-debt-2" but got "${dupResult.data.investments[0].slug}"`);
      return false;
    }

    console.log('   ✅ Duplicate slug was numbered correctly\n');

    // Test 5: Mixed auto and custom
    console.log('📝 Test 5: Mixed auto-generated and custom slugs...\n');

    const mixedInvestments = [
      { name: 'קרן א', investment_type: 'Other', status: 'active' },  // Auto
      { name: 'קרן ב', slug: 'fund-b', investment_type: 'Other', status: 'active' },  // Custom
      { name: 'קרן ג', investment_type: 'Other', status: 'active' }   // Auto
    ];

    const mixedResponse = await fetch(`${API_BASE}/configure/save-investments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(mixedInvestments),
    });

    const mixedResult = await mixedResponse.json();

    if (!mixedResult.success) {
      console.error('   ❌ Failed:', mixedResult.error);
      return false;
    }

    console.log('   ✅ Mixed slugs:');
    mixedResult.data.investments.forEach((inv, i) => {
      const type = inv.slug_was_custom ? 'CUSTOM' : 'AUTO';
      console.log(`      ${i + 1}. "${inv.name}" → "${inv.slug}" [${type}]`);
    });
    console.log('');

    console.log('═══════════════════════════════════════════════════════════════');
    console.log('  ✅ ALL TESTS PASSED');
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

testCustomSlugs().then(success => {
  process.exit(success ? 0 : 1);
}).catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
