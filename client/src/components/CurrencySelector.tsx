import { Globe } from 'lucide-react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { CURRENCY_OPTIONS } from '@shared/currency';
import { useCurrency } from '@/contexts/CurrencyContext';

export function CurrencySelector() {
  const { selectedCurrency, setCurrency, isLoading } = useCurrency();

  // Previously this selector was `disabled={isLoading}`, which locked it on
  // AED whenever the rates query hung. Rates have sensible fallback defaults
  // baked into CurrencyContext, so we let the user switch freely — the
  // display will briefly show default-rate prices until the live rates land,
  // which is a much better UX than a permanently locked dropdown.
  return (
    <Select
      value={selectedCurrency}
      onValueChange={setCurrency}
    >
      <SelectTrigger className="w-auto min-w-16 px-2 sm:px-3 h-8 sm:h-9 text-xs sm:text-sm border-2 border-gray-300 hover:border-yellow-400 [&>svg]:hidden" data-testid="select-currency">
        <div className="flex items-center gap-1 sm:gap-2">
          <Globe className="h-3 w-3 sm:h-4 sm:w-4 text-yellow-600" />
          <SelectValue />
        </div>
      </SelectTrigger>
      <SelectContent align="end" side="bottom" className="w-auto min-w-16">
        {CURRENCY_OPTIONS.map((currency) => (
          <SelectItem 
            key={currency.code} 
            value={currency.code}
            data-testid={`option-currency-${currency.code}`}
          >
            <div className="flex items-center justify-center w-full">
              <span className="text-sm text-gray-500">{currency.symbol}</span>
            </div>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}