/**
 * CSV Parser Service
 * Parses CSV files and extracts columns with sample data
 */

export interface CSVColumn {
  letter: string;
  header: string;
  samples: string[];
}

export interface ParsedCSV {
  columns: CSVColumn[];
  rowCount: number;
}

/**
 * Parse CSV line respecting quoted fields
 */
function parseCSVLine(line: string): string[] {
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
}

/**
 * Convert column index to letter (0 -> A, 1 -> B, etc.)
 */
function indexToLetter(index: number): string {
  let letter = '';
  while (index >= 0) {
    letter = String.fromCharCode((index % 26) + 65) + letter;
    index = Math.floor(index / 26) - 1;
  }
  return letter;
}

/**
 * Detect the header row in a CSV file
 * For this application, headers are always on row 3 (index 2)
 */
function detectHeaderRow(lines: string[]): number {
  // Headers are always on row 3 (0-indexed as row 2)
  return 2;
}

/**
 * Parse CSV file from ArrayBuffer
 */
export function parseCSVFile(arrayBuffer: ArrayBuffer): ParsedCSV {
  // Convert ArrayBuffer to string
  const decoder = new TextDecoder('utf-8');
  const text = decoder.decode(arrayBuffer);

  // Split into lines
  const lines = text.split('\n').map(line => line.trim()).filter(line => line.length > 0);

  if (lines.length === 0) {
    throw new Error('CSV file is empty');
  }

  // Detect header row
  const headerRowIndex = detectHeaderRow(lines);

  // Parse header row
  const headers = parseCSVLine(lines[headerRowIndex]);

  // Parse data rows (get first 5 after header for samples)
  const dataRows: string[][] = [];
  const startRow = headerRowIndex + 1;
  for (let i = startRow; i < Math.min(lines.length, startRow + 5); i++) {
    dataRows.push(parseCSVLine(lines[i]));
  }

  // Build columns with samples
  const columns: CSVColumn[] = headers.map((header, index) => {
    const samples = dataRows
      .map(row => row[index] || '')
      .filter(val => val.length > 0)
      .slice(0, 5);

    return {
      letter: indexToLetter(index),
      header: header || `Column ${indexToLetter(index)}`,
      samples,
    };
  });

  return {
    columns,
    rowCount: lines.length - headerRowIndex - 1, // Count rows after header
  };
}

/**
 * Validate CSV file extension
 */
export function validateCSVFile(filename: string): boolean {
  return /\.csv$/i.test(filename);
}

/**
 * Parsed sheet with full row data (compatible with preview service)
 */
export interface ParsedCSVWithData {
  sheetName: string;
  headerRow: number;
  headers: string[];
  rows: Record<string, any>[];
}

/**
 * Parse CSV file and return full row data
 * Compatible with parseExcelData from excel-parser
 *
 * @param arrayBuffer CSV file as ArrayBuffer
 * @returns Parsed CSV with full row data
 */
export function parseCSVData(arrayBuffer: ArrayBuffer): ParsedCSVWithData {
  // Convert ArrayBuffer to string with UTF-8 decoding
  const decoder = new TextDecoder('utf-8');
  const text = decoder.decode(arrayBuffer);

  // Split into lines
  const lines = text.split('\n').map(line => line.trim()).filter(line => line.length > 0);

  if (lines.length === 0) {
    throw new Error('CSV file is empty');
  }

  // Detect header row
  const headerRowIndex = detectHeaderRow(lines);

  // Parse header row
  const headers = parseCSVLine(lines[headerRowIndex]);

  // Parse data rows (after header)
  const rows: Record<string, any>[] = [];
  for (let i = headerRowIndex + 1; i < lines.length; i++) {
    const values = parseCSVLine(lines[i]);
    const row: Record<string, any> = {};

    // Map values to headers
    for (let j = 0; j < headers.length; j++) {
      const header = headers[j] || `Column ${indexToLetter(j)}`;
      row[header] = values[j] || '';
    }

    rows.push(row);
  }

  return {
    sheetName: 'Sheet1', // CSV files don't have sheet names
    headerRow: headerRowIndex,
    headers,
    rows,
  };
}
