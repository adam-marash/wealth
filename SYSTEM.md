# Wealth Management System Documentation

## System Overview
Financial transaction management system for tracking private equity, venture capital, and alternative investments. Built on Cloudflare Workers with D1 (SQLite) database. Handles CSV imports from financial institutions (Hebrew/English), normalizes data, prevents duplicates, and generates portfolio metrics.

## Database Schema

### Core Tables

**investments**
- Primary entity for each investment
- `slug` (TEXT): URL-safe canonical identifier for handling name variations
- `investment_type`: PE, VC, Real Estate, Public Equity, Hedge Fund, Credit, Infrastructure, Other
- `status`: active, fully_called, exited, written_off
- `phase`: building_up, stable, drawing_down (manually set)
- Commitment tracking fields: `commitment_amount_usd`, `called_to_date`, `remaining`
- Product type stored for reference

**transactions**
- All financial transactions linked to investments
- `transaction_category`: Mapped slug from transaction type (e.g., 'income-distribution', 'withdrawal', 'deposit', 'capital-return', 'management-fee', 'unrealized-gain-loss')
- `transaction_type_raw`: Original Hebrew value from CSV
- `cash_flow_direction`: +1 (money in) or -1 (money out)
- `amount_original`: Original amount from CSV
- `amount_normalized`: After applying directionality rules
- `amount_usd`: USD-normalized via exchange rate API
- `amount_ils`, `exchange_rate_to_ils`: Warehoused for reconciliation
- `dedup_hash`: SHA-256 hash for duplicate detection
- `metadata`: JSON with original CSV row

**investment_name_mappings**
- Maps raw name variations → canonical slug
- Handles spelling variations, Hebrew/English names
- Enables multi-script name normalization

### Configuration Tables

**transaction_type_mappings**
- Maps raw Hebrew transaction types → categories + directionality rules
- Currently populated via code config, not via database inserts

**column_mappings**
- CSV column → database field mappings
- Currently using static config in code (src/config/csv-static-mapping.ts)

**counterparty_normalizations**
- Raw counterparty names → normalized names

**system_config**
- Key-value store
- Defaults: schema_version='1.0.0', currency_base='USD', date_format_preference='ISO8601'

**exchange_rates**
- Cached exchange rates by date and currency pair
- Source: API or manual entry

## Configuration: Enums and Mappings

### Transaction Type Mappings
**File**: `src/config/transaction-type-mappings.ts`

| Hebrew | Slug | Display | Directionality |
|--------|------|---------|----------------|
| משיכת תשואה | income-distribution | Income Distribution | as_is |
| משיכה | withdrawal | Withdrawal | as_is |
| הפקדה | deposit | Deposit | always_negative |
| החזר הון | capital-return | Capital Return | always_positive |
| דמי ניהול | management-fee | Management Fee | always_negative |
| שינוי שווי שוק | unrealized-gain-loss | Unrealized Gain/Loss | as_is |

**Directionality Rules**:
- `as_is`: Keep amount sign unchanged
- `always_positive`: Force positive (capital returns)
- `always_negative`: Force negative (fees, contributions)

### CSV Static Mapping
**File**: `src/config/csv-static-mapping.ts`

**Hebrew Column** → **DB Field** → **Purpose**:
- תאור → investment_name → investment_discovery
- גוף מנהל → counterparty → investment_discovery
- סוג מוצר → product_type → investment_discovery
- תאריך התנועה → date → transaction_import
- סכום תנועה במטבע → amount → transaction_import
- מטבע התנועה → currency → transaction_import
- סוג תנועה → transaction_type → transaction_import
- שער המרה לתנועה → exchange_rate_to_ils → warehousing
- סכום תנועה בש"ח → amount_ils → warehousing

**Ignored Columns**: לקוח אב, מנהל לקוח, שייכות, סוג תנועה מורחב, מספר חשבון

### Column Mapping Suggestions
**File**: `src/config/column-mapping-suggestions.ts`

Intelligent suggestions for Hebrew/English column names with confidence levels (high/medium/low). Used for initial mapping discovery.

## Data Import Process

### Phase 1: Investment Discovery
**Endpoint**: `POST /api/upload/discover-investments`
**Process**:
1. Parse CSV, extract unique triplets: (תאור, גוף מנהל, סוג מוצר)
2. Query database for existing investments by name
3. Return: existing investments + new investments needing creation
4. User confirms creation
5. `POST /api/upload/create-investments` creates new investment records

### Phase 2: Transaction Import
**Endpoint**: `POST /api/upload/import-transactions`
**Process**:
1. Parse CSV using static Hebrew column mappings
2. Extract transaction rows with required fields
3. Look up investment ID by name
4. Map Hebrew transaction type → slug + directionality
5. Apply directionality rules to normalize amount
6. Generate deduplication hash: `SHA256(date|amount|investment_name|counterparty)`
7. Insert with `ON CONFLICT(dedup_hash) DO NOTHING`
8. Return: imported count, skipped count, errors

### CSV Parsing
**File**: `src/services/csv-parser.ts`
- **Hard-coded**: Row 3 (0-indexed as row 2) contains headers
- Supports UTF-8 with BOM detection
- Max file size: 10MB

## Key Processes and Algorithms

### Slug Generation
**File**: `src/services/slug.ts`
1. Transliterate Hebrew → Latin characters (א→a, ב→b, etc.)
2. Lowercase, remove non-alphanumeric (except hyphens)
3. Replace spaces with hyphens, collapse multiple hyphens
4. Examples: "Faro-Point FRG-X" → "faro-point-frg-x"

