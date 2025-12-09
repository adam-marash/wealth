/**
 * Excel Parser Service
 * Handles Excel file parsing using SheetJS (xlsx)
 */

import * as XLSX from 'xlsx';
import type { ExcelColumn } from '../types';

export interface ParsedSheet {
  sheetName: string;
  columns: ExcelColumn[];
  rowCount: number;
}

export interface ParseExcelResult {
  sheets: ParsedSheet[];
  selectedSheet?: ParsedSheet;
}

/**
 * Parsed sheet with full row data
 */
export interface ParsedSheetWithData {
  sheetName: string;
  headerRow: number;
  headers: string[];
  rows: Record<string, any>[];
}

/**
 * Parse Excel file and extract column information with samples
 * @param fileBuffer - Excel file as ArrayBuffer
 * @param sheetIndex - Optional: specific sheet index to parse (0-based)
 * @returns Parsed sheet(s) with column data and samples
 */
export function parseExcelFile(
  fileBuffer: ArrayBuffer,
  sheetIndex?: number
): ParseExcelResult {
  try {
    // Read the workbook from buffer
    const workbook = XLSX.read(fileBuffer, {
      type: 'array',
      cellDates: true, // Parse dates automatically
      cellFormula: false, // Don't include formulas
      cellStyles: false, // Don't include styles (faster)
    });

    // Get all sheet names
    const sheetNames = workbook.SheetNames;

    if (sheetNames.length === 0) {
      throw new Error('No sheets found in workbook');
    }

    // Parse all sheets
    const sheets: ParsedSheet[] = sheetNames.map((sheetName, index) => {
      const worksheet = workbook.Sheets[sheetName];
      if (!worksheet) {
        throw new Error(`Sheet "${sheetName}" not found`);
      }
      return parseWorksheet(worksheet, sheetName);
    });

    // Select sheet based on index or use first sheet
    const selectedSheet = sheetIndex !== undefined && sheetIndex < sheets.length
      ? sheets[sheetIndex]
      : sheets[0];

    return {
      sheets,
      selectedSheet,
    };
  } catch (error) {
    throw new Error(
      `Failed to parse Excel file: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }
}

/**
 * Parse a single worksheet and extract columns with samples
 */
function parseWorksheet(
  worksheet: XLSX.WorkSheet,
  sheetName: string
): ParsedSheet {
  // Convert worksheet to array of arrays
  const data = XLSX.utils.sheet_to_json<unknown[]>(worksheet, {
    header: 1, // Return array of arrays
    defval: null, // Use null for empty cells
    blankrows: false, // Skip blank rows
    raw: false, // Format values (dates, numbers, etc)
  });

  if (data.length === 0) {
    throw new Error(`Sheet "${sheetName}" is empty`);
  }

  // Detect header row (first non-empty row)
  const headerRowIndex = detectHeaderRow(data);
  const headerRow = data[headerRowIndex] as (string | number | null)[];

  // Extract data rows (skip header and take next 5 rows for samples)
  const dataRows = data.slice(headerRowIndex + 1);
  const sampleCount = Math.min(5, dataRows.length);

  // Build columns with samples
  const columns: ExcelColumn[] = headerRow.map((header, colIndex) => {
    const columnLetter = XLSX.utils.encode_col(colIndex);
    const headerName = String(header || `Column_${columnLetter}`).trim();

    // Extract sample data for this column
    const samples: (string | number | null)[] = [];
    for (let i = 0; i < sampleCount; i++) {
      const row = dataRows[i] as (string | number | null)[];
      samples.push(row?.[colIndex] ?? null);
    }

    return {
      letter: columnLetter,
      name: headerName,
      samples,
    };
  });

  return {
    sheetName,
    columns,
    rowCount: dataRows.length,
  };
}

/**
 * Detect which row is the header row
 * Looks for row with most non-empty text values
 */
function detectHeaderRow(data: unknown[][]): number {
  let bestRowIndex = 0;
  let maxTextCells = 0;

  for (let i = 0; i < Math.min(10, data.length); i++) {
    const row = data[i] as (string | number | null)[];
    let textCellCount = 0;

    for (const cell of row) {
      if (cell !== null && cell !== undefined && cell !== '') {
        // Check if it's a string or looks like a header
        if (typeof cell === 'string' && cell.length > 0) {
          textCellCount++;
        }
      }
    }

    if (textCellCount > maxTextCells) {
      maxTextCells = textCellCount;
      bestRowIndex = i;
    }
  }

  return bestRowIndex;
}

/**
 * Parse specific cells for date detection
 * Returns date in ISO 8601 format or null
 */
export function parseDateValue(value: unknown): string | null {
  if (!value) return null;

  // If already a Date object (from SheetJS parsing)
  if (value instanceof Date) {
    return value.toISOString().split('T')[0]; // YYYY-MM-DD
  }

  // If it's a string, try various date formats
  if (typeof value === 'string') {
    const dateFormats = [
      // ISO format
      /^\d{4}-\d{2}-\d{2}$/,
      // DD/MM/YYYY or MM/DD/YYYY
      /^\d{1,2}[\/\-]\d{1,2}[\/\-]\d{4}$/,
      // DD Month YYYY (e.g., "15 March 2024")
      /^\d{1,2}\s+[A-Za-z]+\s+\d{4}$/,
    ];

    for (const format of dateFormats) {
      if (format.test(value)) {
        const parsed = new Date(value);
        if (!isNaN(parsed.getTime())) {
          return parsed.toISOString().split('T')[0];
        }
      }
    }
  }

  // If it's a number, it might be an Excel serial date
  if (typeof value === 'number') {
    try {
      const date = XLSX.SSF.parse_date_code(value);
      if (date) {
        const jsDate = new Date(date.y, date.m - 1, date.d);
        if (!isNaN(jsDate.getTime())) {
          return jsDate.toISOString().split('T')[0];
        }
      }
    } catch {
      // Not a valid Excel date
    }
  }

  return null;
}

/**
 * Validate Excel file format
 */
export function validateExcelFile(filename: string): boolean {
  const validExtensions = ['.xlsx', '.xls', '.xlsm', '.xlsb'];
  return validExtensions.some(ext => filename.toLowerCase().endsWith(ext));
}

/**
 * Parse Excel file and extract full row data
 * Used for transaction preview and import
 *
 * @param fileBuffer - Excel file as ArrayBuffer
 * @param sheetIndex - Optional: specific sheet index to parse (0-based)
 * @returns Parsed sheet with full row data
 */
export function parseExcelData(
  fileBuffer: ArrayBuffer,
  sheetIndex?: number
): ParsedSheetWithData {
  // Read the workbook from buffer
  const workbook = XLSX.read(fileBuffer, {
    type: 'array',
    cellDates: true,
    cellFormula: false,
    cellStyles: false,
  });

  // Get all sheet names
  const sheetNames = workbook.SheetNames;

  if (sheetNames.length === 0) {
    throw new Error('No sheets found in workbook');
  }

  // Determine which sheet to parse
  const targetIndex = sheetIndex !== undefined ? sheetIndex : 0;
  const sheetName = sheetNames[targetIndex];

  if (!sheetName) {
    throw new Error(`Sheet at index ${targetIndex} not found`);
  }

  const worksheet = workbook.Sheets[sheetName];

  if (!worksheet) {
    throw new Error(`Worksheet ${sheetName} not found`);
  }

  // Convert to array of arrays
  const data = XLSX.utils.sheet_to_json<any[]>(worksheet, {
    header: 1, // Return array of arrays (not objects)
    defval: null, // Use null for empty cells
    blankrows: false, // Skip blank rows
  });

  if (data.length === 0) {
    throw new Error('Worksheet contains no data');
  }

  // Detect header row
  const headerRowIndex = detectHeaderRow(data);
  const headerRow = data[headerRowIndex] as (string | number | null)[];

  // Extract headers as strings
  const headers = headerRow.map(h => (h !== null && h !== undefined ? String(h) : ''));

  // Extract data rows (after header)
  const dataRows = data.slice(headerRowIndex + 1);

  // Convert rows to objects using headers as keys
  const rows = dataRows.map(row => {
    const rowObj: Record<string, any> = {};
    for (let i = 0; i < headers.length; i++) {
      const header = headers[i];
      const value = row[i];
      if (header) {
        rowObj[header] = value;
      }
    }
    return rowObj;
  });

  return {
    sheetName,
    headerRow: headerRowIndex,
    headers,
    rows,
  };
}
