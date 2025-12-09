-- Migration 001: Add missing fields based on Issue #17 decisions
-- Date: 2025-12-09
-- Description: Add exchange rate fields, ILS amount, product type, and exchange rates table

-- Add fields to transactions table
ALTER TABLE transactions ADD COLUMN amount_ils REAL;
ALTER TABLE transactions ADD COLUMN exchange_rate_to_ils REAL;

-- Add field to investments table
ALTER TABLE investments ADD COLUMN product_type TEXT;

-- Create exchange_rates table for USD rate caching
CREATE TABLE IF NOT EXISTS exchange_rates (
    date TEXT NOT NULL,
    from_currency TEXT NOT NULL,
    to_currency TEXT NOT NULL,
    rate REAL NOT NULL,
    source TEXT DEFAULT 'api',
    created_at TEXT DEFAULT (datetime('now')),
    PRIMARY KEY (date, from_currency, to_currency)
);
