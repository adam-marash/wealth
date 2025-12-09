/**
 * Financial Metrics Module
 *
 * Calculates standard private equity metrics:
 * - MOIC (Multiple on Invested Capital)
 * - DPI (Distributions to Paid-In Capital)
 * - RVPI (Residual Value to Paid-In Capital)
 * - TVPI (Total Value to Paid-In Capital)
 */

export interface InvestmentMetrics {
  // Capital flows
  total_called: number;
  total_distributed: number;
  net_position: number;

  // Multiples
  moic: number | null; // Multiple on Invested Capital
  dpi: number | null; // Distributions to Paid-In Capital
  rvpi: number | null; // Residual Value to Paid-In Capital
  tvpi: number | null; // Total Value to Paid-In Capital

  // Metrics metadata
  has_distributions: boolean;
  has_capital_calls: boolean;
  is_fully_realized: boolean;
}

/**
 * Calculate MOIC (Multiple on Invested Capital)
 *
 * MOIC = (Total Distributions + Residual Value) / Total Capital Called
 *
 * This is the total return multiple on the investment.
 * For fully realized investments (no residual value), MOIC = Total Distributions / Total Called
 *
 * @param totalCalled Total capital called (invested)
 * @param totalDistributed Total distributions received
 * @param residualValue Current value of unrealized position (defaults to net position if positive, 0 otherwise)
 * @returns MOIC as a decimal (e.g., 2.5 = 2.5x return), or null if no capital called
 */
export function calculateMOIC(
  totalCalled: number,
  totalDistributed: number,
  residualValue?: number
): number | null {
  if (totalCalled <= 0) {
    return null;
  }

  // If residual value not provided, estimate it
  // For active investments: assume current capital at risk could be recovered
  // For fully realized: residual is 0
  let residual = residualValue ?? 0;
  if (residualValue === undefined) {
    const netPosition = totalCalled - totalDistributed;
    residual = netPosition > 0 ? netPosition : 0;
  }

  const totalValue = totalDistributed + residual;
  return totalValue / totalCalled;
}

/**
 * Calculate DPI (Distributions to Paid-In Capital)
 *
 * DPI = Total Distributions / Total Capital Called
 *
 * This represents the realized return multiple (cash already received).
 * DPI is always less than or equal to MOIC.
 *
 * @param totalCalled Total capital called (invested)
 * @param totalDistributed Total distributions received
 * @returns DPI as a decimal (e.g., 1.5 = 1.5x cash returned), or null if no capital called
 */
export function calculateDPI(
  totalCalled: number,
  totalDistributed: number
): number | null {
  if (totalCalled <= 0) {
    return null;
  }

  return totalDistributed / totalCalled;
}

/**
 * Calculate RVPI (Residual Value to Paid-In Capital)
 *
 * RVPI = Residual Value / Total Capital Called
 *
 * This represents the unrealized return multiple (value still invested).
 * MOIC = DPI + RVPI
 *
 * @param totalCalled Total capital called (invested)
 * @param residualValue Current value of unrealized position
 * @returns RVPI as a decimal, or null if no capital called
 */
export function calculateRVPI(
  totalCalled: number,
  residualValue: number
): number | null {
  if (totalCalled <= 0) {
    return null;
  }

  return residualValue / totalCalled;
}

/**
 * Calculate TVPI (Total Value to Paid-In Capital)
 *
 * TVPI = (Total Distributions + Residual Value) / Total Capital Called
 *
 * TVPI is identical to MOIC. Both represent total value created.
 * In private equity, TVPI and MOIC are interchangeable terms.
 *
 * @param totalCalled Total capital called (invested)
 * @param totalDistributed Total distributions received
 * @param residualValue Current value of unrealized position
 * @returns TVPI as a decimal, or null if no capital called
 */
export function calculateTVPI(
  totalCalled: number,
  totalDistributed: number,
  residualValue: number
): number | null {
  // TVPI is identical to MOIC
  return calculateMOIC(totalCalled, totalDistributed, residualValue);
}

/**
 * Calculate all investment metrics at once
 *
 * @param totalCalled Total capital called (invested)
 * @param totalDistributed Total distributions received
 * @param residualValue Current value of unrealized position (optional)
 * @returns Complete InvestmentMetrics object
 */
export function calculateAllMetrics(
  totalCalled: number,
  totalDistributed: number,
  residualValue?: number
): InvestmentMetrics {
  // Calculate net position
  const netPosition = totalCalled - totalDistributed;

  // Estimate residual value if not provided
  let residual = residualValue ?? 0;
  if (residualValue === undefined) {
    // Conservative estimate: assume unreturned capital could be recovered at cost
    residual = netPosition > 0 ? netPosition : 0;
  }

  // Calculate multiples
  const moic = calculateMOIC(totalCalled, totalDistributed, residual);
  const dpi = calculateDPI(totalCalled, totalDistributed);
  const rvpi = calculateRVPI(totalCalled, residual);
  const tvpi = calculateTVPI(totalCalled, totalDistributed, residual);

  return {
    total_called: totalCalled,
    total_distributed: totalDistributed,
    net_position: netPosition,
    moic,
    dpi,
    rvpi,
    tvpi,
    has_distributions: totalDistributed > 0,
    has_capital_calls: totalCalled > 0,
    is_fully_realized: netPosition <= 0 && totalCalled > 0,
  };
}

/**
 * Format a metric as a multiple string
 */
export function formatMultiple(value: number | null, decimals: number = 2): string {
  if (value === null) {
    return 'N/A';
  }
  return `${value.toFixed(decimals)}x`;
}

/**
 * Calculate metrics from transaction data
 *
 * @param transactions Array of transaction objects
 * @param residualValue Optional residual value (if not provided, estimated from net position)
 * @returns Complete InvestmentMetrics object
 */
export function metricsFromTransactions(
  transactions: Array<{
    transaction_category: string;
    amount_normalized: number;
  }>,
  residualValue?: number
): InvestmentMetrics {
  let totalCalled = 0;
  let totalDistributed = 0;

  for (const tx of transactions) {
    if (tx.transaction_category === 'capital_call') {
      totalCalled += Math.abs(tx.amount_normalized);
    } else if (tx.transaction_category === 'distribution') {
      totalDistributed += Math.abs(tx.amount_normalized);
    }
    // Ignore fees, income, transfers for metrics
  }

  return calculateAllMetrics(totalCalled, totalDistributed, residualValue);
}
