# Financial Transaction Management System - Interactive Setup

Build a web application for managing family office financial transactions with an interactive onboarding process and flexible reporting.

## Tech Stack
- Cloudflare Workers + D1 (SQLite)
- Hono framework for API
- React for frontend
- TypeScript throughout
- Libraries: xlsx (SheetJS), date-fns

## Phase 1: Interactive Schema Discovery

### First Upload Flow
When user uploads their first Excel file:

1. **Column Detection**
   - Parse the Excel file
   - Show all columns with sample data (first 5 rows)
   - For each column, ask user:
     - "What is this column?" (dropdown: Date, Description, Transaction Type, Amount, Currency, Counterparty, Category, Investment Name, Ignore)
     - Allow custom field names for future flexibility

2. **Transaction Type Classification**
   - Show unique values from the "Transaction Type" column
   - For each unique value, ask:
     - "What category is this?" (dropdown: Income/Return, Capital Call, Distribution, Fee, Transfer, Other)
     - "What's the cash flow direction?" (dropdown: Money In [+], Money Out [-], Variable - depends on amount sign)
   - Save these mappings to a configuration table

3. **Amount Directionality Logic**
   - Show unique transaction types
   - For each type, ask: "Should amounts be inverted for accounting?" (Yes/No)
   - Examples shown: "If amount is -1000 and type is 'Distribution', should we treat as +1000 income?"
   - Save directionality rules per transaction type

4. **Investment Identification**
   - Ask: "Which column identifies individual investments?" (dropdown of available columns)
   - Show unique investment names
   - Ask: "Group any of these together?" (multi-select to create investment groups/rollups)

5. **Currency Handling**
   - Detect currency columns
   - Ask: "Do you have a USD-normalized amount column?" (Yes/No)
   - If No: "We'll need exchange rates. Add them manually or via API later?"
   - Save currency configuration

6. **Save Configuration**
   - Store all mappings in D1 config tables
   - Future uploads use this configuration automatically
   - Provide "Reconfigure" option in settings

## Data Model

### Core Tables

**transactions**
- id (primary key)
- date (ISO date)
- description (text)
- transaction_type_raw (text) - original value from Excel
- transaction_category (text) - mapped category: income, capital_call, distribution, fee, transfer
- cash_flow_direction (integer) - +1 or -1
- amount_original (decimal)
- amount_normalized (decimal) - after applying directionality rules
- original_currency (text)
- amount_usd (decimal)
- investment_id (foreign key)
- counterparty (text)
- commitment_id (foreign key, nullable) - links to capital commitments
- dedup_hash (text, unique)
- metadata (JSON) - store original row data for debugging
- created_at (timestamp)
- source_file (text) - original filename

**investments**
- id (primary key)
- name (text)
- investment_group (text, nullable) - for rolling up related investments
- investment_type (text) - PE, VC, Real Estate, Public Equity, etc
- initial_commitment (decimal, nullable)
- committed_currency (text)
- commitment_date (date, nullable)
- status (text) - active, fully_called, exited, written_off
- created_at (timestamp)

**commitments**
- id (primary key)
- investment_id (foreign key)
- commitment_amount (decimal)
- currency (text)
- commitment_date (date)
- called_to_date (decimal) - calculated from transactions
- remaining (decimal) - calculated: commitment_amount - called_to_date
- phase (text) - building_up, stable, drawing_down (inferred from recent transaction pattern)
- notes (text)

**transaction_type_mappings**
- raw_value (text, primary key)
- category (text) - income, capital_call, distribution, fee, transfer
- directionality_rule (text) - as_is, invert, variable
- cash_flow_impact (integer) - +1 or -1 (or NULL if variable)

**column_mappings**
- id (primary key)
- excel_column_letter (text)
- excel_column_name (text) - header from Excel
- mapped_field (text) - date, description, transaction_type, etc
- active (boolean)

**counterparty_normalizations**
- raw_name (text, primary key)
- normalized_name (text)

## Phase 2: Ingestion Pipeline

