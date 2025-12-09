/**
 * Reports Routes
 * Handles reporting and analytics endpoints
 */

import { Hono } from 'hono';
import type { Env, ApiResponse } from '../types';
import { calculateXIRR, transactionsToCashFlows } from '../calculations/irr';
import { calculateAllMetrics } from '../calculations/metrics';

const reports = new Hono<{ Bindings: Env }>();

/**
 * GET /api/reports/transactions
 * Query transactions with filters
 *
 * Query params:
 * - investment_id: Filter by investment
 * - start_date: Filter by start date (ISO format)
 * - end_date: Filter by end date (ISO format)
 * - category: Filter by transaction_category
 * - counterparty: Filter by counterparty
 * - page: Page number (default: 1)
 * - pageSize: Items per page (default: 50)
 * - sort: Sort field (default: date)
 * - order: Sort order (asc/desc, default: desc)
 */
reports.get('/transactions', async (c) => {
  try {
    const investment_id = c.req.query('investment_id');
    const start_date = c.req.query('start_date');
    const end_date = c.req.query('end_date');
    const category = c.req.query('category');
    const counterparty = c.req.query('counterparty');
    const page = parseInt(c.req.query('page') || '1', 10);
    const pageSize = parseInt(c.req.query('pageSize') || '50', 10);
    const sort = c.req.query('sort') || 'date';
    const order = c.req.query('order') || 'desc';

    // Build WHERE clause
    const conditions: string[] = [];
    const params: any[] = [];

    if (investment_id) {
      conditions.push('t.investment_id = ?');
      params.push(parseInt(investment_id, 10));
    }

    if (start_date) {
      conditions.push('t.date >= ?');
      params.push(start_date);
    }

    if (end_date) {
      conditions.push('t.date <= ?');
      params.push(end_date);
    }

    if (category) {
      conditions.push('t.transaction_category = ?');
      params.push(category);
    }

    if (counterparty) {
      conditions.push('t.counterparty LIKE ?');
      params.push(`%${counterparty}%`);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    // Get total count
    const countQuery = `
      SELECT COUNT(*) as total
      FROM transactions t
      ${whereClause}
    `;

    const countResult = await c.env.DB.prepare(countQuery).bind(...params).first<{ total: number }>();
    const total = countResult?.total || 0;

    // Get transactions with investment details
    const offset = (page - 1) * pageSize;
    const dataQuery = `
      SELECT
        t.*,
        i.name as investment_name,
        i.investment_type,
        i.investment_group
      FROM transactions t
      LEFT JOIN investments i ON t.investment_id = i.id
      ${whereClause}
      ORDER BY t.${sort} ${order.toUpperCase()}
      LIMIT ? OFFSET ?
    `;

    const dataResult = await c.env.DB.prepare(dataQuery)
      .bind(...params, pageSize, offset)
      .all();

    return c.json<ApiResponse>({
      success: true,
      message: `Found ${total} transactions`,
      data: {
        items: dataResult.results,
        pagination: {
          page,
          pageSize,
          total,
          totalPages: Math.ceil(total / pageSize),
        },
      },
    });

  } catch (error) {
    console.error('Error querying transactions:', error);
    return c.json<ApiResponse>({
      success: false,
      error: 'Failed to query transactions',
      message: error instanceof Error ? error.message : 'Unknown error',
    }, 500);
  }
});

/**
 * GET /api/reports/portfolio-position
 * Current portfolio position across all investments
 */
reports.get('/portfolio-position', async (c) => {
  try {
    const query = `
      SELECT
        i.id,
        i.name,
        i.investment_type,
        i.investment_group,
        i.status,
        COALESCE(SUM(CASE WHEN t.transaction_category = 'contribution' THEN ABS(t.amount_normalized) ELSE 0 END), 0) as total_called,
        COALESCE(SUM(CASE WHEN t.transaction_category IN ('income_distribution', 'capital_distribution') THEN ABS(t.amount_normalized) ELSE 0 END), 0) as total_distributed,
        COALESCE(SUM(CASE WHEN t.transaction_category = 'contribution' THEN ABS(t.amount_usd) ELSE 0 END), 0) as total_called_usd,
        COALESCE(SUM(CASE WHEN t.transaction_category IN ('income_distribution', 'capital_distribution') THEN ABS(t.amount_usd) ELSE 0 END), 0) as total_distributed_usd,
        COUNT(t.id) as transaction_count,
        MIN(t.date) as first_transaction_date,
        MAX(t.date) as last_transaction_date
      FROM investments i
      LEFT JOIN transactions t ON i.id = t.investment_id
      GROUP BY i.id, i.name, i.investment_type, i.investment_group, i.status
      ORDER BY i.name
    `;

    const result = await c.env.DB.prepare(query).all();

    // Calculate net positions and totals
    const investments = result.results.map((inv: any) => ({
      ...inv,
      net_position: inv.total_called - inv.total_distributed,
      net_position_usd: inv.total_called_usd - inv.total_distributed_usd,
    }));

    const summary = {
      total_investments: investments.length,
      active_investments: investments.filter((i: any) => i.status === 'active').length,
      total_called: investments.reduce((sum: number, i: any) => sum + i.total_called, 0),
      total_distributed: investments.reduce((sum: number, i: any) => sum + i.total_distributed, 0),
      total_called_usd: investments.reduce((sum: number, i: any) => sum + i.total_called_usd, 0),
      total_distributed_usd: investments.reduce((sum: number, i: any) => sum + i.total_distributed_usd, 0),
      net_position: investments.reduce((sum: number, i: any) => sum + i.net_position, 0),
      net_position_usd: investments.reduce((sum: number, i: any) => sum + i.net_position_usd, 0),
    };

    return c.json<ApiResponse>({
      success: true,
      message: 'Portfolio position report generated',
      data: {
        summary,
        investments,
      },
    });

  } catch (error) {
    console.error('Error generating portfolio position:', error);
    return c.json<ApiResponse>({
      success: false,
      error: 'Failed to generate portfolio position report',
      message: error instanceof Error ? error.message : 'Unknown error',
    }, 500);
  }
});

/**
 * GET /api/reports/commitments
 * Commitment tracking across all investments
 *
 * Query params:
 * - investment_id: Filter by investment
 * - phase: Filter by phase
 */
reports.get('/commitments', async (c) => {
  try {
    const investment_id = c.req.query('investment_id');
    const phase = c.req.query('phase');

    const conditions: string[] = ['i.commitment_amount_usd IS NOT NULL'];
    const params: any[] = [];

    if (investment_id) {
      conditions.push('i.id = ?');
      params.push(parseInt(investment_id, 10));
    }

    if (phase) {
      conditions.push('i.phase = ?');
      params.push(phase);
    }

    const whereClause = `WHERE ${conditions.join(' AND ')}`;

    const query = `
      SELECT
        i.id,
        i.id as investment_id,
        i.name as investment_name,
        i.investment_type,
        i.investment_group,
        i.commitment_amount_usd as commitment_amount,
        i.committed_currency as currency,
        i.commitment_date,
        i.called_to_date,
        i.remaining,
        i.phase,
        i.commitment_notes as notes,
        (i.called_to_date / NULLIF(i.commitment_amount_usd, 0) * 100) as percentage_called,
        CASE
          WHEN i.remaining < 0 THEN 'overdrawn'
          WHEN i.remaining = 0 THEN 'fully_called'
          WHEN (i.remaining / NULLIF(i.commitment_amount_usd, 0) * 100) < 10 THEN 'near_exhaustion'
          ELSE 'normal'
        END as alert_status
      FROM investments i
      ${whereClause}
      ORDER BY i.commitment_date DESC
    `;

    const result = await c.env.DB.prepare(query).bind(...params).all();

    // Calculate summary
    const commitments = result.results;
    const summary = {
      total_commitments: commitments.length,
      total_committed: commitments.reduce((sum: number, c: any) => sum + (c.commitment_amount || 0), 0),
      total_called: commitments.reduce((sum: number, c: any) => sum + (c.called_to_date || 0), 0),
      total_remaining: commitments.reduce((sum: number, c: any) => sum + (c.remaining || 0), 0),
      overdrawn_count: commitments.filter((c: any) => c.alert_status === 'overdrawn').length,
      near_exhaustion_count: commitments.filter((c: any) => c.alert_status === 'near_exhaustion').length,
      fully_called_count: commitments.filter((c: any) => c.alert_status === 'fully_called').length,
    };

    return c.json<ApiResponse>({
      success: true,
      message: 'Commitment tracking report generated',
      data: {
        summary,
        commitments,
      },
    });

  } catch (error) {
    console.error('Error generating commitments report:', error);
    return c.json<ApiResponse>({
      success: false,
      error: 'Failed to generate commitments report',
      message: error instanceof Error ? error.message : 'Unknown error',
    }, 500);
  }
});

/**
 * GET /api/reports/cash-flow
 * Cash flow analysis by time period
 *
 * Query params:
 * - start_date: Start date (ISO format)
 * - end_date: End date (ISO format)
 * - period: Grouping period (monthly, quarterly, yearly, default: monthly)
 * - investment_id: Filter by investment
 */
reports.get('/cash-flow', async (c) => {
  try {
    const start_date = c.req.query('start_date');
    const end_date = c.req.query('end_date');
    const period = c.req.query('period') || 'monthly';
    const investment_id = c.req.query('investment_id');

    const conditions: string[] = [];
    const params: any[] = [];

    if (start_date) {
      conditions.push('t.date >= ?');
      params.push(start_date);
    }

    if (end_date) {
      conditions.push('t.date <= ?');
      params.push(end_date);
    }

    if (investment_id) {
      conditions.push('t.investment_id = ?');
      params.push(parseInt(investment_id, 10));
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    // Determine period grouping
    let periodGroup = '';
    switch (period) {
      case 'yearly':
        periodGroup = "strftime('%Y', t.date)";
        break;
      case 'quarterly':
        periodGroup = "strftime('%Y', t.date) || '-Q' || ((CAST(strftime('%m', t.date) AS INTEGER) + 2) / 3)";
        break;
      case 'monthly':
      default:
        periodGroup = "strftime('%Y-%m', t.date)";
        break;
    }

    const query = `
      SELECT
        ${periodGroup} as period,
        COALESCE(SUM(CASE WHEN t.transaction_category = 'capital_call' THEN ABS(t.amount_normalized) ELSE 0 END), 0) as capital_calls,
        COALESCE(SUM(CASE WHEN t.transaction_category = 'distribution' THEN ABS(t.amount_normalized) ELSE 0 END), 0) as distributions,
        COALESCE(SUM(CASE WHEN t.transaction_category = 'capital_call' THEN ABS(t.amount_usd) ELSE 0 END), 0) as capital_calls_usd,
        COALESCE(SUM(CASE WHEN t.transaction_category = 'distribution' THEN ABS(t.amount_usd) ELSE 0 END), 0) as distributions_usd,
        COUNT(CASE WHEN t.transaction_category = 'capital_call' THEN 1 END) as capital_call_count,
        COUNT(CASE WHEN t.transaction_category = 'distribution' THEN 1 END) as distribution_count
      FROM transactions t
      ${whereClause}
      GROUP BY period
      ORDER BY period DESC
    `;

    const result = await c.env.DB.prepare(query).bind(...params).all();

    // Calculate net cash flow for each period
    const periods = result.results.map((p: any) => ({
      ...p,
      net_cash_flow: p.distributions - p.capital_calls,
      net_cash_flow_usd: p.distributions_usd - p.capital_calls_usd,
    }));

    // Calculate summary
    const summary = {
      total_periods: periods.length,
      total_capital_calls: periods.reduce((sum: number, p: any) => sum + p.capital_calls, 0),
      total_distributions: periods.reduce((sum: number, p: any) => sum + p.distributions, 0),
      total_capital_calls_usd: periods.reduce((sum: number, p: any) => sum + p.capital_calls_usd, 0),
      total_distributions_usd: periods.reduce((sum: number, p: any) => sum + p.distributions_usd, 0),
      net_cash_flow: periods.reduce((sum: number, p: any) => sum + p.net_cash_flow, 0),
      net_cash_flow_usd: periods.reduce((sum: number, p: any) => sum + p.net_cash_flow_usd, 0),
    };

    return c.json<ApiResponse>({
      success: true,
      message: 'Cash flow analysis generated',
      data: {
        summary,
        periods,
      },
    });

  } catch (error) {
    console.error('Error generating cash flow analysis:', error);
    return c.json<ApiResponse>({
      success: false,
      error: 'Failed to generate cash flow analysis',
      message: error instanceof Error ? error.message : 'Unknown error',
    }, 500);
  }
});

/**
 * GET /api/reports/investment/:id/summary
 * Comprehensive summary for a single investment
 */
reports.get('/investment/:id/summary', async (c) => {
  try {
    const investment_id = parseInt(c.req.param('id'), 10);

    if (isNaN(investment_id)) {
      return c.json<ApiResponse>({
        success: false,
        error: 'Invalid investment ID',
      }, 400);
    }

    // Get investment details
    const investmentResult = await c.env.DB.prepare(`
      SELECT * FROM investments WHERE id = ?
    `).bind(investment_id).first();

    if (!investmentResult) {
      return c.json<ApiResponse>({
        success: false,
        error: 'Investment not found',
      }, 404);
    }

    // Get transaction summary
    const transactionSummary = await c.env.DB.prepare(`
      SELECT
        COUNT(*) as total_transactions,
        COALESCE(SUM(CASE WHEN transaction_category = 'capital_call' THEN ABS(amount_normalized) ELSE 0 END), 0) as total_called,
        COALESCE(SUM(CASE WHEN transaction_category = 'distribution' THEN ABS(amount_normalized) ELSE 0 END), 0) as total_distributed,
        COALESCE(SUM(CASE WHEN transaction_category = 'capital_call' THEN ABS(amount_usd) ELSE 0 END), 0) as total_called_usd,
        COALESCE(SUM(CASE WHEN transaction_category = 'distribution' THEN ABS(amount_usd) ELSE 0 END), 0) as total_distributed_usd,
        COUNT(CASE WHEN transaction_category = 'capital_call' THEN 1 END) as capital_call_count,
        COUNT(CASE WHEN transaction_category = 'distribution' THEN 1 END) as distribution_count,
        COUNT(CASE WHEN transaction_category = 'fee' THEN 1 END) as fee_count,
        MIN(date) as first_transaction_date,
        MAX(date) as last_transaction_date
      FROM transactions
      WHERE investment_id = ?
    `).bind(investment_id).first();

    // Get commitment data from investment (now embedded in investment table)
    // Return as array for backward compatibility with existing code
    const investmentCommitment = investment.commitment_amount_usd ? [{
      id: investment.id,
      investment_id: investment.id,
      commitment_amount: investment.commitment_amount_usd,
      currency: investment.committed_currency,
      commitment_date: investment.commitment_date,
      called_to_date: investment.called_to_date,
      remaining: investment.remaining,
      phase: investment.phase,
      notes: investment.commitment_notes,
    }] : [];
    const commitments = { results: investmentCommitment };

    // Get recent transactions
    const recentTransactions = await c.env.DB.prepare(`
      SELECT * FROM transactions
      WHERE investment_id = ?
      ORDER BY date DESC
      LIMIT 10
    `).bind(investment_id).all();

    // Get all transactions for IRR/metrics calculation
    const allTransactions = await c.env.DB.prepare(`
      SELECT date, transaction_category, amount_normalized
      FROM transactions
      WHERE investment_id = ?
      ORDER BY date ASC
    `).bind(investment_id).all();

    // Calculate XIRR
    let xirr: number | null = null;
    if (allTransactions.results.length >= 2) {
      const cashFlows = transactionsToCashFlows(
        allTransactions.results as Array<{
          date: string;
          transaction_category: string;
          amount_normalized: number;
        }>,
        true // Include current position
      );
      xirr = calculateXIRR(cashFlows);
    }

    // Calculate financial metrics (MOIC, DPI, RVPI, TVPI)
    const metrics = calculateAllMetrics(
      transactionSummary?.total_called || 0,
      transactionSummary?.total_distributed || 0
    );

    const summary = {
      investment: investmentResult,
      transaction_summary: {
        ...transactionSummary,
        net_position: (transactionSummary?.total_called || 0) - (transactionSummary?.total_distributed || 0),
        net_position_usd: (transactionSummary?.total_called_usd || 0) - (transactionSummary?.total_distributed_usd || 0),
      },
      commitments: commitments.results,
      recent_transactions: recentTransactions.results,
      performance: {
        xirr: xirr, // As decimal (e.g., 0.15 = 15%)
        xirr_percentage: xirr !== null ? (xirr * 100).toFixed(2) + '%' : null,
        moic: metrics.moic,
        dpi: metrics.dpi,
        rvpi: metrics.rvpi,
        tvpi: metrics.tvpi,
      },
    };

    return c.json<ApiResponse>({
      success: true,
      message: 'Investment summary generated',
      data: summary,
    });

  } catch (error) {
    console.error('Error generating investment summary:', error);
    return c.json<ApiResponse>({
      success: false,
      error: 'Failed to generate investment summary',
      message: error instanceof Error ? error.message : 'Unknown error',
    }, 500);
  }
});

/**
 * GET /api/reports/dashboard
 * Dashboard statistics and overview
 */
reports.get('/dashboard', async (c) => {
  try {
    // Get overall statistics
    const stats = await c.env.DB.prepare(`
      SELECT
        COUNT(DISTINCT i.id) as total_investments,
        COUNT(DISTINCT CASE WHEN i.status = 'active' THEN i.id END) as active_investments,
        COUNT(t.id) as total_transactions,
        COALESCE(SUM(CASE WHEN t.transaction_category = 'contribution' THEN ABS(t.amount_original) ELSE 0 END), 0) as total_called,
        COALESCE(SUM(CASE WHEN t.transaction_category IN ('income_distribution', 'capital_distribution') THEN ABS(t.amount_original) ELSE 0 END), 0) as total_distributed,
        COALESCE(SUM(CASE WHEN t.transaction_category = 'fee' THEN ABS(t.amount_original) ELSE 0 END), 0) as total_fees
      FROM investments i
      LEFT JOIN transactions t ON i.id = t.investment_id
    `).first();

    // Get commitment stats (now from investments table)
    const commitmentStats = await c.env.DB.prepare(`
      SELECT
        COUNT(*) as total_commitments,
        COALESCE(SUM(commitment_amount_usd), 0) as total_committed,
        COALESCE(SUM(called_to_date), 0) as total_called,
        COALESCE(SUM(remaining), 0) as total_remaining
      FROM investments
      WHERE commitment_amount_usd IS NOT NULL
    `).first();

    // Get recent transactions
    const recentTransactions = await c.env.DB.prepare(`
      SELECT t.*, i.name as investment_name
      FROM transactions t
      LEFT JOIN investments i ON t.investment_id = i.id
      ORDER BY t.date DESC, t.created_at DESC
      LIMIT 10
    `).all();

    // Get commitment alerts (now from investments table)
    const alerts = await c.env.DB.prepare(`
      SELECT
        i.id,
        i.id as investment_id,
        i.name as investment_name,
        i.commitment_amount_usd as commitment_amount,
        i.called_to_date,
        i.remaining,
        (i.remaining / NULLIF(i.commitment_amount_usd, 0) * 100) as remaining_percentage,
        CASE
          WHEN i.remaining < 0 THEN 'overdrawn'
          WHEN i.remaining = 0 THEN 'fully_called'
          WHEN (i.remaining / NULLIF(i.commitment_amount_usd, 0) * 100) < 10 THEN 'near_exhaustion'
        END as alert_type
      FROM investments i
      WHERE i.commitment_amount_usd IS NOT NULL
        AND (i.remaining <= 0 OR (i.remaining / NULLIF(i.commitment_amount_usd, 0) * 100) < 10)
      ORDER BY i.remaining ASC
    `).all();

    return c.json<ApiResponse>({
      success: true,
      message: 'Dashboard data generated',
      data: {
        overview: {
          ...stats,
          net_position: (stats?.total_called || 0) - (stats?.total_distributed || 0),
        },
        commitments: commitmentStats,
        recent_transactions: recentTransactions.results,
        alerts: alerts.results,
        alert_count: alerts.results.length,
      },
    });

  } catch (error) {
    console.error('Error generating dashboard data:', error);
    return c.json<ApiResponse>({
      success: false,
      error: 'Failed to generate dashboard data',
      message: error instanceof Error ? error.message : 'Unknown error',
    }, 500);
  }
});

/**
 * GET /api/reports/equity-returns
 * Equity returns report with IRR and performance metrics for all investments
 */
reports.get('/equity-returns', async (c) => {
  try {
    // Get all investments with their transaction summaries
    const investmentsResult = await c.env.DB.prepare(`
      SELECT
        i.id,
        i.name,
        i.investment_type,
        i.investment_group,
        i.status,
        COALESCE(SUM(CASE WHEN t.transaction_category = 'contribution' THEN ABS(t.amount_normalized) ELSE 0 END), 0) as total_called,
        COALESCE(SUM(CASE WHEN t.transaction_category IN ('income_distribution', 'capital_distribution') THEN ABS(t.amount_normalized) ELSE 0 END), 0) as total_distributed,
        COALESCE(SUM(CASE WHEN t.transaction_category = 'contribution' THEN ABS(t.amount_usd) ELSE 0 END), 0) as total_called_usd,
        COALESCE(SUM(CASE WHEN t.transaction_category IN ('income_distribution', 'capital_distribution') THEN ABS(t.amount_usd) ELSE 0 END), 0) as total_distributed_usd,
        COUNT(t.id) as transaction_count,
        MIN(t.date) as first_transaction_date,
        MAX(t.date) as last_transaction_date
      FROM investments i
      LEFT JOIN transactions t ON i.id = t.investment_id
      GROUP BY i.id, i.name, i.investment_type, i.investment_group, i.status
      HAVING transaction_count > 0
      ORDER BY i.name
    `).all();

    const investments = [];

    // Calculate IRR and metrics for each investment
    for (const inv of investmentsResult.results as any[]) {
      // Get all transactions for this investment
      const txResult = await c.env.DB.prepare(`
        SELECT date, transaction_category, amount_normalized
        FROM transactions
        WHERE investment_id = ?
        ORDER BY date ASC
      `).bind(inv.id).all();

      // Calculate XIRR
      let xirr: number | null = null;
      if (txResult.results.length >= 2) {
        const cashFlows = transactionsToCashFlows(
          txResult.results as Array<{
            date: string;
            transaction_category: string;
            amount_normalized: number;
          }>,
          true // Include current position
        );
        xirr = calculateXIRR(cashFlows);
      }

      // Calculate metrics
      const metrics = calculateAllMetrics(
        inv.total_called,
        inv.total_distributed
      );

      investments.push({
        id: inv.id,
        name: inv.name,
        investment_type: inv.investment_type,
        investment_group: inv.investment_group,
        status: inv.status,
        total_called: inv.total_called,
        total_distributed: inv.total_distributed,
        total_called_usd: inv.total_called_usd,
        total_distributed_usd: inv.total_distributed_usd,
        net_position: inv.total_called - inv.total_distributed,
        net_position_usd: inv.total_called_usd - inv.total_distributed_usd,
        transaction_count: inv.transaction_count,
        first_transaction_date: inv.first_transaction_date,
        last_transaction_date: inv.last_transaction_date,
        performance: {
          xirr: xirr,
          xirr_percentage: xirr !== null ? (xirr * 100).toFixed(2) + '%' : null,
          moic: metrics.moic,
          dpi: metrics.dpi,
          rvpi: metrics.rvpi,
          tvpi: metrics.tvpi,
        },
      });
    }

    // Calculate portfolio-level metrics
    const totalCalled = investments.reduce((sum, i) => sum + i.total_called, 0);
    const totalDistributed = investments.reduce((sum, i) => sum + i.total_distributed, 0);
    const totalCalledUSD = investments.reduce((sum, i) => sum + i.total_called_usd, 0);
    const totalDistributedUSD = investments.reduce((sum, i) => sum + i.total_distributed_usd, 0);

    const portfolioMetrics = calculateAllMetrics(totalCalled, totalDistributed);

    // Calculate portfolio-level XIRR (combine all cash flows)
    const allTxResult = await c.env.DB.prepare(`
      SELECT date, transaction_category, amount_normalized
      FROM transactions
      WHERE transaction_category IN ('capital_call', 'distribution')
      ORDER BY date ASC
    `).all();

    let portfolioXIRR: number | null = null;
    if (allTxResult.results.length >= 2) {
      const cashFlows = transactionsToCashFlows(
        allTxResult.results as Array<{
          date: string;
          transaction_category: string;
          amount_normalized: number;
        }>,
        true
      );
      portfolioXIRR = calculateXIRR(cashFlows);
    }

    return c.json<ApiResponse>({
      success: true,
      message: 'Equity returns report generated',
      data: {
        portfolio_summary: {
          total_investments: investments.length,
          total_called: totalCalled,
          total_distributed: totalDistributed,
          total_called_usd: totalCalledUSD,
          total_distributed_usd: totalDistributedUSD,
          net_position: totalCalled - totalDistributed,
          net_position_usd: totalCalledUSD - totalDistributedUSD,
          performance: {
            xirr: portfolioXIRR,
            xirr_percentage: portfolioXIRR !== null ? (portfolioXIRR * 100).toFixed(2) + '%' : null,
            moic: portfolioMetrics.moic,
            dpi: portfolioMetrics.dpi,
            rvpi: portfolioMetrics.rvpi,
            tvpi: portfolioMetrics.tvpi,
          },
        },
        investments: investments,
      },
    });

  } catch (error) {
    console.error('Error generating equity returns report:', error);
    return c.json<ApiResponse>({
      success: false,
      error: 'Failed to generate equity returns report',
      message: error instanceof Error ? error.message : 'Unknown error',
    }, 500);
  }
});

export default reports;
