/**
 * Transactions Routes
 * Handles transaction CRUD operations
 */

import { Hono } from 'hono';
import type { Env, ApiResponse } from '../types';

const transactions = new Hono<{ Bindings: Env }>();

/**
 * GET /api/transactions
 * Get all transactions with optional filtering
 */
transactions.get('/', async (c) => {
  try {
    const { investment_id, category, limit = '100', offset = '0' } = c.req.query();

    let query = `
      SELECT
        t.id,
        t.date,
        t.transaction_type_raw,
        t.transaction_category,
        t.cash_flow_direction,
        t.amount_original,
        t.amount_normalized,
        t.original_currency,
        t.exchange_rate_to_ils,
        t.amount_ils,
        t.counterparty,
        t.source_file,
        t.created_at,
        t.updated_at,
        i.id as investment_id,
        i.name as investment_name,
        i.slug as investment_slug
      FROM transactions t
      LEFT JOIN investments i ON t.investment_id = i.id
      WHERE 1=1
    `;

    const params: any[] = [];

    if (investment_id) {
      query += ' AND t.investment_id = ?';
      params.push(investment_id);
    }

    if (category) {
      query += ' AND t.transaction_category = ?';
      params.push(category);
    }

    query += ' ORDER BY t.date DESC, t.id DESC LIMIT ? OFFSET ?';
    params.push(parseInt(limit), parseInt(offset));

    const result = await c.env.DB.prepare(query).bind(...params).all();

    return c.json<ApiResponse>({
      success: true,
      data: result.results || [],
    });

  } catch (error) {
    console.error('Error fetching transactions:', error);
    return c.json<ApiResponse>({
      success: false,
      error: 'Failed to fetch transactions',
      message: error instanceof Error ? error.message : 'Unknown error',
    }, 500);
  }
});

/**
 * GET /api/transactions/:id
 * Get a single transaction by ID
 */
transactions.get('/:id', async (c) => {
  try {
    const id = c.req.param('id');

    const transaction = await c.env.DB.prepare(`
      SELECT
        t.id,
        t.date,
        t.transaction_type_raw,
        t.transaction_category,
        t.cash_flow_direction,
        t.amount_original,
        t.amount_normalized,
        t.original_currency,
        t.exchange_rate_to_ils,
        t.amount_ils,
        t.counterparty,
        t.dedup_hash,
        t.metadata,
        t.source_file,
        t.created_at,
        t.updated_at,
        i.id as investment_id,
        i.name as investment_name,
        i.slug as investment_slug
      FROM transactions t
      LEFT JOIN investments i ON t.investment_id = i.id
      WHERE t.id = ?
    `).bind(id).first();

    if (!transaction) {
      return c.json<ApiResponse>({
        success: false,
        error: 'Transaction not found',
        message: `No transaction found with ID ${id}`,
      }, 404);
    }

    return c.json<ApiResponse>({
      success: true,
      data: transaction,
    });

  } catch (error) {
    console.error('Error fetching transaction:', error);
    return c.json<ApiResponse>({
      success: false,
      error: 'Failed to fetch transaction',
      message: error instanceof Error ? error.message : 'Unknown error',
    }, 500);
  }
});

/**
 * PUT /api/transactions/:id
 * Update a transaction by ID
 */
