/**
 * Currency Converter Service
 * Uses Frankfurter API for real-time currency conversion
 * API: https://frankfurter.dev
 */

import AsyncStorage from '@react-native-async-storage/async-storage';

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
const STORAGE_KEY = 'currency_rate_cache';

/**
 * Calculate when the cache should expire based on Frankfurter's update schedule
 * Frankfurter updates rates daily around 16:00 CET
 * We'll invalidate cache after the next expected update time
 */
function getNextUpdateTime(now: Date = new Date()): Date {
  // Create a date object for today at 16:00 CET
  const today16CET = new Date(now);
  
  // Convert to CET timezone (UTC+1 in winter, UTC+2 in summer)
  // For simplicity, we'll use UTC+1 (CET standard time)
  const cetHour = 16;
  const cetOffset = 1; // CET is UTC+1
  const utcHour = cetHour - cetOffset; // 15:00 UTC
  
  today16CET.setUTCHours(utcHour, 0, 0, 0);
  
  // If current time is before today's 16:00 CET, use today's update time
  // Otherwise, use tomorrow's update time
  if (now >= today16CET) {
    // Already past today's update, next update is tomorrow
    const tomorrow = new Date(today16CET);
    tomorrow.setDate(tomorrow.getDate() + 1);
    return tomorrow;
  }
  
  return today16CET;
}

/**
 * Check if cached rate is still valid based on Frankfurter's update schedule
 * Rates are considered valid until the next update time (16:00 CET)
 */
function isCacheValid(cacheTimestamp: number): boolean {
  const now = new Date();
  const cacheDate = new Date(cacheTimestamp);

  // Safety check: if cache is from the future (e.g. user changed clock), invalidate
  if (now.getTime() < cacheTimestamp) {
    return false;
  }

  // Redundancy check: if cache is older than 26 hours, force update
  // This handles cases where timezone calculations might be off or API schedule changes
  // We use 26 hours to allow for some flexibility around the 24h update cycle + timezone diffs
  const MAX_CACHE_AGE = 26 * 60 * 60 * 1000; // 26 hours in ms
  if (now.getTime() - cacheTimestamp > MAX_CACHE_AGE) {
    return false;
  }

  const nextUpdate = getNextUpdateTime(cacheDate);
  
  // Cache is valid if we haven't reached the next update time yet
  return now < nextUpdate;
}

// Initialize cache from persistent storage
let cacheInitialized = false;
async function initializeCache() {
  if (cacheInitialized) return;
  
  try {
    const cached = await AsyncStorage.getItem(STORAGE_KEY);
    if (cached) {
      const data = JSON.parse(cached);
      
      // Restore valid cached rates
      for (const [key, value] of Object.entries(data)) {
        const cacheEntry = value as { rate: number; timestamp: number };
        if (isCacheValid(cacheEntry.timestamp)) {
          rateCache.set(key, cacheEntry);
        }
      }
      
      console.log(`[CurrencyConverter] Restored ${rateCache.size} cached rates from storage`);
    }
  } catch (error) {
    console.error('[CurrencyConverter] Failed to load cache from storage:', error);
  }
  
  cacheInitialized = true;
}

// Save cache to persistent storage
async function persistCache() {
  try {
    const cacheData: Record<string, { rate: number; timestamp: number }> = {};
    for (const [key, value] of rateCache.entries()) {
      cacheData[key] = value;
    }
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(cacheData));
  } catch (error) {
    console.error('[CurrencyConverter] Failed to persist cache:', error);
  }
}

/**
 * Get conversion rate from Frankfurter API
 * @param from - Source currency code (e.g., 'USD')
 * @param to - Target currency code (e.g., 'HKD')
 * @returns Conversion rate
 */
