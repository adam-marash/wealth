/**
 * Configure Routes
 * Handles interactive schema discovery and configuration
 */

import { Hono } from 'hono';
import type { Env, ApiResponse, ColumnMapping, CreateColumnMappingInput, ExcelColumn } from '../types';
import { parseExcelFile } from '../services/excel-parser';

const configure = new Hono<{ Bindings: Env }>();

/**
 * POST /api/configure/columns
 * Step 1: Parse Excel and allow user to map columns to fields
 *
 * Body: multipart/form-data with 'file' field
 * Returns: Parsed columns with samples for user to map
 */
configure.post('/columns', async (c) => {
  try {
    // Get the uploaded file
    const formData = await c.req.formData();
    const file = formData.get('file');

    if (!file || !(file instanceof File)) {
      return c.json<ApiResponse>({
        success: false,
        error: 'No file uploaded',
        message: 'Please provide an Excel file in the "file" field',
      }, 400);
    }

    // Parse the Excel file
    const arrayBuffer = await file.arrayBuffer();
    const result = parseExcelFile(arrayBuffer);

    // Return columns for user to map
    return c.json<ApiResponse<{ columns: ExcelColumn[] }>>({
      success: true,
      message: 'Columns extracted. Please map each column to a field.',
      data: {
        columns: result.selectedSheet?.columns || [],
      },
    });

  } catch (error) {
    console.error('Error in column configuration:', error);
    return c.json<ApiResponse>({
      success: false,
      error: 'Failed to configure columns',
      message: error instanceof Error ? error.message : 'Unknown error',
    }, 500);
  }
});

/**
 * POST /api/configure/save-mappings
 * Step 2: Save user's column mappings to database
 *
 * Body: JSON array of column mappings
 * [
 *   { excel_column_letter: "A", excel_column_name: "תאריך", mapped_field: "date" },
 *   { excel_column_letter: "B", excel_column_name: "סכום", mapped_field: "amount" }
 * ]
 */
configure.post('/save-mappings', async (c) => {
  try {
    const mappings = await c.req.json<CreateColumnMappingInput[]>();

    if (!Array.isArray(mappings) || mappings.length === 0) {
      return c.json<ApiResponse>({
        success: false,
        error: 'Invalid input',
        message: 'Mappings must be a non-empty array',
      }, 400);
    }

    // Deactivate all existing mappings first
    await c.env.DB.prepare(
      'UPDATE column_mappings SET active = 0 WHERE active = 1'
    ).run();

    // Insert new mappings
    const insertStmt = c.env.DB.prepare(`
      INSERT INTO column_mappings (
        excel_column_letter,
        excel_column_name,
        mapped_field,
        active
      ) VALUES (?, ?, ?, 1)
    `);

    // Use batch for efficiency
    const batch = mappings
      .filter(m => m.mapped_field !== 'ignore') // Don't save ignored columns
      .map(mapping =>
        insertStmt.bind(
          mapping.excel_column_letter || null,
          mapping.excel_column_name,
          mapping.mapped_field
        )
      );

    await c.env.DB.batch(batch);

    return c.json<ApiResponse>({
      success: true,
      message: `Successfully saved ${mappings.length} column mappings`,
    });

  } catch (error) {
    console.error('Error saving column mappings:', error);
    return c.json<ApiResponse>({
      success: false,
      error: 'Failed to save mappings',
      message: error instanceof Error ? error.message : 'Unknown error',
    }, 500);
  }
});

/**
 * GET /api/configure/mappings
 * Get current active column mappings
 */
configure.get('/mappings', async (c) => {
  try {
    const result = await c.env.DB.prepare(`
      SELECT
        id,
        excel_column_letter,
        excel_column_name,
        mapped_field,
        active,
        date_format,
        created_at,
        updated_at
      FROM column_mappings
      WHERE active = 1
      ORDER BY id ASC
    `).all<ColumnMapping>();

    return c.json<ApiResponse<ColumnMapping[]>>({
      success: true,
      data: result.results || [],
    });

  } catch (error) {
    console.error('Error fetching column mappings:', error);
    return c.json<ApiResponse>({
      success: false,
      error: 'Failed to fetch mappings',
      message: error instanceof Error ? error.message : 'Unknown error',
    }, 500);
  }
});

/**
 * DELETE /api/configure/mappings
 * Clear all column mappings (reset configuration)
 */
configure.delete('/mappings', async (c) => {
  try {
    await c.env.DB.prepare('DELETE FROM column_mappings').run();

    return c.json<ApiResponse>({
      success: true,
      message: 'All column mappings cleared',
    });

  } catch (error) {
    console.error('Error clearing column mappings:', error);
    return c.json<ApiResponse>({
      success: false,
      error: 'Failed to clear mappings',
      message: error instanceof Error ? error.message : 'Unknown error',
    }, 500);
  }
});

/**
 * GET /api/configure/status
 * Check if system is configured
 */
configure.get('/status', async (c) => {
  try {
    // Check for column mappings
    const columnMappingsResult = await c.env.DB.prepare(
      'SELECT COUNT(*) as count FROM column_mappings WHERE active = 1'
    ).first<{ count: number }>();

    // Check for transaction type mappings
    const typeMappingsResult = await c.env.DB.prepare(
      'SELECT COUNT(*) as count FROM transaction_type_mappings'
    ).first<{ count: number }>();

    // Check for investments
    const investmentsResult = await c.env.DB.prepare(
      'SELECT COUNT(*) as count FROM investments'
    ).first<{ count: number }>();

    const hasColumnMappings = (columnMappingsResult?.count || 0) > 0;
    const hasTransactionTypeMappings = (typeMappingsResult?.count || 0) > 0;
    const hasInvestments = (investmentsResult?.count || 0) > 0;

    return c.json<ApiResponse>({
      success: true,
      data: {
        hasColumnMappings,
        hasTransactionTypeMappings,
        hasInvestments,
        isConfigured: hasColumnMappings && hasTransactionTypeMappings && hasInvestments,
        columnMappingsCount: columnMappingsResult?.count || 0,
        transactionTypeMappingsCount: typeMappingsResult?.count || 0,
        investmentsCount: investmentsResult?.count || 0,
      },
    });

  } catch (error) {
    console.error('Error checking configuration status:', error);
    return c.json<ApiResponse>({
      success: false,
      error: 'Failed to check status',
      message: error instanceof Error ? error.message : 'Unknown error',
    }, 500);
  }
});

export default configure;
