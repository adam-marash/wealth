#!/bin/bash
# Run all commitment migrations

echo "Running commitment migrations..."

# Database file location (PERSISTENT)
DB_FILE=".database/v3/d1/miniflare-D1DatabaseObject/18be79d38fd2493c122fe83ebdebd2a91b476bf2c9583d675f2c8071ba86e8ed.sqlite"

if [ ! -f "$DB_FILE" ]; then
    echo "Error: Database file not found at $DB_FILE"
    exit 1
fi

echo "Using database: $DB_FILE"

# Run migration 002
echo "Running migration 002: Add is_complete field..."
sqlite3 "$DB_FILE" < migrations/002_commitment_updates.sql

# Run migration 003
echo "Running migration 003: Seed commitment data..."
sqlite3 "$DB_FILE" < migrations/003_commitment_seed_data.sql

echo "Migrations completed successfully!"
echo ""
echo "Verifying is_complete column exists..."
sqlite3 "$DB_FILE" "PRAGMA table_info(investments);" | grep is_complete

echo ""
echo "Checking commitment data..."
sqlite3 "$DB_FILE" "SELECT COUNT(*) as commitments_added FROM investments WHERE initial_commitment IS NOT NULL;"
