/**
 * Configure Routes
 * Handles interactive schema discovery and configuration
 */

import { Hono } from 'hono';
import type { Env, ApiResponse, ColumnMapping, CreateColumnMappingInput } from '../types';
import { parseCSVFile, type CSVColumn } from '../services/csv-parser';
import {
  getExchangeRate,
  batchFetchExchangeRates,
  setManualExchangeRate,
  getExchangeRatesForDate,
  currencySymbolToCode,
} from '../services/exchange-rate';
import {
  generateSlug,
  generateUniqueSlug,
  slugExists,
  mapInvestmentName,
  resolveInvestmentSlug,
  getInvestmentNameVariations,
} from '../services/slug';
import { suggestFieldForColumn, getConfidenceForSuggestion } from '../config/column-mapping-suggestions';

const configure = new Hono<{ Bindings: Env }>();

/**
 * POST /api/configure/columns
 * Step 1: Parse CSV and allow user to map columns to fields
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
        message: 'Please provide a CSV file in the "file" field',
      }, 400);
    }

    // Parse the CSV file
    const arrayBuffer = await file.arrayBuffer();
    const result = parseCSVFile(arrayBuffer);

    // Add suggested mappings to each column
    const columnsWithSuggestions = result.columns.map(column => ({
      ...column,
      suggestedField: suggestFieldForColumn(column.header),
      confidence: getConfidenceForSuggestion(column.header),
    }));

    // Return columns for user to map
    return c.json<ApiResponse<{ columns: (CSVColumn & { suggestedField: string; confidence?: string })[] }>>({
      success: true,
      message: 'Columns extracted with intelligent mapping suggestions.',
      data: {
        columns: columnsWithSuggestions,
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
 * Step 2: Extract unique transaction types from CSV file for classification
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
        message: 'Please provide a CSV file in the "file" field',
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

    // Parse CSV file to extract all unique transaction types
    const arrayBuffer = await file.arrayBuffer();
    const decoder = new TextDecoder('utf-8');
    const text = decoder.decode(arrayBuffer);
    const lines = text.split('\n').map(line => line.trim()).filter(line => line.length > 0);

    if (lines.length === 0) {
      return c.json<ApiResponse>({
        success: false,
        error: 'CSV file is empty',
        message: 'The uploaded CSV file contains no data',
      }, 400);
    }

    // Parse CSV line respecting quoted fields
    const parseCSVLine = (line: string): string[] => {
      const result: string[] = [];
      let current = '';
      let inQuotes = false;

      for (let i = 0; i < line.length; i++) {
        const char = line[i];
        if (char === '"') {
          if (inQuotes && line[i + 1] === '"') {
            current += '"';
            i++;
          } else {
            inQuotes = !inQuotes;
          }
        } else if (char === ',' && !inQuotes) {
          result.push(current.trim());
          current = '';
        } else {
          current += char;
        }
      }
      result.push(current.trim());
      return result;
    };

    // Convert column letter to index (A=0, B=1, etc.)
    const columnLetter = mappings.excel_column_letter;
    let colIndex = 0;
    for (let i = 0; i < columnLetter.length; i++) {
      colIndex = colIndex * 26 + (columnLetter.charCodeAt(i) - 65);
    }

    // Extract unique values (skip header row)
    const uniqueTypes = new Set<string>();
    for (let i = 1; i < lines.length; i++) {
      const row = parseCSVLine(lines[i]);
      const value = row[colIndex];
      if (value && value !== '') {
        uniqueTypes.add(value.trim());
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
 * Step 3: Extract unique investment names from CSV file
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
        message: 'Please provide a CSV file in the "file" field',
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

    // Parse CSV file to extract all unique investment names
    const arrayBuffer = await file.arrayBuffer();
    const decoder = new TextDecoder('utf-8');
    const text = decoder.decode(arrayBuffer);
    const lines = text.split('\n').map(line => line.trim()).filter(line => line.length > 0);

    if (lines.length === 0) {
      return c.json<ApiResponse>({
        success: false,
        error: 'CSV file is empty',
        message: 'The uploaded CSV file contains no data',
      }, 400);
    }

    // Parse CSV line respecting quoted fields
    const parseCSVLine = (line: string): string[] => {
      const result: string[] = [];
      let current = '';
      let inQuotes = false;

      for (let i = 0; i < line.length; i++) {
        const char = line[i];
        if (char === '"') {
          if (inQuotes && line[i + 1] === '"') {
            current += '"';
            i++;
          } else {
            inQuotes = !inQuotes;
          }
        } else if (char === ',' && !inQuotes) {
          result.push(current.trim());
          current = '';
        } else {
          current += char;
        }
      }
      result.push(current.trim());
      return result;
    };

    // Convert column letter to index (A=0, B=1, etc.)
    const columnLetter = mappings.excel_column_letter;
    let colIndex = 0;
    for (let i = 0; i < columnLetter.length; i++) {
      colIndex = colIndex * 26 + (columnLetter.charCodeAt(i) - 65);
    }

    // Extract unique values (skip header row)
    const uniqueInvestments = new Set<string>();
    for (let i = 1; i < lines.length; i++) {
      const row = parseCSVLine(lines[i]);
      const value = row[colIndex];
      if (value && value !== '') {
        uniqueInvestments.add(value.trim());
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
      slug?: string; // Optional: operator can provide custom slug
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

    // Generate or validate slugs for each investment
    const investmentsWithSlugs = await Promise.all(
      investments.map(async (inv) => {
        let slug: string;

        if (inv.slug) {
          // Operator provided custom slug - validate and ensure uniqueness
          const cleanSlug = generateSlug(inv.slug); // Sanitize the provided slug

          if (!cleanSlug) {
            throw new Error(`Invalid slug provided for "${inv.name}": must contain alphanumeric characters`);
          }

          // Make unique if already exists
          let finalSlug = cleanSlug;
          let counter = 2;
          while (await slugExists(c.env.DB, finalSlug)) {
            const baseSlug = cleanSlug.replace(/-\d+$/, '');
            finalSlug = `${baseSlug}-${counter}`;
            counter++;
          }

          slug = finalSlug;
        } else {
          // Auto-generate slug with transliteration
          slug = await generateUniqueSlug(c.env.DB, inv.name);
        }

        return {
          ...inv,
          slug,
        };
      })
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
        investments: investmentsWithSlugs.map((inv, i) => ({
          name: inv.name,
          slug: inv.slug,
          slug_was_custom: !!investments[i]?.slug, // Indicates if operator provided custom slug
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
        product_type,
        initial_commitment,
        committed_currency,
        commitment_date,
        called_to_date,
        remaining,
        is_complete,
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
      product_type: string | null;
      initial_commitment: number | null;
      committed_currency: string | null;
      commitment_date: string | null;
      called_to_date: number | null;
      remaining: number | null;
      is_complete: number | null;
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
 * GET /api/configure/investments/:id
 * Get a single investment by ID
 */
