/**
 * Upload Routes
 * Handles CSV file uploads and parsing
 */

import { Hono } from 'hono';
import type { Env, ApiResponse } from '../types';
import {
  parseCSVFile,
  validateCSVFile,
  parseCSVData,
  type ParsedCSV,
} from '../services/csv-parser';
import { previewTransactions, type PreviewResult } from '../services/preview';
import { importTransactions, type ImportTransaction, type ImportSummary, type ImportOptions } from '../services/import';
import {
  discoverInvestments,
  createInvestments,
  type InvestmentDiscoveryResult,
  type InvestmentTriplet,
} from '../services/investment-discovery';
import {
  importTransactions as importTransactionsStatic,
  type TransactionImportResult,
} from '../services/transaction-import';

const upload = new Hono<{ Bindings: Env }>();

/**
 * POST /api/upload/parse-csv
 * Parse CSV file and return column information with samples
 *
 * Body: multipart/form-data with 'file' field
 */
upload.post('/parse-csv', async (c) => {
  try {
    // Get the uploaded file from form data
    const formData = await c.req.formData();
    const file = formData.get('file');

    if (!file || !(file instanceof File)) {
      return c.json<ApiResponse>({
        success: false,
        error: 'No file uploaded',
        message: 'Please provide a CSV file in the "file" field',
      }, 400);
    }

    // Validate file extension
    if (!validateCSVFile(file.name)) {
      return c.json<ApiResponse>({
        success: false,
        error: 'Invalid file type',
        message: 'Please upload a valid CSV file (.csv)',
      }, 400);
    }

    // Check file size (max 10MB)
    const maxSize = 10 * 1024 * 1024; // 10MB
    if (file.size > maxSize) {
      return c.json<ApiResponse>({
        success: false,
        error: 'File too large',
        message: `File size must be less than ${maxSize / 1024 / 1024}MB`,
      }, 400);
    }

    // Convert file to ArrayBuffer
    const arrayBuffer = await file.arrayBuffer();

    // Parse the CSV file
    const result: ParsedCSV = parseCSVFile(arrayBuffer);

    return c.json<ApiResponse<ParsedCSV>>({
      success: true,
      message: 'CSV file parsed successfully',
      data: result,
    });

  } catch (error) {
    console.error('Error parsing CSV file:', error);
    return c.json<ApiResponse>({
      success: false,
      error: 'Failed to parse CSV file',
      message: error instanceof Error ? error.message : 'Unknown error occurred',
    }, 500);
  }
});

/**
 * POST /api/upload/preview
 * Preview transactions before import (with normalization and deduplication)
 *
 * Body: multipart/form-data with 'file' field
 * Query params:
 * - dry_run=true: Explicitly mark as dry run (preview is always non-destructive)
 */
upload.post('/preview', async (c) => {
  try {
    // Get the uploaded file from form data
    const formData = await c.req.formData();
    const file = formData.get('file');

    if (!file || !(file instanceof File)) {
      return c.json<ApiResponse>({
        success: false,
        error: 'No file uploaded',
        message: 'Please provide a CSV file in the "file" field',
      }, 400);
    }

    // Validate file extension
    if (!validateCSVFile(file.name)) {
      return c.json<ApiResponse>({
        success: false,
        error: 'Invalid file type',
        message: 'Please upload a valid CSV file (.csv)',
      }, 400);
    }

    // Check file size (max 10MB)
    const maxSize = 10 * 1024 * 1024; // 10MB
    if (file.size > maxSize) {
      return c.json<ApiResponse>({
        success: false,
        error: 'File too large',
        message: `File size must be less than ${maxSize / 1024 / 1024}MB`,
      }, 400);
    }

    // Get dry_run from query params
    const dryRun = c.req.query('dry_run') === 'true';

    // Convert file to ArrayBuffer
    const arrayBuffer = await file.arrayBuffer();

    // Preview transactions
    const result: PreviewResult = await previewTransactions(
      c.env.DB,
      arrayBuffer,
      undefined,
      c.env
    );

    // Add dry_run indicator if requested
    const resultWithDryRun = dryRun
      ? { ...result, dry_run: true }
      : result;

    const message = dryRun
      ? '[DRY RUN] Transaction preview generated (no data will be saved)'
      : 'Transaction preview generated successfully';

    if (dryRun) {
      console.log(`[DRY RUN] Preview generated for ${result.transactions.length} transactions`);
    }

    return c.json<ApiResponse<PreviewResult & { dry_run?: boolean }>>({
      success: true,
      message,
      data: resultWithDryRun,
    });

  } catch (error) {
    console.error('Error generating preview:', error);
    return c.json<ApiResponse>({
      success: false,
      error: 'Failed to generate preview',
      message: error instanceof Error ? error.message : 'Unknown error occurred',
    }, 500);
  }
});

