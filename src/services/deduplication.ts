/**
 * Deduplication Service
 * Detects and prevents duplicate transaction imports
 */

import type { NormalizedTransaction } from './normalize';

/**
 * Generate deduplication hash for a transaction
 *
 * Hash formula: sha256(date_iso|amount_original|investment_slug)
 *
 * Rationale:
 * - date_iso: Normalized date (YYYY-MM-DD)
 * - amount_original: Original amount before directionality adjustment
 * - investment_slug: Canonical slug (handles name variations)
 * - Counterparty removed (redundant with investment, 58% match rate)
 *
 * @param transaction Normalized transaction data
 * @returns SHA-256 hash or null if missing required fields
 */
export async function generateDedupHash(
  transaction: Pick<NormalizedTransaction, 'date_iso' | 'amount_original' | 'investment_slug'>
): Promise<string | null> {
  const { date_iso, amount_original, investment_slug } = transaction;

  // Require all fields for hash generation
  if (!date_iso || amount_original === null || !investment_slug) {
    return null;
  }

  // Create hash input string
  const hashInput = `${date_iso}|${amount_original}|${investment_slug}`;

  // Generate SHA-256 hash
  const encoder = new TextEncoder();
  const data = encoder.encode(hashInput);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);

  // Convert to hex string
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');

  return hashHex;
}

/**
 * Check if a transaction is a duplicate
 *
 * @param db D1 database instance
 * @param hash Deduplication hash
 * @returns Duplicate transaction if found, null otherwise
 */
export async function checkDuplicate(
  db: D1Database,
  hash: string
): Promise<{
  id: number;
  date: string;
  amount: number;
  investment_id: number;
  created_at: string;
} | null> {
  const result = await db.prepare(`
    SELECT id, date, amount, investment_id, created_at
    FROM transactions
    WHERE dedup_hash = ?
    LIMIT 1
  `).bind(hash).first<{
    id: number;
    date: string;
    amount: number;
    investment_id: number;
    created_at: string;
  }>();

  return result || null;
}

/**
 * Find all duplicates for a set of transactions
 * Useful for batch import preview
 *
 * @param db D1 database instance
 * @param hashes Array of dedup hashes
 * @returns Map of hash → duplicate transaction
 */
export async function batchCheckDuplicates(
  db: D1Database,
  hashes: string[]
): Promise<Map<string, {
  id: number;
  date: string;
  amount: number;
  investment_id: number;
  created_at: string;
}>> {
  const result = new Map();

  if (hashes.length === 0) {
    return result;
  }

  // Build placeholders for SQL IN clause
  const placeholders = hashes.map(() => '?').join(',');

  const duplicates = await db.prepare(`
    SELECT id, date, amount, investment_id, created_at, dedup_hash
    FROM transactions
    WHERE dedup_hash IN (${placeholders})
  `).bind(...hashes).all<{
    id: number;
    date: string;
    amount: number;
    investment_id: number;
    created_at: string;
    dedup_hash: string;
  }>();

  for (const dup of duplicates.results) {
    result.set(dup.dedup_hash, {
      id: dup.id,
      date: dup.date,
      amount: dup.amount,
      investment_id: dup.investment_id,
      created_at: dup.created_at,
    });
  }

  return result;
}

/**
 * Calculate similarity score between two transactions
 * Used for detecting near-duplicates (fuzzy matching)
 *
 * Scoring:
 * - Same date: +40 points
 * - Amount within 1%: +40 points
 * - Same investment_slug: +20 points
 * - Total: 0-100 score
 *
 * @param tx1 First transaction
 * @param tx2 Second transaction
 * @returns Similarity score (0-100)
 */
export function calculateSimilarity(
  tx1: Pick<NormalizedTransaction, 'date_iso' | 'amount_original' | 'investment_slug'>,
  tx2: Pick<NormalizedTransaction, 'date_iso' | 'amount_original' | 'investment_slug'>
): number {
  let score = 0;

  // Same date: +40
  if (tx1.date_iso && tx2.date_iso && tx1.date_iso === tx2.date_iso) {
    score += 40;
  }

  // Amount similarity: +40 if within 1%
  if (tx1.amount_original !== null && tx2.amount_original !== null) {
    const diff = Math.abs(tx1.amount_original - tx2.amount_original);
    const avg = (Math.abs(tx1.amount_original) + Math.abs(tx2.amount_original)) / 2;
    const percentDiff = avg > 0 ? (diff / avg) * 100 : 0;

    if (percentDiff < 1) {
      score += 40;
    } else if (percentDiff < 5) {
      score += 20;
    } else if (percentDiff < 10) {
      score += 10;
    }
  }

  // Same investment: +20
  if (tx1.investment_slug && tx2.investment_slug && tx1.investment_slug === tx2.investment_slug) {
    score += 20;
  }

  return score;
}

