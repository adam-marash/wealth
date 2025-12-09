-- Migration 003: Consolidate Commitments into Investments Table
-- Moves commitment tracking fields directly into investments table
-- Rationale: Each investment has exactly one commitment, separate table adds unnecessary complexity

-- Add commitment tracking fields to investments
ALTER TABLE investments ADD COLUMN commitment_amount_usd REAL;
ALTER TABLE investments ADD COLUMN called_to_date REAL DEFAULT 0;
ALTER TABLE investments ADD COLUMN remaining REAL;
ALTER TABLE investments ADD COLUMN phase TEXT;  -- 'building_up', 'stable', 'drawing_down'
ALTER TABLE investments ADD COLUMN manual_phase INTEGER DEFAULT 0;  -- Boolean flag
ALTER TABLE investments ADD COLUMN commitment_notes TEXT;

-- Migrate existing commitment data if any exists
-- (This is a best-effort migration - assumes one commitment per investment)
UPDATE investments
SET
    commitment_amount_usd = (
        SELECT c.commitment_amount
        FROM commitments c
        WHERE c.investment_id = investments.id
        ORDER BY c.commitment_date DESC
        LIMIT 1
    ),
    called_to_date = (
        SELECT c.called_to_date
        FROM commitments c
        WHERE c.investment_id = investments.id
        ORDER BY c.commitment_date DESC
        LIMIT 1
    ),
    remaining = (
        SELECT c.remaining
        FROM commitments c
        WHERE c.investment_id = investments.id
        ORDER BY c.commitment_date DESC
        LIMIT 1
    ),
    phase = (
        SELECT c.phase
        FROM commitments c
        WHERE c.investment_id = investments.id
        ORDER BY c.commitment_date DESC
        LIMIT 1
    ),
    manual_phase = (
        SELECT c.manual_phase
        FROM commitments c
        WHERE c.investment_id = investments.id
        ORDER BY c.commitment_date DESC
        LIMIT 1
    ),
    commitment_notes = (
        SELECT c.notes
        FROM commitments c
        WHERE c.investment_id = investments.id
        ORDER BY c.commitment_date DESC
        LIMIT 1
    )
WHERE EXISTS (
    SELECT 1 FROM commitments c WHERE c.investment_id = investments.id
);

-- Drop the commitments table
DROP TABLE IF EXISTS commitments;

-- Create index for phase-based queries
CREATE INDEX IF NOT EXISTS idx_investments_phase ON investments(phase);

-- Update status field options to be more descriptive
-- (No schema change, just documentation)
-- status can be: 'active', 'fully_called', 'exited', 'written_off'
