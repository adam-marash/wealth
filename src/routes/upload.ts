/**
 * Upload Routes
 * Handles Excel file uploads and parsing
 */

import { Hono } from 'hono';
import type { Env, ApiResponse } from '../types';
import {
  parseExcelFile,
  validateExcelFile,
  type ParseExcelResult,
} from '../services/excel-parser';
import { previewTransactions, type PreviewResult } from '../services/preview';
import { importTransactions, type ImportTransaction, type ImportSummary, type ImportOptions } from '../services/import';

const upload = new Hono<{ Bindings: Env }>();

/**
 * POST /api/upload/parse-excel
 * Parse Excel file and return column information with samples
 *
 * Body: multipart/form-data with 'file' field
 * Optional query param: ?sheetIndex=0 (to specify which sheet to parse)
 */
upload.post('/parse-excel', async (c) => {
  try {
    // Get the uploaded file from form data
    const formData = await c.req.formData();
    const file = formData.get('file');

    if (!file || !(file instanceof File)) {
      return c.json<ApiResponse>({
        success: false,
        error: 'No file uploaded',
        message: 'Please provide an Excel file in the "file" field',
      }, 400);
    }

    // Validate file extension
    if (!validateExcelFile(file.name)) {
      return c.json<ApiResponse>({
        success: false,
        error: 'Invalid file type',
        message: 'Please upload a valid Excel file (.xlsx, .xls, .xlsm, .xlsb)',
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

    // Get optional sheet index from query params
    const sheetIndexParam = c.req.query('sheetIndex');
    const sheetIndex = sheetIndexParam ? parseInt(sheetIndexParam, 10) : undefined;

    // Convert file to ArrayBuffer
    const arrayBuffer = await file.arrayBuffer();

    // Parse the Excel file
    const result: ParseExcelResult = parseExcelFile(arrayBuffer, sheetIndex);

    return c.json<ApiResponse<ParseExcelResult>>({
      success: true,
      message: 'Excel file parsed successfully',
      data: result,
    });

  } catch (error) {
    console.error('Error parsing Excel file:', error);
    return c.json<ApiResponse>({
      success: false,
      error: 'Failed to parse Excel file',
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
 * - sheetIndex=0: Specify which sheet to parse
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
        message: 'Please provide an Excel file in the "file" field',
      }, 400);
    }

    // Validate file extension
    if (!validateExcelFile(file.name)) {
      return c.json<ApiResponse>({
        success: false,
        error: 'Invalid file type',
        message: 'Please upload a valid Excel file (.xlsx, .xls, .xlsm, .xlsb)',
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

    // Get optional sheet index and dry_run from query params
    const sheetIndexParam = c.req.query('sheetIndex');
    const sheetIndex = sheetIndexParam ? parseInt(sheetIndexParam, 10) : undefined;
    const dryRun = c.req.query('dry_run') === 'true';

    // Convert file to ArrayBuffer
    const arrayBuffer = await file.arrayBuffer();

    // Preview transactions
    const result: PreviewResult = await previewTransactions(
      c.env.DB,
      arrayBuffer,
      sheetIndex,
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
 * GET /api/upload/test
 * Test endpoint to verify upload route is working
 */
upload.get('/test', (c) => {
  return c.json<ApiResponse>({
    success: true,
    message: 'Upload route is working',
    data: {
      availableEndpoints: [
        'POST /api/upload/parse-excel - Parse Excel file and extract columns',
        'POST /api/upload/preview - Preview transactions with normalization and dedup',
        'POST /api/upload/commit - Commit transactions to database',
      ],
    },
  });
});

export default upload;
