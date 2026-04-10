import { useState, useEffect, useCallback } from 'react';
import { cn } from '@/lib/utils';
import { Check, X, AlertCircle, Info, Loader2 } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useHapticFeedback } from '@/hooks/useHapticFeedback';

interface ValidationRule {
  test: (value: any) => boolean | Promise<boolean>;
  message: string;
  type?: 'error' | 'warning' | 'info';
}

interface SmartFormFieldProps {
  name: string;
  label: string;
  value: any;
  onChange: (value: any) => void;
  onBlur?: () => void;
  type?: 'text' | 'email' | 'password' | 'number' | 'tel' | 'url' | 'textarea';
  placeholder?: string;
  required?: boolean;
  disabled?: boolean;
  validations?: ValidationRule[];
  validateOnChange?: boolean;
  validateOnBlur?: boolean;
  debounceMs?: number;
  showStrengthIndicator?: boolean; // For password fields
  showSuggestions?: boolean;
  suggestions?: string[];
  helpText?: string;
  className?: string;
}

export function SmartFormField({
  name,
  label,
  value,
  onChange,
  onBlur,
  type = 'text',
  placeholder,
  required = false,
  disabled = false,
  validations = [],
  validateOnChange = true,
  validateOnBlur = true,
  debounceMs = 500,
  showStrengthIndicator = false,
  showSuggestions = false,
  suggestions = [],
  helpText,
  className
}: SmartFormFieldProps) {
  const [isFocused, setIsFocused] = useState(false);
  const [isTouched, setIsTouched] = useState(false);
  const [isValidating, setIsValidating] = useState(false);
  const [validationResults, setValidationResults] = useState<{
    valid: boolean;
    messages: { text: string; type: 'error' | 'warning' | 'info' }[];
  }>({ valid: true, messages: [] });
  const [debounceTimer, setDebounceTimer] = useState<NodeJS.Timeout | null>(null);
  const { fieldError, fieldSuccess } = useHapticFeedback();

  // Password strength calculation
  const calculatePasswordStrength = useCallback((password: string): number => {
    if (!password) return 0;
    let strength = 0;
    
    // Length check
    if (password.length >= 8) strength += 20;
    if (password.length >= 12) strength += 20;
    
    // Character variety checks
    if (/[a-z]/.test(password)) strength += 15;
    if (/[A-Z]/.test(password)) strength += 15;
    if (/[0-9]/.test(password)) strength += 15;
    if (/[^a-zA-Z0-9]/.test(password)) strength += 15;
    
    return Math.min(100, strength);
  }, []);

  // Validate value against rules
  const validateValue = useCallback(async (val: any) => {
    if (!validations.length) return { valid: true, messages: [] };
    
    setIsValidating(true);
    const messages: { text: string; type: 'error' | 'warning' | 'info' }[] = [];
    let hasError = false;

    for (const rule of validations) {
      try {
        const passed = await rule.test(val);
        if (!passed) {
          messages.push({ text: rule.message, type: rule.type || 'error' });
          if (rule.type === 'error' || !rule.type) {
            hasError = true;
          }
        }
      } catch (error) {
        console.error('Validation error:', error);
      }
    }

    setIsValidating(false);
    const result = { valid: !hasError, messages };
    setValidationResults(result);
    
    // Trigger haptic feedback
    if (isTouched) {
      if (hasError) {
        fieldError();
      } else if (messages.length === 0) {
        fieldSuccess();
      }
    }
    
    return result;
  }, [validations, isTouched, fieldError, fieldSuccess]);

  // Handle input change with debouncing
  const handleChange = useCallback((e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const newValue = e.target.value;
    onChange(newValue);

    if (validateOnChange && isTouched) {
      if (debounceTimer) clearTimeout(debounceTimer);
      
      const timer = setTimeout(() => {
        validateValue(newValue);
      }, debounceMs);
      
      setDebounceTimer(timer);
    }
  }, [onChange, validateOnChange, isTouched, debounceMs, validateValue, debounceTimer]);

  // Handle blur
  const handleBlur = useCallback(() => {
    setIsFocused(false);
    setIsTouched(true);
    
    if (validateOnBlur) {
      validateValue(value);
    }
    
    if (onBlur) onBlur();
  }, [validateOnBlur, value, validateValue, onBlur]);

  // Handle focus
  const handleFocus = useCallback(() => {
    setIsFocused(true);
  }, []);

  // Get field status icon
  const getStatusIcon = () => {
    if (isValidating) {
      return <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />;
    }
    if (!isTouched) return null;
    
    if (validationResults.messages.some(m => m.type === 'error')) {
      return <X className="h-4 w-4 text-destructive" />;
    }
    if (validationResults.messages.some(m => m.type === 'warning')) {
      return <AlertCircle className="h-4 w-4 text-yellow-500" />;
    }
    if (validationResults.valid && value) {
      return <Check className="h-4 w-4 text-green-500" />;
    }
    return null;
  };

  // Get password strength color
  const getPasswordStrengthColor = (strength: number) => {
    if (strength < 30) return 'bg-destructive';
    if (strength < 60) return 'bg-yellow-500';
    if (strength < 80) return 'bg-blue-500';
    return 'bg-green-500';
  };

  const passwordStrength = type === 'password' && showStrengthIndicator ? calculatePasswordStrength(value) : 0;

  return (
    <div className={cn("space-y-2", className)}>
      {/* Label */}
      <label htmlFor={name} className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
        {label}
        {required && <span className="text-destructive ml-1">*</span>}
      </label>

      {/* Input wrapper */}
      <div className="relative">
        {/* Input field */}
        {type === 'textarea' ? (
          <textarea
            id={name}
            name={name}
            value={value}
            onChange={handleChange}
            onBlur={handleBlur}
            onFocus={handleFocus}
            placeholder={placeholder}
            disabled={disabled}
            className={cn(
              "flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50",
              isFocused && "ring-2 ring-ring ring-offset-2",
              validationResults.messages.some(m => m.type === 'error') && isTouched && "border-destructive",
              validationResults.valid && isTouched && value && "border-green-500"
            )}
          />
        ) : (
          <input
            id={name}
            name={name}
            type={type}
            value={value}
            onChange={handleChange}
            onBlur={handleBlur}
            onFocus={handleFocus}
            placeholder={placeholder}
            disabled={disabled}
            className={cn(
              "flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50",
              isFocused && "ring-2 ring-ring ring-offset-2",
              validationResults.messages.some(m => m.type === 'error') && isTouched && "border-destructive",
              validationResults.valid && isTouched && value && "border-green-500",
              "pr-10" // Space for status icon
            )}
          />
        )}

        {/* Status icon */}
        <div className="absolute right-3 top-1/2 -translate-y-1/2">
          {getStatusIcon()}
        </div>
      </div>

      {/* Password strength indicator */}
      {type === 'password' && showStrengthIndicator && value && (
        <div className="space-y-1">
          <div className="h-2 bg-muted rounded-full overflow-hidden">
            <motion.div
              className={cn("h-full", getPasswordStrengthColor(passwordStrength))}
              initial={{ width: 0 }}
              animate={{ width: `${passwordStrength}%` }}
              transition={{ duration: 0.3 }}
            />
          </div>
          <p className="text-xs text-muted-foreground">
            Password strength: {passwordStrength < 30 ? 'Weak' : passwordStrength < 60 ? 'Fair' : passwordStrength < 80 ? 'Good' : 'Strong'}
          </p>
        </div>
      )}

      {/* Help text */}
      {helpText && !isTouched && (
        <p className="text-sm text-muted-foreground">
          {helpText}
        </p>
      )}

      {/* Validation messages */}
      <AnimatePresence mode="wait">
        {isTouched && validationResults.messages.length > 0 && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.2 }}
            className="space-y-1"
          >
            {validationResults.messages.map((msg, index) => (
              <div
                key={index}
                className={cn(
                  "text-sm flex items-center gap-1",
                  msg.type === 'error' && "text-destructive",
                  msg.type === 'warning' && "text-yellow-600",
                  msg.type === 'info' && "text-blue-600"
                )}
              >
                {msg.type === 'warning' && <AlertCircle className="h-3 w-3" />}
                {msg.type === 'info' && <Info className="h-3 w-3" />}
                {msg.text}
              </div>
            ))}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Suggestions */}
      {showSuggestions && suggestions.length > 0 && isFocused && (
        <div className="absolute z-10 w-full mt-1 bg-background border border-border rounded-md shadow-lg">
          {suggestions
            .filter(s => s.toLowerCase().includes(value.toLowerCase()))
            .slice(0, 5)
            .map((suggestion, index) => (
              <button
                key={index}
                type="button"
                onClick={() => onChange(suggestion)}
                className="w-full px-3 py-2 text-left text-sm hover:bg-accent hover:text-accent-foreground transition-colors"
              >
                {suggestion}
              </button>
            ))}
        </div>
      )}
    </div>
  );
}

