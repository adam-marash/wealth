/**
 * Configure Routes
 * Handles interactive schema discovery and configuration
 */

import { Hono } from 'hono';
import type { Env, ApiResponse, ColumnMapping, CreateColumnMappingInput, ExcelColumn } from '../types';
import { parseExcelFile } from '../services/excel-parser';
import {
  getExchangeRate,
  batchFetchExchangeRates,
  setManualExchangeRate,
  getExchangeRatesForDate,
  currencySymbolToCode,
} from '../services/exchange-rate';
import {
  generateUniqueSlug,
  mapInvestmentName,
  resolveInvestmentSlug,
  getInvestmentNameVariations,
} from '../services/slug';

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

/**
 * POST /api/configure/transaction-types
 * Step 2: Extract unique transaction types from Excel file for classification
 *
 * Body: multipart/form-data with 'file' field
 * Returns: Unique transaction type values from the transaction_type column
 */
configure.post('/transaction-types', async (c) => {
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

    if (!result.selectedSheet) {
      return c.json<ApiResponse>({
        success: false,
        error: 'No sheet found',
        message: 'Could not find any sheet in the workbook',
      }, 400);
    }

    // Get column mappings to find which column is transaction_type
    const mappings = await c.env.DB.prepare(`
      SELECT excel_column_letter, mapped_field
      FROM column_mappings
      WHERE active = 1 AND mapped_field = 'transaction_type'
    `).first<{ excel_column_letter: string; mapped_field: string }>();

    if (!mappings) {
      return c.json<ApiResponse>({
        success: false,
        error: 'Transaction type column not mapped',
        message: 'Please configure column mappings first (POST /api/configure/save-mappings)',
      }, 400);
    }

    // Find the column with transaction types
    const transactionTypeColumn = result.selectedSheet.columns.find(
      col => col.letter === mappings.excel_column_letter
    );

    if (!transactionTypeColumn) {
      return c.json<ApiResponse>({
        success: false,
        error: 'Transaction type column not found',
        message: `Column ${mappings.excel_column_letter} not found in Excel file`,
      }, 400);
    }

    // Convert to full data to extract all unique values (not just samples)
    const arrayBuffer2 = await file.arrayBuffer();
    const XLSX = await import('xlsx');
    const workbook = XLSX.read(arrayBuffer2, { type: 'array' });
    const worksheet = workbook.Sheets[workbook.SheetNames[0]!];
    const data = XLSX.utils.sheet_to_json<unknown[]>(worksheet, {
      header: 1,
      defval: null,
      blankrows: false,
      raw: false,
    });

    // Find column index
    const colIndex = XLSX.utils.decode_col(mappings.excel_column_letter);

    // Extract unique values (skip header row)
    const uniqueTypes = new Set<string>();
    for (let i = 1; i < data.length; i++) {
      const row = data[i] as (string | number | null)[];
      const value = row[colIndex];
      if (value !== null && value !== undefined && value !== '') {
        uniqueTypes.add(String(value).trim());
      }
    }

    return c.json<ApiResponse<{ uniqueTypes: string[] }>>({
      success: true,
      message: `Found ${uniqueTypes.size} unique transaction types`,
      data: {
        uniqueTypes: Array.from(uniqueTypes).sort(),
      },
    });

  } catch (error) {
    console.error('Error extracting transaction types:', error);
    return c.json<ApiResponse>({
      success: false,
      error: 'Failed to extract transaction types',
      message: error instanceof Error ? error.message : 'Unknown error',
    }, 500);
  }
});

/**
 * POST /api/configure/save-transaction-type-mappings
 * Step 3: Save transaction type mappings (classification rules)
 *
 * Body: JSON array of transaction type mappings
 * [
 *   {
 *     raw_value: "משיכת תשואה",
 *     category: "distribution",
 *     directionality_rule: "as_is",
 *     cash_flow_impact: 1
 *   }
 * ]
 */
