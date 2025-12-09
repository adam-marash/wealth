/**
 * Exchange Rate Service
 * Fetches and caches exchange rates for USD normalization
 */

import type { Env } from '../types';

/**
 * Exchange rate API configuration
 * Multiple providers with fallback support
 */
const EXCHANGE_RATE_PROVIDERS = [
  {
    name: 'frankfurter',
    url: 'https://api.frankfurter.app',
    requiresApiKey: false,
    formatUrl: (date: string, from: string, to: string) =>
      `https://api.frankfurter.app/${date}?from=${from}&to=${to}`,
    parseResponse: (data: any, toCurrency: string) => data.rates?.[toCurrency] as number | undefined,
  },
  {
    name: 'exchangeratesapi',
    url: 'https://api.exchangeratesapi.io',
    requiresApiKey: true,
    apiKeyParam: 'EXCHANGE_RATES_API_KEY',
    formatUrl: (date: string, from: string, to: string, apiKey?: string) =>
      `http://api.exchangeratesapi.io/v1/${date}?access_key=${apiKey}&base=${from}&symbols=${to}`,
    parseResponse: (data: any, toCurrency: string) => data.rates?.[toCurrency] as number | undefined,
  },
  {
    name: 'fixer',
    url: 'https://fixer.io',
    requiresApiKey: true,
    apiKeyParam: 'FIXER_API_KEY',
    formatUrl: (date: string, from: string, to: string, apiKey?: string) =>
      `https://data.fixer.io/api/${date}?access_key=${apiKey}&base=${from}&symbols=${to}`,
    parseResponse: (data: any, toCurrency: string) => data.rates?.[toCurrency] as number | undefined,
  },
] as const;

export interface ExchangeRate {
  date: string;
  from_currency: string;
  to_currency: string;
  rate: number;
  source: string;
}

/**
 * Get exchange rate for a specific date and currency pair
 * Checks cache first, fetches from API if not found
 */
export async function getExchangeRate(
  db: D1Database,
  date: string, // ISO 8601 format (YYYY-MM-DD)
  fromCurrency: string,
  toCurrency: string = 'USD',
  env?: Env
): Promise<number | null> {
  // Normalize currency codes
  const from = fromCurrency.toUpperCase();
  const to = toCurrency.toUpperCase();

  // If same currency, rate is 1
  if (from === to) {
    return 1.0;
  }

  // Check cache first
  const cached = await db.prepare(`
    SELECT rate FROM exchange_rates
    WHERE date = ? AND from_currency = ? AND to_currency = ?
  `).bind(date, from, to).first<{ rate: number }>();

  if (cached) {
    return cached.rate;
  }

  // Fetch from API
  try {
    const rate = await fetchExchangeRateFromAPI(date, from, to, env);

    if (rate !== null) {
      // Cache it
      await db.prepare(`
        INSERT INTO exchange_rates (date, from_currency, to_currency, rate, source)
        VALUES (?, ?, ?, ?, 'api')
        ON CONFLICT(date, from_currency, to_currency) DO UPDATE SET
          rate = excluded.rate,
          source = excluded.source
      `).bind(date, from, to, rate).run();
    }

    return rate;
  } catch (error) {
    console.error(`Failed to fetch exchange rate for ${from}→${to} on ${date}:`, error);
    return null;
  }
}

/**
 * Fetch exchange rate from API with fallback providers
 * Tries multiple providers in sequence if one fails or rate limits (429)
 */
