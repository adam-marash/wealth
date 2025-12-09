/**
 * Test Routes
 * For testing services and utilities
 */

import { Hono } from 'hono';
import type { Env, ApiResponse } from '../types';
import {
  parseDate,
  parseAmount,
  normalizeAmount,
  normalizeCounterparty,
  convertToUSD,
  normalizeTransactionRow,
  type TransactionRow,
} from '../services/normalize';

const test = new Hono<{ Bindings: Env }>();

/**
 * POST /api/test/normalize-transaction
 * Test transaction normalization with a sample row
 *
 * Body: TransactionRow object
 */
test.post('/normalize-transaction', async (c) => {
  try {
    const row = await c.req.json<TransactionRow>();

    const normalized = await normalizeTransactionRow(
      c.env.DB,
      row,
      c.env,
      'DD/MM/YYYY' // Our data uses DD/MM/YYYY format
    );

    return c.json<ApiResponse>({
      success: true,
      data: {
        input: row,
        normalized,
      },
    });

  } catch (error) {
    console.error('Error normalizing transaction:', error);
    return c.json<ApiResponse>({
      success: false,
      error: 'Failed to normalize transaction',
      message: error instanceof Error ? error.message : 'Unknown error',
    }, 500);
  }
});

/**
 * POST /api/test/parse-date
 * Test date parsing
 */
test.post('/parse-date', async (c) => {
  try {
    const { value, format } = await c.req.json<{
      value: string | number;
      format?: 'DD/MM/YYYY' | 'MM/DD/YYYY';
    }>();

    const result = parseDate(value, format);

    return c.json<ApiResponse>({
      success: true,
      data: result,
    });

  } catch (error) {
    console.error('Error parsing date:', error);
    return c.json<ApiResponse>({
      success: false,
      error: 'Failed to parse date',
      message: error instanceof Error ? error.message : 'Unknown error',
    }, 500);
  }
});

/**
 * POST /api/test/parse-amount
 * Test amount parsing
 */
test.post('/parse-amount', async (c) => {
  try {
    const { value } = await c.req.json<{ value: string | number }>();

    const result = parseAmount(value);

    return c.json<ApiResponse>({
      success: true,
      data: { parsed: result },
    });

  } catch (error) {
    console.error('Error parsing amount:', error);
    return c.json<ApiResponse>({
      success: false,
      error: 'Failed to parse amount',
      message: error instanceof Error ? error.message : 'Unknown error',
    }, 500);
  }
});

/**
 * POST /api/test/normalize-amount
 * Test amount normalization with directionality
 */
test.post('/normalize-amount', async (c) => {
  try {
    const { amount, transaction_type } = await c.req.json<{
      amount: number;
      transaction_type: string;
    }>();

    const result = await normalizeAmount(c.env.DB, amount, transaction_type);

    return c.json<ApiResponse>({
      success: true,
      data: result,
    });

  } catch (error) {
    console.error('Error normalizing amount:', error);
    return c.json<ApiResponse>({
      success: false,
      error: 'Failed to normalize amount',
      message: error instanceof Error ? error.message : 'Unknown error',
    }, 500);
  }
});

/**
 * POST /api/test/convert-to-usd
 * Test USD conversion
 */
test.post('/convert-to-usd', async (c) => {
  try {
    const { amount, currency, date } = await c.req.json<{
      amount: number;
      currency: string;
      date: string;
    }>();

    const result = await convertToUSD(c.env.DB, amount, currency, date, c.env);

    return c.json<ApiResponse>({
      success: true,
      data: { amount_usd: result },
    });

  } catch (error) {
    console.error('Error converting to USD:', error);
    return c.json<ApiResponse>({
      success: false,
      error: 'Failed to convert to USD',
      message: error instanceof Error ? error.message : 'Unknown error',
    }, 500);
  }
});

/**
 * GET /api/test/transactions
 * Get all transactions from database
 */
test.get('/transactions', async (c) => {
  try {
    const result = await c.env.DB.prepare(`
      SELECT * FROM transactions
      ORDER BY date DESC
    `).all();

    return c.json<ApiResponse>({
      success: true,
      data: result.results,
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
 * GET /api/test/investments
 * Get all investments from database
 */
test.get('/investments', async (c) => {
  try {
    const result = await c.env.DB.prepare(`
      SELECT * FROM investments
      ORDER BY name
    `).all();

    return c.json<ApiResponse>({
      success: true,
      data: result.results,
    });

  } catch (error) {
    console.error('Error fetching investments:', error);
    return c.json<ApiResponse>({
      success: false,
      error: 'Failed to fetch investments',
      message: error instanceof Error ? error.message : 'Unknown error',
    }, 500);
  }
});

export default test;