// Common validation rules
export const commonValidations = {
  required: (message = 'This field is required'): ValidationRule => ({
    test: (value) => !!value && value.toString().trim().length > 0,
    message,
    type: 'error'
  }),
  
  email: (message = 'Please enter a valid email address'): ValidationRule => ({
    test: (value) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value),
    message,
    type: 'error'
  }),
  
  minLength: (min: number, message?: string): ValidationRule => ({
    test: (value) => value && value.length >= min,
    message: message || `Must be at least ${min} characters`,
    type: 'error'
  }),
  
  maxLength: (max: number, message?: string): ValidationRule => ({
    test: (value) => !value || value.length <= max,
    message: message || `Must be no more than ${max} characters`,
    type: 'error'
  }),
  
  pattern: (regex: RegExp, message: string): ValidationRule => ({
    test: (value) => !value || regex.test(value),
    message,
    type: 'error'
  }),
  
  number: (message = 'Must be a valid number'): ValidationRule => ({
    test: (value) => !value || !isNaN(Number(value)),
    message,
    type: 'error'
  }),
  
  min: (min: number, message?: string): ValidationRule => ({
    test: (value) => !value || Number(value) >= min,
    message: message || `Must be at least ${min}`,
    type: 'error'
  }),
  
  max: (max: number, message?: string): ValidationRule => ({
    test: (value) => !value || Number(value) <= max,
    message: message || `Must be no more than ${max}`,
    type: 'error'
  }),
  
  url: (message = 'Please enter a valid URL'): ValidationRule => ({
    test: (value) => {
      try {
        new URL(value);
        return true;
      } catch {
        return false;
      }
    },
    message,
    type: 'error'
  }),
  
  phone: (message = 'Please enter a valid phone number'): ValidationRule => ({
    test: (value) => /^[\d\s\-\+\(\)]+$/.test(value) && value.replace(/\D/g, '').length >= 10,
    message,
    type: 'error'
  }),
  
  // Async validation example
  uniqueUsername: (checkFunction: (username: string) => Promise<boolean>): ValidationRule => ({
    test: async (value) => {
      if (!value) return true;
      return await checkFunction(value);
    },
    message: 'This username is already taken',
    type: 'error'
  })
};