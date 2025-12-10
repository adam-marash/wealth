/**
 * Transaction Import Service
 *
 * Phase 2 of CSV import: Imports transactions using static mappings
 */

import type { D1Database } from '@cloudflare/workers-types';
import type { Env } from '../types';
import { getTransactionTypeByHebrew } from '../config/transaction-type-mappings';
import { parse as parseDate, format as formatDate } from 'date-fns';
import { getExchangeRate, currencySymbolToCode } from './exchange-rate';

export interface TransactionImportRow {
  date: string;
  investmentName: string;
  counterparty: string;
  transactionType: string;
  amount: number;
  currency: string;
  exchangeRateToIls?: number;
  amountIls?: number;
  originalRow: Record<string, any>;
}

export interface TransactionImportResult {
  imported: number;
  skipped: number;
  errors: Array<{ row: number; error: string }>;
}

/**
 * Parse a date string in various formats
 */
function parseDateValue(value: any): string | null {
  if (!value) return null;

  const str = value.toString().trim();

  // Try ISO format (YYYY-MM-DD)
  if (/^\d{4}-\d{2}-\d{2}/.test(str)) {
    return str.split('T')[0];
  }

  // Try DD/MM/YYYY format
  try {
    const parsed = parseDate(str, 'dd/MM/yyyy', new Date());
    if (!isNaN(parsed.getTime())) {
      return formatDate(parsed, 'yyyy-MM-dd');
    }
  } catch (e) {
    // Continue to next format
  }

  // Try MM/DD/YYYY format
  try {
    const parsed = parseDate(str, 'MM/dd/yyyy', new Date());
    if (!isNaN(parsed.getTime())) {
      return formatDate(parsed, 'yyyy-MM-dd');
    }
  } catch (e) {
    // Continue
  }

  return null;
}

/**
 * Parse a number value (handles commas and various formats)
 */
function parseNumberValue(value: any): number | null {
  if (!value) return null;

  const str = value.toString().trim().replace(/,/g, '');
  const num = parseFloat(str);

  return isNaN(num) ? null : num;
}

/**
 * Generate deduplication hash for a transaction
 */
function generateDedupHash(date: string, amount: number, investmentName: string, counterparty: string): string {
  return `${date}|${amount}|${investmentName}|${counterparty}`;
}

/**
 * Extract transaction data from CSV row using static mappings
 */
export function extractTransactionFromRow(row: Record<string, any>, rowIndex: number): TransactionImportRow | null {
  try {
    // Extract fields using Hebrew column names
    const date = parseDateValue(row['תאריך התנועה']);
    const investmentName = row['תאור']?.toString().trim();
    const counterparty = row['גוף מנהל']?.toString().trim();
    const transactionType = row['סוג תנועה']?.toString().trim();
    const amount = parseNumberValue(row['סכום תנועה במטבע']);
    const currency = row['מטבע התנועה']?.toString().trim();
    const exchangeRateToIls = parseNumberValue(row['שער המרה לתנועה']);
    const amountIls = parseNumberValue(row['סכום תנועה בש"ח']);

    // Validate required fields
    if (!date || !investmentName || !counterparty || !transactionType || amount === null || !currency) {
      console.log(`[Transaction Import] Skipping row ${rowIndex}: missing required fields`);
      return null;
    }

    return {
      date,
      investmentName,
      counterparty,
      transactionType,
      amount,
      currency,
      exchangeRateToIls: exchangeRateToIls ?? undefined,
      amountIls: amountIls ?? undefined,
      originalRow: row,
    };
  } catch (error) {
    console.error(`[Transaction Import] Error extracting row ${rowIndex}:`, error);
    return null;
  }
}

/**
 * Import transactions into the database
 *
 * @param db D1 database instance
 * @param rows Array of row objects from CSV parser
 * @param sourceFile Original filename
 * @returns Import result with statistics
 */