export async function getConversionRate(from: string, to: string): Promise<number> {
  // Initialize cache from storage on first use
  await initializeCache();
  
  // If same currency, return 1
  if (from === to) {
    return 1;
  }

  // Check cache first
  const cacheKey = `${from}_${to}`;
  const cached = rateCache.get(cacheKey);
  const now = Date.now();

  if (cached && isCacheValid(cached.timestamp)) {
    const cacheAge = Math.round((now - cached.timestamp) / 3600000);
    console.log(`[CurrencyConverter] Using cached rate for ${from} -> ${to}: ${cached.rate} (age: ${cacheAge}h)`);
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
    
    // Persist to storage (async, don't wait)
    persistCache();
    
    console.log(`[CurrencyConverter] Fetched and cached rate for ${from} -> ${to}: ${rate}`);

    return rate;
  } catch (error) {
    console.error(`[CurrencyConverter] Error fetching conversion rate:`, error);
    
    // If we have an expired cache, use it as fallback
    if (cached) {
      console.log(`[CurrencyConverter] Using expired cache as fallback for ${from} -> ${to}: ${cached.rate}`);
      return cached.rate;
    }
    
    // Return 1 as final fallback to avoid breaking the UI
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
  // Initialize cache from storage on first use
  await initializeCache();
  
  const rates = new Map<string, number>();

  // Filter out same currency
  const uniqueCurrencies = [...new Set(toCurrencies.filter(to => to !== from))];

  if (uniqueCurrencies.length === 0) {
    return rates;
  }

  // Check which currencies we already have cached
  const now = Date.now();
  const currenciesToFetch: string[] = [];
  
  for (const currency of uniqueCurrencies) {
    const cacheKey = `${from}_${currency}`;
    const cached = rateCache.get(cacheKey);
    
    if (cached && isCacheValid(cached.timestamp)) {
      rates.set(currency, cached.rate);
    } else {
      currenciesToFetch.push(currency);
    }
  }

  console.log(`[CurrencyConverter] Found ${rates.size} cached rates, fetching ${currenciesToFetch.length} from API`);

  // If all rates are cached, return early
  if (currenciesToFetch.length === 0) {
    return rates;
  }

  try {
    const toParam = currenciesToFetch.join(',');
    const url = `https://api.frankfurter.app/latest?from=${from}&to=${toParam}`;
    
    const response = await fetch(url);
    
    if (!response.ok) {
      throw new Error(`Failed to fetch conversion rates: ${response.statusText}`);
    }

    const data = await response.json();

    // Cache and return all fetched rates
    for (const [currency, rate] of Object.entries(data.rates)) {
      rates.set(currency, rate as number);
      const cacheKey = `${from}_${currency}`;
      rateCache.set(cacheKey, { rate: rate as number, timestamp: now });
    }

    // Persist to storage (async, don't wait)
    persistCache();

    console.log(`[CurrencyConverter] Fetched ${currenciesToFetch.length} new rates from ${from}`);
    return rates;
  } catch (error) {
    console.error(`[CurrencyConverter] Error fetching multiple rates:`, error);
    
    // Try to use expired cache as fallback
    for (const currency of currenciesToFetch) {
      const cacheKey = `${from}_${currency}`;
      const cached = rateCache.get(cacheKey);
      if (cached && !rates.has(currency)) {
        console.log(`[CurrencyConverter] Using expired cache for ${from} -> ${currency}`);
        rates.set(currency, cached.rate);
      }
    }
    
    return rates;
  }
}

/**
 * Clear the rate cache
 * Useful for forcing a refresh of exchange rates
 */
export function clearRateCache(): void {
  rateCache.clear();
  AsyncStorage.removeItem(STORAGE_KEY).catch(error => {
    console.error('[CurrencyConverter] Failed to clear cache from storage:', error);
  });
  console.log('[CurrencyConverter] Rate cache cleared');
}

/**
 * Preload common exchange rates for a given base currency
 * This can be called on app startup to improve initial loading performance
 * @param baseCurrency - The user's primary currency
 * @param targetCurrencies - Optional array of currencies to preload (defaults to common currencies)
 */
export async function preloadRates(
  baseCurrency: string,
  targetCurrencies: string[] = ['USD', 'EUR', 'GBP', 'JPY', 'CNY', 'HKD', 'AUD', 'CAD', 'CHF', 'SGD']
): Promise<void> {
  try {
    console.log(`[CurrencyConverter] Preloading rates for ${baseCurrency}...`);
    await getMultipleRates(baseCurrency, targetCurrencies);
    console.log(`[CurrencyConverter] Preloaded rates for ${baseCurrency}`);
  } catch (error) {
    console.error('[CurrencyConverter] Failed to preload rates:', error);
  }
}

/**
 * Get cache statistics for debugging
 * @returns Cache info including size and oldest entry
 */
export function getCacheStats(): {
  size: number;
  oldestEntry: number | null;
  newestEntry: number | null;
  nextUpdateTime: Date;
} {
  let oldest: number | null = null;
  let newest: number | null = null;
  
  for (const entry of rateCache.values()) {
    if (oldest === null || entry.timestamp < oldest) {
      oldest = entry.timestamp;
    }
    if (newest === null || entry.timestamp > newest) {
      newest = entry.timestamp;
    }
  }
  
  return {
    size: rateCache.size,
    oldestEntry: oldest,
    newestEntry: newest,
    nextUpdateTime: getNextUpdateTime(),
  };
}

/**
 * Get time until next Frankfurter rate update
 * @returns Milliseconds until next update (16:00 CET)
 */
export function getTimeUntilNextUpdate(): number {
  const now = new Date();
  const nextUpdate = getNextUpdateTime(now);
  return nextUpdate.getTime() - now.getTime();
}

/**
 * Get human-readable time until next update
 * @returns String like "5 hours 23 minutes"
 */
export function getTimeUntilNextUpdateFormatted(): string {
  const ms = getTimeUntilNextUpdate();
  const hours = Math.floor(ms / 3600000);
  const minutes = Math.floor((ms % 3600000) / 60000);
  
  if (hours > 0) {
    return `${hours} 小时 ${minutes} 分钟`;
  }
  return `${minutes} 分钟`;
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