### Subsequent Uploads
1. Use saved column mappings to parse Excel automatically
2. Apply transaction type mappings and directionality rules
3. Calculate dedup_hash
4. Show preview:
   - X new transactions
   - Y duplicates (show list)
   - Z potential issues (unparsed dates, unknown transaction types, missing investments)
5. Allow user to:
   - Review and fix issues inline
   - Add new transaction type mappings if new types found
   - Create new investments if referenced but not in DB
   - Confirm and commit

### Smart Deduplication
- Hash: date + amount_original + counterparty + investment
- Show duplicate matches with similarity score
- Allow user to mark as "actually different" and adjust hash fields

### Commitment Tracking
- When capital call transaction detected, link to commitment
- Update commitment.called_to_date
- Calculate remaining automatically
- Infer phase based on transaction pattern:
  - building_up: calls > distributions in last 12 months
  - stable: calls ≈ distributions
  - drawing_down: distributions > calls significantly

## Phase 3: Reports

All reports have:
- Date range selector (year, quarter, custom range, or "inception to date")
- Investment filter (all, specific investment, investment group)
- Currency selector (original currencies, USD, both)
- Export to CSV button

### 1. Total Earnings Per Year
**Query logic:**
- Filter: transaction_category = 'income' OR (category = 'distribution' AND investment_type = 'Public Equity')
- Group by: YEAR(date), investment (optional drill-down)
- Sum: amount_usd
- Show: Year, Investment, Amount, % of Total

**Display:**
- Table with year rows, investment columns
- Grand total row
- Year-over-year growth %
- Chart: bar graph of total earnings by year

### 2. Total Equity Returns
**Components:**
- Realized gains: distributions marked as returns of capital
- Unrealized gains: current valuation - cost basis (requires valuation input)
- IRR calculation per investment
- MOIC (Multiple on Invested Capital)

**Query logic:**
- Cost basis: SUM(amount) WHERE category = 'capital_call'
- Distributions: SUM(amount) WHERE category = 'distribution'
- Current value: user input or latest valuation transaction
- IRR: calculate using XIRR formula on cash flows

**Display:**
- Table: Investment, Cost Basis, Distributions, Current Value, Gain/Loss, IRR, MOIC
- Aggregated totals
- Pie chart: allocation by investment

### 3. Total Returned Cash Per Year
**Query logic:**
- Filter: category = 'distribution' AND cash_flow_direction = +1
- Group by: YEAR(date), optional: QUARTER(date), MONTH(date)
- Sum: amount_usd

**Display:**
- Table with period breakdown
- Running total column
- Chart: line graph of cumulative cash returned
- Comparison to contributions (net cash position)

### 4. Portfolio Position (Balance Sheet)
**Query logic:**
- For each investment:
  - Total contributed: SUM(amount) WHERE category = 'capital_call'
  - Total distributed: SUM(amount) WHERE category = 'distribution'
  - Current invested: contributed - distributed
  - Current valuation: latest valuation or user input
  - Unrealized gain: valuation - current invested

**Display:**
- Table: Investment, Contributed, Distributed, Net Invested, Valuation, Unrealized Gain, % of Portfolio
- Treemap visualization by investment size
- Status indicator (active, exited, written off)

### 5. Outstanding Commitments Per Investment
**Query logic:**
- Join investments with commitments table
- Show: commitment amount, called to date, remaining, phase

**Display:**
- Table: Investment, Committed, Called, Remaining, % Called, Phase, Est. Timeline
- Phase indicators with icons:
  - 🔼 Building up (still actively calling capital)
  - ⏸️ Stable (occasional calls, mostly dormant)
  - 🔽 Drawing down (distributions exceeding calls)
- Alert if commitment nearly exhausted or overdrawn
- Chart: stacked bar showing called vs remaining by investment

**Phase Detection Logic:**
- Analyze last 24 months of transactions
- Building up: capital calls > 2x distributions
- Drawing down: distributions > 2x capital calls
- Stable: neither condition met
- Override: allow manual phase setting

