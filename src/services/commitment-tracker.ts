/**
 * Commitment Tracker Service
 *
 * Handles commitment calculations:
 * - Called capital tracking (from deposit transactions)
 * - Remaining commitment calculations
 * - Commitment completion status
 * - Dynamic USD conversion for reporting
 */

import { D1Database } from '@cloudflare/workers-types';

export interface CommitmentStatus {
  investment_id: number;
  investment_name: string;
  initial_commitment: number;
  committed_currency: string;
  commitment_date: string;
  called_to_date: number;
  remaining: number;
  is_complete: boolean;
  completion_percentage: number;
  // USD values (dynamically converted)
  initial_commitment_usd?: number;
  called_to_date_usd?: number;
  remaining_usd?: number;
  exchange_rate_used?: number;
  exchange_rate_date?: string;
}

export interface OpenCommitmentsSummary {
  total_committed_usd: number;
  total_called_usd: number;
  total_remaining_usd: number;
  count: number;
  by_currency: {
    [currency: string]: {
      committed: number;
      called: number;
      remaining: number;
      exchange_rate: number;
      exchange_rate_date: string;
    };
  };
}

/**
 * Calculate called_to_date for an investment from deposit transactions
 */
export async function calculateCalledToDate(
  db: D1Database,
  investmentId: number,
  committedCurrency: string
): Promise<number> {
  // Sum all deposit transactions for this investment
  const result = await db
    .prepare(
      `SELECT
        COALESCE(SUM(amount_original), 0) as total_called
      FROM transactions
      WHERE investment_id = ?
        AND transaction_category = 'deposit'
        AND original_currency = ?`
    )
    .bind(investmentId, committedCurrency)
    .first<{ total_called: number }>();

  return Math.abs(result?.total_called || 0);
}

/**
 * Update called_to_date and remaining for an investment
 */
export async function updateInvestmentCommitmentStatus(
  db: D1Database,
  investmentId: number
): Promise<void> {
  // Get investment details
  const investment = await db
    .prepare(
      `SELECT id, initial_commitment, committed_currency, is_complete
      FROM investments
      WHERE id = ?`
    )
    .bind(investmentId)
    .first<{
      id: number;
      initial_commitment: number | null;
      committed_currency: string | null;
      is_complete: number;
    }>();

  if (!investment || !investment.initial_commitment || !investment.committed_currency) {
    return; // No commitment set for this investment
  }

  // Calculate called to date
  const calledToDate = await calculateCalledToDate(
    db,
    investmentId,
    investment.committed_currency
  );

  // Calculate remaining
  const remaining = Math.max(0, investment.initial_commitment - calledToDate);

  // Update the investment
  await db
    .prepare(
      `UPDATE investments
      SET called_to_date = ?,
          remaining = ?,
          updated_at = datetime('now')
      WHERE id = ?`
    )
    .bind(calledToDate, remaining, investmentId)
    .run();
}

/**
 * Update all investment commitment statuses
 * Call after transaction import
 */
export async function updateAllCommitmentStatuses(db: D1Database): Promise<void> {
  // Get all investments with commitments
  const investments = await db
    .prepare(
      `SELECT id
      FROM investments
      WHERE initial_commitment IS NOT NULL
        AND committed_currency IS NOT NULL`
    )
    .all<{ id: number }>();

  // Update each investment
  for (const inv of investments.results) {
    await updateInvestmentCommitmentStatus(db, inv.id);
  }
}

/**
 * Get current exchange rate (today's date or latest available)
 */
async function getCurrentExchangeRate(
  db: D1Database,
  fromCurrency: string,
  toCurrency: string = 'USD'
): Promise<{ rate: number; date: string }> {
  if (fromCurrency === toCurrency) {
    return { rate: 1.0, date: new Date().toISOString().split('T')[0] };
  }

  // Try to get rate for today
  const today = new Date().toISOString().split('T')[0];
  let result = await db
    .prepare(
      `SELECT rate, date
      FROM exchange_rates
      WHERE from_currency = ?
        AND to_currency = ?
        AND date = ?
      LIMIT 1`
    )
    .bind(fromCurrency, toCurrency, today)
    .first<{ rate: number; date: string }>();

  if (result) {
    return result;
  }

  // Fall back to most recent rate available
  result = await db
    .prepare(
      `SELECT rate, date
      FROM exchange_rates
      WHERE from_currency = ?
        AND to_currency = ?
      ORDER BY date DESC
      LIMIT 1`
    )
    .bind(fromCurrency, toCurrency)
    .first<{ rate: number; date: string }>();

  if (result) {
    return result;
  }

  throw new Error(
    `No exchange rate found for ${fromCurrency} to ${toCurrency}`
  );
}

/**
 * Get commitment status for a single investment with USD conversion
 */
