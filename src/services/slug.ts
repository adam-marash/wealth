/**
 * Slug Service
 * Handles generation and resolution of investment slugs
 * Enables mapping multiple name variations to canonical identifiers
 */

/**
 * Generate a URL-safe slug from an investment name
 *
 * Rules:
 * - Convert to lowercase
 * - Remove non-alphanumeric characters (except spaces and hyphens)
 * - Replace spaces with hyphens
 * - Collapse multiple hyphens into one
 * - Trim hyphens from start and end
 *
 * Examples:
 * - "Faro-Point FRG-X" → "faro-point-frg-x"
 * - "פארופוינט FRG-X" → "frg-x" (Hebrew removed, only alphanumeric kept)
 * - "Migdal Insurance" → "migdal-insurance"
 * - "IBI  " → "ibi" (whitespace trimmed)
 *
 * @param name Raw investment name
 * @returns URL-safe slug
 */
export function generateSlug(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '') // Remove non-alphanumeric (keeps spaces and hyphens)
    .replace(/\s+/g, '-')          // Replace spaces with hyphens
    .replace(/-+/g, '-')           // Collapse multiple hyphens
    .replace(/^-+|-+$/g, '');      // Trim hyphens from start/end
}

/**
 * Resolve a raw investment name to its canonical slug
 *
 * Lookup order:
 * 1. Check investment_name_mappings table (raw_name → slug)
 * 2. Check investments table (name → slug)
 * 3. Return null if not found (flag for review)
 *
 * @param db D1 database instance
 * @param rawName Raw investment name from Excel
 * @returns Canonical slug or null if unmapped
 */
export async function resolveInvestmentSlug(
  db: D1Database,
  rawName: string | null
): Promise<string | null> {
  if (!rawName) {
    return null;
  }

  const trimmed = rawName.trim();

  // 1. Check name mappings first (handles variations)
  const mapping = await db.prepare(`
    SELECT investment_slug
    FROM investment_name_mappings
    WHERE raw_name = ?
  `).bind(trimmed).first<{ investment_slug: string }>();

  if (mapping) {
    return mapping.investment_slug;
  }

  // 2. Check if it matches a canonical investment name
  const investment = await db.prepare(`
    SELECT slug
    FROM investments
    WHERE name = ? AND slug IS NOT NULL
  `).bind(trimmed).first<{ slug: string }>();

  if (investment) {
    return investment.slug;
  }

  // 3. Not found - flag for review
  return null;
}

/**
 * Create a mapping from a raw name to an investment slug
 *
 * Used during:
 * - Initial investment configuration (canonical name → slug)
 * - Data review workflow (user maps variation → existing slug)
 *
 * @param db D1 database instance
 * @param rawName Raw investment name from Excel
 * @param slug Canonical slug to map to
 */
export async function mapInvestmentName(
  db: D1Database,
  rawName: string,
  slug: string
): Promise<void> {
  const trimmed = rawName.trim();

  await db.prepare(`
    INSERT INTO investment_name_mappings (raw_name, investment_slug)
    VALUES (?, ?)
    ON CONFLICT(raw_name) DO UPDATE SET
      investment_slug = excluded.investment_slug,
      updated_at = datetime('now')
  `).bind(trimmed, slug).run();
}

/**
 * Get all name mappings for a specific slug
 * Useful for displaying all known variations of an investment
 *
 * @param db D1 database instance
 * @param slug Investment slug
 * @returns Array of raw names mapped to this slug
 */
export async function getInvestmentNameVariations(
  db: D1Database,
  slug: string
): Promise<string[]> {
  const results = await db.prepare(`
    SELECT raw_name
    FROM investment_name_mappings
    WHERE investment_slug = ?
    ORDER BY raw_name
  `).bind(slug).all<{ raw_name: string }>();

  return results.results.map(r => r.raw_name);
}

/**
 * Batch resolve multiple raw names to slugs
 * More efficient than calling resolveInvestmentSlug in a loop
 *
 * @param db D1 database instance
 * @param rawNames Array of raw investment names
 * @returns Map of raw name → slug (null if unmapped)
 */
export async function batchResolveInvestmentSlugs(
  db: D1Database,
  rawNames: string[]
): Promise<Map<string, string | null>> {
  const result = new Map<string, string | null>();

  if (rawNames.length === 0) {
    return result;
  }

  // Trim and deduplicate
  const trimmed = Array.from(new Set(rawNames.map(n => n.trim())));

  // Build placeholders for SQL IN clause
  const placeholders = trimmed.map(() => '?').join(',');

  // Get all mappings in one query
  const mappings = await db.prepare(`
    SELECT raw_name, investment_slug
    FROM investment_name_mappings
    WHERE raw_name IN (${placeholders})
  `).bind(...trimmed).all<{ raw_name: string; investment_slug: string }>();

  // Build result map
  for (const name of trimmed) {
    const mapping = mappings.results.find(m => m.raw_name === name);
    result.set(name, mapping ? mapping.investment_slug : null);
  }

  // For unmapped names, check investments table
  const unmapped = trimmed.filter(name => !result.has(name) || result.get(name) === null);

  if (unmapped.length > 0) {
    const invPlaceholders = unmapped.map(() => '?').join(',');
    const investments = await db.prepare(`
      SELECT name, slug
      FROM investments
      WHERE name IN (${invPlaceholders}) AND slug IS NOT NULL
    `).bind(...unmapped).all<{ name: string; slug: string }>();

    for (const inv of investments.results) {
      result.set(inv.name, inv.slug);
    }

    // Set remaining unmapped to null
    for (const name of unmapped) {
      if (!result.has(name)) {
        result.set(name, null);
      }
    }
  }

  return result;
}

/**
 * Check if a slug is already in use
 * Used during investment creation to prevent conflicts
 *
 * @param db D1 database instance
 * @param slug Slug to check
 * @returns true if slug exists, false otherwise
 */
export async function slugExists(
  db: D1Database,
  slug: string
): Promise<boolean> {
  const result = await db.prepare(`
    SELECT 1 FROM investments WHERE slug = ?
  `).bind(slug).first();

  return result !== null;
}

/**
 * Generate a unique slug by appending a number if necessary
 *
 * Examples:
 * - "faro-point" → "faro-point" (if available)
 * - "faro-point" → "faro-point-2" (if "faro-point" exists)
 * - "faro-point" → "faro-point-3" (if "faro-point-2" exists)
 *
 * @param db D1 database instance
 * @param baseName Base name to generate slug from
 * @returns Unique slug
 */
export async function generateUniqueSlug(
  db: D1Database,
  baseName: string
): Promise<string> {
  let slug = generateSlug(baseName);
  let counter = 2;

  while (await slugExists(db, slug)) {
    // Remove previous number suffix if it exists
    const baseSlug = slug.replace(/-\d+$/, '');
    slug = `${baseSlug}-${counter}`;
    counter++;
  }

  return slug;
}
