/**
 * Static CSV Column Mapping Configuration
 *
 * Since CSV files from the financial institution have a consistent format,
 * we use static mappings instead of a UI configuration screen.
 *
 * Row 3 always contains headers (0-indexed as row 2)
 */

export interface CSVFieldMapping {
  hebrewColumn: string;
  dbField: string;
  purpose: 'investment_discovery' | 'transaction_import' | 'warehousing' | 'ignore';
  description: string;
}

/**
 * Static mapping from CSV columns to database fields
 */
export const csvStaticMapping: CSVFieldMapping[] = [
  // ============================================================================
  // INVESTMENT DISCOVERY FIELDS (Phase 1)
  // ============================================================================
  {
    hebrewColumn: 'תאור',
    dbField: 'investment_name',
    purpose: 'investment_discovery',
    description: 'Investment name - used to create/lookup investments',
  },
  {
    hebrewColumn: 'גוף מנהל',
    dbField: 'counterparty',
    purpose: 'investment_discovery',
    description: 'Counterparty - stored on both investment and transaction',
  },
  {
    hebrewColumn: 'סוג מוצר',
    dbField: 'product_type',
    purpose: 'investment_discovery',
    description: 'Product type - stored on investment',
  },

  // ============================================================================
  // TRANSACTION IMPORT FIELDS (Phase 2)
  // ============================================================================
  {
    hebrewColumn: 'תאריך התנועה',
    dbField: 'date',
    purpose: 'transaction_import',
    description: 'Transaction date',
  },
  {
    hebrewColumn: 'סכום תנועה במטבע',
    dbField: 'amount',
    purpose: 'transaction_import',
    description: 'Transaction amount in original currency',
  },
  {
    hebrewColumn: 'מטבע התנועה',
    dbField: 'currency',
    purpose: 'transaction_import',
    description: 'Transaction currency',
  },
  {
    hebrewColumn: 'סוג תנועה',
    dbField: 'transaction_type',
    purpose: 'transaction_import',
    description: 'Transaction type - maps to category via transaction-type-mappings',
  },

  // ============================================================================
  // WAREHOUSING FIELDS (for reconciliation)
  // ============================================================================
  {
    hebrewColumn: 'שער המרה לתנועה',
    dbField: 'exchange_rate_to_ils',
    purpose: 'warehousing',
    description: 'Exchange rate to ILS - stored for reconciliation',
  },
  {
    hebrewColumn: 'סכום תנועה בש"ח',
    dbField: 'amount_ils',
    purpose: 'warehousing',
    description: 'Amount in ILS - stored for reconciliation',
  },

  // ============================================================================
  // IGNORED FIELDS
  // ============================================================================
  {
    hebrewColumn: 'לקוח אב',
    dbField: 'ignore',
    purpose: 'ignore',
    description: 'Parent client - not needed',
  },
  {
    hebrewColumn: 'מנהל לקוח',
    dbField: 'ignore',
    purpose: 'ignore',
    description: 'Client manager - not needed',
  },
  {
    hebrewColumn: 'שייכות',
    dbField: 'ignore',
    purpose: 'ignore',
    description: 'Ownership - not needed',
  },
  {
    hebrewColumn: 'סוג תנועה מורחב',
    dbField: 'ignore',
    purpose: 'ignore',
    description: 'Extended transaction type - redundant with סוג תנועה',
  },
  {
    hebrewColumn: 'מספר חשבון',
    dbField: 'ignore',
    purpose: 'ignore',
    description: 'Account number - not needed',
  },
];

/**
 * Get mapping for a Hebrew column name
 */
export function getMappingForColumn(hebrewColumn: string): CSVFieldMapping | undefined {
  return csvStaticMapping.find(m => m.hebrewColumn === hebrewColumn);
}

/**
 * Get all fields for a specific purpose
 */
export function getFieldsByPurpose(purpose: CSVFieldMapping['purpose']): CSVFieldMapping[] {
  return csvStaticMapping.filter(m => m.purpose === purpose);
}

/**
 * Get investment discovery fields (Phase 1)
 */
export function getInvestmentDiscoveryFields(): string[] {
  return getFieldsByPurpose('investment_discovery').map(m => m.hebrewColumn);
}

/**
 * Get transaction import fields (Phase 2)
 */
export function getTransactionImportFields(): string[] {
  return getFieldsByPurpose('transaction_import').map(m => m.hebrewColumn);
}

/**
 * Get warehousing fields
 */
export function getWarehousingFields(): string[] {
  return getFieldsByPurpose('warehousing').map(m => m.hebrewColumn);
}
