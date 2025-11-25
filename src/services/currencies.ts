/**
 * Currency Service
 * Provides available currencies for the application
 * Future: can be extended to fetch from backend or user settings
 */

export interface Currency {
  code: string;
  symbol: string;
  name: string;
}

/**
 * Get list of available currencies
 * Returns currencies supported by Frankfurter API for conversion
 * Symbol is for display only - conversion uses the currency code
 */
export async function getCurrencies(): Promise<Currency[]> {
  // All currencies supported by Frankfurter API (based on ECB data)
  const currencies: Currency[] = [
    // Only currencies requested (supported by Frankfurter API)
    { code: 'USD', symbol: 'US$', name: 'US Dollar' },
    { code: 'EUR', symbol: '€', name: 'Euro' },
    { code: 'GBP', symbol: '£', name: 'British Pound' },
    { code: 'JPY', symbol: 'JP¥', name: 'Japanese Yen' },
    { code: 'CNY', symbol: 'CN¥', name: 'Chinese Yuan' },
    { code: 'HKD', symbol: 'HK$', name: 'Hong Kong Dollar' },
    { code: 'AUD', symbol: 'AU$', name: 'Australian Dollar' },
    { code: 'CAD', symbol: 'CA$', name: 'Canadian Dollar' },
    { code: 'CHF', symbol: 'Fr', name: 'Swiss Franc' },
    { code: 'SGD', symbol: 'SG$', name: 'Singapore Dollar' },
  ];

  return Promise.resolve(currencies);
}

/**
 * Subscribe to currency changes (placeholder for future realtime updates)
 * Currently returns a no-op unsubscribe function
 * TODO: Implement realtime subscription when backend supports it
 */
export async function subscribeToCurrencyChanges(
  handler: (change: any) => void
): Promise<() => Promise<void>> {
  // Placeholder: no realtime updates yet
  // In the future, this could subscribe to a Supabase table or settings changes
  
  return async () => {
    // No-op unsubscribe
  };
}
