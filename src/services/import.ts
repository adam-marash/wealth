/**
 * Transaction Import Service
 * Handles importing validated transactions into the database
 */

import type { NormalizedTransaction } from './normalize';
import type { DedupResult } from './deduplication';

/**
 * Transaction ready for import
 */
export interface ImportTransaction {
  normalized: NormalizedTransaction;
  dedup: DedupResult;
  metadata?: Record<string, any>; // Original row data
}

/**
 * Import options
 */
export interface ImportOptions {
  source_file?: string;
  skip_duplicates?: boolean; // Skip exact duplicates (default: true)
  force_import?: boolean; // Import even with issues (default: false)
}

/**
 * Import result for a single transaction
 */
export interface TransactionImportResult {
  success: boolean;
  transaction_id?: number;
  error?: string;
  skipped?: boolean;
  reason?: string;
}

/**
 * Overall import summary
 */
export interface ImportSummary {
  total: number;
  imported: number;
  skipped: number;
  failed: number;
  transaction_ids: number[];
  errors: Array<{
    index: number;
    error: string;
  }>;
}

/**
 * Look up investment ID from slug
 */
async function resolveInvestmentId(
  db: D1Database,
  slug: string | null
): Promise<number | null> {
  if (!slug) {
    return null;
  }

  const result = await db.prepare(`
    SELECT id FROM investments WHERE slug = ?
  `).bind(slug).first<{ id: number }>();

  return result?.id || null;
}

/**
 * Import a single transaction
 */
export async function importTransaction(
  db: D1Database,
  transaction: ImportTransaction,
  options: ImportOptions = {}
): Promise<TransactionImportResult> {
  const { normalized, dedup, metadata } = transaction;
  const { source_file, skip_duplicates = true } = options;

  // Check if duplicate and should skip
  if (skip_duplicates && dedup.is_duplicate) {
    return {
      success: false,
      skipped: true,
      reason: `Duplicate of transaction #${dedup.duplicate_id}`,
    };
  }

  // Resolve investment_id from slug
  const investment_id = await resolveInvestmentId(db, normalized.investment_slug);

  // Prepare metadata JSON
  const metadataJson = metadata ? JSON.stringify(metadata) : null;

  try {
    // Insert transaction
    const result = await db.prepare(`
      INSERT INTO transactions (
        date,
        description,
        transaction_type_raw,
        transaction_category,
        cash_flow_direction,
        amount_original,
        amount_normalized,
        original_currency,
        amount_usd,
        amount_ils,
        exchange_rate_to_ils,
        investment_id,
        counterparty,
        dedup_hash,
        metadata,
        source_file
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      normalized.date_iso,
      null, // description - not in normalized yet
      null, // transaction_type_raw - not in normalized yet
      normalized.transaction_category,
      normalized.cash_flow_direction,
      normalized.amount_original,
      normalized.amount_normalized,
      normalized.original_currency,
      normalized.amount_usd,
      normalized.amount_ils,
      normalized.exchange_rate_to_ils,
      investment_id,
      normalized.counterparty_normalized,
      dedup.hash,
      metadataJson,
      source_file || null
    ).run();

    return {
      success: true,
      transaction_id: result.meta.last_row_id,
    };
  } catch (error) {
    console.error('Failed to import transaction:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Import multiple transactions in a batch
 * Uses D1 batch API for better performance
 *
 * @param db D1 database instance
 * @param transactions Array of transactions to import
 * @param options Import options
 * @returns Import summary
 */
export async function importTransactions(
  db: D1Database,
  transactions: ImportTransaction[],
  options: ImportOptions = {}
): Promise<ImportSummary> {
  const { source_file, skip_duplicates = true, force_import = false } = options;

  const summary: ImportSummary = {
    total: transactions.length,
    imported: 0,
    skipped: 0,
    failed: 0,
    transaction_ids: [],
    errors: [],
  };

  // Filter transactions
  const toImport: Array<{ index: number; transaction: ImportTransaction }> = [];

  for (let i = 0; i < transactions.length; i++) {
    const transaction = transactions[i]!;

    // Skip duplicates if configured
    if (skip_duplicates && transaction.dedup.is_duplicate) {
      summary.skipped++;
      continue;
    }

    // Skip transactions with issues unless force_import
    if (!force_import && (!transaction.normalized.date_iso || transaction.normalized.amount_original === null)) {
      summary.skipped++;
      continue;
    }

    toImport.push({ index: i, transaction });
  }

  // Prepare batch insert statements
  const batchStatements = [];

  for (const { index, transaction } of toImport) {
    const { normalized, dedup, metadata } = transaction;

    // Resolve investment_id from slug
    const investment_id = await resolveInvestmentId(db, normalized.investment_slug);

    // Prepare metadata JSON
    const metadataJson = metadata ? JSON.stringify(metadata) : null;

    // Add to batch
    batchStatements.push(
      db.prepare(`
        INSERT INTO transactions (
          date,
          description,
          transaction_type_raw,
          transaction_category,
          cash_flow_direction,
          amount_original,
          amount_normalized,
          original_currency,
          amount_usd,
          amount_ils,
          exchange_rate_to_ils,
          investment_id,
          counterparty,
          dedup_hash,
          metadata,
          source_file
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).bind(
        normalized.date_iso,
        null, // description - not in normalized yet
        null, // transaction_type_raw - not in normalized yet
        normalized.transaction_category,
        normalized.cash_flow_direction,
        normalized.amount_original,
        normalized.amount_normalized,
        normalized.original_currency,
        normalized.amount_usd,
        normalized.amount_ils,
        normalized.exchange_rate_to_ils,
        investment_id,
        normalized.counterparty_normalized,
        dedup.hash,
        metadataJson,
        source_file || null
      )
    );
  }

  // Execute batch
  if (batchStatements.length > 0) {
    try {
      const results = await db.batch(batchStatements);

      for (let i = 0; i < results.length; i++) {
        const result = results[i]!;
        if (result.success) {
          summary.imported++;
          if (result.meta?.last_row_id) {
            summary.transaction_ids.push(result.meta.last_row_id);
          }
        } else {
          summary.failed++;
          summary.errors.push({
            index: toImport[i]!.index,
            error: result.error || 'Unknown error',
          });
        }
      }
    } catch (error) {
      console.error('Batch import failed:', error);
      summary.failed = batchStatements.length;
      summary.errors.push({
        index: -1,
        error: error instanceof Error ? error.message : 'Batch execution failed',
      });
    }
  }

  // TODO: Phase detection auto-update after import
  // Phase is now manually set in investment edit form
  // Could re-implement phase detection logic here in the future if needed

  return summary;
}