configure.post('/save-transaction-type-mappings', async (c) => {
  try {
    const mappings = await c.req.json<Array<{
      raw_value: string;
      category: string;
      directionality_rule: string;
      cash_flow_impact: number | null;
    }>>();

    if (!Array.isArray(mappings) || mappings.length === 0) {
      return c.json<ApiResponse>({
        success: false,
        error: 'Invalid input',
        message: 'Mappings must be a non-empty array',
      }, 400);
    }

    // Delete existing mappings for these raw values
    const rawValues = mappings.map(m => m.raw_value);
    const placeholders = rawValues.map(() => '?').join(',');
    await c.env.DB.prepare(
      `DELETE FROM transaction_type_mappings WHERE raw_value IN (${placeholders})`
    ).bind(...rawValues).run();

    // Insert new mappings
    const insertStmt = c.env.DB.prepare(`
      INSERT INTO transaction_type_mappings (
        raw_value,
        category,
        directionality_rule,
        cash_flow_impact
      ) VALUES (?, ?, ?, ?)
    `);

    const batch = mappings.map(mapping =>
      insertStmt.bind(
        mapping.raw_value,
        mapping.category,
        mapping.directionality_rule,
        mapping.cash_flow_impact
      )
    );

    await c.env.DB.batch(batch);

    return c.json<ApiResponse>({
      success: true,
      message: `Successfully saved ${mappings.length} transaction type mappings`,
    });

  } catch (error) {
    console.error('Error saving transaction type mappings:', error);
    return c.json<ApiResponse>({
      success: false,
      error: 'Failed to save transaction type mappings',
      message: error instanceof Error ? error.message : 'Unknown error',
    }, 500);
  }
});

/**
 * GET /api/configure/transaction-type-mappings
 * Get all transaction type mappings
 */
configure.get('/transaction-type-mappings', async (c) => {
  try {
    const result = await c.env.DB.prepare(`
      SELECT
        raw_value,
        category,
        directionality_rule,
        cash_flow_impact,
        created_at,
        updated_at
      FROM transaction_type_mappings
      ORDER BY raw_value ASC
    `).all<{
      raw_value: string;
      category: string;
      directionality_rule: string;
      cash_flow_impact: number | null;
      created_at: string;
      updated_at: string;
    }>();

    return c.json<ApiResponse>({
      success: true,
      data: result.results || [],
    });

  } catch (error) {
    console.error('Error fetching transaction type mappings:', error);
    return c.json<ApiResponse>({
      success: false,
      error: 'Failed to fetch transaction type mappings',
      message: error instanceof Error ? error.message : 'Unknown error',
    }, 500);
  }
});

/**
 * POST /api/configure/investments
 * Step 3: Extract unique investment names from Excel file
 *
 * Body: multipart/form-data with 'file' field
 * Returns: Unique investment names from the investment_name column
 */
configure.post('/investments', async (c) => {
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

    // Get column mappings to find which column is investment_name
    const mappings = await c.env.DB.prepare(`
      SELECT excel_column_letter, mapped_field
      FROM column_mappings
      WHERE active = 1 AND mapped_field = 'investment_name'
    `).first<{ excel_column_letter: string; mapped_field: string }>();

    if (!mappings) {
      return c.json<ApiResponse>({
        success: false,
        error: 'Investment name column not mapped',
        message: 'Please configure column mappings first (POST /api/configure/save-mappings)',
      }, 400);
    }

    // Parse Excel file to extract all unique investment names
    const arrayBuffer = await file.arrayBuffer();
    const XLSX = await import('xlsx');
    const workbook = XLSX.read(arrayBuffer, { type: 'array' });
    const worksheet = workbook.Sheets[workbook.SheetNames[0]!];
    const data = XLSX.utils.sheet_to_json<unknown[]>(worksheet, {
      header: 1,
      defval: null,
      blankrows: false,
      raw: false,
    });

    // Find column index
    const colIndex = XLSX.utils.decode_col(mappings.excel_column_letter);

    // Extract unique values (skip header row)
    const uniqueInvestments = new Set<string>();
    for (let i = 1; i < data.length; i++) {
      const row = data[i] as (string | number | null)[];
      const value = row[colIndex];
      if (value !== null && value !== undefined && value !== '') {
        uniqueInvestments.add(String(value).trim());
      }
    }

    return c.json<ApiResponse<{ uniqueInvestments: string[] }>>({
      success: true,
      message: `Found ${uniqueInvestments.size} unique investments`,
      data: {
        uniqueInvestments: Array.from(uniqueInvestments).sort(),
      },
    });

  } catch (error) {
    console.error('Error extracting investments:', error);
    return c.json<ApiResponse>({
      success: false,
      error: 'Failed to extract investments',
      message: error instanceof Error ? error.message : 'Unknown error',
    }, 500);
  }
});

