/**
 * Commitments Routes
 * Handles commitment tracking, calculations, and management
 */

import { Hono } from 'hono';
import type { Env, ApiResponse } from '../types';
import {
  getCommitmentStatus,
  getAllCommitmentsWithStatus,
  getOpenCommitmentsSummary,
  updateInvestmentCommitmentStatus,
  updateAllCommitmentStatuses,
  markCommitmentComplete,
} from '../services/commitment-tracker';

const commitments = new Hono<{ Bindings: Env }>();

/**
 * GET /api/commitments/summary
 * Get summary of all open commitments in USD
 */
commitments.get('/summary', async (c) => {
  try {
    const db = c.env.DB;
    const summary = await getOpenCommitmentsSummary(db);

    return c.json<ApiResponse>({
      success: true,
      data: summary,
    });
  } catch (error: any) {
    console.error('Error fetching commitments summary:', error);
    return c.json<ApiResponse>(
      {
        success: false,
        error: error.message || 'Failed to fetch commitments summary',
        message: 'An error occurred while calculating commitments summary',
      },
      500
    );
  }
});

/**
 * GET /api/commitments/all
 * Get all commitments with their status and calculations
 */
commitments.get('/all', async (c) => {
  try {
    const db = c.env.DB;
    const commitmentStatuses = await getAllCommitmentsWithStatus(db);

    return c.json<ApiResponse>({
      success: true,
      data: {
        commitments: commitmentStatuses,
        count: commitmentStatuses.length,
      },
    });
  } catch (error: any) {
    console.error('Error fetching all commitments:', error);
    return c.json<ApiResponse>(
      {
        success: false,
        error: error.message || 'Failed to fetch commitments',
        message: 'An error occurred while fetching commitments',
      },
      500
    );
  }
});

/**
 * GET /api/commitments/:investmentId
 * Get commitment status for a specific investment
 */
commitments.get('/:investmentId', async (c) => {
  try {
    const db = c.env.DB;
    const investmentId = parseInt(c.req.param('investmentId'), 10);

    if (isNaN(investmentId)) {
      return c.json<ApiResponse>(
        {
          success: false,
          error: 'Invalid investment ID',
          message: 'Investment ID must be a number',
        },
        400
      );
    }

    const commitment = await getCommitmentStatus(db, investmentId);

    if (!commitment) {
      return c.json<ApiResponse>(
        {
          success: false,
          error: 'Commitment not found',
          message: `No commitment found for investment ID ${investmentId}`,
        },
        404
      );
    }

    return c.json<ApiResponse>({
      success: true,
      data: commitment,
    });
  } catch (error: any) {
    console.error('Error fetching commitment:', error);
    return c.json<ApiResponse>(
      {
        success: false,
        error: error.message || 'Failed to fetch commitment',
        message: 'An error occurred while fetching commitment details',
      },
      500
    );
  }
});

/**
 * POST /api/commitments/recalculate
 * Recalculate all commitment statuses (called_to_date, remaining)
 * Should be called after transaction imports
 */
commitments.post('/recalculate', async (c) => {
  try {
    const db = c.env.DB;

    await updateAllCommitmentStatuses(db);

    return c.json<ApiResponse>({
      success: true,
      message: 'All commitment statuses recalculated successfully',
    });
  } catch (error: any) {
    console.error('Error recalculating commitments:', error);
    return c.json<ApiResponse>(
      {
        success: false,
        error: error.message || 'Failed to recalculate commitments',
        message: 'An error occurred while recalculating commitment statuses',
      },
      500
    );
  }
});

/**
 * POST /api/commitments/:investmentId
 * Add or update commitment for an investment
 *
 * Body: {
 *   initial_commitment: number,
 *   committed_currency: string,
 *   commitment_date: string (ISO date),
 *   commitment_notes?: string
 * }
 */
