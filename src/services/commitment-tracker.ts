/**
 * Commitment Tracker Service
 * Manages investment commitments and tracks capital calls
 */

/**
 * Commitment data structure
 */
export interface Commitment {
  id?: number;
  investment_id: number;
  commitment_amount: number;
  currency: string;
  commitment_date: string; // ISO 8601
  called_to_date?: number;
  remaining?: number;
  phase?: 'building_up' | 'stable' | 'drawing_down' | null;
  manual_phase?: boolean;
  notes?: string;
  created_at?: string;
  updated_at?: string;
}

/**
 * Create a new commitment
 */
export async function createCommitment(
  db: D1Database,
  commitment: Omit<Commitment, 'id' | 'created_at' | 'updated_at'>
): Promise<Commitment> {
  const result = await db.prepare(`
    INSERT INTO commitments (
      investment_id,
      commitment_amount,
      currency,
      commitment_date,
      called_to_date,
      remaining,
      phase,
      manual_phase,
      notes
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    commitment.investment_id,
    commitment.commitment_amount,
    commitment.currency,
    commitment.commitment_date,
    commitment.called_to_date || 0,
    commitment.remaining || commitment.commitment_amount,
    commitment.phase || null,
    commitment.manual_phase ? 1 : 0,
    commitment.notes || null
  ).run();

  // Fetch the created commitment
  const created = await db.prepare(`
    SELECT * FROM commitments WHERE id = ?
  `).bind(result.meta.last_row_id).first<Commitment>();

  if (!created) {
    throw new Error('Failed to create commitment');
  }

  return created;
}

/**
 * Get all commitments for an investment
 */
export async function getCommitmentsByInvestment(
  db: D1Database,
  investment_id: number
): Promise<Commitment[]> {
  const result = await db.prepare(`
    SELECT * FROM commitments
    WHERE investment_id = ?
    ORDER BY commitment_date DESC
  `).bind(investment_id).all<Commitment>();

  return result.results;
}

/**
 * Get a single commitment by ID
 */
export async function getCommitmentById(
  db: D1Database,
  id: number
): Promise<Commitment | null> {
  const result = await db.prepare(`
    SELECT * FROM commitments WHERE id = ?
  `).bind(id).first<Commitment>();

  return result || null;
}

/**
 * Update a commitment
 */
export async function updateCommitment(
  db: D1Database,
  id: number,
  updates: Partial<Omit<Commitment, 'id' | 'investment_id' | 'created_at' | 'updated_at'>>
): Promise<Commitment> {
  // Build dynamic UPDATE query
  const fields: string[] = [];
  const values: any[] = [];

  if (updates.commitment_amount !== undefined) {
    fields.push('commitment_amount = ?');
    values.push(updates.commitment_amount);
  }
  if (updates.currency !== undefined) {
    fields.push('currency = ?');
    values.push(updates.currency);
  }
  if (updates.commitment_date !== undefined) {
    fields.push('commitment_date = ?');
    values.push(updates.commitment_date);
  }
  if (updates.called_to_date !== undefined) {
    fields.push('called_to_date = ?');
    values.push(updates.called_to_date);
  }
  if (updates.remaining !== undefined) {
    fields.push('remaining = ?');
    values.push(updates.remaining);
  }
  if (updates.phase !== undefined) {
    fields.push('phase = ?');
    values.push(updates.phase);
  }
  if (updates.manual_phase !== undefined) {
    fields.push('manual_phase = ?');
    values.push(updates.manual_phase ? 1 : 0);
  }
  if (updates.notes !== undefined) {
    fields.push('notes = ?');
    values.push(updates.notes);
  }

  if (fields.length === 0) {
    // No updates, just return current
    const current = await getCommitmentById(db, id);
    if (!current) {
      throw new Error('Commitment not found');
    }
    return current;
  }

  // Add ID to end of values array
  values.push(id);

  await db.prepare(`
    UPDATE commitments
    SET ${fields.join(', ')}
    WHERE id = ?
  `).bind(...values).run();

  // Fetch updated commitment
  const updated = await getCommitmentById(db, id);
  if (!updated) {
    throw new Error('Commitment not found after update');
  }

  return updated;
}

/**
 * Delete a commitment
 */
export async function deleteCommitment(
  db: D1Database,
  id: number
): Promise<void> {
  await db.prepare(`
    DELETE FROM commitments WHERE id = ?
  `).bind(id).run();
}

/**
 * Calculate called_to_date for a commitment
 * Sums all capital call transactions for the investment
 */
export async function calculateCalledToDate(
  db: D1Database,
  investment_id: number
): Promise<number> {
  const result = await db.prepare(`
    SELECT SUM(ABS(amount_normalized)) as total
    FROM transactions
    WHERE investment_id = ?
      AND transaction_category = 'capital_call'
  `).bind(investment_id).first<{ total: number | null }>();

  return result?.total || 0;
}

/**
 * Update called_to_date and remaining for all commitments of an investment
 * Should be called after importing new transactions
 */
export async function updateCommitmentProgress(
  db: D1Database,
  investment_id: number
): Promise<void> {
  // Calculate total called to date
  const calledToDate = await calculateCalledToDate(db, investment_id);

  // Get all commitments for this investment
  const commitments = await getCommitmentsByInvestment(db, investment_id);

  if (commitments.length === 0) {
    return; // No commitments to update
  }

  // Update each commitment
  // Distribute the called amount across commitments chronologically
  // Allow overdraw (remaining can go negative)

  let remainingCalled = calledToDate;

  for (const commitment of commitments.sort((a, b) =>
    new Date(a.commitment_date).getTime() - new Date(b.commitment_date).getTime()
  )) {
    const commitmentAmount = commitment.commitment_amount;

    // Allocate as much as possible to this commitment (can exceed commitment_amount for overdraw)
    const called = remainingCalled;
    const remaining = commitmentAmount - called;

    await updateCommitment(db, commitment.id!, {
      called_to_date: called,
      remaining: remaining,
    });

    remainingCalled -= called;

    if (remainingCalled <= 0) {
      break;
    }
  }
}

/**
 * Get commitment status for alerts
 */
export interface CommitmentAlert {
  commitment_id: number;
  investment_id: number;
  severity: 'warning' | 'critical';
  message: string;
  remaining: number;
  remaining_percentage: number;
}

/**
 * Check for commitment alerts (nearly exhausted or overdrawn)
 */
export async function getCommitmentAlerts(
  db: D1Database,
  investment_id?: number
): Promise<CommitmentAlert[]> {
  const alerts: CommitmentAlert[] = [];

  // Get commitments to check
  let commitments: Commitment[];
  if (investment_id) {
    commitments = await getCommitmentsByInvestment(db, investment_id);
  } else {
    const result = await db.prepare(`
      SELECT * FROM commitments ORDER BY commitment_date DESC
    `).all<Commitment>();
    commitments = result.results;
  }

  for (const commitment of commitments) {
    const remaining = commitment.remaining || 0;
    const amount = commitment.commitment_amount;
    const percentage = (remaining / amount) * 100;

    // Overdrawn (negative remaining)
    if (remaining < 0) {
      alerts.push({
        commitment_id: commitment.id!,
        investment_id: commitment.investment_id,
        severity: 'critical',
        message: `Commitment overdrawn by ${Math.abs(remaining).toFixed(2)} ${commitment.currency}`,
        remaining,
        remaining_percentage: percentage,
      });
    }
    // Nearly exhausted (< 10% remaining)
    else if (percentage < 10 && percentage > 0) {
      alerts.push({
        commitment_id: commitment.id!,
        investment_id: commitment.investment_id,
        severity: 'warning',
        message: `Commitment ${percentage.toFixed(1)}% remaining (${remaining.toFixed(2)} ${commitment.currency})`,
        remaining,
        remaining_percentage: percentage,
      });
    }
    // Fully exhausted
    else if (remaining === 0) {
      alerts.push({
        commitment_id: commitment.id!,
        investment_id: commitment.investment_id,
        severity: 'warning',
        message: 'Commitment fully called',
        remaining: 0,
        remaining_percentage: 0,
      });
    }
  }

  return alerts;
}

/**
 * Get commitment summary for an investment
 */
export interface CommitmentSummary {
  total_committed: number;
  total_called: number;
  total_remaining: number;
  currency: string;
  commitment_count: number;
  percentage_called: number;
}

export async function getCommitmentSummary(
  db: D1Database,
  investment_id: number
): Promise<CommitmentSummary | null> {
  const commitments = await getCommitmentsByInvestment(db, investment_id);

  if (commitments.length === 0) {
    return null;
  }

  // Assuming all commitments use same currency (should be validated)
  const currency = commitments[0]!.currency;

  const totalCommitted = commitments.reduce((sum, c) => sum + c.commitment_amount, 0);
  const totalCalled = commitments.reduce((sum, c) => sum + (c.called_to_date || 0), 0);
  const totalRemaining = commitments.reduce((sum, c) => sum + (c.remaining || 0), 0);

  return {
    total_committed: totalCommitted,
    total_called: totalCalled,
    total_remaining: totalRemaining,
    currency,
    commitment_count: commitments.length,
    percentage_called: totalCommitted > 0 ? (totalCalled / totalCommitted) * 100 : 0,
  };
}
