import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { CURRENCY_OPTIONS, DEFAULT_CURRENCY, type CurrencyOption } from '@shared/currency';

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
  // Fetch exchange rates for everyone (including Landing page visitors).
  // Without this, currency switcher shows wrong prices pre-login.
  //
  // We explicitly wire a queryFn here rather than leaning on the default
  // one in queryClient.ts — in some code paths (e.g. first paint before
  // the QueryClient has finished warming up its defaults) the implicit
  // queryFn was never firing, leaving isLoading stuck true forever and
  // locking the CurrencySelector on its default value (AED). Explicit
  // is safer.
  const { data: exchangeRates = { AED: 1, SAR: 1.02, GBP: 0.201, USD: 0.272, EUR: 0.231 }, isLoading } = useQuery<Record<string, number>>({
    queryKey: ['/api/currency/rates'],
    queryFn: async () => {
      const res = await fetch('/api/currency/rates', { credentials: 'include' });
      if (!res.ok) throw new Error(`rates http ${res.status}`);
      return res.json();
    },
    staleTime: 60 * 60 * 1000, // Cache for 1 hour
    refetchInterval: 60 * 60 * 1000, // Refetch every hour
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