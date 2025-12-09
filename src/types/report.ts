/**
 * Report Types
 * For various financial reports and analytics
 */

import type { CommitmentPhase, InvestmentType } from './investment';

/**
 * Common Report Filter Options
 */
export interface ReportFilters {
  dateFrom?: string; // ISO 8601
  dateTo?: string; // ISO 8601
  investmentIds?: number[];
  investmentGroups?: string[];
  currency?: 'original' | 'usd' | 'both';
}

/**
 * 1. Total Earnings Per Year Report
 */
export interface EarningsReportRow {
  year: number;
  investment_name: string | null;
  amount_usd: number;
  percentage_of_total: number;
}

export interface EarningsReport {
  rows: EarningsReportRow[];
  total: number;
  yearOverYearGrowth: {
    [year: number]: number; // Percentage growth
  };
}

/**
 * 2. Total Equity Returns Report
 */
export interface EquityReturnsRow {
  investment_id: number;
  investment_name: string;
  cost_basis: number; // Sum of capital calls
  distributions: number; // Sum of distributions
  current_value: number; // Latest valuation
  gain_loss: number; // current_value + distributions - cost_basis
  irr: number | null; // Internal Rate of Return (%)
  moic: number | null; // Multiple on Invested Capital
}

export interface EquityReturnsReport {
  rows: EquityReturnsRow[];
  totals: {
    cost_basis: number;
    distributions: number;
    current_value: number;
    gain_loss: number;
    blended_irr: number | null;
    blended_moic: number | null;
  };
}

/**
 * 3. Total Returned Cash Per Year Report
 */
export interface ReturnedCashRow {
  period: string; // Year, Quarter, or Month
  amount_usd: number;
  running_total: number;
}

export interface ReturnedCashReport {
  rows: ReturnedCashRow[];
  total_returned: number;
  total_contributed: number;
  net_cash_position: number; // returned - contributed
}

/**
 * 4. Portfolio Position (Balance Sheet) Report
 */
export interface PortfolioPositionRow {
  investment_id: number;
  investment_name: string;
  investment_type: InvestmentType | null;
  total_contributed: number;
  total_distributed: number;
  net_invested: number; // contributed - distributed
  current_valuation: number | null;
  unrealized_gain: number | null; // valuation - net_invested
  percentage_of_portfolio: number;
  status: string;
}

export interface PortfolioPositionReport {
  rows: PortfolioPositionRow[];
  totals: {
    total_contributed: number;
    total_distributed: number;
    net_invested: number;
    current_valuation: number;
    unrealized_gain: number;
  };
}

/**
 * 5. Outstanding Commitments Per Investment Report
 */
export interface OutstandingCommitmentRow {
  investment_id: number;
  investment_name: string;
  committed: number;
  called: number;
  remaining: number;
  percentage_called: number;
  phase: CommitmentPhase | null;
  estimated_timeline: string | null; // Future enhancement
}

export interface OutstandingCommitmentsReport {
  rows: OutstandingCommitmentRow[];
  totals: {
    committed: number;
    called: number;
    remaining: number;
  };
  alerts: CommitmentAlert[];
}

export interface CommitmentAlert {
  investment_id: number;
  investment_name: string;
  type: 'nearly_exhausted' | 'overdrawn';
  message: string;
}

/**
 * 6. Cash Flow Analysis Report
 */
export interface CashFlowRow {
  period: string; // Month, Quarter, or Year
  income: number;
  capital_calls: number;
  distributions: number;
  fees: number;
  net_cash_flow: number;
  running_balance: number;
}

export interface CashFlowReport {
  rows: CashFlowRow[];
  projected_calls: number; // Based on outstanding commitments
}

/**
 * 7. Fee Analysis Report
 */
export interface FeeAnalysisRow {
  investment_id: number;
  investment_name: string;
  year: number;
  total_fees: number;
  fee_percentage_nav: number | null;
  fee_percentage_committed: number | null;
}

export interface FeeAnalysisReport {
  rows: FeeAnalysisRow[];
  trends: {
    [year: number]: number; // Total fees by year
  };
}

/**
 * 8. Capital Account Statement (per investment)
 */
export interface CapitalAccountStatement {
  investment_id: number;
  investment_name: string;
  period_start: string; // ISO 8601
  period_end: string; // ISO 8601
  beginning_balance: number;
  contributions: number;
  income_gains: number;
  distributions: number;
  fees: number;
  ending_balance: number;
  transactions: CapitalAccountTransaction[];
}

export interface CapitalAccountTransaction {
  date: string;
  description: string;
  type: string;
  amount: number;
  balance: number;
}

/**
 * Dashboard Widgets Data
 */
export interface DashboardData {
  total_portfolio_value: number;
  ytd_returns: number;
  ytd_cash_returned: number;
  outstanding_commitments: number;
  recent_transactions: RecentTransaction[];
  alerts: DashboardAlert[];
}

export interface RecentTransaction {
  id: number;
  date: string;
  investment_name: string | null;
  description: string | null;
  amount_usd: number | null;
  category: string | null;
}

export interface DashboardAlert {
  type: 'warning' | 'error' | 'info';
  message: string;
  investment_id?: number;
  investment_name?: string;
}
