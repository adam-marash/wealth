# Database Schema Documentation

## Overview
This database schema supports a financial transaction management system for family office reporting. The schema is designed for Cloudflare D1 (SQLite) and includes transaction tracking, investment management, and commitment monitoring.

## Database Configuration
- **Database Name**: `transactions_db`
- **Database ID**: `ebf992cb-5dbf-4ba6-9622-b5fbc15bdc57`
- **Engine**: Cloudflare D1 (SQLite)
- **Schema Version**: 1.0.0

## Core Tables

### `investments`
Stores individual investment entities (PE, VC, Real Estate, Public Equity, etc.)

| Column | Type | Description |
|--------|------|-------------|
| `id` | INTEGER (PK) | Auto-incrementing primary key |
| `name` | TEXT | Investment name |
| `investment_group` | TEXT | For rolling up related investments |
| `investment_type` | TEXT | PE, VC, Real Estate, Public Equity, etc |
| `initial_commitment` | REAL | Initial commitment amount |
| `committed_currency` | TEXT | Currency of commitment |
| `commitment_date` | TEXT | ISO 8601 date of commitment |
| `status` | TEXT | active, fully_called, exited, written_off |
| `created_at` | TEXT | Record creation timestamp |
| `updated_at` | TEXT | Last update timestamp |

**Indexes**:
- `idx_investments_status` on `status`
- `idx_investments_type` on `investment_type`
- `idx_investments_group` on `investment_group`

---

### `commitments`
Tracks capital commitments per investment with automatic calculations

| Column | Type | Description |
|--------|------|-------------|
| `id` | INTEGER (PK) | Auto-incrementing primary key |
| `investment_id` | INTEGER (FK) | References `investments(id)` |
| `commitment_amount` | REAL | Total commitment amount |
| `currency` | TEXT | Commitment currency |
| `commitment_date` | TEXT | ISO 8601 date |
| `called_to_date` | REAL | Sum of capital calls (calculated) |
| `remaining` | REAL | commitment_amount - called_to_date |
| `phase` | TEXT | building_up, stable, drawing_down |
| `manual_phase` | INTEGER | Boolean: 1 if phase manually set |
| `notes` | TEXT | Additional notes |
| `created_at` | TEXT | Record creation timestamp |
| `updated_at` | TEXT | Last update timestamp |

**Indexes**:
- `idx_commitments_investment_id` on `investment_id`
- `idx_commitments_phase` on `phase`

**Foreign Keys**:
- `investment_id` → `investments(id)` (CASCADE DELETE)

---

### `transactions`
Core transaction data with deduplication and metadata

| Column | Type | Description |
|--------|------|-------------|
| `id` | INTEGER (PK) | Auto-incrementing primary key |
| `date` | TEXT | Transaction date (ISO 8601) |
| `description` | TEXT | Transaction description |
| `transaction_type_raw` | TEXT | Original value from Excel |
| `transaction_category` | TEXT | Mapped: income, capital_call, distribution, fee, transfer |
| `cash_flow_direction` | INTEGER | +1 (money in) or -1 (money out) |
| `amount_original` | REAL | Original amount from source |
| `amount_normalized` | REAL | After applying directionality rules |
| `original_currency` | TEXT | Source currency |
| `amount_usd` | REAL | USD-normalized amount |
| `investment_id` | INTEGER (FK) | References `investments(id)` |
| `counterparty` | TEXT | Counterparty name |
| `commitment_id` | INTEGER (FK) | References `commitments(id)` |
| `dedup_hash` | TEXT (UNIQUE) | Hash for deduplication |
| `metadata` | TEXT | JSON: original row data |
| `source_file` | TEXT | Original filename |
| `created_at` | TEXT | Record creation timestamp |
| `updated_at` | TEXT | Last update timestamp |

**Indexes** (optimized for reporting queries):
- `idx_transactions_date` on `date`
- `idx_transactions_investment_id` on `investment_id`
- `idx_transactions_category` on `transaction_category`
- `idx_transactions_dedup_hash` on `dedup_hash`
- `idx_transactions_date_investment` on `(date, investment_id)` - composite
- `idx_transactions_category_investment` on `(transaction_category, investment_id)` - composite

**Foreign Keys**:
- `investment_id` → `investments(id)` (SET NULL on delete)
- `commitment_id` → `commitments(id)` (SET NULL on delete)

---

## Configuration Tables

### `transaction_type_mappings`
Maps raw Excel transaction types to standardized categories

| Column | Type | Description |
|--------|------|-------------|
| `raw_value` | TEXT (PK) | Raw transaction type from Excel |
| `category` | TEXT | income, capital_call, distribution, fee, transfer |
| `directionality_rule` | TEXT | as_is, invert, variable |
| `cash_flow_impact` | INTEGER | +1, -1, or NULL if variable |
| `created_at` | TEXT | Record creation timestamp |
| `updated_at` | TEXT | Last update timestamp |

