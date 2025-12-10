#!/bin/bash
# Backup database and run migrations

set -e

# Database file location (PERSISTENT)
DB_FILE=".database/v3/d1/miniflare-D1DatabaseObject/18be79d38fd2493c122fe83ebdebd2a91b476bf2c9583d675f2c8071ba86e8ed.sqlite"

if [ ! -f "$DB_FILE" ]; then
    echo "Error: Database file not found at $DB_FILE"
    exit 1
fi

echo "Found database: $DB_FILE"

# Create backup
TIMESTAMP=$(date +%Y%m%d-%H%M%S)
BACKUP_FILE="${DB_FILE}.backup-${TIMESTAMP}"
cp "$DB_FILE" "$BACKUP_FILE"
echo "✓ Backup created: $BACKUP_FILE"

# Run migration 002
echo ""
echo "Running migration 002: Add is_complete field..."
sqlite3 "$DB_FILE" < migrations/002_commitment_updates.sql
echo "✓ Migration 002 completed"

# Run migration 003
echo ""
echo "Running migration 003: Seed commitment data..."
sqlite3 "$DB_FILE" < migrations/003_commitment_seed_data.sql
echo "✓ Migration 003 completed"

echo ""
echo "✓ All migrations completed successfully!"
echo ""
echo "Verifying changes..."
sqlite3 "$DB_FILE" "PRAGMA table_info(investments);" | grep is_complete || echo "Warning: is_complete column not found"
echo ""
echo "Commitments added:"
sqlite3 "$DB_FILE" "SELECT COUNT(*) FROM investments WHERE initial_commitment IS NOT NULL;"
