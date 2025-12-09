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
      ],
    },
  });
});

export default upload;
