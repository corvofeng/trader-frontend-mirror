import React, { createContext, useContext, useState, useEffect } from 'react';
import type { CurrencyConfig, RegionalColorConfig } from '../../shared/types';
import { getThemeColors } from '../theme';
import { currencyConfigs, regionalColorConfigs } from '../../shared/constants';
import { currencyService } from '../services';
import type { Theme } from '../theme';

interface CurrencyContextType {
  currency: string;
  setCurrency: (currency: string) => void;
  currencyConfig: CurrencyConfig;
  regionalColors: RegionalColorConfig;
  getThemedColors: (theme: Theme) => any;
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
  const regionalColors = regionalColorConfigs[currencyConfig?.region || 'US'];

  const getThemedColors = (theme: Theme) => {
    return getThemeColors(theme, regionalColors);
  };

  return (
    <CurrencyContext.Provider value={{ 
      currency, 
      setCurrency, 
      currencyConfig, 
      regionalColors,
      getThemedColors,
      isLoading 
    }}>
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