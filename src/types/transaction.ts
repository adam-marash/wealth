/**
 * Transaction Types
 * Based on the transactions table schema
 */

export interface Transaction {
  id: number;
  date: string; // ISO 8601 format
  description: string | null;
  transaction_type_raw: string | null;
  transaction_category: TransactionCategory | null;
  cash_flow_direction: CashFlowDirection | null;
  amount_original: number;
  amount_normalized: number;
  original_currency: string | null;
  amount_usd: number | null;
  investment_id: number | null;
  counterparty: string | null;
  commitment_id: number | null;
  dedup_hash: string | null;
  metadata: string | null; // JSON string
  source_file: string | null;
  created_at: string;
  updated_at: string;
}

export type TransactionCategory =
  | 'income'
  | 'capital_call'
  | 'distribution'
  | 'fee'
  | 'transfer';

export type CashFlowDirection = 1 | -1; // +1 for money in, -1 for money out

export interface TransactionMetadata {
  [key: string]: unknown; // Original row data from Excel
}

export interface CreateTransactionInput {
  date: string;
  description?: string;
  transaction_type_raw?: string;
  transaction_category?: TransactionCategory;
  cash_flow_direction?: CashFlowDirection;
  amount_original: number;
  amount_normalized: number;
  original_currency?: string;
  amount_usd?: number;
  investment_id?: number;
  counterparty?: string;
  commitment_id?: number;
  dedup_hash?: string;
  metadata?: TransactionMetadata;
  source_file?: string;
}

export interface UpdateTransactionInput {
  id: number;
  date?: string;
  description?: string;
  transaction_type_raw?: string;
  transaction_category?: TransactionCategory;
  cash_flow_direction?: CashFlowDirection;
  amount_original?: number;
  amount_normalized?: number;
  original_currency?: string;
  amount_usd?: number;
  investment_id?: number;
  counterparty?: string;
  commitment_id?: number;
}
