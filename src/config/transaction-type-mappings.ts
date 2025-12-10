/**
 * Transaction Type Mappings
 * Maps Hebrew transaction type names to English slugs and display values
 */

export interface TransactionTypeMapping {
  hebrew: string;
  slug: string;
  display: string;
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
    directionality: 'as_is',
  },
  {
    hebrew: 'משיכה',
    slug: 'withdrawal',
    display: 'Withdrawal',
    directionality: 'as_is',
  },
  {
    hebrew: 'הפקדה',
    slug: 'deposit',
    display: 'Deposit',
    directionality: 'always_negative',
  },
  // Reserved for future use - not currently in data
  {
    hebrew: 'דמי ניהול',
    slug: 'management-fee',
    display: 'Management Fee',
    directionality: 'always_negative',
  },
  {
    hebrew: 'שינוי שווי שוק',
    slug: 'unrealized-gain-loss',
    display: 'Unrealized Gain/Loss',
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