/**
 * POST /api/upload/commit
 * Commit transactions to database
 *
 * Body: JSON array of transactions to import
 * {
 *   transactions: ImportTransaction[],
 *   options?: {
 *     source_file?: string,
 *     skip_duplicates?: boolean,
 *     force_import?: boolean
 *   }
 * }
 *
 * Query params:
 * - dry_run=true: Perform validation without saving to database
 */
upload.post('/commit', async (c) => {
  try {
    const body = await c.req.json<{
      transactions: ImportTransaction[];
      options?: ImportOptions;
    }>();

    const { transactions, options = {} } = body;

    // Check for dry run mode
    const dryRun = c.req.query('dry_run') === 'true';

    if (!Array.isArray(transactions) || transactions.length === 0) {
      return c.json<ApiResponse>({
        success: false,
        error: 'Invalid input',
        message: 'Transactions must be a non-empty array',
      }, 400);
    }

    // Dry run mode: validate but don't import
    if (dryRun) {
      console.log(`[DRY RUN] Would import ${transactions.length} transactions`);

      // Perform validation without database operations
      const summary: ImportSummary & { dry_run: boolean } = {
        total: transactions.length,
        imported: 0,
        skipped: 0,
        failed: 0,
        transaction_ids: [],
        errors: [],
        dry_run: true,
      };

      // Simulate what would happen (count duplicates, check for issues)
      let wouldImport = 0;
      let wouldSkip = 0;

      for (const transaction of transactions) {
        const { dedup, normalized } = transaction;

        // Check if would be skipped due to duplicate
        if (options.skip_duplicates !== false && dedup.is_duplicate) {
          wouldSkip++;
          continue;
        }

        // Check if would be skipped due to missing required fields
        if (!options.force_import && (!normalized.date_iso || normalized.amount_original === null)) {
          wouldSkip++;
          continue;
        }

        wouldImport++;
      }

      summary.imported = wouldImport;
      summary.skipped = wouldSkip;

      return c.json<ApiResponse<ImportSummary & { dry_run: boolean }>>({
        success: true,
        message: `[DRY RUN] Would import ${wouldImport} transactions, skip ${wouldSkip}. No changes made to database.`,
        data: summary,
      });
    }

    // Normal mode: actually import transactions
    const summary: ImportSummary = await importTransactions(
      c.env.DB,
      transactions,
      options
    );

    return c.json<ApiResponse<ImportSummary>>({
      success: true,
      message: `Import complete: ${summary.imported} imported, ${summary.skipped} skipped, ${summary.failed} failed`,
      data: summary,
    });

  } catch (error) {
    console.error('Error importing transactions:', error);
    return c.json<ApiResponse>({
      success: false,
      error: 'Failed to import transactions',
      message: error instanceof Error ? error.message : 'Unknown error occurred',
    }, 500);
  }
});

/**
 * POST /api/upload/discover-investments
 * Phase 1: Discover investments in uploaded CSV file
 *
 * Body: multipart/form-data with 'file' field
 */
upload.post('/discover-investments', async (c) => {
  try {
    // Get the uploaded file from form data
    const formData = await c.req.formData();
    const file = formData.get('file');

    if (!file || !(file instanceof File)) {
      return c.json<ApiResponse>({
        success: false,
        error: 'No file uploaded',
        message: 'Please provide a CSV file in the "file" field',
      }, 400);
    }

    // Validate file extension
    if (!validateCSVFile(file.name)) {
      return c.json<ApiResponse>({
        success: false,
        error: 'Invalid file type',
        message: 'Please upload a valid CSV file (.csv)',
      }, 400);
    }

    // Check file size (max 10MB)
    const maxSize = 10 * 1024 * 1024; // 10MB
    if (file.size > maxSize) {
      return c.json<ApiResponse>({
        success: false,
        error: 'File too large',
        message: `File size must be less than ${maxSize / 1024 / 1024}MB`,
      }, 400);
    }

    // Convert file to ArrayBuffer
    const arrayBuffer = await file.arrayBuffer();

    // Parse CSV data
    const parsedData = parseCSVData(arrayBuffer);

    // Discover investments
    const result: InvestmentDiscoveryResult = await discoverInvestments(
      c.env.DB,
      parsedData.rows
    );

    return c.json<ApiResponse<InvestmentDiscoveryResult>>({
      success: true,
      message: `Found ${result.totalFound} investments: ${result.stats.existing} existing, ${result.stats.new} new`,
      data: result,
    });

  } catch (error) {
    console.error('Error discovering investments:', error);
    return c.json<ApiResponse>({
      success: false,
      error: 'Failed to discover investments',
      message: error instanceof Error ? error.message : 'Unknown error occurred',
    }, 500);
  }
});

