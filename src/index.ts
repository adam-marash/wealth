/**
 * Wealth Management System - Main Entry Point
 * Cloudflare Workers + Hono Framework
 */

import { Hono } from 'hono';
import { cors } from 'hono/cors';
import type { Env } from './types';

// Initialize Hono app with environment bindings
const app = new Hono<{ Bindings: Env }>();

// CORS middleware - adjust in production
app.use('/*', cors({
  origin: '*',
  allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowHeaders: ['Content-Type', 'Authorization'],
}));

// Request logging middleware
app.use('*', async (c, next) => {
  const start = Date.now();
  await next();
  const ms = Date.now() - start;
  console.log(`${c.req.method} ${c.req.url} - ${c.res.status} (${ms}ms)`);
});

// ============================================================================
// HEALTH CHECK ENDPOINT
// ============================================================================

app.get('/api/health', async (c) => {
  try {
    // Test database connection
    const result = await c.env.DB.prepare(
      'SELECT COUNT(*) as count FROM sqlite_master WHERE type="table"'
    ).first<{ count: number }>();

    return c.json({
      success: true,
      message: 'Wealth Management API is running',
      data: {
        status: 'healthy',
        environment: c.env.ENVIRONMENT,
        timestamp: new Date().toISOString(),
        database: {
          connected: true,
          tables: result?.count || 0,
        },
      },
    });
  } catch (error) {
    return c.json({
      success: false,
      message: 'Health check failed',
      error: error instanceof Error ? error.message : 'Unknown error',
    }, 500);
  }
});

// ============================================================================
// API ROUTES (to be implemented)
// ============================================================================

// Root endpoint
app.get('/', (c) => {
  return c.json({
    success: true,
    message: 'Wealth Management API',
    version: '1.0.0',
    endpoints: {
      health: '/api/health',
      upload: '/api/upload/parse-excel',
      configure: {
        columns: 'POST /api/configure/columns',
        saveMappings: 'POST /api/configure/save-mappings',
        getMappings: 'GET /api/configure/mappings',
        transactionTypes: 'POST /api/configure/transaction-types',
        saveTransactionTypeMappings: 'POST /api/configure/save-transaction-type-mappings',
        getTransactionTypeMappings: 'GET /api/configure/transaction-type-mappings',
        investments: 'POST /api/configure/investments',
        saveInvestments: 'POST /api/configure/save-investments',
        getInvestmentsList: 'GET /api/configure/investments-list',
        status: 'GET /api/configure/status',
      },
      reports: '/api/reports (coming soon)',
      investments: '/api/investments (coming soon)',
      settings: '/api/settings (coming soon)',
    },
  });
});

// Import routes
import upload from './routes/upload';
import configure from './routes/configure';
import test from './routes/test';
import commitments from './routes/commitments';
import reports from './routes/reports';
// import investments from './routes/investments';
// import settings from './routes/settings';

// Mount routes
app.route('/api/upload', upload);
app.route('/api/configure', configure);
app.route('/api/test', test);
app.route('/api', commitments); // Commitments routes (includes /api/investments/:id/commitments and /api/commitments/:id)
app.route('/api/reports', reports);
// app.route('/api/investments', investments);
// app.route('/api/settings', settings);

// ============================================================================
// ERROR HANDLING
// ============================================================================

app.notFound((c) => {
  return c.json({
    success: false,
    error: 'Not Found',
    message: `Route ${c.req.method} ${c.req.path} not found`,
  }, 404);
});

app.onError((err, c) => {
  console.error('Error:', err);
  return c.json({
    success: false,
    error: 'Internal Server Error',
    message: err.message,
  }, 500);
});

// ============================================================================
// EXPORT
// ============================================================================

export default app;
