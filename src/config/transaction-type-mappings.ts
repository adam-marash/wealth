/**
 * Transaction Type Mappings
 * Maps Hebrew transaction type names to English slugs and display values
 */

export interface TransactionTypeMapping {
  hebrew: string;
  slug: string;
  display: string;
  category?: 'distribution' | 'contribution' | 'call' | 'transfer' | 'fee' | 'other';
  directionality?: 'as_is' | 'always_positive' | 'always_negative';
}

/**
 * Transaction type mappings
 * Add new Hebrew transaction types here with their English equivalents
 */
export const transactionTypeMappings: TransactionTypeMapping[] = [
  {
    hebrew: 'משיכת תשואה',
    slug: 'distribution',
    display: 'Distribution',
    category: 'distribution',
    directionality: 'as_is',
  },
  {
    hebrew: 'משיכה',
    slug: 'withdrawal',
    display: 'Withdrawal',
    category: 'distribution',
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
    hebrew: 'קריאת הון',
    slug: 'capital-call',
    display: 'Capital Call',
    category: 'call',
    directionality: 'always_negative',
  },
  {
    hebrew: 'החזר הון',
    slug: 'capital-return',
    display: 'Capital Return',
    category: 'distribution',
    directionality: 'always_positive',
  },
  {
    hebrew: 'העברה',
    slug: 'transfer',
    display: 'Transfer',
    category: 'transfer',
    directionality: 'as_is',
  },
  {
    hebrew: 'דמי ניהול',
    slug: 'management-fee',
    display: 'Management Fee',
    category: 'fee',
    directionality: 'always_negative',
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