### 6. Additional Important Reports

#### Cash Flow Analysis
- Monthly/quarterly net cash flow (in - out)
- Breakdown by: income, calls, distributions, fees
- Running balance
- Projected calls based on outstanding commitments

#### Fee Analysis
- Total fees per year by investment
- Fee as % of NAV or committed capital
- Fee trend over time

#### Investment Performance Matrix
- IRR vs MOIC scatter plot
- Vintage year analysis
- Time-weighted returns
- Comparison to benchmarks (if provided)

#### Capital Account Statement (per investment)
- Beginning balance
- Plus: Contributions
- Plus: Income/gains
- Minus: Distributions
- Minus: Fees
- Equals: Ending balance
- Formatted like a traditional capital account statement

#### Concentration Risk
- Top 10 investments by value
- Percentage of portfolio in top 3, 5, 10
- Diversification metrics

## UI Implementation

### Main Navigation
- Dashboard (overview metrics)
- Upload (drag-drop Excel, or "Configure column mappings")
- Reports (tabs for each report type)
- Investments (list view, detail view per investment)
- Settings (column mappings, transaction type rules, counterparty normalization)

### Dashboard Widgets
- Total portfolio value
- YTD returns
- YTD cash returned
- Outstanding commitments
- Recent transactions (last 10)
- Alerts (unfunded commitments, missing valuations, anomalies)

### Report Interactions
- All tables: sortable, filterable columns
- Click investment name to drill into investment detail
- Click year to drill into transactions for that period
- Hover on data point to show breakdown
- Right-click row to "Show underlying transactions"

## Configuration & Settings

### Transaction Type Manager
- List all discovered transaction types
- Edit category and directionality for each
- Add custom types manually
- Bulk import type mappings from CSV

### Investment Manager
- List all investments
- Edit details: name, type, commitment amount, status
- Merge investments (if duplicates)
- Archive investments
- Link to external IDs (if applicable)

### Column Mapping Reconfiguration
- Show current mappings
- "Test on file" - upload sample Excel to verify mappings work
- Reset and re-run interactive setup

## Technical Implementation Notes

### Excel Parsing
- Handle merged cells gracefully
- Detect header row automatically (look for common patterns)
- Support multiple sheets (ask which sheet to use)
- Handle formulas (evaluate or take displayed value)

### Date Normalization
- Try formats in order: ISO 8601, DD/MM/YYYY, MM/DD/YYYY, "15th March 2024", Excel serial dates
- If ambiguous, ask user to clarify format
- Save preferred date format per column

### Currency Conversion
- If no USD column, integrate with exchange rate API (exchangerate-api.io or similar)
- Cache rates in D1 by date
- Allow manual rate overrides

### IRR Calculation
- Use XIRR algorithm (Newton-Raphson method)
- Handle irregular cash flows
- Return NULL if cannot converge

### Performance
- Index on: date, investment_id, transaction_category
- Use materialized views for expensive calculations (portfolio position, returns)
- Refresh on upload or manually

### Security
- Authenticate uploads (optional: password protect or use Cloudflare Access)
- Validate all Excel input (prevent injection)
- Rate limit upload endpoint

## Deployment
```toml
# wrangler.toml
name = "family-office-reporting"
main = "src/index.ts"
compatibility_date = "2024-01-01"

[[d1_databases]]
binding = "DB"
database_name = "transactions_db"
database_id = "<generated-on-create>"

[vars]
ENVIRONMENT = "production"
```

Commands:
```bash
npx wrangler d1 create transactions_db
npx wrangler d1 execute transactions_db --file=./schema.sql
npx wrangler deploy
```

