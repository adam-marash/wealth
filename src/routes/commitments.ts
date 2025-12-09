/**
 * Commitments Routes
 * Handles commitment CRUD and tracking operations
 */

import { Hono } from 'hono';
import type { Env, ApiResponse } from '../types';
import {
  createCommitment,
  getCommitmentsByInvestment,
  getCommitmentById,
  updateCommitment,
  deleteCommitment,
  updateCommitmentProgress,
  getCommitmentAlerts,
  getCommitmentSummary,
  type Commitment,
  type CommitmentAlert,
  type CommitmentSummary,
} from '../services/commitment-tracker';

const commitments = new Hono<{ Bindings: Env }>();

/**
 * POST /api/investments/:id/commitments
 * Create a new commitment for an investment
 */
commitments.post('/investments/:id/commitments', async (c) => {
  try {
    const investment_id = parseInt(c.req.param('id'), 10);

    if (isNaN(investment_id)) {
      return c.json<ApiResponse>({
        success: false,
        error: 'Invalid investment ID',
      }, 400);
    }

    const body = await c.req.json<Omit<Commitment, 'id' | 'investment_id' | 'created_at' | 'updated_at'>>();

    const commitment = await createCommitment(c.env.DB, {
      ...body,
      investment_id,
    });

    return c.json<ApiResponse<Commitment>>({
      success: true,
      message: 'Commitment created successfully',
      data: commitment,
    });

  } catch (error) {
    console.error('Error creating commitment:', error);
    return c.json<ApiResponse>({
      success: false,
      error: 'Failed to create commitment',
      message: error instanceof Error ? error.message : 'Unknown error',
    }, 500);
  }
});

/**
 * GET /api/investments/:id/commitments
 * Get all commitments for an investment
 */
commitments.get('/investments/:id/commitments', async (c) => {
  try {
    const investment_id = parseInt(c.req.param('id'), 10);

    if (isNaN(investment_id)) {
      return c.json<ApiResponse>({
        success: false,
        error: 'Invalid investment ID',
      }, 400);
    }

    const results = await getCommitmentsByInvestment(c.env.DB, investment_id);

    return c.json<ApiResponse<Commitment[]>>({
      success: true,
      message: `Found ${results.length} commitments`,
      data: results,
    });

  } catch (error) {
    console.error('Error fetching commitments:', error);
    return c.json<ApiResponse>({
      success: false,
      error: 'Failed to fetch commitments',
      message: error instanceof Error ? error.message : 'Unknown error',
    }, 500);
  }
});

/**
 * GET /api/investments/:id/commitments/summary
 * Get commitment summary for an investment
 */
commitments.get('/investments/:id/commitments/summary', async (c) => {
  try {
    const investment_id = parseInt(c.req.param('id'), 10);

    if (isNaN(investment_id)) {
      return c.json<ApiResponse>({
        success: false,
        error: 'Invalid investment ID',
      }, 400);
    }

    const summary = await getCommitmentSummary(c.env.DB, investment_id);

    if (!summary) {
      return c.json<ApiResponse>({
        success: false,
        error: 'No commitments found for this investment',
      }, 404);
    }

    return c.json<ApiResponse<CommitmentSummary>>({
      success: true,
      message: 'Commitment summary retrieved',
      data: summary,
    });

  } catch (error) {
    console.error('Error fetching commitment summary:', error);
    return c.json<ApiResponse>({
      success: false,
      error: 'Failed to fetch commitment summary',
      message: error instanceof Error ? error.message : 'Unknown error',
    }, 500);
  }
});

/**
 * GET /api/commitments/alerts
 * Get all commitment alerts
 * Optional query param: investment_id
 */
