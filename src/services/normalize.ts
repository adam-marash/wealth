/**
 * Data Normalization Service
 * Handles normalization of dates, amounts, counterparty names, and investment slugs
 */

import type { Env } from '../types';
import { getExchangeRate, currencySymbolToCode } from './exchange-rate';
import { resolveInvestmentSlug } from './slug';

/**
 * Date normalization result
 */
export interface NormalizedDate {
  iso: string; // ISO 8601 format (YYYY-MM-DD)
  original: string;
  format?: string; // Detected format
}

/**
 * Amount normalization result
 */
export interface NormalizedAmount {
  original: number;
  normalized: number; // After applying directionality
  currency: string;
  usd?: number; // USD-normalized amount
}

/**
 * Parse date from various formats to ISO 8601 (YYYY-MM-DD)
 * Supports:
 * - ISO 8601: "2024-03-15"
 * - DD/MM/YYYY: "15/03/2024"
 * - MM/DD/YYYY: "03/15/2024"
 * - Excel serial dates: 45000
 * - Various text formats
 */
export function parseDate(
  value: string | number | null | undefined,
  preferredFormat?: 'DD/MM/YYYY' | 'MM/DD/YYYY'
): NormalizedDate | null {
  if (value === null || value === undefined || value === '') {
    return null;
  }

  const original = String(value);

  // Handle Excel serial dates (numbers)
  if (typeof value === 'number' || /^\d+$/.test(original)) {
    const serial = typeof value === 'number' ? value : parseInt(original, 10);
    if (serial > 0 && serial < 100000) {
      // Excel serial date (days since 1900-01-01, with 1900 leap year bug)
      const excelEpoch = new Date(Date.UTC(1900, 0, 1));
      const days = serial - 2; // Adjust for Excel's 1900 leap year bug
      const date = new Date(excelEpoch.getTime() + days * 24 * 60 * 60 * 1000);

      if (!isNaN(date.getTime())) {
        return {
          iso: date.toISOString().split('T')[0]!,
          original,
          format: 'Excel serial',
        };
      }
    }
  }

  const str = original.trim();

  // ISO 8601 format: YYYY-MM-DD or YYYY/MM/DD
  const isoMatch = str.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/);
  if (isoMatch) {
    const [, year, month, day] = isoMatch;
    const date = new Date(Date.UTC(parseInt(year!), parseInt(month!) - 1, parseInt(day!)));
    if (!isNaN(date.getTime())) {
      return {
        iso: date.toISOString().split('T')[0]!,
        original,
        format: 'ISO 8601',
      };
    }
  }

  // DD/MM/YYYY or MM/DD/YYYY format
  const slashMatch = str.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (slashMatch) {
    const [, first, second, year] = slashMatch;

    // Use preferred format if specified
    if (preferredFormat === 'DD/MM/YYYY') {
      const date = new Date(Date.UTC(parseInt(year!), parseInt(second!) - 1, parseInt(first!)));
      if (!isNaN(date.getTime())) {
        return {
          iso: date.toISOString().split('T')[0]!,
          original,
          format: 'DD/MM/YYYY',
        };
      }
    } else if (preferredFormat === 'MM/DD/YYYY') {
      const date = new Date(Date.UTC(parseInt(year!), parseInt(first!) - 1, parseInt(second!)));
      if (!isNaN(date.getTime())) {
        return {
          iso: date.toISOString().split('T')[0]!,
          original,
          format: 'MM/DD/YYYY',
        };
      }
    }

    // Auto-detect: if first number > 12, it must be DD/MM/YYYY
    const firstNum = parseInt(first!);
    const secondNum = parseInt(second!);

    if (firstNum > 12) {
      // Must be DD/MM/YYYY
      const date = new Date(Date.UTC(parseInt(year!), secondNum - 1, firstNum));
      if (!isNaN(date.getTime())) {
        return {
          iso: date.toISOString().split('T')[0]!,
          original,
          format: 'DD/MM/YYYY',
        };
      }
    } else if (secondNum > 12) {
      // Must be MM/DD/YYYY
      const date = new Date(Date.UTC(parseInt(year!), firstNum - 1, secondNum));
      if (!isNaN(date.getTime())) {
        return {
          iso: date.toISOString().split('T')[0]!,
          original,
          format: 'MM/DD/YYYY',
        };
      }
    } else {
      // Ambiguous - try DD/MM/YYYY first (common in international contexts)
      const ddmmDate = new Date(Date.UTC(parseInt(year!), secondNum - 1, firstNum));
      if (!isNaN(ddmmDate.getTime())) {
        return {
          iso: ddmmDate.toISOString().split('T')[0]!,
          original,
          format: 'DD/MM/YYYY (ambiguous)',
        };
      }
    }
  }

  // Try native Date parsing as fallback
  const fallbackDate = new Date(str);
  if (!isNaN(fallbackDate.getTime())) {
    return {
      iso: fallbackDate.toISOString().split('T')[0]!,
      original,
      format: 'Auto-detected',
    };
  }

  return null;
}

