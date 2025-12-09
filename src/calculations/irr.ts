/**
 * IRR and XIRR Calculation Module
 *
 * XIRR (Extended Internal Rate of Return):
 * - Calculates annualized rate of return for irregular cash flows
 * - Uses Newton-Raphson method for numerical approximation
 * - More accurate than simple IRR for real-world investment scenarios
 *
 * Formula: NPV = Σ(CF_i / (1 + r)^((date_i - date_0) / 365)) = 0
 * Where r is the XIRR we're solving for
 */

export interface CashFlow {
  date: string; // ISO 8601 format (YYYY-MM-DD)
  amount: number; // Negative = investment/capital call, Positive = return/distribution
}

/**
 * Calculate days between two dates
 */
function daysBetween(date1: string, date2: string): number {
  const d1 = new Date(date1);
  const d2 = new Date(date2);
  const diffTime = d2.getTime() - d1.getTime();
  const diffDays = diffTime / (1000 * 60 * 60 * 24);
  return diffDays;
}

/**
 * Calculate Net Present Value (NPV) for a given rate
 */
function calculateNPV(cashFlows: CashFlow[], rate: number): number {
  const firstDate = cashFlows[0].date;
  let npv = 0;

  for (const cf of cashFlows) {
    const days = daysBetween(firstDate, cf.date);
    const years = days / 365;
    npv += cf.amount / Math.pow(1 + rate, years);
  }

  return npv;
}

/**
 * Calculate derivative of NPV with respect to rate
 */
function calculateNPVDerivative(cashFlows: CashFlow[], rate: number): number {
  const firstDate = cashFlows[0].date;
  let derivative = 0;

  for (const cf of cashFlows) {
    const days = daysBetween(firstDate, cf.date);
    const years = days / 365;
    derivative -= (years * cf.amount) / Math.pow(1 + rate, years + 1);
  }

  return derivative;
}

/**
 * Calculate XIRR using Newton-Raphson method
 *
 * @param cashFlows Array of cash flows with dates and amounts
 * @param guess Initial guess for the rate (default: 0.1 = 10%)
 * @param maxIterations Maximum number of iterations (default: 100)
 * @param tolerance Convergence tolerance (default: 0.0001 = 0.01%)
 * @returns XIRR as a decimal (e.g., 0.15 = 15%), or null if calculation fails
 */
export function calculateXIRR(
  cashFlows: CashFlow[],
  guess: number = 0.1,
  maxIterations: number = 100,
  tolerance: number = 0.0001
): number | null {
  // Validation
  if (cashFlows.length < 2) {
    console.warn('XIRR requires at least 2 cash flows');
    return null;
  }

  // Sort by date
  const sortedFlows = [...cashFlows].sort((a, b) =>
    new Date(a.date).getTime() - new Date(b.date).getTime()
  );

  // Check for both positive and negative cash flows
  const hasNegative = sortedFlows.some(cf => cf.amount < 0);
  const hasPositive = sortedFlows.some(cf => cf.amount > 0);

  if (!hasNegative || !hasPositive) {
    console.warn('XIRR requires both positive and negative cash flows');
    return null;
  }

  // Newton-Raphson iteration
  let rate = guess;

  for (let i = 0; i < maxIterations; i++) {
    const npv = calculateNPV(sortedFlows, rate);
    const derivative = calculateNPVDerivative(sortedFlows, rate);

    // Check for convergence
    if (Math.abs(npv) < tolerance) {
      return rate;
    }

    // Check for zero derivative (would cause division by zero)
    if (Math.abs(derivative) < 1e-10) {
      console.warn('XIRR calculation failed: derivative too small');
      return null;
    }

    // Newton-Raphson step: r_new = r_old - f(r) / f'(r)
    const newRate = rate - npv / derivative;

    // Sanity check: rate should be reasonable (-1 to 10 = -100% to 1000%)
    if (newRate < -0.99 || newRate > 10) {
      console.warn('XIRR calculation diverging: rate out of bounds');
      return null;
    }

    rate = newRate;
  }

  // Failed to converge
  console.warn('XIRR calculation failed to converge');
  return null;
}

/**
 * Calculate simple IRR for evenly spaced cash flows
 * This is a special case of XIRR where all periods are equal
 */
export function calculateIRR(
  cashFlows: number[],
  guess: number = 0.1,
  maxIterations: number = 100,
  tolerance: number = 0.0001
): number | null {
  if (cashFlows.length < 2) {
    console.warn('IRR requires at least 2 cash flows');
    return null;
  }

  // Convert to evenly spaced cash flows (annual)
  const today = new Date();
  const xirrFlows: CashFlow[] = cashFlows.map((amount, index) => {
    const date = new Date(today);
    date.setFullYear(date.getFullYear() - (cashFlows.length - 1 - index));
    return {
      date: date.toISOString().split('T')[0],
      amount,
    };
  });

  return calculateXIRR(xirrFlows, guess, maxIterations, tolerance);
}

/**
 * Helper: Generate cash flows from investment transactions
 *
 * @param transactions Array of transaction objects
 * @param includeCurrentPosition Whether to add current position as a negative cash flow (default: true)
 * @returns Array of CashFlow objects
 */
export function transactionsToCashFlows(
  transactions: Array<{
    date: string;
    transaction_category: string;
    amount_normalized: number;
  }>,
  includeCurrentPosition: boolean = true
): CashFlow[] {
  const cashFlows: CashFlow[] = [];
  let netPosition = 0;

  for (const tx of transactions) {
    if (tx.transaction_category === 'capital_call') {
      // Capital calls are negative (money out)
      const amount = -Math.abs(tx.amount_normalized);
      cashFlows.push({
        date: tx.date,
        amount,
      });
      netPosition += amount;
    } else if (tx.transaction_category === 'distribution') {
      // Distributions are positive (money in)
      const amount = Math.abs(tx.amount_normalized);
      cashFlows.push({
        date: tx.date,
        amount,
      });
      netPosition += amount;
    }
    // Ignore fees, income, transfers for XIRR calculation
  }

  // If we still have money outstanding, add current position as a hypothetical liquidation
  if (includeCurrentPosition && netPosition < 0) {
    cashFlows.push({
      date: new Date().toISOString().split('T')[0],
      amount: Math.abs(netPosition), // Assume we could liquidate at cost
    });
  }

  return cashFlows;
}

/**
 * Format XIRR as a percentage string
 */
export function formatXIRR(xirr: number | null): string {
  if (xirr === null) {
    return 'N/A';
  }
  return `${(xirr * 100).toFixed(2)}%`;
}