commitments.get('/commitments/alerts', async (c) => {
  try {
    const investment_id_param = c.req.query('investment_id');
    const investment_id = investment_id_param ? parseInt(investment_id_param, 10) : undefined;

    if (investment_id_param && isNaN(investment_id!)) {
      return c.json<ApiResponse>({
        success: false,
        error: 'Invalid investment ID',
      }, 400);
    }

    const alerts = await getCommitmentAlerts(c.env.DB, investment_id);

    return c.json<ApiResponse<CommitmentAlert[]>>({
      success: true,
      message: `Found ${alerts.length} alerts`,
      data: alerts,
    });

  } catch (error) {
    console.error('Error fetching commitment alerts:', error);
    return c.json<ApiResponse>({
      success: false,
      error: 'Failed to fetch commitment alerts',
      message: error instanceof Error ? error.message : 'Unknown error',
    }, 500);
  }
});

/**
 * GET /api/commitments/:id
 * Get a single commitment by ID
 */
commitments.get('/commitments/:id', async (c) => {
  try {
    const id = parseInt(c.req.param('id'), 10);

    if (isNaN(id)) {
      return c.json<ApiResponse>({
        success: false,
        error: 'Invalid commitment ID',
      }, 400);
    }

    const commitment = await getCommitmentById(c.env.DB, id);

    if (!commitment) {
      return c.json<ApiResponse>({
        success: false,
        error: 'Commitment not found',
      }, 404);
    }

    return c.json<ApiResponse<Commitment>>({
      success: true,
      data: commitment,
    });

  } catch (error) {
    console.error('Error fetching commitment:', error);
    return c.json<ApiResponse>({
      success: false,
      error: 'Failed to fetch commitment',
      message: error instanceof Error ? error.message : 'Unknown error',
    }, 500);
  }
});

/**
 * PATCH /api/commitments/:id
 * Update a commitment
 */
commitments.patch('/commitments/:id', async (c) => {
  try {
    const id = parseInt(c.req.param('id'), 10);

    if (isNaN(id)) {
      return c.json<ApiResponse>({
        success: false,
        error: 'Invalid commitment ID',
      }, 400);
    }

    const updates = await c.req.json<Partial<Commitment>>();

    const commitment = await updateCommitment(c.env.DB, id, updates);

    return c.json<ApiResponse<Commitment>>({
      success: true,
      message: 'Commitment updated successfully',
      data: commitment,
    });

  } catch (error) {
    console.error('Error updating commitment:', error);
    return c.json<ApiResponse>({
      success: false,
      error: 'Failed to update commitment',
      message: error instanceof Error ? error.message : 'Unknown error',
    }, 500);
  }
});

/**
 * DELETE /api/commitments/:id
 * Delete a commitment
 */
commitments.delete('/commitments/:id', async (c) => {
  try {
    const id = parseInt(c.req.param('id'), 10);

    if (isNaN(id)) {
      return c.json<ApiResponse>({
        success: false,
        error: 'Invalid commitment ID',
      }, 400);
    }

    await deleteCommitment(c.env.DB, id);

    return c.json<ApiResponse>({
      success: true,
      message: 'Commitment deleted successfully',
    });

  } catch (error) {
    console.error('Error deleting commitment:', error);
    return c.json<ApiResponse>({
      success: false,
      error: 'Failed to delete commitment',
      message: error instanceof Error ? error.message : 'Unknown error',
    }, 500);
  }
});

/**
 * POST /api/investments/:id/commitments/update-progress
 * Update commitment progress (called_to_date and remaining) based on transactions
 */
commitments.post('/investments/:id/commitments/update-progress', async (c) => {
  try {
    const investment_id = parseInt(c.req.param('id'), 10);

    if (isNaN(investment_id)) {
      return c.json<ApiResponse>({
        success: false,
        error: 'Invalid investment ID',
      }, 400);
    }

    await updateCommitmentProgress(c.env.DB, investment_id);

    // Get updated commitments
    const commitments = await getCommitmentsByInvestment(c.env.DB, investment_id);

    return c.json<ApiResponse<Commitment[]>>({
      success: true,
      message: 'Commitment progress updated successfully',
      data: commitments,
    });

  } catch (error) {
    console.error('Error updating commitment progress:', error);
    return c.json<ApiResponse>({
      success: false,
      error: 'Failed to update commitment progress',
      message: error instanceof Error ? error.message : 'Unknown error',
    }, 500);
  }
});

export default commitments;