/**
 * POST /api/configure/save-investments
 * Step 4: Save investments with optional grouping
 *
 * Body: JSON array of investments
 * [
 *   {
 *     name: "Faro-Point FRG-X",
 *     investment_group: "Real Estate",
 *     investment_type: "Real Estate",
 *     status: "active"
 *   }
 * ]
 *
 * IMPORTANT: This endpoint now generates unique slugs for each investment
 * and creates initial name mappings (canonical name → slug)
 */
configure.post('/save-investments', async (c) => {
  try {
    const investments = await c.req.json<Array<{
      name: string;
      investment_group?: string;
      investment_type?: string;
      initial_commitment?: number;
      committed_currency?: string;
      commitment_date?: string;
      status?: string;
    }>>();

    if (!Array.isArray(investments) || investments.length === 0) {
      return c.json<ApiResponse>({
        success: false,
        error: 'Invalid input',
        message: 'Investments must be a non-empty array',
      }, 400);
    }

    // Generate unique slugs for each investment
    const investmentsWithSlugs = await Promise.all(
      investments.map(async (inv) => ({
        ...inv,
        slug: await generateUniqueSlug(c.env.DB, inv.name),
      }))
    );

    // Insert or update investments
    const insertStmt = c.env.DB.prepare(`
      INSERT INTO investments (
        name,
        slug,
        investment_group,
        investment_type,
        initial_commitment,
        committed_currency,
        commitment_date,
        status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(name) DO UPDATE SET
        slug = excluded.slug,
        investment_group = excluded.investment_group,
        investment_type = excluded.investment_type,
        initial_commitment = excluded.initial_commitment,
        committed_currency = excluded.committed_currency,
        commitment_date = excluded.commitment_date,
        status = excluded.status,
        updated_at = datetime('now')
    `);

    const batch = investmentsWithSlugs.map(inv =>
      insertStmt.bind(
        inv.name,
        inv.slug,
        inv.investment_group || null,
        inv.investment_type || null,
        inv.initial_commitment || null,
        inv.committed_currency || null,
        inv.commitment_date || null,
        inv.status || 'active'
      )
    );

    await c.env.DB.batch(batch);

    // Create initial name mappings (canonical name → slug)
    const mappingBatch = investmentsWithSlugs.map(inv =>
      mapInvestmentName(c.env.DB, inv.name, inv.slug)
    );

    await Promise.all(mappingBatch);

    return c.json<ApiResponse>({
      success: true,
      message: `Successfully saved ${investments.length} investments with slugs`,
      data: {
        investments: investmentsWithSlugs.map(inv => ({
          name: inv.name,
          slug: inv.slug,
        })),
      },
    });

  } catch (error) {
    console.error('Error saving investments:', error);
    return c.json<ApiResponse>({
      success: false,
      error: 'Failed to save investments',
      message: error instanceof Error ? error.message : 'Unknown error',
    }, 500);
  }
});

/**
 * GET /api/configure/investments-list
 * Get all investments with their slugs and name variations
 */
