-- Migration: Update commitment fields
-- Date: 2025-12-10
-- Description: Add is_complete field, remove commitment_amount_usd, update comments

-- Add is_complete field for manual commitment completion
ALTER TABLE investments ADD COLUMN is_complete INTEGER DEFAULT 0;

-- Note: SQLite doesn't support DROP COLUMN directly
-- We'll need to recreate the table to remove commitment_amount_usd
-- For now, we'll just stop using it and it will be cleaned up in the next major schema update

-- Update existing investments to have is_complete = 0
UPDATE investments SET is_complete = 0 WHERE is_complete IS NULL;
