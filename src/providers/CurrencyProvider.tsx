import React, { createContext, useContext, useEffect, useState } from 'react';
import { getProfile } from '../services/profiles';
import { getCurrencies, type Currency } from '../services/currencies';
import { convertCurrency, type ConversionResult } from '../services/currency-converter';
import { useAuth } from './AuthProvider';

type CurrencyContextType = {
  primaryCurrency: Currency | null;
  currencySymbol: string;
  currencyCode: string;
  loading: boolean;
  refreshCurrency: () => Promise<void>;
  convertToUserCurrency: (amount: number, fromCurrency: string) => Promise<ConversionResult>;
};

const CurrencyContext = createContext<CurrencyContextType>({
  primaryCurrency: null,
  currencySymbol: '$',
  currencyCode: 'HKD',
  loading: true,
  refreshCurrency: async () => {},
  convertToUserCurrency: async () => ({
    originalAmount: 0,
    originalCurrency: '',
    convertedAmount: 0,
    targetCurrency: 'HKD',
    rate: 1,
  }),
});

export function CurrencyProvider({ children }: { children: React.ReactNode }) {
  const { session } = useAuth();
  const [primaryCurrency, setPrimaryCurrency] = useState<Currency | null>(null);
  const [loading, setLoading] = useState(true);

  const loadCurrency = async () => {
    if (!session) {
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      const [profile, currencies] = await Promise.all([
        getProfile(),
        getCurrencies(),
      ]);

      const currencyCode = profile?.primary_currency || 'HKD';
      const currency = currencies.find(c => c.code === currencyCode) || currencies.find(c => c.code === 'HKD');
      
      setPrimaryCurrency(currency || { code: 'HKD', symbol: '$', name: 'Hong Kong Dollar' });
    } catch (error) {
      console.error('Failed to load currency:', error);
      // Default to HKD on error
      setPrimaryCurrency({ code: 'HKD', symbol: '$', name: 'Hong Kong Dollar' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadCurrency();
  }, [session]);

  const refreshCurrency = async () => {
    await loadCurrency();
  };

  const convertToUserCurrency = async (amount: number, fromCurrency: string): Promise<ConversionResult> => {
    const targetCurrency = primaryCurrency?.code || 'HKD';
    return await convertCurrency(amount, fromCurrency, targetCurrency);
  };

  const value: CurrencyContextType = {
    primaryCurrency,
    currencySymbol: primaryCurrency?.symbol || '$',
    currencyCode: primaryCurrency?.code || 'HKD',
    loading,
    refreshCurrency,
    convertToUserCurrency,
  };

  return (
    <CurrencyContext.Provider value={value}>
      {children}
    </CurrencyContext.Provider>
  );
}

export const useCurrency = () => useContext(CurrencyContext);