configure.get('/investments-list', async (c) => {
  try {
    const result = await c.env.DB.prepare(`
      SELECT
        id,
        name,
        slug,
        investment_group,
        investment_type,
        initial_commitment,
        committed_currency,
        commitment_date,
        status,
        created_at,
        updated_at
      FROM investments
      ORDER BY name ASC
    `).all<{
      id: number;
      name: string;
      slug: string | null;
      investment_group: string | null;
      investment_type: string | null;
      initial_commitment: number | null;
      committed_currency: string | null;
      commitment_date: string | null;
      status: string;
      created_at: string;
      updated_at: string;
    }>();

    return c.json<ApiResponse>({
      success: true,
      data: result.results || [],
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

/**
 * POST /api/configure/map-investment-name
 * Map a raw investment name (variation) to a canonical slug
 *
 * Body: { raw_name: "פארופוינט FRG-X", slug: "faro-point-frg-x" }
 *
 * Use cases:
 * - During data review: map unmapped names to existing investments
 * - Manual correction: fix mis-mapped names
 * - Multi-script handling: map Hebrew/English variations to same slug
 */
configure.post('/map-investment-name', async (c) => {
  try {
    const { raw_name, slug } = await c.req.json<{
      raw_name: string;
      slug: string;
    }>();

    if (!raw_name || !slug) {
      return c.json<ApiResponse>({
        success: false,
        error: 'Missing required fields',
        message: 'raw_name and slug are required',
      }, 400);
    }

    // Verify the slug exists in investments table
    const investment = await c.env.DB.prepare(`
      SELECT name FROM investments WHERE slug = ?
    `).bind(slug).first<{ name: string }>();

    if (!investment) {
      return c.json<ApiResponse>({
        success: false,
        error: 'Invalid slug',
        message: `No investment found with slug "${slug}"`,
      }, 400);
    }

    // Create the mapping
    await mapInvestmentName(c.env.DB, raw_name, slug);

    return c.json<ApiResponse>({
      success: true,
      message: `Mapped "${raw_name}" → "${slug}" (${investment.name})`,
    });

  } catch (error) {
    console.error('Error mapping investment name:', error);
    return c.json<ApiResponse>({
      success: false,
      error: 'Failed to map investment name',
      message: error instanceof Error ? error.message : 'Unknown error',
    }, 500);
  }
});

/**
 * GET /api/configure/investment-variations/:slug
 * Get all name variations mapped to a specific slug
 *
 * Params: slug (investment slug)
 * Returns: Array of raw names mapped to this slug
 */
configure.get('/investment-variations/:slug', async (c) => {
  try {
    const slug = c.req.param('slug');

    if (!slug) {
      return c.json<ApiResponse>({
        success: false,
        error: 'Missing slug parameter',
        message: 'Please provide a slug',
      }, 400);
    }

    // Verify slug exists
    const investment = await c.env.DB.prepare(`
      SELECT name FROM investments WHERE slug = ?
    `).bind(slug).first<{ name: string }>();

    if (!investment) {
      return c.json<ApiResponse>({
        success: false,
        error: 'Invalid slug',
        message: `No investment found with slug "${slug}"`,
      }, 404);
    }

    // Get all variations
    const variations = await getInvestmentNameVariations(c.env.DB, slug);

    return c.json<ApiResponse<{ canonical_name: string; variations: string[] }>>({
      success: true,
      data: {
        canonical_name: investment.name,
        variations,
      },
      message: `Found ${variations.length} name variation(s) for "${investment.name}"`,
    });

  } catch (error) {
    console.error('Error fetching investment variations:', error);
    return c.json<ApiResponse>({
      success: false,
      error: 'Failed to fetch investment variations',
      message: error instanceof Error ? error.message : 'Unknown error',
    }, 500);
  }
});

/**
 * POST /api/configure/resolve-investment-slug
 * Resolve a raw investment name to its canonical slug
 * Useful for testing the resolution logic
 *
 * Body: { raw_name: "Faro-Point FRG-X" }
 * Returns: { slug: "faro-point-frg-x" } or { slug: null } if unmapped
 */
configure.post('/resolve-investment-slug', async (c) => {
  try {
    const { raw_name } = await c.req.json<{ raw_name: string }>();

    if (!raw_name) {
      return c.json<ApiResponse>({
        success: false,
        error: 'Missing required field',
        message: 'raw_name is required',
      }, 400);
    }

    const slug = await resolveInvestmentSlug(c.env.DB, raw_name);

    if (slug) {
      // Get canonical name
      const investment = await c.env.DB.prepare(`
        SELECT name FROM investments WHERE slug = ?
      `).bind(slug).first<{ name: string }>();

      return c.json<ApiResponse<{ raw_name: string; slug: string; canonical_name: string }>>({
        success: true,
        data: {
          raw_name,
          slug,
          canonical_name: investment?.name || slug,
        },
        message: `Resolved "${raw_name}" → "${slug}"`,
      });
    } else {
      return c.json<ApiResponse<{ raw_name: string; slug: null }>>({
        success: true,
        data: {
          raw_name,
          slug: null,
        },
        message: `"${raw_name}" is not mapped. Flag for review.`,
      });
    }

  } catch (error) {
    console.error('Error resolving investment slug:', error);
    return c.json<ApiResponse>({
      success: false,
      error: 'Failed to resolve investment slug',
      message: error instanceof Error ? error.message : 'Unknown error',
    }, 500);
  }
});

/**
 * POST /api/configure/exchange-rates/fetch
 * Fetch exchange rate for a specific date and currency
 *
 * Body: { date: "2024-01-15", fromCurrency: "EUR", toCurrency: "USD" }
 * Returns: Exchange rate (cached if available, fetched from API if not)
 */
configure.post('/exchange-rates/fetch', async (c) => {
  try {
    const { date, fromCurrency, toCurrency = 'USD' } = await c.req.json<{
      date: string;
      fromCurrency: string;
      toCurrency?: string;
    }>();

    if (!date || !fromCurrency) {
      return c.json<ApiResponse>({
        success: false,
        error: 'Missing required fields',
        message: 'date and fromCurrency are required',
      }, 400);
    }

    // Validate date format (basic check for YYYY-MM-DD)
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return c.json<ApiResponse>({
        success: false,
        error: 'Invalid date format',
        message: 'Date must be in ISO 8601 format (YYYY-MM-DD)',
      }, 400);
    }

    const rate = await getExchangeRate(c.env.DB, date, fromCurrency, toCurrency, c.env);

    if (rate === null) {
      return c.json<ApiResponse>({
        success: false,
        error: 'Exchange rate not available',
        message: `Could not fetch exchange rate for ${fromCurrency}→${toCurrency} on ${date}`,
      }, 404);
    }

    return c.json<ApiResponse<{ rate: number; date: string; from: string; to: string }>>({
      success: true,
      data: {
        rate,
        date,
        from: currencySymbolToCode(fromCurrency),
        to: currencySymbolToCode(toCurrency),
      },
    });

  } catch (error) {
    console.error('Error fetching exchange rate:', error);
    return c.json<ApiResponse>({
      success: false,
      error: 'Failed to fetch exchange rate',
      message: error instanceof Error ? error.message : 'Unknown error',
    }, 500);
  }
});

/**
 * POST /api/configure/exchange-rates/batch
 * Pre-fetch exchange rates for multiple dates and currencies
 * Useful before transaction import to cache all needed rates
 *
 * Body: { dates: ["2024-01-15", "2024-01-16"], currencies: ["EUR", "$", "€"] }
 * Returns: Summary of fetched, cached, and failed rates
 */
configure.post('/exchange-rates/batch', async (c) => {
  try {
    const { dates, currencies } = await c.req.json<{
      dates: string[];
      currencies: string[];
    }>();

    if (!Array.isArray(dates) || !Array.isArray(currencies)) {
      return c.json<ApiResponse>({
        success: false,
        error: 'Invalid input',
        message: 'dates and currencies must be arrays',
      }, 400);
    }

    if (dates.length === 0 || currencies.length === 0) {
      return c.json<ApiResponse>({
        success: false,
        error: 'Empty input',
        message: 'dates and currencies arrays cannot be empty',
      }, 400);
    }

    // Validate all dates
    for (const date of dates) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
        return c.json<ApiResponse>({
          success: false,
          error: 'Invalid date format',
          message: `Date "${date}" is not in ISO 8601 format (YYYY-MM-DD)`,
        }, 400);
      }
    }

    const result = await batchFetchExchangeRates(c.env.DB, dates, currencies, c.env);

    return c.json<ApiResponse<{ fetched: number; cached: number; failed: number }>>({
      success: true,
      message: `Processed ${result.fetched + result.cached + result.failed} rate requests`,
      data: result,
    });

  } catch (error) {
    console.error('Error batch fetching exchange rates:', error);
    return c.json<ApiResponse>({
      success: false,
      error: 'Failed to batch fetch exchange rates',
      message: error instanceof Error ? error.message : 'Unknown error',
    }, 500);
  }
});

/**
 * POST /api/configure/exchange-rates/manual
 * Set manual exchange rate override
 *
 * Body: { date: "2024-01-15", fromCurrency: "EUR", toCurrency: "USD", rate: 1.09 }
 * Returns: Success confirmation
 */
configure.post('/exchange-rates/manual', async (c) => {
  try {
    const { date, fromCurrency, toCurrency, rate } = await c.req.json<{
      date: string;
      fromCurrency: string;
      toCurrency: string;
      rate: number;
    }>();

    if (!date || !fromCurrency || !toCurrency || rate === undefined) {
      return c.json<ApiResponse>({
        success: false,
        error: 'Missing required fields',
        message: 'date, fromCurrency, toCurrency, and rate are required',
      }, 400);
    }

    // Validate date format
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return c.json<ApiResponse>({
        success: false,
        error: 'Invalid date format',
        message: 'Date must be in ISO 8601 format (YYYY-MM-DD)',
      }, 400);
    }

    // Validate rate is positive
    if (typeof rate !== 'number' || rate <= 0) {
      return c.json<ApiResponse>({
        success: false,
        error: 'Invalid rate',
        message: 'Rate must be a positive number',
      }, 400);
    }

    await setManualExchangeRate(c.env.DB, date, fromCurrency, toCurrency, rate);

    return c.json<ApiResponse>({
      success: true,
      message: `Manual exchange rate set: ${fromCurrency}→${toCurrency} = ${rate} on ${date}`,
    });

  } catch (error) {
    console.error('Error setting manual exchange rate:', error);
    return c.json<ApiResponse>({
      success: false,
      error: 'Failed to set manual exchange rate',
      message: error instanceof Error ? error.message : 'Unknown error',
    }, 500);
  }
});

/**
 * GET /api/configure/exchange-rates/:date
 * Get all cached exchange rates for a specific date
 *
 * Params: date (YYYY-MM-DD)
 * Returns: Array of exchange rates for that date
 */
configure.get('/exchange-rates/:date', async (c) => {
  try {
    const date = c.req.param('date');

    // Validate date format
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return c.json<ApiResponse>({
        success: false,
        error: 'Invalid date format',
        message: 'Date must be in ISO 8601 format (YYYY-MM-DD)',
      }, 400);
    }

    const rates = await getExchangeRatesForDate(c.env.DB, date);

    return c.json<ApiResponse>({
      success: true,
      data: rates,
      message: rates.length > 0
        ? `Found ${rates.length} cached rates for ${date}`
        : `No cached rates found for ${date}`,
    });

  } catch (error) {
    console.error('Error fetching exchange rates for date:', error);
    return c.json<ApiResponse>({
      success: false,
      error: 'Failed to fetch exchange rates',
      message: error instanceof Error ? error.message : 'Unknown error',
    }, 500);
  }
});

export default configure;