**Example**:
```
raw_value: "Capital Call"
category: "capital_call"
directionality_rule: "invert"
cash_flow_impact: -1
```

---

### `column_mappings`
Stores Excel column to database field mappings for data ingestion

| Column | Type | Description |
|--------|------|-------------|
| `id` | INTEGER (PK) | Auto-incrementing primary key |
| `excel_column_letter` | TEXT | Excel column letter (A, B, C, etc.) |
| `excel_column_name` | TEXT | Header from Excel file |
| `mapped_field` | TEXT | Database field: date, description, transaction_type, etc |
| `active` | INTEGER | Boolean: 1 if active |
| `date_format` | TEXT | Preferred date format if applicable |
| `created_at` | TEXT | Record creation timestamp |
| `updated_at` | TEXT | Last update timestamp |

**Indexes**:
- `idx_column_mappings_active` on `active`
- `idx_column_mappings_field` on `mapped_field`

---

### `counterparty_normalizations`
Name normalization rules for counterparties

| Column | Type | Description |
|--------|------|-------------|
| `raw_name` | TEXT (PK) | Raw counterparty name |
| `normalized_name` | TEXT | Standardized name |
| `created_at` | TEXT | Record creation timestamp |
| `updated_at` | TEXT | Last update timestamp |

**Example**:
```
raw_name: "Goldman Sachs Inc."
normalized_name: "Goldman Sachs"
```

---

### `system_config`
Key-value store for system-wide configuration

| Column | Type | Description |
|--------|------|-------------|
| `key` | TEXT (PK) | Configuration key |
| `value` | TEXT | Configuration value |
| `description` | TEXT | Description of setting |
| `created_at` | TEXT | Record creation timestamp |
| `updated_at` | TEXT | Last update timestamp |

**Default Configuration**:
- `schema_version`: "1.0.0"
- `currency_base`: "USD"
- `date_format_preference`: "ISO8601"
- `dedup_hash_fields`: "date,amount_original,counterparty,investment"

---

## Triggers

All tables have automatic timestamp update triggers:
- `update_transactions_timestamp`
- `update_investments_timestamp`
- `update_commitments_timestamp`
- `update_transaction_type_mappings_timestamp`
- `update_column_mappings_timestamp`
- `update_counterparty_normalizations_timestamp`

These triggers automatically set `updated_at = datetime('now')` on any UPDATE operation.

---

## Data Relationships

```
investments (1) ──< (N) commitments
    │
    │
    └──< (N) transactions ──> (1) commitments [optional]
```

- Each **investment** can have multiple **commitments**
- Each **investment** can have multiple **transactions**
- Each **transaction** can optionally link to a specific **commitment** (for capital calls)

---

## Deduplication Strategy

Transactions use a `dedup_hash` field to prevent duplicate imports:

**Hash Components** (configurable via `system_config.dedup_hash_fields`):
- `date`
- `amount_original`
- `counterparty`
- `investment` (investment_id)

The hash ensures that the same transaction from multiple file uploads is detected and not re-imported.

---

## Deployment Commands

### Create Database (already done)
```bash
npx wrangler d1 create transactions_db
# Database ID: ebf992cb-5dbf-4ba6-9622-b5fbc15bdc57
```

### Execute Schema (Local)
```bash
npx wrangler d1 execute transactions_db --local --file=./schema.sql
```

### Execute Schema (Remote/Production)
```bash
npx wrangler d1 execute transactions_db --remote --file=./schema.sql
```

### Query Database (Local)
```bash
npx wrangler d1 execute transactions_db --local --command="SELECT * FROM investments;"
```

### Query Database (Remote)
```bash
npx wrangler d1 execute transactions_db --remote --command="SELECT * FROM investments;"
```

---

## Performance Considerations

1. **Composite Indexes**: Created for common query patterns (date + investment, category + investment)
2. **Index Coverage**: All foreign keys are indexed for JOIN performance
3. **Dedup Index**: Unique index on `dedup_hash` for fast duplicate detection
4. **Timestamp Triggers**: Automatic via triggers (minimal overhead on SQLite)

---

## Schema Version History

| Version | Date | Changes |
|---------|------|---------|
| 1.0.0 | 2025-12-09 | Initial schema with all core tables, indexes, and triggers |

---

## Next Steps

- **TICKET-002**: Set up Hono backend to interact with this schema
- **TICKET-003**: Implement Excel parsing to populate these tables
- **TICKET-004+**: Build interactive configuration UI for mappings
