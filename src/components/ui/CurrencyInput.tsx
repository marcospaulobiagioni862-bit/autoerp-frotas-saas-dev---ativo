import React, { useEffect, useState } from 'react';
import { normalizeCurrencyCentsDraft, parseCurrencyDraft, numberToCurrencyDraft } from '../../shared/utils/currency';

export interface CurrencyInputProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange'> {
  label?: string;
  error?: string;
  helperText?: string;
  value?: number | string | null;
  onChangeValue?: (numericValue: number, formatted: string) => void;
  onChange?: (e: React.ChangeEvent<HTMLInputElement>) => void;
}

export const CurrencyInput = React.forwardRef<HTMLInputElement, CurrencyInputProps>(({
  label,
  error,
  helperText,
  className = '',
  id,
  required,
  value,
  onChangeValue,
  onChange,
  disabled,
  placeholder = '0,00',
  ...props
}, ref) => {
  const inputId = id || (label ? label.toLowerCase().replace(/\s+/g, '-') : undefined);

  // Mantém rascunho de texto formatado
  const [displayValue, setDisplayValue] = useState<string>(() => {
    if (typeof value === 'number') return numberToCurrencyDraft(value);
    if (typeof value === 'string') return normalizeCurrencyCentsDraft(value);
    return '';
  });

  // Sincroniza se o pai atualizar o valor numericamente
  useEffect(() => {
    if (typeof value === 'number') {
      const currentNumeric = parseCurrencyDraft(displayValue);
      if (Number.isNaN(currentNumeric) || Math.abs(currentNumeric - value) > 0.001) {
        setDisplayValue(numberToCurrencyDraft(value));
      }
    } else if (typeof value === 'string') {
      const normalized = normalizeCurrencyCentsDraft(value);
      if (normalized !== displayValue) {
        setDisplayValue(normalized);
      }
    } else if (value === null || value === undefined) {
      if (displayValue !== '') setDisplayValue('');
    }
  }, [value]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value;
    const formatted = normalizeCurrencyCentsDraft(raw);
    setDisplayValue(formatted);

    const numericValue = parseCurrencyDraft(formatted) || 0;
    if (onChangeValue) {
      onChangeValue(numericValue, formatted);
    }
    if (onChange) {
      e.target.value = formatted;
      onChange(e);
    }
  };

  return (
    <div className="w-full space-y-1.5">
      {label && (
        <label htmlFor={inputId} className="block text-xs font-semibold uppercase tracking-wider text-graphite-700 dark:text-graphite-200">
          {label} {required && <span className="text-error-icon">*</span>}
        </label>
      )}
      <div className="relative">
        <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3 text-xs font-semibold text-graphite-400">
          R$
        </div>
        <input
          ref={ref}
          id={inputId}
          type="text"
          inputMode="numeric"
          disabled={disabled}
          placeholder={placeholder}
          value={displayValue}
          onChange={handleChange}
          className={`w-full rounded-lg border bg-white py-2 pl-9 pr-3 text-sm font-mono text-graphite-900 transition-colors placeholder-graphite-400 focus:border-transparent focus:outline-none focus:ring-2 focus-visible:outline-focus-ring disabled:bg-graphite-50 disabled:opacity-50 dark:bg-graphite-900 dark:text-graphite-100 dark:placeholder-graphite-500 dark:disabled:bg-graphite-950 ${
            error ? 'border-error-border focus-visible:outline-focus-ring' : 'border-graphite-300 dark:border-graphite-700'
          } ${className}`}
          {...props}
        />
      </div>
      {error && <p className="text-xs text-error-icon">{error}</p>}
      {!error && helperText && <p className="text-xs text-graphite-500 dark:text-graphite-300">{helperText}</p>}
    </div>
  );
});

CurrencyInput.displayName = 'CurrencyInput';