/**
 * Normalize amount based on transaction type directionality rules
 *
 * @param amount Original amount from Excel
 * @param transactionTypeRaw Raw transaction type value
 * @param mappings Transaction type mappings with directionality rules
 * @returns Normalized amount (applying sign based on directionality)
 */
export async function normalizeAmount(
  db: D1Database,
  amount: number,
  transactionTypeRaw: string | null
): Promise<{
  normalized: number;
  category: string | null;
  direction: number | null;
}> {
  if (!transactionTypeRaw) {
    return {
      normalized: amount,
      category: null,
      direction: null,
    };
  }

  // Look up transaction type mapping
  const mapping = await db.prepare(`
    SELECT category, directionality_rule, cash_flow_impact
    FROM transaction_type_mappings
    WHERE raw_value = ?
  `).bind(transactionTypeRaw).first<{
    category: string;
    directionality_rule: string;
    cash_flow_impact: number | null;
  }>();

  if (!mapping) {
    console.warn(`No mapping found for transaction type: ${transactionTypeRaw}`);
    return {
      normalized: amount,
      category: null,
      direction: null,
    };
  }

  let normalized = amount;

  // Apply directionality rule
  switch (mapping.directionality_rule) {
    case 'as_is':
      // Keep amount as-is
      normalized = amount;
      break;

    case 'invert':
      // Invert the sign
      normalized = -amount;
      break;

    case 'variable':
      // Sign depends on context (use amount as-is for now)
      // This might need additional logic based on other fields
      normalized = amount;
      break;

    default:
      normalized = amount;
  }

  return {
    normalized,
    category: mapping.category,
    direction: mapping.cash_flow_impact,
  };
}

/**
 * Convert amount to USD using exchange rates
 */
export async function convertToUSD(
  db: D1Database,
  amount: number,
  currency: string,
  date: string,
  env?: Env
): Promise<number | null> {
  // Normalize currency symbol to ISO code
  const currencyCode = currencySymbolToCode(currency);

  // If already USD, return as-is
  if (currencyCode === 'USD') {
    return amount;
  }

  // Get exchange rate for the date
  const rate = await getExchangeRate(db, date, currencyCode, 'USD', env);

  if (rate === null) {
    console.error(`Failed to get exchange rate for ${currencyCode}→USD on ${date}`);
    return null;
  }

  return amount * rate;
}

/**
 * Normalize counterparty name
 * - Trim whitespace
 * - Standardize case (Title Case)
 * - Apply custom normalization rules from database
 */
export async function normalizeCounterparty(
  db: D1Database,
  rawName: string | null
): Promise<string | null> {
  if (!rawName) {
    return null;
  }

  // Trim whitespace
  let normalized = rawName.trim();

  // Check for custom normalization rules
  const rule = await db.prepare(`
    SELECT normalized_name
    FROM counterparty_normalizations
    WHERE raw_name = ?
  `).bind(normalized).first<{ normalized_name: string }>();

  if (rule) {
    return rule.normalized_name;
  }

  // Apply default normalization (preserve original case for now)
  // Hebrew text should not be title-cased
  return normalized;
}

