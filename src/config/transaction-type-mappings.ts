/**
 * Transaction Type Mappings
 * Maps Hebrew transaction type names to English slugs and display values
 */

export interface TransactionTypeMapping {
  hebrew: string;
  slug: string;
  display: string;
  category?: 'income_distribution' | 'capital_distribution' | 'contribution' | 'fee' | 'valuation' | 'other';
  directionality?: 'as_is' | 'always_positive' | 'always_negative';
}

/**
 * Transaction type mappings
 * Add new Hebrew transaction types here with their English equivalents
 */
export const transactionTypeMappings: TransactionTypeMapping[] = [
  {
    hebrew: 'משיכת תשואה',
    slug: 'income-distribution',
    display: 'Income Distribution',
    category: 'income_distribution',
    directionality: 'as_is',
  },
  {
    hebrew: 'משיכה',
    slug: 'withdrawal',
    display: 'Withdrawal',
    category: 'income_distribution',
    directionality: 'as_is',
  },
  {
    hebrew: 'הפקדה',
    slug: 'deposit',
    display: 'Deposit',
    category: 'contribution',
    directionality: 'as_is',
  },
  {
    hebrew: 'החזר הון',
    slug: 'capital-return',
    display: 'Capital Return',
    category: 'capital_distribution',
    directionality: 'always_positive',
  },
  {
    hebrew: 'דמי ניהול',
    slug: 'management-fee',
    display: 'Management Fee',
    category: 'fee',
    directionality: 'always_negative',
  },
  {
    hebrew: 'שינוי שווי שוק',
    slug: 'unrealized-gain-loss',
    display: 'Unrealized Gain/Loss',
    category: 'valuation',
    directionality: 'as_is',
  },
];

/**
 * Get transaction type mapping by Hebrew name
 */
export function getTransactionTypeByHebrew(hebrew: string): TransactionTypeMapping | undefined {
  return transactionTypeMappings.find(m => m.hebrew === hebrew);
}

/**
 * Get transaction type mapping by slug
 */
export function getTransactionTypeBySlug(slug: string): TransactionTypeMapping | undefined {
  return transactionTypeMappings.find(m => m.slug === slug);
}

/**
 * Get all Hebrew transaction type names
 */
export function getAllHebrewTransactionTypes(): string[] {
  return transactionTypeMappings.map(m => m.hebrew);
}

/**
 * Get all transaction type slugs
 */
export function getAllTransactionTypeSlugs(): string[] {
  return transactionTypeMappings.map(m => m.slug);
}