### Investment Name Resolution
1. Check `investment_name_mappings` (raw_name → slug)
2. Check `investments` (name → slug)
3. Return null if not found (flags for manual mapping)

### Date Parsing
**File**: `src/services/normalize.ts`
Supports: ISO 8601 (YYYY-MM-DD), DD/MM/YYYY, MM/DD/YYYY, Excel serial dates
Auto-detection: If first number > 12, assumes DD/MM/YYYY

### Amount Normalization
1. Parse number (handles commas, parentheses for negatives)
2. Look up transaction type mapping
3. Apply directionality rule
4. Return: normalized amount + category + direction

### Deduplication
**File**: `src/services/deduplication.ts`
**Hash Formula**: `SHA256(date_iso|amount_original|investment_slug)`
- Excludes counterparty (58% redundancy with investment)
- Similarity scoring for near-duplicates (date ±7 days, amount ±10%)

### Exchange Rate Conversion
**File**: `src/services/exchange-rate.ts`
- Currency symbol → ISO code mapping ($ → USD, ₪ → ILS, € → EUR)
- Check cached rates in database
- Fetch from external API if missing (requires env.EXCHANGE_RATE_API_KEY)
- Cache for future use

## Metrics and Calculations

### Private Equity Metrics
**File**: `src/calculations/metrics.ts`

**MOIC** (Multiple on Invested Capital):
```
MOIC = (Total Distributions + Residual Value) / Total Called
```

**DPI** (Distributions to Paid-In Capital):
```
DPI = Total Distributions / Total Called
```

**RVPI** (Residual Value to Paid-In Capital):
```
RVPI = Residual Value / Total Called
```

**TVPI** (Total Value to Paid-In Capital):
```
TVPI = DPI + RVPI = MOIC
```

**XIRR** (Extended Internal Rate of Return):
- Uses Newton-Raphson method for IRR calculation
- Converts transactions to cash flow series

### Aggregate Calculations
Per investment or portfolio-wide:
- Total Called (sum negative flows)
- Total Distributed (sum positive flows)
- Net Position (Called - Distributed)
- Current NAV (optional input, else = Net Position if positive)

## Hard-coded Values and Assumptions

### File Limits
- Max CSV upload: 10MB
- CSV header row: Row 3 (index 2)

### Default Values
- Base currency: USD
- Date format preference: ISO8601
- Dedup hash fields: date, amount_original, counterparty, investment
- Transaction pagination: 50 per page (default)
- Exchange rate date range for similarity: ±7 days
- Amount similarity threshold: ±10%
- Duplicate similarity score threshold: 80/100

### Transaction Categories
System uses slugs for categories instead of enum. Current categories (from transaction-type-mappings):
- income-distribution
- withdrawal
- deposit
- capital-return
- management-fee
- unrealized-gain-loss

### Investment Phases
Manually set (no auto-detection currently):
- building_up: Actively calling capital
- stable: Occasional calls, mostly dormant
- drawing_down: Distributions exceed calls

Note: Phase detection logic removed (see transaction-import.ts:280-282)

### Currency Support
Default mappings:
- $ → USD
- ₪ → ILS
- € → EUR
- £ → GBP
- ¥ → JPY

## API Endpoints

### Upload Routes (`/api/upload/*`)
- `POST /parse-csv`: Parse CSV and return column info
- `POST /preview`: Preview normalized transactions with dedup check (no DB write)
- `POST /commit`: Import transactions to database (supports ?dry_run=true)
- `POST /discover-investments`: Phase 1 - Find new vs existing investments
- `POST /create-investments`: Phase 1b - Create new investments
- `POST /import-transactions`: Phase 2 - Import transactions using static mapping

### Reports Routes (`/api/reports/*`)
- `GET /transactions`: Query transactions with filters (investment_id, date range, category, counterparty)
- `GET /investment-summary/:id`: Get metrics for specific investment
- `GET /portfolio-summary`: Aggregate metrics across all investments

### Transaction Routes (`/api/transactions/*`)
- Standard CRUD operations
- List with filtering and pagination

## Workflow: Implementation Order
Per CLAUDE.md, implement in descending priority:
1. Successful upload ✓
2. Relationships and linking ✓
3. Data visibility ✓
4. UI and entry confirmation
5. Management features
6. Reports and analytics

## Common Implementation Scenarios

**Add new transaction type**:
1. Add Hebrew→English mapping to `src/config/transaction-type-mappings.ts`
2. Specify directionality rule (as_is, always_positive, always_negative)
3. Optionally add to column suggestions in `column-mapping-suggestions.ts`

**Add new CSV column mapping**:
1. Add to `src/config/csv-static-mapping.ts`
2. Specify purpose (investment_discovery, transaction_import, warehousing, ignore)
3. Update extraction logic in `src/services/transaction-import.ts` if needed

**Change deduplication logic**:
- Modify `generateDedupHash()` in `src/services/deduplication.ts`
- Update `dedup_hash_fields` in `system_config` table
- Warning: Changing hash formula invalidates existing hashes

**Add new investment type**:
- Update `InvestmentType` enum in `src/types/investment.ts`
- No database migration needed (TEXT field)

**Modify phase detection**:
- Phase is manually set via investment edit form
- Previous auto-detection removed (see note in import.ts:280)
- To re-enable: add logic to `importTransactions()` in `src/services/import.ts`

**Add new currency**:
1. Add symbol mapping to `currencySymbolToCode()` in `src/services/exchange-rate.ts`
2. Ensure exchange rate API supports the currency

**Custom investment name mapping**:
- Use `mapInvestmentName(db, rawName, slug)` from `src/services/slug.ts`
- Stores in `investment_name_mappings` table
- Used for handling Hebrew/English variations and misspellings