transactions.put('/:id', async (c) => {
  try {
    const id = c.req.param('id');
    const updates = await c.req.json<{
      date?: string;
      transaction_type_raw?: string;
      transaction_category?: string;
      cash_flow_direction?: number;
      amount_original?: number;
      amount_normalized?: number;
      original_currency?: string;
      exchange_rate_to_ils?: number;
      amount_ils?: number;
      investment_id?: number;
      counterparty?: string;
    }>();

    // Check if transaction exists
    const existing = await c.env.DB.prepare(
      'SELECT id FROM transactions WHERE id = ?'
    ).bind(id).first();

    if (!existing) {
      return c.json<ApiResponse>({
        success: false,
        error: 'Transaction not found',
        message: `No transaction found with ID ${id}`,
      }, 404);
    }

    // Build update query dynamically based on provided fields
    const fields: string[] = [];
    const values: any[] = [];

    if (updates.date !== undefined) {
      fields.push('date = ?');
      values.push(updates.date);
    }
    if (updates.transaction_type_raw !== undefined) {
      fields.push('transaction_type_raw = ?');
      values.push(updates.transaction_type_raw);
    }
    if (updates.transaction_category !== undefined) {
      fields.push('transaction_category = ?');
      values.push(updates.transaction_category);
    }
    if (updates.cash_flow_direction !== undefined) {
      fields.push('cash_flow_direction = ?');
      values.push(updates.cash_flow_direction);
    }
    if (updates.amount_original !== undefined) {
      fields.push('amount_original = ?');
      values.push(updates.amount_original);
    }
    if (updates.amount_normalized !== undefined) {
      fields.push('amount_normalized = ?');
      values.push(updates.amount_normalized);
    }
    if (updates.original_currency !== undefined) {
      fields.push('original_currency = ?');
      values.push(updates.original_currency);
    }
    if (updates.exchange_rate_to_ils !== undefined) {
      fields.push('exchange_rate_to_ils = ?');
      values.push(updates.exchange_rate_to_ils || null);
    }
    if (updates.amount_ils !== undefined) {
      fields.push('amount_ils = ?');
      values.push(updates.amount_ils || null);
    }
    if (updates.investment_id !== undefined) {
      fields.push('investment_id = ?');
      values.push(updates.investment_id);
    }
    if (updates.counterparty !== undefined) {
      fields.push('counterparty = ?');
      values.push(updates.counterparty);
    }

    if (fields.length === 0) {
      return c.json<ApiResponse>({
        success: false,
        error: 'No fields to update',
        message: 'Please provide at least one field to update',
      }, 400);
    }

    // Always update updated_at
    fields.push("updated_at = datetime('now')");
    values.push(id);

    const query = `UPDATE transactions SET ${fields.join(', ')} WHERE id = ?`;
    await c.env.DB.prepare(query).bind(...values).run();

    return c.json<ApiResponse>({
      success: true,
      message: `Transaction ${id} updated successfully`,
    });

  } catch (error) {
    console.error('Error updating transaction:', error);
    return c.json<ApiResponse>({
      success: false,
      error: 'Failed to update transaction',
      message: error instanceof Error ? error.message : 'Unknown error',
    }, 500);
  }
});

/**
 * DELETE /api/transactions/:id
 * Delete a transaction by ID
 */
transactions.delete('/:id', async (c) => {
  try {
    const id = c.req.param('id');

    // Check if transaction exists
    const existing = await c.env.DB.prepare(
      'SELECT id, date, investment_id FROM transactions WHERE id = ?'
    ).bind(id).first<{ id: number; date: string; investment_id: number }>();

    if (!existing) {
      return c.json<ApiResponse>({
        success: false,
        error: 'Transaction not found',
        message: `No transaction found with ID ${id}`,
      }, 404);
    }

    // Delete the transaction
    await c.env.DB.prepare('DELETE FROM transactions WHERE id = ?').bind(id).run();

    return c.json<ApiResponse>({
      success: true,
      message: `Transaction ${id} deleted successfully`,
    });

  } catch (error) {
    console.error('Error deleting transaction:', error);
    return c.json<ApiResponse>({
      success: false,
      error: 'Failed to delete transaction',
      message: error instanceof Error ? error.message : 'Unknown error',
    }, 500);
  }
});

/**
 * DELETE /api/transactions/bulk
 * Delete multiple transactions by IDs
 */
transactions.delete('/bulk', async (c) => {
  try {
    const { ids } = await c.req.json<{ ids: number[] }>();

    if (!Array.isArray(ids) || ids.length === 0) {
      return c.json<ApiResponse>({
        success: false,
        error: 'Invalid input',
        message: 'ids must be a non-empty array',
      }, 400);
    }

    const placeholders = ids.map(() => '?').join(',');
    const result = await c.env.DB.prepare(
      `DELETE FROM transactions WHERE id IN (${placeholders})`
    ).bind(...ids).run();

    return c.json<ApiResponse>({
      success: true,
      message: `Deleted ${result.meta.changes} transaction(s)`,
      data: {
        deleted: result.meta.changes,
      },
    });

  } catch (error) {
    console.error('Error bulk deleting transactions:', error);
    return c.json<ApiResponse>({
      success: false,
      error: 'Failed to bulk delete transactions',
      message: error instanceof Error ? error.message : 'Unknown error',
    }, 500);
  }
});

export default transactions;
