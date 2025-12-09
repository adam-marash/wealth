-- Migration 002: Add slug-based entity normalization
-- Purpose: Enable mapping of multiple name variations to canonical slugs
-- Date: 2025-12-09

-- ============================================================================
-- 1. Add slug column to investments table
-- ============================================================================

-- Add slug column (nullable initially for backfilling)
ALTER TABLE investments ADD COLUMN slug TEXT;

-- Create UNIQUE index for slug (required for foreign key constraint)
CREATE UNIQUE INDEX idx_investments_slug_unique ON investments(slug) WHERE slug IS NOT NULL;

-- ============================================================================
-- 2. Create investment name mappings table
-- ============================================================================

-- Maps raw investment names (from Excel) to canonical slugs
-- Enables handling of spelling variations and multi-script names
-- Example: "Faro-Point FRG-X" and "פארופוינט FRG-X" both map to "faro-point-frg-x"

CREATE TABLE investment_name_mappings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  raw_name TEXT NOT NULL UNIQUE,
  investment_slug TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
  -- Note: FOREIGN KEY removed due to SQLite partial index limitation
  -- Data integrity enforced at application level in mapInvestmentName()
);

-- Indexes for fast lookups
CREATE INDEX idx_name_mappings_raw_name ON investment_name_mappings(raw_name);
CREATE INDEX idx_name_mappings_slug ON investment_name_mappings(investment_slug);

-- Trigger to update updated_at timestamp
CREATE TRIGGER update_name_mappings_timestamp
AFTER UPDATE ON investment_name_mappings
FOR EACH ROW
BEGIN
  UPDATE investment_name_mappings
  SET updated_at = datetime('now')
  WHERE id = NEW.id;
END;

-- ============================================================================
-- 3. Notes
-- ============================================================================

-- After this migration:
-- 1. Backfill slugs for existing investments using generateSlug(name)
-- 2. Create initial mappings: canonical name → slug
-- 3. Add UNIQUE constraint to investments.slug:
--    CREATE UNIQUE INDEX idx_investments_slug_unique ON investments(slug);

-- Workflow:
-- - On investment save: generate slug, create mapping for canonical name
-- - On transaction import: resolve raw name → slug via mappings
-- - Unmapped names flagged with validation_status = 'needs_review'
-- - During review: user can map to existing slug or create new investment

-- ============================================================================
