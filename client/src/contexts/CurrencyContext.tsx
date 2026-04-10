import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { CURRENCY_OPTIONS, DEFAULT_CURRENCY, type CurrencyOption } from '@shared/currency';
import { useAuth } from '@/hooks/useAuth';

interface CurrencyContextType {
  selectedCurrency: string;
  setCurrency: (currency: string) => void;
  exchangeRates: Record<string, number>;
  getCurrencySymbol: (currency: string) => string;
  formatPrice: (priceInAED: number, currency?: string) => string;
  convertPrice: (priceInAED: number, toCurrency?: string) => number;
  isLoading: boolean;
}

const CurrencyContext = createContext<CurrencyContextType | undefined>(undefined);

interface CurrencyProviderProps {
  children: ReactNode;
}

export function CurrencyProvider({ children }: CurrencyProviderProps) {
  const [selectedCurrency, setSelectedCurrency] = useState<string>(() => {
    return localStorage.getItem('selectedCurrency') || DEFAULT_CURRENCY;
  });
  const { isAuthenticated } = useAuth();

  // Fetch exchange rates
  const { data: exchangeRates = { AED: 1 }, isLoading } = useQuery<Record<string, number>>({
    queryKey: ['/api/currency/rates'],
    staleTime: 60 * 60 * 1000, // Cache for 1 hour
    refetchInterval: 60 * 60 * 1000, // Refetch every hour
    enabled: isAuthenticated,
    retry: false,
  });

  const setCurrency = (currency: string) => {
    setSelectedCurrency(currency);
    localStorage.setItem('selectedCurrency', currency);
  };

  const getCurrencySymbol = (currency: string = selectedCurrency): string => {
    const currencyOption = CURRENCY_OPTIONS.find(opt => opt.code === currency);
    return currencyOption?.symbol || currency;
  };

  const convertPrice = (priceInAED: number, toCurrency: string = selectedCurrency): number => {
    if (toCurrency === 'AED') return priceInAED;
    const rate = exchangeRates[toCurrency] || 1;
    return priceInAED * rate;
  };

  const formatPrice = (priceInAED: number, currency: string = selectedCurrency): string => {
    const convertedPrice = convertPrice(priceInAED, currency);
    const symbol = getCurrencySymbol(currency);
    
    // Format the number with appropriate decimal places
    const formattedNumber = Math.round(convertedPrice).toLocaleString('en-US');
    
    if (currency === 'AED' || currency === 'SAR') {
      return `${symbol} ${formattedNumber}`;
    } else {
      return `${symbol}${formattedNumber}`;
    }
  };

  const contextValue: CurrencyContextType = {
    selectedCurrency,
    setCurrency,
    exchangeRates,
    getCurrencySymbol,
    formatPrice,
    convertPrice,
    isLoading,
  };

  return (
    <CurrencyContext.Provider value={contextValue}>
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