export async function importTransactions(
  db: D1Database,
  rows: Record<string, any>[],
  sourceFile: string,
  env?: Env
): Promise<TransactionImportResult> {
  console.log(`[Transaction Import] Starting import of ${rows.length} rows...`);

  const result: TransactionImportResult = {
    imported: 0,
    skipped: 0,
    errors: [],
  };

  // Get all investments for lookup
  const investmentsQuery = await db.prepare('SELECT id, name FROM investments').all();
  const investmentMap = new Map<string, number>();

  for (const inv of investmentsQuery.results || []) {
    investmentMap.set(inv.name as string, inv.id as number);
  }

  console.log(`[Transaction Import] Loaded ${investmentMap.size} investments for lookup`);

  // Process each row
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const rowIndex = i + 1;

    // Extract transaction data
    const txData = extractTransactionFromRow(row, rowIndex);
    if (!txData) {
      result.skipped++;
      continue;
    }

    try {
      // Look up investment ID
      const investmentId = investmentMap.get(txData.investmentName);
      if (!investmentId) {
        result.errors.push({
          row: rowIndex,
          error: `Investment not found: ${txData.investmentName}`,
        });
        result.skipped++;
        continue;
      }

      // Map transaction type
      const typeMapping = getTransactionTypeByHebrew(txData.transactionType);
      if (!typeMapping) {
        result.errors.push({
          row: rowIndex,
          error: `Unknown transaction type: ${txData.transactionType}`,
        });
        result.skipped++;
        continue;
      }

      // Apply directionality rules
      let amountNormalized = txData.amount;
      let cashFlowDirection = 1;

      if (typeMapping.directionality === 'always_positive') {
        amountNormalized = Math.abs(txData.amount);
        cashFlowDirection = 1;
      } else if (typeMapping.directionality === 'always_negative') {
        amountNormalized = -Math.abs(txData.amount);
        cashFlowDirection = -1;
      } else {
        // as_is
        cashFlowDirection = txData.amount >= 0 ? 1 : -1;
      }

      // Generate deduplication hash
      const dedupHash = generateDedupHash(
        txData.date,
        txData.amount,
        txData.investmentName,
        txData.counterparty
      );

      // Get USD exchange rate and calculate amount_usd
      let amountUsd: number | null = null;
      const currencyCode = currencySymbolToCode(txData.currency);

      if (currencyCode === 'USD') {
        // Already in USD
        amountUsd = Math.abs(amountNormalized);
      } else {
        // Fetch exchange rate for original currency to USD
        const exchangeRate = await getExchangeRate(db, txData.date, currencyCode, 'USD', env);

        if (exchangeRate !== null) {
          // Convert: amount_original * rate = amount_usd
          amountUsd = Math.abs(amountNormalized) * exchangeRate;
          console.log(`[Transaction Import] Row ${rowIndex}: ${Math.abs(amountNormalized)} ${currencyCode} × ${exchangeRate} = ${amountUsd} USD`);
        } else {
          console.warn(`[Transaction Import] Row ${rowIndex}: Could not fetch exchange rate for ${currencyCode}→USD on ${txData.date}`);
        }
      }

      // Prepare metadata JSON
      const metadata = JSON.stringify(txData.originalRow);

      // Insert transaction
      const insertQuery = `
        INSERT INTO transactions (
          date,
          transaction_type_raw,
          transaction_category,
          cash_flow_direction,
          amount_original,
          amount_normalized,
          original_currency,
          exchange_rate_to_ils,
          amount_ils,
          amount_usd,
          investment_id,
          counterparty,
          dedup_hash,
          metadata,
          source_file
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(dedup_hash) DO NOTHING
      `;

      const insertResult = await db.prepare(insertQuery).bind(
        txData.date,
        txData.transactionType,
        typeMapping.slug,
        cashFlowDirection,
        txData.amount,
        amountNormalized,
        txData.currency,
        txData.exchangeRateToIls ?? null,
        txData.amountIls ?? null,
        amountUsd,
        investmentId,
        txData.counterparty,
        dedupHash,
        metadata,
        sourceFile
      ).run();

      // Check if row was actually inserted (changes > 0) or skipped due to duplicate
      if (insertResult.meta.changes > 0) {
        result.imported++;
      } else {
        result.skipped++;
      }
    } catch (error: any) {
      console.error(`[Transaction Import] Error importing row ${rowIndex}:`, error);
      result.errors.push({
        row: rowIndex,
        error: error.message || 'Unknown error',
      });
      result.skipped++;
    }
  }

  console.log(`[Transaction Import] Complete. Imported: ${result.imported}, Skipped: ${result.skipped}, Errors: ${result.errors.length}`);

  return result;
}