commitments.post('/:investmentId', async (c) => {
  try {
    const db = c.env.DB;
    const investmentId = parseInt(c.req.param('investmentId'), 10);

    if (isNaN(investmentId)) {
      return c.json<ApiResponse>(
        {
          success: false,
          error: 'Invalid investment ID',
          message: 'Investment ID must be a number',
        },
        400
      );
    }

    const body = await c.req.json<{
      initial_commitment: number;
      committed_currency: string;
      commitment_date: string;
      commitment_notes?: string;
    }>();

    // Validate required fields
    if (
      !body.initial_commitment ||
      !body.committed_currency ||
      !body.commitment_date
    ) {
      return c.json<ApiResponse>(
        {
          success: false,
          error: 'Missing required fields',
          message:
            'initial_commitment, committed_currency, and commitment_date are required',
        },
        400
      );
    }

    // Check if investment exists
    const investment = await db
      .prepare('SELECT id, name FROM investments WHERE id = ?')
      .bind(investmentId)
      .first();

    if (!investment) {
      return c.json<ApiResponse>(
        {
          success: false,
          error: 'Investment not found',
          message: `Investment with ID ${investmentId} does not exist`,
        },
        404
      );
    }

    // Update investment with commitment
    await db
      .prepare(
        `UPDATE investments
        SET initial_commitment = ?,
            committed_currency = ?,
            commitment_date = ?,
            commitment_notes = ?,
            updated_at = datetime('now')
        WHERE id = ?`
      )
      .bind(
        body.initial_commitment,
        body.committed_currency,
        body.commitment_date,
        body.commitment_notes || null,
        investmentId
      )
      .run();

    // Recalculate called_to_date and remaining
    await updateInvestmentCommitmentStatus(db, investmentId);

    // Get updated commitment status
    const updatedCommitment = await getCommitmentStatus(db, investmentId);

    return c.json<ApiResponse>({
      success: true,
      data: updatedCommitment,
      message: 'Commitment updated successfully',
    });
  } catch (error: any) {
    console.error('Error updating commitment:', error);
    return c.json<ApiResponse>(
      {
        success: false,
        error: error.message || 'Failed to update commitment',
        message: 'An error occurred while updating commitment',
      },
      500
    );
  }
});

/**
 * PUT /api/commitments/:investmentId/complete
 * Mark commitment as complete or incomplete
 *
 * Body: {
 *   is_complete: boolean
 * }
 */
commitments.put('/:investmentId/complete', async (c) => {
  try {
    const db = c.env.DB;
    const investmentId = parseInt(c.req.param('investmentId'), 10);

    if (isNaN(investmentId)) {
      return c.json<ApiResponse>(
        {
          success: false,
          error: 'Invalid investment ID',
          message: 'Investment ID must be a number',
        },
        400
      );
    }

    const body = await c.req.json<{ is_complete: boolean }>();

    if (typeof body.is_complete !== 'boolean') {
      return c.json<ApiResponse>(
        {
          success: false,
          error: 'Invalid request body',
          message: 'is_complete must be a boolean',
        },
        400
      );
    }

    // Check if investment exists and has commitment
    const investment = await db
      .prepare(
        'SELECT id, name, initial_commitment FROM investments WHERE id = ?'
      )
      .bind(investmentId)
      .first<{ id: number; name: string; initial_commitment: number | null }>();

    if (!investment) {
      return c.json<ApiResponse>(
        {
          success: false,
          error: 'Investment not found',
          message: `Investment with ID ${investmentId} does not exist`,
        },
        404
      );
    }

    if (!investment.initial_commitment) {
      return c.json<ApiResponse>(
        {
          success: false,
          error: 'No commitment set',
          message: `Investment "${investment.name}" does not have a commitment`,
        },
        400
      );
    }

    // Mark as complete/incomplete
    await markCommitmentComplete(db, investmentId, body.is_complete);

    // Get updated commitment status
    const updatedCommitment = await getCommitmentStatus(db, investmentId);

    return c.json<ApiResponse>({
      success: true,
      data: updatedCommitment,
      message: `Commitment marked as ${body.is_complete ? 'complete' : 'incomplete'}`,
    });
  } catch (error: any) {
    console.error('Error updating commitment completion status:', error);
    return c.json<ApiResponse>(
      {
        success: false,
        error: error.message || 'Failed to update completion status',
        message: 'An error occurred while updating commitment status',
      },
      500
    );
  }
});

/**
 * DELETE /api/commitments/:investmentId
 * Remove commitment from an investment
 */
commitments.delete('/:investmentId', async (c) => {
  try {
    const db = c.env.DB;
    const investmentId = parseInt(c.req.param('investmentId'), 10);

    if (isNaN(investmentId)) {
      return c.json<ApiResponse>(
        {
          success: false,
          error: 'Invalid investment ID',
          message: 'Investment ID must be a number',
        },
        400
      );
    }

    // Check if investment exists
    const investment = await db
      .prepare('SELECT id, name FROM investments WHERE id = ?')
      .bind(investmentId)
      .first();

    if (!investment) {
      return c.json<ApiResponse>(
        {
          success: false,
          error: 'Investment not found',
          message: `Investment with ID ${investmentId} does not exist`,
        },
        404
      );
    }

    // Remove commitment data
    await db
      .prepare(
        `UPDATE investments
        SET initial_commitment = NULL,
            committed_currency = NULL,
            commitment_date = NULL,
            called_to_date = 0,
            remaining = NULL,
            is_complete = 0,
            commitment_notes = NULL,
            updated_at = datetime('now')
        WHERE id = ?`
      )
      .bind(investmentId)
      .run();

    return c.json<ApiResponse>({
      success: true,
      message: 'Commitment removed successfully',
    });
  } catch (error: any) {
    console.error('Error removing commitment:', error);
    return c.json<ApiResponse>(
      {
        success: false,
        error: error.message || 'Failed to remove commitment',
        message: 'An error occurred while removing commitment',
      },
      500
    );
  }
});

export { commitments };
