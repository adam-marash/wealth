/**
 * Transaction Preview Service
 * Handles preview of transactions before import
 */

import type { Env } from '../types';
import { parseCSVData } from './csv-parser';
import { normalizeTransactionRow, type TransactionRow, type NormalizedTransaction } from './normalize';
import { checkDeduplication, type DedupResult } from './deduplication';

/**
 * Column mapping from database
 */
export interface ColumnMapping {
  excel_column_name: string;
  mapped_field: string;
  date_format?: string | null;
}

/**
 * Issue severity levels
 */
export type IssueSeverity = 'error' | 'warning';

/**
 * Issue found during preview
 */
export interface PreviewIssue {
  row_number: number;
  severity: IssueSeverity;
  field: string;
  message: string;
  value?: any;
}

/**
 * Transaction with preview metadata
 */
export interface PreviewTransaction {
  row_number: number;
  raw_data: Record<string, any>;
  normalized: NormalizedTransaction;
  dedup: DedupResult;
  issues: PreviewIssue[];
  status: 'clean' | 'duplicate' | 'similar' | 'has_issues';
}

/**
 * Preview summary statistics
 */
export interface PreviewSummary {
  total_rows: number;
  clean_transactions: number;
  exact_duplicates: number;
  similar_transactions: number;
  transactions_with_issues: number;
  will_import: number;
  will_skip: number;
}

/**
 * Complete preview result
 */
export interface PreviewResult {
  summary: PreviewSummary;
  transactions: PreviewTransaction[];
  column_mappings_used: ColumnMapping[];
}

/**
 * Load active column mappings from database
 */
async function loadColumnMappings(db: D1Database): Promise<ColumnMapping[]> {
  const result = await db.prepare(`
    SELECT excel_column_name, mapped_field, date_format
    FROM column_mappings
    WHERE active = 1
    ORDER BY id
  `).all<ColumnMapping>();

  return result.results;
}

/**
 * Map Excel row to TransactionRow using column mappings
 */
function mapExcelRow(
  excelRow: Record<string, any>,
  mappings: ColumnMapping[]
): TransactionRow {
  const mapped: TransactionRow = {};

  for (const mapping of mappings) {
    const excelValue = excelRow[mapping.excel_column_name];
    mapped[mapping.mapped_field] = excelValue;
  }

  return mapped;
}

/**
 * Detect issues in a normalized transaction
 */
function detectIssues(
  rowNumber: number,
  raw: Record<string, any>,
  normalized: NormalizedTransaction,
  dedup: DedupResult
): PreviewIssue[] {
  const issues: PreviewIssue[] = [];

  // Missing or unparsable date
  if (!normalized.date_iso) {
    issues.push({
      row_number: rowNumber,
      severity: 'error',
      field: 'date',
      message: 'Date could not be parsed',
      value: raw.date,
    });
  }

  // Missing or unparsable amount
  if (normalized.amount_original === null) {
    issues.push({
      row_number: rowNumber,
      severity: 'error',
      field: 'amount',
      message: 'Amount could not be parsed',
      value: raw.amount,
    });
  }

  // Unknown transaction type
  if (raw.transaction_type && !normalized.transaction_category) {
    issues.push({
      row_number: rowNumber,
      severity: 'warning',
      field: 'transaction_type',
      message: 'Unknown transaction type (no mapping found)',
      value: raw.transaction_type,
    });
  }

  // Unmapped investment
  if (normalized.investment_name && !normalized.investment_slug) {
    issues.push({
      row_number: rowNumber,
      severity: 'warning',
      field: 'investment_name',
      message: 'Investment not mapped to any slug (needs review)',
      value: normalized.investment_name,
    });
  }

  // Missing dedup hash (missing required fields)
  if (!dedup.hash) {
    issues.push({
      row_number: rowNumber,
      severity: 'warning',
      field: 'dedup_hash',
      message: 'Could not generate dedup hash (missing date, amount, or investment)',
    });
  }

  // Failed USD conversion
  if (normalized.amount_normalized !== null && !normalized.amount_usd && normalized.original_currency !== 'USD') {
    issues.push({
      row_number: rowNumber,
      severity: 'warning',
      field: 'amount_usd',
      message: `Failed to convert ${normalized.original_currency} to USD (exchange rate not found)`,
      value: normalized.amount_normalized,
    });
  }

  return issues;
}

/**
 * Determine transaction status
 */
function determineStatus(
  issues: PreviewIssue[],
  dedup: DedupResult
): PreviewTransaction['status'] {
  // Has critical issues
  if (issues.some(issue => issue.severity === 'error')) {
    return 'has_issues';
  }

  // Exact duplicate
  if (dedup.is_duplicate) {
    return 'duplicate';
  }

  // Similar to existing
  if (dedup.similar_transactions && dedup.similar_transactions.length > 0) {
    return 'similar';
  }

  // Has warnings but no errors/duplicates
  if (issues.length > 0) {
    return 'has_issues';
  }

  return 'clean';
}

/**
 * Preview transactions from CSV file
 *
 * @param db D1 database instance
 * @param arrayBuffer CSV file as ArrayBuffer
 * @param sheetIndex Unused (kept for backwards compatibility)
 * @param env Environment (for exchange rates)
 * @returns Preview result with summary and transaction details
 */
export async function previewTransactions(
  db: D1Database,
  arrayBuffer: ArrayBuffer,
  sheetIndex: number | undefined,
  env?: Env
): Promise<PreviewResult> {
  // Load column mappings
  const mappings = await loadColumnMappings(db);

  if (mappings.length === 0) {
    throw new Error('No active column mappings found. Please configure column mappings first.');
  }

  // Parse CSV file to extract full row data
  const sheet = parseCSVData(arrayBuffer);

  // Get date format from mappings
  const dateMapping = mappings.find(m => m.mapped_field === 'date');
  const dateFormat = dateMapping?.date_format as 'DD/MM/YYYY' | 'MM/DD/YYYY' | undefined;

  // Process each row
  const transactions: PreviewTransaction[] = [];

  for (let i = 0; i < sheet.rows.length; i++) {
    const rowNumber = i + sheet.headerRow + 2; // +2 for 1-based index and header row
    const excelRow = sheet.rows[i];

    // Map Excel columns to transaction fields
    const mappedRow = mapExcelRow(excelRow, mappings);

    // Normalize transaction
    const normalized = await normalizeTransactionRow(db, mappedRow, env, dateFormat);

    // Check for duplicates
    const dedup = await checkDeduplication(db, normalized);

    // Detect issues
    const issues = detectIssues(rowNumber, mappedRow, normalized, dedup);

    // Determine status
    const status = determineStatus(issues, dedup);

    transactions.push({
      row_number: rowNumber,
      raw_data: mappedRow,
      normalized,
      dedup,
      issues,
      status,
    });
  }

  // Calculate summary statistics
  const summary: PreviewSummary = {
    total_rows: transactions.length,
    clean_transactions: transactions.filter(t => t.status === 'clean').length,
    exact_duplicates: transactions.filter(t => t.status === 'duplicate').length,
    similar_transactions: transactions.filter(t => t.status === 'similar').length,
    transactions_with_issues: transactions.filter(t => t.status === 'has_issues').length,
    will_import: transactions.filter(t => t.status === 'clean').length,
    will_skip: transactions.filter(t => t.status === 'duplicate').length,
  };

  return {
    summary,
    transactions,
    column_mappings_used: mappings,
  };
}
