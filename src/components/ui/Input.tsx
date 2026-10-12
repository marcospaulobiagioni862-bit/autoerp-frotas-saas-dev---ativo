import React from 'react';

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  helperText?: string;
  icon?: React.ReactNode;
}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(({
  label,
  error,
  helperText,
  className = '',
  id,
  required,
  icon,
  ...props
}, ref) => {
  const inputId = id || (label ? label.toLowerCase().replace(/\s+/g, '-') : undefined);

  return (
    <div className="w-full space-y-1.5">
      {label && (
        <label htmlFor={inputId} className="block text-xs font-semibold uppercase tracking-wider text-graphite-700 dark:text-graphite-200">
          {label} {required && <span className="text-error-icon">*</span>}
        </label>
      )}
      <div className="relative">
        {icon && (
          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-graphite-400">
            {icon}
          </div>
        )}
        <input
          ref={ref}
          id={inputId}
          className={`w-full px-3 py-2 text-sm bg-white dark:bg-graphite-900 border rounded-lg text-graphite-900 dark:text-graphite-100 placeholder-graphite-400 dark:placeholder-graphite-400 ${props.type === 'date' ? 'dark:[color-scheme:dark]' : ''} focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:opacity-50 disabled:bg-graphite-50 dark:disabled:bg-graphite-950 transition-colors ${
            icon ? 'pl-10' : ''
          } ${
            error ? 'border-red-500 focus:ring-red-500' : 'border-graphite-300 dark:border-graphite-700'
          } ${className}`}
          {...props}
        />
      </div>
      {error && <p className="text-xs text-error-icon ">{error}</p>}
      {!error && helperText && <p className="text-xs text-graphite-500 dark:text-graphite-300">{helperText}</p>}
    </div>
  );
});

Input.displayName = 'Input';