export async function getCommitmentStatus(
  db: D1Database,
  investmentId: number
): Promise<CommitmentStatus | null> {
  const investment = await db
    .prepare(
      `SELECT
        id,
        name,
        initial_commitment,
        committed_currency,
        commitment_date,
        called_to_date,
        remaining,
        is_complete
      FROM investments
      WHERE id = ?
        AND initial_commitment IS NOT NULL`
    )
    .bind(investmentId)
    .first<{
      id: number;
      name: string;
      initial_commitment: number;
      committed_currency: string;
      commitment_date: string;
      called_to_date: number;
      remaining: number;
      is_complete: number;
    }>();

  if (!investment) {
    return null;
  }

  const completionPercentage =
    (investment.called_to_date / investment.initial_commitment) * 100;

  const isComplete =
    investment.is_complete === 1 ||
    investment.called_to_date >= investment.initial_commitment;

  // Get exchange rate for USD conversion
  let exchangeRateInfo;
  let usdValues = {};
  try {
    exchangeRateInfo = await getCurrentExchangeRate(
      db,
      investment.committed_currency,
      'USD'
    );

    usdValues = {
      initial_commitment_usd:
        investment.initial_commitment * exchangeRateInfo.rate,
      called_to_date_usd: investment.called_to_date * exchangeRateInfo.rate,
      remaining_usd: investment.remaining * exchangeRateInfo.rate,
      exchange_rate_used: exchangeRateInfo.rate,
      exchange_rate_date: exchangeRateInfo.date,
    };
  } catch (error) {
    // Exchange rate not available, return without USD values
    console.warn(
      `Exchange rate not available for ${investment.committed_currency}: ${error}`
    );
  }

  return {
    investment_id: investment.id,
    investment_name: investment.name,
    initial_commitment: investment.initial_commitment,
    committed_currency: investment.committed_currency,
    commitment_date: investment.commitment_date,
    called_to_date: investment.called_to_date,
    remaining: investment.remaining,
    is_complete: isComplete,
    completion_percentage: Math.round(completionPercentage * 10) / 10,
    ...usdValues,
  };
}

/**
 * Get summary of all open commitments in USD
 */
export async function getOpenCommitmentsSummary(
  db: D1Database
): Promise<OpenCommitmentsSummary> {
  // Get all open commitments (not complete and has remaining)
  // Only include active investments (exclude exited, written_off, fully_called)
  const openCommitments = await db
    .prepare(
      `SELECT
        id,
        initial_commitment,
        committed_currency,
        called_to_date,
        remaining,
        is_complete
      FROM investments
      WHERE initial_commitment IS NOT NULL
        AND committed_currency IS NOT NULL
        AND is_complete = 0
        AND remaining > 0
        AND status = 'active'
      ORDER BY committed_currency`
    )
    .all<{
      id: number;
      initial_commitment: number;
      committed_currency: string;
      called_to_date: number;
      remaining: number;
      is_complete: number;
    }>();

  const summary: OpenCommitmentsSummary = {
    total_committed_usd: 0,
    total_called_usd: 0,
    total_remaining_usd: 0,
    count: openCommitments.results.length,
    by_currency: {},
  };

  // Group by currency and convert to USD
  for (const commitment of openCommitments.results) {
    const currency = commitment.committed_currency;

    try {
      const exchangeRateInfo = await getCurrentExchangeRate(db, currency, 'USD');
      const rate = exchangeRateInfo.rate;

      // Initialize currency group if needed
      if (!summary.by_currency[currency]) {
        summary.by_currency[currency] = {
          committed: 0,
          called: 0,
          remaining: 0,
          exchange_rate: rate,
          exchange_rate_date: exchangeRateInfo.date,
        };
      }

      // Add to currency totals
      summary.by_currency[currency].committed += commitment.initial_commitment;
      summary.by_currency[currency].called += commitment.called_to_date;
      summary.by_currency[currency].remaining += commitment.remaining;

      // Add to USD totals
      summary.total_committed_usd += commitment.initial_commitment * rate;
      summary.total_called_usd += commitment.called_to_date * rate;
      summary.total_remaining_usd += commitment.remaining * rate;
    } catch (error) {
      console.error(
        `Failed to get exchange rate for ${currency}: ${error}`
      );
    }
  }

  return summary;
}

/**
 * Mark a commitment as manually complete
 */
export async function markCommitmentComplete(
  db: D1Database,
  investmentId: number,
  isComplete: boolean = true
): Promise<void> {
  await db
    .prepare(
      `UPDATE investments
      SET is_complete = ?,
          updated_at = datetime('now')
      WHERE id = ?`
    )
    .bind(isComplete ? 1 : 0, investmentId)
    .run();
}

/**
 * Get all commitments with their statuses
 */
export async function getAllCommitmentsWithStatus(
  db: D1Database
): Promise<CommitmentStatus[]> {
  const investments = await db
    .prepare(
      `SELECT id
      FROM investments
      WHERE initial_commitment IS NOT NULL
        AND committed_currency IS NOT NULL
      ORDER BY name`
    )
    .all<{ id: number }>();

  const statuses: CommitmentStatus[] = [];

  for (const inv of investments.results) {
    const status = await getCommitmentStatus(db, inv.id);
    if (status) {
      statuses.push(status);
    }
  }

  return statuses;
}
