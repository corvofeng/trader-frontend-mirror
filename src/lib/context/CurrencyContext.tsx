import React, { createContext, useContext, useState, useEffect } from 'react';
import type { CurrencyConfig } from '../types';
import { currencyConfigs } from '../theme';
import { currencyService } from '../services';

interface CurrencyContextType {
  currency: string;
  setCurrency: (currency: string) => void;
  currencyConfig: CurrencyConfig;
  isLoading: boolean;
}

const CurrencyContext = createContext<CurrencyContextType | undefined>(undefined);

export function CurrencyProvider({ children }: { children: React.ReactNode }) {
  const [currency, setCurrencyState] = useState('USD');
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const fetchCurrency = async () => {
      const { data, error } = await currencyService.getCurrency();
      if (data && !error) {
        setCurrencyState(data);
      }
      setIsLoading(false);
    };
    fetchCurrency();
  }, []);

  const setCurrency = async (newCurrency: string) => {
    setIsLoading(true);
    const { error } = await currencyService.setCurrency(newCurrency);
    if (!error) {
      setCurrencyState(newCurrency);
    }
    setIsLoading(false);
  };

  const currencyConfig = currencyConfigs[currency];

  return (
    <CurrencyContext.Provider value={{ currency, setCurrency, currencyConfig, isLoading }}>
      {children}
    </CurrencyContext.Provider>
  );
}

export function useCurrency() {
  const context = useContext(CurrencyContext);
  if (context === undefined) {
    throw new Error('useCurrency must be used within a CurrencyProvider');
  }
  return context;
}