/**
 * Parse and normalize a number value from Excel
 * Handles:
 * - Numbers: 1234.56
 * - Strings with commas: "1,234.56"
 * - Negative amounts: "-1234.56" or "(1234.56)"
 */
export function parseAmount(value: string | number | null | undefined): number | null {
  if (value === null || value === undefined || value === '') {
    return null;
  }

  // Already a number
  if (typeof value === 'number') {
    return value;
  }

  const str = String(value).trim();

  // Remove commas and spaces
  let cleaned = str.replace(/,/g, '').replace(/\s/g, '');

  // Handle parentheses as negative (accounting format)
  if (cleaned.startsWith('(') && cleaned.endsWith(')')) {
    cleaned = '-' + cleaned.slice(1, -1);
  }

  const parsed = parseFloat(cleaned);

  if (isNaN(parsed)) {
    return null;
  }

  return parsed;
}

/**
 * Batch normalize transaction rows
 * Applies all normalization rules in one pass
 */
export interface TransactionRow {
  date?: string | number;
  amount?: string | number;
  currency?: string;
  transaction_type?: string;
  counterparty?: string;
  investment_name?: string;
  exchange_rate_to_ils?: string | number;
  amount_ils?: string | number;
  [key: string]: any;
}

export interface NormalizedTransaction {
  date_iso: string | null;
  amount_original: number | null;
  amount_normalized: number | null;
  original_currency: string | null;
  amount_usd: number | null;
  transaction_category: string | null;
  cash_flow_direction: number | null;
  counterparty_normalized: string | null;
  investment_name: string | null;
  investment_slug: string | null;
  exchange_rate_to_ils: number | null;
  amount_ils: number | null;
}

export async function normalizeTransactionRow(
  db: D1Database,
  row: TransactionRow,
  env?: Env,
  dateFormat?: 'DD/MM/YYYY' | 'MM/DD/YYYY'
): Promise<NormalizedTransaction> {
  // Parse date
  const dateResult = parseDate(row.date, dateFormat);

  // Parse amount
  const amountOriginal = parseAmount(row.amount);

  // Normalize amount with directionality
  let amountNormalized: number | null = null;
  let category: string | null = null;
  let direction: number | null = null;

  if (amountOriginal !== null) {
    const normResult = await normalizeAmount(db, amountOriginal, row.transaction_type || null);
    amountNormalized = normResult.normalized;
    category = normResult.category;
    direction = normResult.direction;
  }

  // Convert to USD
  let amountUsd: number | null = null;
  if (amountNormalized !== null && dateResult && row.currency) {
    amountUsd = await convertToUSD(db, amountNormalized, row.currency, dateResult.iso, env);
  }

  // Normalize counterparty
  const counterpartyNormalized = await normalizeCounterparty(db, row.counterparty || null);

  // Resolve investment slug
  const investmentName = row.investment_name?.trim() || null;
  const investmentSlug = investmentName
    ? await resolveInvestmentSlug(db, investmentName)
    : null;

  // Parse ILS fields
  const exchangeRateToIls = parseAmount(row.exchange_rate_to_ils);
  const amountIls = parseAmount(row.amount_ils);

  return {
    date_iso: dateResult?.iso || null,
    amount_original: amountOriginal,
    amount_normalized: amountNormalized,
    original_currency: row.currency?.trim() || null,
    amount_usd: amountUsd,
    transaction_category: category,
    cash_flow_direction: direction,
    counterparty_normalized: counterpartyNormalized,
    investment_name: investmentName,
    investment_slug: investmentSlug,
    exchange_rate_to_ils: exchangeRateToIls,
    amount_ils: amountIls,
  };
}