## Project Structure
```
/
├── schema.sql              # D1 table definitions with indexes
├── src/
│   ├── index.ts           # Main worker entry point with Hono app
│   ├── routes/
│   │   ├── upload.ts      # POST /api/upload (handles Excel parsing)
│   │   ├── configure.ts   # Interactive setup endpoints
│   │   ├── reports.ts     # GET /api/reports/:type
│   │   ├── investments.ts # CRUD for investments
│   │   └── settings.ts    # Configuration management
│   ├── services/
│   │   ├── excel-parser.ts     # SheetJS integration
│   │   ├── schema-discovery.ts # Interactive column mapping
│   │   ├── normalize.ts        # Date/name/amount normalization
│   │   ├── deduplication.ts    # Hash generation and duplicate detection
│   │   ├── commitment-tracker.ts # Capital call/commitment logic
│   │   └── report-queries.ts   # SQL for all reports
│   ├── calculations/
│   │   ├── irr.ts         # XIRR implementation
│   │   └── metrics.ts     # MOIC, returns, etc
│   ├── types/
│   │   ├── transaction.ts
│   │   ├── investment.ts
│   │   ├── config.ts
│   │   └── report.ts
│   └── frontend/
│       ├── App.tsx
│       ├── components/
│       │   ├── Upload.tsx
│       │   ├── SchemaSetup.tsx      # Interactive column mapping UI
│       │   ├── TransactionPreview.tsx
│       │   ├── Dashboard.tsx
│       │   ├── Reports/
│       │   │   ├── EarningsReport.tsx
│       │   │   ├── PortfolioPosition.tsx
│       │   │   ├── Commitments.tsx
│       │   │   └── CashFlow.tsx
│       │   ├── InvestmentDetail.tsx
│       │   └── Settings/
│       │       ├── ColumnMappings.tsx
│       │       ├── TransactionTypes.tsx
│       │       └── CounterpartyRules.tsx
│       ├── hooks/
│       │   ├── useUpload.ts
│       │   └── useReports.ts
│       └── index.html
├── wrangler.toml
├── package.json
├── tsconfig.json
└── README.md
```

## Acceptance Criteria

### Phase 1 (Interactive Setup)
- [ ] Upload first Excel file
- [ ] Walk through column mapping UI with sample data
- [ ] Map transaction types to categories
- [ ] Configure directionality rules with examples
- [ ] Configuration saved to D1 and reused on next upload

### Phase 2 (Ingestion)
- [ ] Upload subsequent file using saved config
- [ ] Deduplication detects 100% of true duplicates, 0% false positives
- [ ] Unknown transaction types prompt for mapping without blocking import
- [ ] Can review and fix issues before commit
- [ ] Transactions imported with proper signs and normalized values

### Phase 3 (Reports)
- [ ] Total Earnings Per Year shows correct totals and YoY growth
- [ ] Portfolio Position reflects accurate net invested amounts
- [ ] Outstanding Commitments shows phase correctly (building/stable/drawing)
- [ ] IRR calculations match industry-standard XIRR results
- [ ] All reports export to CSV with proper formatting

### Phase 4 (Usability)
- [ ] Dashboard loads in under 2 seconds
- [ ] Reports render in under 3 seconds for 1000+ transactions
- [ ] Mobile-responsive design works on tablet
- [ ] Settings allow reconfiguration without data loss
- [ ] Can drill down from any report to underlying transactions

## Implementation Priority

1. D1 schema, Excel parsing, interactive column mapping UI
2. Transaction ingestion with deduplication, basic transaction list view
3. Portfolio Position and Commitments reports (most critical)
4. Earnings and Cash Flow reports, dashboard widgets
5. IRR calculations, performance matrix, polish and testing

## Notes for Claude Code

- All UI text should be in English with normalized field names (no Hebrew in UI)
- Store original Hebrew values from Excel but display translated/normalized versions
- Focus on data integrity during ingestion - better to block with a warning than silently import bad data
- Make the interactive setup foolproof - if column mappings are correct, everything downstream works
- Use prepared statements for all SQL to prevent injection
- Log all configuration changes for audit trail
- Consider adding a "dry run" mode for uploads that shows what would happen without committing

Start with the interactive schema discovery flow and column mapping UI. This is the foundation that makes everything else work cleanly.