async function fetchExchangeRateFromAPI(
  date: string,
  fromCurrency: string,
  toCurrency: string,
  env?: Env
): Promise<number | null> {
  const errors: string[] = [];

  for (const provider of EXCHANGE_RATE_PROVIDERS) {
    // Get API key for this provider if required
    let apiKey: string | undefined;
    if (provider.requiresApiKey) {
      if ('apiKeyParam' in provider) {
        apiKey = env?.[provider.apiKeyParam as keyof Env] as string | undefined;
      }

      if (!apiKey) {
        console.log(`Skipping ${provider.name} (no API key configured)`);
        continue;
      }
    }

    try {
      const url = provider.requiresApiKey
        ? provider.formatUrl(date, fromCurrency, toCurrency, apiKey)
        : provider.formatUrl(date, fromCurrency, toCurrency);

      console.log(`Fetching exchange rate from ${provider.name}: ${fromCurrency}→${toCurrency} on ${date}`);
      const response = await fetch(url);

      if (!response.ok) {
        if (response.status === 429) {
          errors.push(`${provider.name}: Rate limited (429)`);
          console.warn(`${provider.name} rate limited, trying next provider...`);
          continue; // Try next provider
        }

        errors.push(`${provider.name}: ${response.status} ${response.statusText}`);
        console.error(`${provider.name} API error: ${response.status} ${response.statusText}`);
        continue; // Try next provider
      }

      const data = await response.json();
      const rate = provider.parseResponse(data, toCurrency);

      if (rate === undefined || rate === null) {
        errors.push(`${provider.name}: No rate found in response`);
        console.error(`${provider.name}: No rate found for ${fromCurrency}→${toCurrency} on ${date}`);
        continue; // Try next provider
      }

      console.log(`✓ Successfully fetched rate from ${provider.name}: ${rate}`);
      return rate;

    } catch (error) {
      errors.push(`${provider.name}: ${error instanceof Error ? error.message : 'Unknown error'}`);
      console.error(`${provider.name} fetch failed:`, error);
      continue; // Try next provider
    }
  }

  // All providers failed
  console.error(`All exchange rate providers failed for ${fromCurrency}→${toCurrency} on ${date}:`, errors);
  return null;
}

/**
 * Convert currency symbol to ISO code
 * Handles common symbols from Excel
 */
export function currencySymbolToCode(symbol: string): string {
  const symbolMap: { [key: string]: string } = {
    '$': 'USD',
    '€': 'EUR',
    '₪': 'ILS',
    '£': 'GBP',
    '¥': 'JPY',
    'USD': 'USD',
    'EUR': 'EUR',
    'ILS': 'ILS',
    'GBP': 'GBP',
    'JPY': 'JPY',
  };

  return symbolMap[symbol.trim()] || symbol.trim().toUpperCase();
}

/**
 * Batch fetch exchange rates for multiple dates
 * Useful for pre-caching rates before transaction import
 */
export async function batchFetchExchangeRates(
  db: D1Database,
  dates: string[], // Array of ISO dates
  currencies: string[], // Array of currency codes
  env?: Env
): Promise<{ fetched: number; cached: number; failed: number }> {
  let fetched = 0;
  let cached = 0;
  let failed = 0;

  const uniqueDates = [...new Set(dates)];
  const uniqueCurrencies = [...new Set(currencies.map(c => currencySymbolToCode(c)))];

  for (const date of uniqueDates) {
    for (const currency of uniqueCurrencies) {
      if (currency === 'USD') continue; // Skip USD→USD

      // Check if already cached
      const existing = await db.prepare(`
        SELECT rate FROM exchange_rates
        WHERE date = ? AND from_currency = ? AND to_currency = 'USD'
      `).bind(date, currency).first<{ rate: number }>();

      if (existing) {
        cached++;
        continue;
      }

      // Fetch and cache
      const rate = await getExchangeRate(db, date, currency, 'USD', env);

      if (rate !== null) {
        fetched++;
      } else {
        failed++;
      }

      // Rate limit: small delay between requests
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  }

  return { fetched, cached, failed };
}

/**
 * Set manual exchange rate override
 * Useful for correcting rates or setting custom rates
 */
export async function setManualExchangeRate(
  db: D1Database,
  date: string,
  fromCurrency: string,
  toCurrency: string,
  rate: number
): Promise<void> {
  await db.prepare(`
    INSERT INTO exchange_rates (date, from_currency, to_currency, rate, source)
    VALUES (?, ?, ?, ?, 'manual')
    ON CONFLICT(date, from_currency, to_currency) DO UPDATE SET
      rate = excluded.rate,
      source = 'manual'
  `).bind(date, fromCurrency.toUpperCase(), toCurrency.toUpperCase(), rate).run();
}

/**
 * Get all cached exchange rates for a specific date
 */
export async function getExchangeRatesForDate(
  db: D1Database,
  date: string
): Promise<ExchangeRate[]> {
  const result = await db.prepare(`
    SELECT date, from_currency, to_currency, rate, source
    FROM exchange_rates
    WHERE date = ?
    ORDER BY from_currency, to_currency
  `).bind(date).all<ExchangeRate>();

  return result.results || [];
}
