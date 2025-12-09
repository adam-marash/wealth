/**
 * Configuration Types
 * Based on transaction_type_mappings, column_mappings,
 * counterparty_normalizations, and system_config tables
 */

export interface TransactionTypeMapping {
  raw_value: string;
  category: string; // TransactionCategory from transaction.ts
  directionality_rule: DirectionalityRule;
  cash_flow_impact: number | null; // +1, -1, or null
  created_at: string;
  updated_at: string;
}

export type DirectionalityRule =
  | 'as_is' // Use amount as-is from Excel
  | 'invert' // Multiply by -1
  | 'variable'; // Depends on sign of amount

export interface CreateTransactionTypeMappingInput {
  raw_value: string;
  category: string;
  directionality_rule: DirectionalityRule;
  cash_flow_impact?: number | null;
}

export interface ColumnMapping {
  id: number;
  excel_column_letter: string | null;
  excel_column_name: string;
  mapped_field: MappedField;
  active: boolean;
  date_format: string | null;
  created_at: string;
  updated_at: string;
}

export type MappedField =
  | 'date'
  | 'description'
  | 'transaction_type'
  | 'amount'
  | 'currency'
  | 'counterparty'
  | 'category'
  | 'investment_name'
  | 'ignore'
  | string; // Allow custom field names

export interface CreateColumnMappingInput {
  excel_column_letter?: string;
  excel_column_name: string;
  mapped_field: MappedField;
  active?: boolean;
  date_format?: string;
}

export interface UpdateColumnMappingInput {
  id: number;
  excel_column_letter?: string;
  excel_column_name?: string;
  mapped_field?: MappedField;
  active?: boolean;
  date_format?: string;
}

export interface CounterpartyNormalization {
  raw_name: string;
  normalized_name: string;
  created_at: string;
  updated_at: string;
}

export interface CreateCounterpartyNormalizationInput {
  raw_name: string;
  normalized_name: string;
}

export interface SystemConfig {
  key: string;
  value: string | null;
  description: string | null;
  created_at: string;
  updated_at: string;
}

export interface SetSystemConfigInput {
  key: string;
  value: string;
  description?: string;
}

/**
 * Excel Column with Sample Data
 * Used during interactive schema setup
 */
export interface ExcelColumn {
  letter: string; // A, B, C, etc.
  name: string; // Header name
  samples: (string | number | null)[]; // First 5 rows
}

/**
 * Configuration State
 * Aggregated configuration status
 */
export interface ConfigurationState {
  hasColumnMappings: boolean;
  hasTransactionTypeMappings: boolean;
  hasInvestments: boolean;
  isConfigured: boolean;
}
