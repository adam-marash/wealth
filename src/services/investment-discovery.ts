/**
 * Investment Discovery Service
 *
 * Phase 1 of CSV import: Discovers investments in the uploaded file
 * and checks which ones already exist in the database.
 */

import type { D1Database } from '@cloudflare/workers-types';

export interface InvestmentTriplet {
  name: string;           // תאור
  counterparty: string;   // גוף מנהל
  productType: string;    // סוג מוצר
}

export interface InvestmentDiscoveryResult {
  existingInvestments: Array<InvestmentTriplet & { id: number }>;
  newInvestments: InvestmentTriplet[];
  totalFound: number;
  stats: {
    existing: number;
    new: number;
  };
}

/**
 * Extract unique investment triplets from CSV data
 *
 * @param rows Array of row objects from CSV parser
 * @returns Array of unique investment triplets
 */
export function extractInvestmentTriplets(rows: Record<string, any>[]): InvestmentTriplet[] {
  const uniqueTriplets = new Map<string, InvestmentTriplet>();

  for (const row of rows) {
    const name = row['תאור']?.toString().trim();
    const counterparty = row['גוף מנהל']?.toString().trim();
    const productType = row['סוג מוצר']?.toString().trim();

    // Skip rows with missing required fields
    if (!name || !counterparty || !productType) {
      continue;
    }

    // Create unique key for deduplication
    const key = `${name}|${counterparty}|${productType}`;

    // Store unique triplets
    if (!uniqueTriplets.has(key)) {
      uniqueTriplets.set(key, {
        name,
        counterparty,
        productType,
      });
    }
  }

  return Array.from(uniqueTriplets.values());
}

/**
 * Discover investments in CSV file and check which exist in database
 *
 * @param db D1 database instance
 * @param rows Array of row objects from CSV parser
 * @returns Discovery result with existing and new investments
 */
export async function discoverInvestments(
  db: D1Database,
  rows: Record<string, any>[]
): Promise<InvestmentDiscoveryResult> {
  console.log('[Investment Discovery] Starting discovery...');

  // Extract unique triplets from CSV
  const triplets = extractInvestmentTriplets(rows);
  console.log(`[Investment Discovery] Found ${triplets.length} unique investment triplets`);

  if (triplets.length === 0) {
    return {
      existingInvestments: [],
      newInvestments: [],
      totalFound: 0,
      stats: {
        existing: 0,
        new: 0,
      },
    };
  }

  // Query database to find existing investments
  // We match by name since that's the primary identifier
  const names = triplets.map(t => t.name);
  const placeholders = names.map(() => '?').join(',');

  const query = `
    SELECT id, name, product_type
    FROM investments
    WHERE name IN (${placeholders})
  `;

  const result = await db.prepare(query).bind(...names).all();
  const existingInvestmentsMap = new Map<string, { id: number; name: string; product_type: string }>();

  for (const row of result.results || []) {
    existingInvestmentsMap.set(row.name as string, {
      id: row.id as number,
      name: row.name as string,
      product_type: row.product_type as string,
    });
  }

  // Separate existing and new investments
  const existingInvestments: Array<InvestmentTriplet & { id: number }> = [];
  const newInvestments: InvestmentTriplet[] = [];

  for (const triplet of triplets) {
    const existing = existingInvestmentsMap.get(triplet.name);

    if (existing) {
      existingInvestments.push({
        ...triplet,
        id: existing.id,
      });
    } else {
      newInvestments.push(triplet);
    }
  }

  console.log(`[Investment Discovery] ${existingInvestments.length} existing, ${newInvestments.length} new`);

  return {
    existingInvestments,
    newInvestments,
    totalFound: triplets.length,
    stats: {
      existing: existingInvestments.length,
      new: newInvestments.length,
    },
  };
}

/**
 * Create new investments in the database
 *
 * @param db D1 database instance
 * @param investments Array of investment triplets to create
 * @returns Array of created investment IDs
 */
export async function createInvestments(
  db: D1Database,
  investments: InvestmentTriplet[]
): Promise<number[]> {
  console.log(`[Investment Discovery] Creating ${investments.length} new investments...`);

  const createdIds: number[] = [];

  for (const investment of investments) {
    const query = `
      INSERT INTO investments (name, product_type, status)
      VALUES (?, ?, 'active')
      RETURNING id
    `;

    const result = await db
      .prepare(query)
      .bind(investment.name, investment.productType)
      .first<{ id: number }>();

    if (result?.id) {
      createdIds.push(result.id);
      console.log(`[Investment Discovery] Created investment: ${investment.name} (ID: ${result.id})`);
    }
  }

  console.log(`[Investment Discovery] Created ${createdIds.length} investments`);
  return createdIds;
}