configure.get('/investments/:id', async (c) => {
  try {
    const id = c.req.param('id');

    const investment = await c.env.DB.prepare(`
      SELECT
        id,
        name,
        slug,
        investment_group,
        investment_type,
        product_type,
        initial_commitment,
        committed_currency,
        commitment_date,
        status,
        created_at,
        updated_at
      FROM investments
      WHERE id = ?
    `).bind(id).first();

    if (!investment) {
      return c.json<ApiResponse>({
        success: false,
        error: 'Investment not found',
        message: `No investment found with ID ${id}`,
      }, 404);
    }

    return c.json<ApiResponse>({
      success: true,
      data: investment,
    });

  } catch (error) {
    console.error('Error fetching investment:', error);
    return c.json<ApiResponse>({
      success: false,
      error: 'Failed to fetch investment',
      message: error instanceof Error ? error.message : 'Unknown error',
    }, 500);
  }
});

/**
 * PUT /api/configure/investments/:id
 * Update an investment by ID
 */
configure.put('/investments/:id', async (c) => {
  try {
    const id = c.req.param('id');
    const updates = await c.req.json<{
      name?: string;
      investment_group?: string;
      investment_type?: string;
      product_type?: string;
      initial_commitment?: number;
      committed_currency?: string;
      commitment_date?: string;
      commitment_amount_usd?: number;
      phase?: string;
      manual_phase?: number;
      commitment_notes?: string;
      status?: string;
    }>();

    // Check if investment exists
    const existing = await c.env.DB.prepare(
      'SELECT id, initial_commitment, committed_currency, commitment_date FROM investments WHERE id = ?'
    ).bind(id).first();

    if (!existing) {
      return c.json<ApiResponse>({
        success: false,
        error: 'Investment not found',
        message: `No investment found with ID ${id}`,
      }, 404);
    }

    // Auto-calculate USD value if commitment fields are provided
    let calculatedUsd: number | null = null;

    // Determine the values to use (new or existing)
    const commitmentAmount = updates.initial_commitment !== undefined ? updates.initial_commitment : existing.initial_commitment;
    const commitmentCurrency = updates.committed_currency !== undefined ? updates.committed_currency : existing.committed_currency;
    const commitmentDate = updates.commitment_date !== undefined ? updates.commitment_date : existing.commitment_date;

    // Calculate USD value if we have all three fields
    if (commitmentAmount && commitmentCurrency && commitmentDate) {
      const currencyCode = currencySymbolToCode(commitmentCurrency);

      if (currencyCode === 'USD') {
        calculatedUsd = commitmentAmount;
      } else {
        // Fetch exchange rate
        const exchangeRate = await getExchangeRate(c.env.DB, commitmentDate, currencyCode, 'USD', c.env);
        if (exchangeRate !== null) {
          calculatedUsd = commitmentAmount * exchangeRate;
          console.log(`[Investment Update] ${commitmentAmount} ${currencyCode} × ${exchangeRate} = ${calculatedUsd} USD`);
        } else {
          console.warn(`[Investment Update] Could not fetch exchange rate for ${currencyCode}→USD on ${commitmentDate}`);
        }
      }
    }

    // Build update query dynamically based on provided fields
    const fields: string[] = [];
    const values: any[] = [];

    if (updates.name !== undefined) {
      fields.push('name = ?');
      values.push(updates.name);
    }
    if (updates.investment_group !== undefined) {
      fields.push('investment_group = ?');
      values.push(updates.investment_group || null);
    }
    if (updates.investment_type !== undefined) {
      fields.push('investment_type = ?');
      values.push(updates.investment_type || null);
    }
    if (updates.product_type !== undefined) {
      fields.push('product_type = ?');
      values.push(updates.product_type || null);
    }
    if (updates.initial_commitment !== undefined) {
      fields.push('initial_commitment = ?');
      values.push(updates.initial_commitment || null);
    }
    if (updates.committed_currency !== undefined) {
      fields.push('committed_currency = ?');
      values.push(updates.committed_currency || null);
    }
    if (updates.commitment_date !== undefined) {
      fields.push('commitment_date = ?');
      values.push(updates.commitment_date || null);
    }
    // Use calculated USD value if available, otherwise use provided value
    if (calculatedUsd !== null) {
      fields.push('commitment_amount_usd = ?');
      values.push(calculatedUsd);
    } else if (updates.commitment_amount_usd !== undefined) {
      fields.push('commitment_amount_usd = ?');
      values.push(updates.commitment_amount_usd || null);
    }
    if (updates.phase !== undefined) {
      fields.push('phase = ?');
      values.push(updates.phase || null);
    }
    if (updates.manual_phase !== undefined) {
      fields.push('manual_phase = ?');
      values.push(updates.manual_phase || 0);
    }
    if (updates.commitment_notes !== undefined) {
      fields.push('commitment_notes = ?');
      values.push(updates.commitment_notes || null);
    }
    if (updates.status !== undefined) {
      fields.push('status = ?');
      values.push(updates.status);
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

    const query = `UPDATE investments SET ${fields.join(', ')} WHERE id = ?`;
    await c.env.DB.prepare(query).bind(...values).run();

    return c.json<ApiResponse>({
      success: true,
      message: `Investment ${id} updated successfully`,
    });

  } catch (error) {
    console.error('Error updating investment:', error);
    return c.json<ApiResponse>({
      success: false,
      error: 'Failed to update investment',
      message: error instanceof Error ? error.message : 'Unknown error',
    }, 500);
  }
});

/**
 * DELETE /api/configure/investments/:id
 * Delete an investment by ID
 *
 * NOTE: This will fail if there are transactions linked to this investment.
 * Consider implementing soft delete (status = 'deleted') for data integrity.
 */
configure.delete('/investments/:id', async (c) => {
  try {
    const id = c.req.param('id');

    // Check if investment exists
    const existing = await c.env.DB.prepare(
      'SELECT id, name FROM investments WHERE id = ?'
    ).bind(id).first<{ id: number; name: string }>();

    if (!existing) {
      return c.json<ApiResponse>({
        success: false,
        error: 'Investment not found',
        message: `No investment found with ID ${id}`,
      }, 404);
    }

    // Check for linked transactions
    const txCount = await c.env.DB.prepare(
      'SELECT COUNT(*) as count FROM transactions WHERE investment_id = ?'
    ).bind(id).first<{ count: number }>();

    if (txCount && txCount.count > 0) {
      return c.json<ApiResponse>({
        success: false,
        error: 'Cannot delete investment with transactions',
        message: `Investment "${existing.name}" has ${txCount.count} linked transaction(s). Delete those first or consider setting status to 'inactive' instead.`,
      }, 400);
    }

    // Delete the investment
    await c.env.DB.prepare('DELETE FROM investments WHERE id = ?').bind(id).run();

    return c.json<ApiResponse>({
      success: true,
      message: `Investment "${existing.name}" deleted successfully`,
    });

  } catch (error) {
    console.error('Error deleting investment:', error);
    return c.json<ApiResponse>({
      success: false,
      error: 'Failed to delete investment',
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
