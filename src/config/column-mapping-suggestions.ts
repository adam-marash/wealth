/**
 * Column Mapping Suggestions
 * Provides intelligent suggestions for mapping CSV columns to database fields
 * based on Hebrew and English column names
 */

export interface ColumnSuggestion {
  hebrewPatterns: string[];
  englishPatterns: string[];
  suggestedField: string;
  confidence: 'high' | 'medium' | 'low';
}

/**
 * Column mapping suggestions
 * Maps common Hebrew and English column names to our database fields
 */
export const columnMappingSuggestions: ColumnSuggestion[] = [
  {
    hebrewPatterns: ['תאריך התנועה'],
    englishPatterns: [],
    suggestedField: 'date',
    confidence: 'high',
  },
  {
    hebrewPatterns: ['סכום תנועה במטבע'],
    englishPatterns: [],
    suggestedField: 'amount',
    confidence: 'high',
  },
  {
    hebrewPatterns: ['מטבע התנועה'],
    englishPatterns: [],
    suggestedField: 'currency',
    confidence: 'high',
  },
  {
    hebrewPatterns: ['גוף מנהל'],
    englishPatterns: [],
    suggestedField: 'investment_name',
    confidence: 'high',
  },
  {
    hebrewPatterns: ['סוג תנועה מורחב'],
    englishPatterns: [],
    suggestedField: 'ignore',
    confidence: 'high',
  },
  {
    hebrewPatterns: ['תאור'],
    englishPatterns: [],
    suggestedField: 'description',
    confidence: 'high',
  },
  {
    hebrewPatterns: ['מספר חשבון'],
    englishPatterns: [],
    suggestedField: 'account',
    confidence: 'high',
  },
  {
    hebrewPatterns: ['שער המרה לתנועה'],
    englishPatterns: [],
    suggestedField: 'exchange_rate',
    confidence: 'high',
  },
  {
    hebrewPatterns: ['סכום תנועה בש"ח'],
    englishPatterns: [],
    suggestedField: 'ignore',
    confidence: 'high',
  },
  {
    hebrewPatterns: ['לקוח אב'],
    englishPatterns: [],
    suggestedField: 'ignore',
    confidence: 'high',
  },
  {
    hebrewPatterns: ['מנהל לקוח'],
    englishPatterns: [],
    suggestedField: 'ignore',
    confidence: 'high',
  },
  {
    hebrewPatterns: ['שייכות'],
    englishPatterns: [],
    suggestedField: 'ignore',
    confidence: 'high',
  },
  {
    hebrewPatterns: ['סוג מוצר'],
    englishPatterns: [],
    suggestedField: 'ignore',
    confidence: 'high',
  },
  {
    hebrewPatterns: ['סוג תנועה'],
    englishPatterns: [],
    suggestedField: 'transaction_type',
    confidence: 'high',
  },
];

/**
 * Get field suggestion for a column name
 * Returns the best matching field based on pattern matching
 *
 * @param columnName The column name from the CSV file
 * @returns Suggested field name or 'ignore' if no match
 */
export function suggestFieldForColumn(columnName: string): string {
  const normalizedName = columnName.trim().toLowerCase();

  console.log('[Column Suggestion] Analyzing:', columnName, '→ normalized:', normalizedName);

  // Try to find a match in suggestions
  for (const suggestion of columnMappingSuggestions) {
    // Check Hebrew patterns (exact match or contains)
    for (const pattern of suggestion.hebrewPatterns) {
      const normalizedPattern = pattern.toLowerCase();
      if (normalizedName === normalizedPattern ||
          normalizedName.includes(normalizedPattern) ||
          normalizedPattern.includes(normalizedName)) {
        console.log('[Column Suggestion] ✓ Matched Hebrew pattern:', pattern, '→', suggestion.suggestedField);
        return suggestion.suggestedField;
      }
    }

    // Check English patterns (exact match or contains)
    for (const pattern of suggestion.englishPatterns) {
      const normalizedPattern = pattern.toLowerCase();
      if (normalizedName === normalizedPattern ||
          normalizedName.includes(normalizedPattern) ||
          normalizedPattern.includes(normalizedName)) {
        console.log('[Column Suggestion] ✓ Matched English pattern:', pattern, '→', suggestion.suggestedField);
        return suggestion.suggestedField;
      }
    }
  }

  // No match found - suggest ignore
  console.log('[Column Suggestion] ✗ No match found, suggesting ignore');
  return 'ignore';
}

/**
 * Get suggestions for all columns
 *
 * @param columnNames Array of column names from the CSV file
 * @returns Map of column name to suggested field
 */
export function suggestFieldsForColumns(columnNames: string[]): Record<string, string> {
  const suggestions: Record<string, string> = {};

  for (const columnName of columnNames) {
    suggestions[columnName] = suggestFieldForColumn(columnName);
  }

  return suggestions;
}

/**
 * Get confidence level for a suggestion
 *
 * @param columnName The column name from the CSV file
 * @returns Confidence level or undefined if no match
 */
export function getConfidenceForSuggestion(columnName: string): 'high' | 'medium' | 'low' | undefined {
  const normalizedName = columnName.trim().toLowerCase();

  for (const suggestion of columnMappingSuggestions) {
    const allPatterns = [...suggestion.hebrewPatterns, ...suggestion.englishPatterns];

    for (const pattern of allPatterns) {
      if (normalizedName.includes(pattern.toLowerCase()) ||
          pattern.toLowerCase().includes(normalizedName)) {
        return suggestion.confidence;
      }
    }
  }

  return undefined;
}
