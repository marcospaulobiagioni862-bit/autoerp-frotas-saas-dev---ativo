import React from 'react';

export interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  error?: string;
  helperText?: string;
}

export const Select = React.forwardRef<HTMLSelectElement, SelectProps>(({
  label,
  error,
  helperText,
  className = '',
  id,
  required,
  children,
  ...props
}, ref) => {
  const selectId = id || (label ? label.toLowerCase().replace(/\s+/g, '-') : undefined);

  return (
    <div className="w-full space-y-1.5">
      {label && (
        <label htmlFor={selectId} className="block text-xs font-semibold uppercase tracking-wider text-slate-700 dark:text-slate-300">
          {label} {required && <span className="text-red-500">*</span>}
        </label>
      )}
      <select
        ref={ref}
        id={selectId}
        className={`w-full px-3 py-2 text-sm bg-white dark:bg-slate-900 border rounded-lg text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:opacity-50 disabled:bg-slate-50 dark:disabled:bg-slate-950 transition-colors ${
          error ? 'border-red-500 focus:ring-red-500' : 'border-slate-300 dark:border-slate-700'
        } ${className}`}
        {...props}
      >
        {children}
      </select>
      {error && <p className="text-xs text-red-600 dark:text-red-400">{error}</p>}
      {!error && helperText && <p className="text-xs text-slate-500 dark:text-slate-400">{helperText}</p>}
    </div>
  );
});

Select.displayName = 'Select';
