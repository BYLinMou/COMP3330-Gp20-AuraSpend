/**
 * Currency Converter Service
 * Uses Frankfurter API for real-time currency conversion
 * API: https://frankfurter.dev
 */

export interface ConversionRate {
  from: string;
  to: string;
  rate: number;
  lastUpdated: Date;
}

export interface ConversionResult {
  originalAmount: number;
  originalCurrency: string;
  convertedAmount: number;
  targetCurrency: string;
  rate: number;
}

// Cache for conversion rates to reduce API calls
const rateCache: Map<string, { rate: number; timestamp: number }> = new Map();
const CACHE_DURATION = 3600000; // 1 hour in milliseconds

/**
 * Get conversion rate from Frankfurter API
 * @param from - Source currency code (e.g., 'USD')
 * @param to - Target currency code (e.g., 'HKD')
 * @returns Conversion rate
 */
export async function getConversionRate(from: string, to: string): Promise<number> {
  // If same currency, return 1
  if (from === to) {
    return 1;
  }

  // Check cache first
  const cacheKey = `${from}_${to}`;
  const cached = rateCache.get(cacheKey);
  const now = Date.now();

  if (cached && (now - cached.timestamp) < CACHE_DURATION) {
    console.log(`[CurrencyConverter] Using cached rate for ${from} -> ${to}: ${cached.rate}`);
    return cached.rate;
  }

  try {
    // Frankfurter API endpoint
    const url = `https://api.frankfurter.app/latest?from=${from}&to=${to}`;
    console.log(`[CurrencyConverter] Fetching rate from API: ${url}`);
    
    const response = await fetch(url);
    
    if (!response.ok) {
      throw new Error(`Failed to fetch conversion rate: ${response.statusText}`);
    }

    const data = await response.json();
    const rate = data.rates[to];

    if (!rate) {
      throw new Error(`Rate not found for ${from} -> ${to}`);
    }

    // Cache the rate
    rateCache.set(cacheKey, { rate, timestamp: now });
    console.log(`[CurrencyConverter] Fetched and cached rate for ${from} -> ${to}: ${rate}`);

    return rate;
  } catch (error) {
    console.error(`[CurrencyConverter] Error fetching conversion rate:`, error);
    // Return 1 as fallback to avoid breaking the UI
    return 1;
  }
}

/**
 * Convert amount from one currency to another
 * @param amount - Amount to convert
 * @param from - Source currency code
 * @param to - Target currency code
 * @returns Conversion result with original and converted amounts
 */
export async function convertCurrency(
  amount: number,
  from: string,
  to: string
): Promise<ConversionResult> {
  const rate = await getConversionRate(from, to);
  const convertedAmount = amount * rate;

  return {
    originalAmount: amount,
    originalCurrency: from,
    convertedAmount,
    targetCurrency: to,
    rate,
  };
}

/**
 * Convert multiple amounts from different currencies to a target currency
 * Useful for summing transactions in different currencies
 * @param amounts - Array of {amount, currency} objects
 * @param targetCurrency - Target currency to convert all amounts to
 * @returns Total converted amount
 */
export async function convertMultipleCurrencies(
  amounts: Array<{ amount: number; currency: string }>,
  targetCurrency: string
): Promise<number> {
  const conversions = await Promise.all(
    amounts.map(({ amount, currency }) =>
      convertCurrency(amount, currency, targetCurrency)
    )
  );

  return conversions.reduce((total, conv) => total + conv.convertedAmount, 0);
}

/**
 * Get multiple conversion rates at once
 * More efficient than calling getConversionRate multiple times
 * @param from - Source currency
 * @param toCurrencies - Array of target currencies
 * @returns Map of currency codes to rates
 */
export async function getMultipleRates(
  from: string,
  toCurrencies: string[]
): Promise<Map<string, number>> {
  const rates = new Map<string, number>();

  // Filter out same currency
  const uniqueCurrencies = [...new Set(toCurrencies.filter(to => to !== from))];

  if (uniqueCurrencies.length === 0) {
    return rates;
  }

  try {
    const toParam = uniqueCurrencies.join(',');
    const url = `https://api.frankfurter.app/latest?from=${from}&to=${toParam}`;
    
    const response = await fetch(url);
    
    if (!response.ok) {
      throw new Error(`Failed to fetch conversion rates: ${response.statusText}`);
    }

    const data = await response.json();

    // Cache and return all rates
    const now = Date.now();
    for (const [currency, rate] of Object.entries(data.rates)) {
      rates.set(currency, rate as number);
      const cacheKey = `${from}_${currency}`;
      rateCache.set(cacheKey, { rate: rate as number, timestamp: now });
    }

    console.log(`[CurrencyConverter] Fetched ${rates.size} rates from ${from}`);
    return rates;
  } catch (error) {
    console.error(`[CurrencyConverter] Error fetching multiple rates:`, error);
    return rates;
  }
}

/**
 * Clear the rate cache
 * Useful for forcing a refresh of exchange rates
 */
export function clearRateCache(): void {
  rateCache.clear();
  console.log('[CurrencyConverter] Rate cache cleared');
}

/**
 * Get supported currencies from Frankfurter API
 * @returns Array of currency codes
 */
export async function getSupportedCurrencies(): Promise<string[]> {
  try {
    const response = await fetch('https://api.frankfurter.app/currencies');
    
    if (!response.ok) {
      throw new Error(`Failed to fetch supported currencies: ${response.statusText}`);
    }

    const data = await response.json();
    return Object.keys(data);
  } catch (error) {
    console.error(`[CurrencyConverter] Error fetching supported currencies:`, error);
    // Return common currencies as fallback
    return ['USD', 'EUR', 'GBP', 'JPY', 'CNY', 'HKD', 'AUD', 'CAD', 'CHF', 'SGD'];
  }
}
