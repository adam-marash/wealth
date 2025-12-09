# Two-Phase CSV Import Implementation

## Overview

Implemented a two-phase import flow that eliminates the column mapping UI and uses static mappings instead.

## Changes Made

### 1. Static CSV Mapping Configuration
**File:** `src/config/csv-static-mapping.ts`

Defines static mappings from Hebrew column names to database fields:
- **Investment Discovery Fields**: תאור, גוף מנהל, סוג מוצר
- **Transaction Import Fields**: תאריך התנועה, סכום תנועה במטבע, מטבע התנועה, סוג תנועה
- **Warehousing Fields**: שער המרה לתנועה, סכום תנועה בש"ח
- **Ignored Fields**: לקוח אב, מנהל לקוח, שייכות, סוג תנועה מורחב, מספר חשבון

### 2. Investment Discovery Service
**File:** `src/services/investment-discovery.ts`

Functions:
- `extractInvestmentTriplets(rows)` - Extracts unique (תאור + גוף מנהל + סוג מוצר) triplets
- `discoverInvestments(db, rows)` - Checks which investments exist in database
- `createInvestments(db, investments)` - Creates new investments

### 3. Transaction Import Service
**File:** `src/services/transaction-import.ts`

Functions:
- `extractTransactionFromRow(row, rowIndex)` - Extracts transaction using static mappings
- `importTransactions(db, rows, sourceFile)` - Imports all transactions with:
  - Investment lookup by name (תאור)
  - Transaction type mapping (סוג תנועה)
  - Directionality rules applied
  - Deduplication
  - Warehousing fields stored
  - Full row data in metadata JSON

### 4. New API Endpoints
**File:** `src/routes/upload.ts`

#### Phase 1: Investment Discovery
```
POST /api/upload/discover-investments
Body: multipart/form-data with 'file' field
Response: {
  existingInvestments: [...],
  newInvestments: [...],
  totalFound: number,
  stats: { existing: number, new: number }
}
```

#### Phase 1b: Create Investments
```
POST /api/upload/create-investments
Body: { investments: InvestmentTriplet[] }
Response: {
  created: number,
  ids: number[]
}
```

#### Phase 2: Import Transactions
```
POST /api/upload/import-transactions
Body: multipart/form-data with 'file' field
Response: {
  imported: number,
  skipped: number,
  errors: Array<{ row: number, error: string }>
}
```

## Import Flow

### Current Flow (Old)
1. Upload CSV → Parse and show columns
2. Map columns to fields (manual UI configuration)
3. Save mappings
4. Map transaction types
5. Preview transactions
6. Import

### New Flow
1. **Upload CSV** → Discover investments
2. **Show Discovery Results**:
   - Existing investments: X
   - New investments: Y (with names, counterparties, product types)
3. **User confirms** → Create new investments
4. **Import Transactions** → All transactions imported with static mappings
5. **Show Results**: X imported, Y skipped, Z errors

## UI Changes Needed

The UI in `src/dashboardHTML.ts` needs to be updated to:

1. **Remove Column Mapping Step**:
   - Remove `step === 'columns'` section
   - Remove column mapping dropdowns
   - Remove "Next: Transaction Types" button

2. **Add Investment Discovery Step**:
   - After file upload, call `/api/upload/discover-investments`
   - Show table of existing investments
   - Show table of new investments with confirm button
   - If no new investments, proceed directly to import

3. **Simplify Transaction Import**:
   - Remove transaction type mapping step
   - After investment discovery, directly call `/api/upload/import-transactions`
   - Show results: imported, skipped, errors

## Database Fields Populated

### Investments Table
- `name` ← תאור
- `product_type` ← סוג מוצר
- `status` ← 'active' (default)

### Transactions Table
- `date` ← תאריך התנועה
- `amount_original` ← סכום תנועה במטבע
- `amount_normalized` ← סכום תנועה במטבע (with directionality applied)
- `original_currency` ← מטבע התנועה
- `transaction_type_raw` ← סוג תנועה
- `transaction_category` ← Mapped from transaction-type-mappings.ts
- `cash_flow_direction` ← +1 or -1 based on directionality rules
- `investment_id` ← Looked up from investments by תאור
- `counterparty` ← גוף מנהל
- `exchange_rate_to_ils` ← שער המרה לתנועה (warehousing)
- `amount_ils` ← סכום תנועה בש"ח (warehousing)
- `dedup_hash` ← Generated from date|amount|investment|counterparty
- `metadata` ← Full original row as JSON
- `source_file` ← Original filename

## Testing

Backend implementation is complete and server is running without errors.

To test the API endpoints, upload a CSV file with the expected structure:
- Row 1: Metadata
- Row 2: "כל הרשומות"
- Row 3: Headers (תאור, גוף מנהל, סוג מוצר, etc.)
- Row 4+: Data rows

## Next Steps

1. Update UI to implement two-phase flow
2. Test with real CSV file
3. Verify investment discovery works correctly
4. Verify transaction import with all mappings
5. Check warehousing fields are stored
6. Verify deduplication works