/**
 * Find similar transactions (potential duplicates)
 * Returns transactions with similarity score > threshold
 *
 * @param db D1 database instance
 * @param transaction Transaction to check
 * @param threshold Minimum similarity score (default: 80)
 * @returns Array of similar transactions with scores
 */
export async function findSimilarTransactions(
  db: D1Database,
  transaction: Pick<NormalizedTransaction, 'date_iso' | 'amount_original' | 'investment_slug'>,
  threshold: number = 80
): Promise<Array<{
  id: number;
  date: string;
  amount: number;
  investment_id: number;
  similarity_score: number;
}>> {
  if (!transaction.date_iso || transaction.amount_original === null) {
    return [];
  }

  // Find transactions within +/- 7 days with similar amounts
  const dateStart = new Date(transaction.date_iso);
  dateStart.setDate(dateStart.getDate() - 7);
  const dateEnd = new Date(transaction.date_iso);
  dateEnd.setDate(dateEnd.getDate() + 7);

  const amountMin = transaction.amount_original * 0.9;
  const amountMax = transaction.amount_original * 1.1;

  const candidates = await db.prepare(`
    SELECT t.id, t.date, t.amount, t.investment_id, i.slug as investment_slug
    FROM transactions t
    LEFT JOIN investments i ON t.investment_id = i.id
    WHERE t.date >= ? AND t.date <= ?
      AND t.amount >= ? AND t.amount <= ?
    LIMIT 50
  `).bind(
    dateStart.toISOString().split('T')[0],
    dateEnd.toISOString().split('T')[0],
    amountMin,
    amountMax
  ).all<{
    id: number;
    date: string;
    amount: number;
    investment_id: number;
    investment_slug: string | null;
  }>();

  // Calculate similarity scores
  const similar = candidates.results
    .map(candidate => {
      const score = calculateSimilarity(transaction, {
        date_iso: candidate.date,
        amount_original: candidate.amount,
        investment_slug: candidate.investment_slug,
      });

      return {
        id: candidate.id,
        date: candidate.date,
        amount: candidate.amount,
        investment_id: candidate.investment_id,
        similarity_score: score,
      };
    })
    .filter(candidate => candidate.similarity_score >= threshold)
    .sort((a, b) => b.similarity_score - a.similarity_score);

  return similar;
}

/**
 * Deduplication result for a transaction
 */
export interface DedupResult {
  hash: string | null;
  is_duplicate: boolean;
  duplicate_id?: number;
  similar_transactions?: Array<{
    id: number;
    date: string;
    amount: number;
    investment_id: number;
    similarity_score: number;
  }>;
  needs_review: boolean;
}

/**
 * Comprehensive deduplication check
 * Combines exact hash matching with fuzzy similarity detection
 *
 * @param db D1 database instance
 * @param transaction Normalized transaction
 * @param checkSimilarity Whether to check for similar transactions (default: true)
 * @returns Deduplication result
 */
export async function checkDeduplication(
  db: D1Database,
  transaction: NormalizedTransaction,
  checkSimilarity: boolean = true
): Promise<DedupResult> {
  // Generate hash
  const hash = await generateDedupHash(transaction);

  // If no hash (missing fields), flag for review
  if (!hash) {
    return {
      hash: null,
      is_duplicate: false,
      needs_review: true,
    };
  }

  // Check for exact duplicate
  const duplicate = await checkDuplicate(db, hash);

  if (duplicate) {
    return {
      hash,
      is_duplicate: true,
      duplicate_id: duplicate.id,
      needs_review: true, // User should confirm it's really a duplicate
    };
  }

  // Check for similar transactions (fuzzy matching)
  let similar: DedupResult['similar_transactions'] = [];
  if (checkSimilarity) {
    similar = await findSimilarTransactions(db, transaction, 80);
  }

  return {
    hash,
    is_duplicate: false,
    similar_transactions: similar.length > 0 ? similar : undefined,
    needs_review: similar.length > 0, // Review if similar found
  };
}