/**
 * POST /api/upload/create-investments
 * Phase 1b: Create new investments in the database
 *
 * Body: JSON array of investment triplets to create
 * {
 *   investments: InvestmentTriplet[]
 * }
 */
upload.post('/create-investments', async (c) => {
  try {
    const body = await c.req.json<{
      investments: InvestmentTriplet[];
    }>();

    const { investments } = body;

    if (!Array.isArray(investments) || investments.length === 0) {
      return c.json<ApiResponse>({
        success: false,
        error: 'Invalid input',
        message: 'Investments must be a non-empty array',
      }, 400);
    }

    // Create investments
    const createdIds = await createInvestments(c.env.DB, investments);

    return c.json<ApiResponse<{ created: number; ids: number[] }>>({
      success: true,
      message: `Created ${createdIds.length} new investments`,
      data: {
        created: createdIds.length,
        ids: createdIds,
      },
    });

  } catch (error) {
    console.error('Error creating investments:', error);
    return c.json<ApiResponse>({
      success: false,
      error: 'Failed to create investments',
      message: error instanceof Error ? error.message : 'Unknown error occurred',
    }, 500);
  }
});

/**
 * POST /api/upload/import-transactions
 * Phase 2: Import transactions from CSV file
 *
 * Body: multipart/form-data with 'file' field
 */
upload.post('/import-transactions', async (c) => {
  try {
    // Get the uploaded file from form data
    const formData = await c.req.formData();
    const file = formData.get('file');

    if (!file || !(file instanceof File)) {
      return c.json<ApiResponse>({
        success: false,
        error: 'No file uploaded',
        message: 'Please provide a CSV file in the "file" field',
      }, 400);
    }

    // Validate file extension
    if (!validateCSVFile(file.name)) {
      return c.json<ApiResponse>({
        success: false,
        error: 'Invalid file type',
        message: 'Please upload a valid CSV file (.csv)',
      }, 400);
    }

    // Check file size (max 10MB)
    const maxSize = 10 * 1024 * 1024; // 10MB
    if (file.size > maxSize) {
      return c.json<ApiResponse>({
        success: false,
        error: 'File too large',
        message: `File size must be less than ${maxSize / 1024 / 1024}MB`,
      }, 400);
    }

    // Convert file to ArrayBuffer
    const arrayBuffer = await file.arrayBuffer();

    // Parse CSV data
    const parsedData = parseCSVData(arrayBuffer);

    // Import transactions
    const result: TransactionImportResult = await importTransactionsStatic(
      c.env.DB,
      parsedData.rows,
      file.name,
      c.env
    );

    return c.json<ApiResponse<TransactionImportResult>>({
      success: true,
      message: `Import complete: ${result.imported} imported, ${result.skipped} skipped`,
      data: result,
    });

  } catch (error) {
    console.error('Error importing transactions:', error);
    return c.json<ApiResponse>({
      success: false,
      error: 'Failed to import transactions',
      message: error instanceof Error ? error.message : 'Unknown error occurred',
    }, 500);
  }
});

/**
 * POST /api/upload/clear-tables
 * Clear all transactions and investments from the database
 * Note: Exchange rates are preserved to avoid expensive API calls
 */
upload.post('/clear-tables', async (c) => {
  try {
    console.log('[Clear Tables] Clearing transactions and investments...');

    // Clear transactions first (due to foreign key constraint)
    await c.env.DB.prepare('DELETE FROM transactions').run();
    console.log('[Clear Tables] Transactions cleared');

    // Clear investments
    await c.env.DB.prepare('DELETE FROM investments').run();
    console.log('[Clear Tables] Investments cleared');

    // Note: exchange_rates table is NOT cleared to preserve cached API data

    return c.json<ApiResponse>({
      success: true,
      message: 'Transactions and investments cleared (exchange rates preserved)',
    });
  } catch (error) {
    console.error('Error clearing tables:', error);
    return c.json<ApiResponse>({
      success: false,
      error: 'Failed to clear tables',
      message: error instanceof Error ? error.message : 'Unknown error occurred',
    }, 500);
  }
});

/**
 * GET /api/upload/test
 * Test endpoint to verify upload route is working
 */
upload.get('/test', (c) => {
  return c.json<ApiResponse>({
    success: true,
    message: 'Upload route is working',
    data: {
      availableEndpoints: [
        'POST /api/upload/parse-csv - Parse CSV file and extract columns',
        'POST /api/upload/preview - Preview transactions with normalization and dedup',
        'POST /api/upload/commit - Commit transactions to database',
        'POST /api/upload/discover-investments - Phase 1: Discover investments in CSV',
        'POST /api/upload/create-investments - Phase 1b: Create new investments',
        'POST /api/upload/import-transactions - Phase 2: Import transactions from CSV',
        'POST /api/upload/clear-tables - Clear all transactions and investments',
      ],
    },
  });
});

export default upload;
