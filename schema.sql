-- Financial Transaction Management System - D1 Database Schema
-- SQLite schema for Cloudflare D1

-- ============================================================================
-- CORE TABLES
-- ============================================================================

-- Investments: Individual investment entities
CREATE TABLE IF NOT EXISTS investments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    investment_group TEXT,  -- For rolling up related investments
    investment_type TEXT,   -- PE, VC, Real Estate, Public Equity, etc
    initial_commitment REAL,
    committed_currency TEXT,
    commitment_date TEXT,   -- ISO 8601 date format
    status TEXT DEFAULT 'active',  -- active, fully_called, exited, written_off
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
);

-- Commitments: Capital commitments per investment
CREATE TABLE IF NOT EXISTS commitments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    investment_id INTEGER NOT NULL,
    commitment_amount REAL NOT NULL,
    currency TEXT NOT NULL,
    commitment_date TEXT NOT NULL,  -- ISO 8601 date format
    called_to_date REAL DEFAULT 0,  -- Calculated from transactions
    remaining REAL,                 -- Calculated: commitment_amount - called_to_date
    phase TEXT,                     -- building_up, stable, drawing_down
    manual_phase INTEGER DEFAULT 0, -- Boolean flag for manual override
    notes TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (investment_id) REFERENCES investments(id) ON DELETE CASCADE
);

-- Transactions: Core transaction data
CREATE TABLE IF NOT EXISTS transactions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    date TEXT NOT NULL,                    -- ISO 8601 date format
    description TEXT,
    transaction_type_raw TEXT,             -- Original value from Excel
    transaction_category TEXT,             -- Mapped: income, capital_call, distribution, fee, transfer
    cash_flow_direction INTEGER,          -- +1 or -1
    amount_original REAL NOT NULL,
    amount_normalized REAL NOT NULL,       -- After applying directionality rules
    original_currency TEXT,
    amount_usd REAL,
    investment_id INTEGER,
    counterparty TEXT,
    commitment_id INTEGER,                 -- Links to capital commitments
    dedup_hash TEXT UNIQUE,                -- For deduplication
    metadata TEXT,                         -- JSON: store original row data
    source_file TEXT,                      -- Original filename
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (investment_id) REFERENCES investments(id) ON DELETE SET NULL,
    FOREIGN KEY (commitment_id) REFERENCES commitments(id) ON DELETE SET NULL
);

-- ============================================================================
-- CONFIGURATION TABLES
-- ============================================================================

-- Transaction Type Mappings: Maps raw Excel values to categories
CREATE TABLE IF NOT EXISTS transaction_type_mappings (
    raw_value TEXT PRIMARY KEY,
    category TEXT NOT NULL,                -- income, capital_call, distribution, fee, transfer
    directionality_rule TEXT NOT NULL,     -- as_is, invert, variable
    cash_flow_impact INTEGER,              -- +1, -1, or NULL if variable
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
);

-- Column Mappings: Excel column to database field mappings
CREATE TABLE IF NOT EXISTS column_mappings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    excel_column_letter TEXT,
    excel_column_name TEXT NOT NULL,       -- Header from Excel
    mapped_field TEXT NOT NULL,            -- date, description, transaction_type, amount, etc
    active INTEGER DEFAULT 1,              -- Boolean flag
    date_format TEXT,                      -- Store preferred date format if applicable
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
);

-- Counterparty Normalizations: Name normalization rules
CREATE TABLE IF NOT EXISTS counterparty_normalizations (
    raw_name TEXT PRIMARY KEY,
    normalized_name TEXT NOT NULL,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
);

-- System Configuration: Key-value store for system settings
CREATE TABLE IF NOT EXISTS system_config (
    key TEXT PRIMARY KEY,
    value TEXT,
    description TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
);

-- ============================================================================
-- INDEXES FOR PERFORMANCE
-- ============================================================================

-- Transactions table indexes (most frequently queried)
CREATE INDEX IF NOT EXISTS idx_transactions_date ON transactions(date);
CREATE INDEX IF NOT EXISTS idx_transactions_investment_id ON transactions(investment_id);
CREATE INDEX IF NOT EXISTS idx_transactions_category ON transactions(transaction_category);
CREATE INDEX IF NOT EXISTS idx_transactions_dedup_hash ON transactions(dedup_hash);
CREATE INDEX IF NOT EXISTS idx_transactions_date_investment ON transactions(date, investment_id);
CREATE INDEX IF NOT EXISTS idx_transactions_category_investment ON transactions(transaction_category, investment_id);

-- Investments table indexes
CREATE INDEX IF NOT EXISTS idx_investments_status ON investments(status);
CREATE INDEX IF NOT EXISTS idx_investments_type ON investments(investment_type);
CREATE INDEX IF NOT EXISTS idx_investments_group ON investments(investment_group);

-- Commitments table indexes
CREATE INDEX IF NOT EXISTS idx_commitments_investment_id ON commitments(investment_id);
CREATE INDEX IF NOT EXISTS idx_commitments_phase ON commitments(phase);

-- Column mappings index
CREATE INDEX IF NOT EXISTS idx_column_mappings_active ON column_mappings(active);
CREATE INDEX IF NOT EXISTS idx_column_mappings_field ON column_mappings(mapped_field);

-- ============================================================================
-- TRIGGERS FOR AUTOMATIC TIMESTAMP UPDATES
-- ============================================================================

-- Update timestamps on record modification
CREATE TRIGGER IF NOT EXISTS update_transactions_timestamp
AFTER UPDATE ON transactions
BEGIN
    UPDATE transactions SET updated_at = datetime('now') WHERE id = NEW.id;
END;

CREATE TRIGGER IF NOT EXISTS update_investments_timestamp
AFTER UPDATE ON investments
BEGIN
    UPDATE investments SET updated_at = datetime('now') WHERE id = NEW.id;
END;

CREATE TRIGGER IF NOT EXISTS update_commitments_timestamp
AFTER UPDATE ON commitments
BEGIN
    UPDATE commitments SET updated_at = datetime('now') WHERE id = NEW.id;
END;

CREATE TRIGGER IF NOT EXISTS update_transaction_type_mappings_timestamp
AFTER UPDATE ON transaction_type_mappings
BEGIN
    UPDATE transaction_type_mappings SET updated_at = datetime('now') WHERE raw_value = NEW.raw_value;
END;

CREATE TRIGGER IF NOT EXISTS update_column_mappings_timestamp
AFTER UPDATE ON column_mappings
BEGIN
    UPDATE column_mappings SET updated_at = datetime('now') WHERE id = NEW.id;
END;

CREATE TRIGGER IF NOT EXISTS update_counterparty_normalizations_timestamp
AFTER UPDATE ON counterparty_normalizations
BEGIN
    UPDATE counterparty_normalizations SET updated_at = datetime('now') WHERE raw_name = NEW.raw_name;
END;

-- ============================================================================
-- INITIAL CONFIGURATION DATA
-- ============================================================================

-- Insert default system configuration
INSERT OR IGNORE INTO system_config (key, value, description) VALUES
    ('schema_version', '1.0.0', 'Database schema version'),
    ('currency_base', 'USD', 'Base currency for reporting'),
    ('date_format_preference', 'ISO8601', 'Preferred date format for parsing'),
    ('dedup_hash_fields', 'date,amount_original,counterparty,investment', 'Fields used in deduplication hash');
