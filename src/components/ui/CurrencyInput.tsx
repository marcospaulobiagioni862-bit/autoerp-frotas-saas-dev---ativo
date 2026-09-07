import React, { useEffect, useState } from 'react';
import { formatCurrencyInputBRL, parseCurrencyInput } from '../../shared/utils/currency';
import { Input, type InputProps } from './Input';

export interface CurrencyInputProps extends Omit<InputProps, 'type' | 'value' | 'onChange' | 'inputMode'> {
  value: number | string | null | undefined;
  onValueChange: (value: number | null) => void;
}

export const CurrencyInput: React.FC<CurrencyInputProps> = ({ value, onValueChange, ...props }) => {
  const [display, setDisplay] = useState(() => formatCurrencyInputBRL(value));

  useEffect(() => {
    setDisplay(formatCurrencyInputBRL(value));
  }, [value]);

  const handleChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const digits = event.target.value.replace(/\D/g, '');
    if (!digits) {
      setDisplay('');
      onValueChange(null);
      return;
    }

    const amount = Number(digits) / 100;
    const formatted = formatCurrencyInputBRL(amount);
    setDisplay(formatted);
    onValueChange(parseCurrencyInput(formatted));
  };

  return (
    <Input
      {...props}
      type="text"
      inputMode="decimal"
      autoComplete="off"
      value={display}
      onChange={handleChange}
      placeholder={props.placeholder || '0,00'}
    />
  );
};
