import React from 'react';

export interface SelectOption {
 value: string | number;
 label: string;
 disabled?: boolean;
}

export interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
 label?: string;
 error?: string;
 helperText?: string;
 options?: SelectOption[];
}

export const Select = React.forwardRef<HTMLSelectElement, SelectProps>(({
 label,
 error,
 helperText,
 className = '',
 id,
 required,
 children,
 options,
 ...props
}, ref) => {
 const selectId = id || (label ? label.toLowerCase().replace(/\s+/g, '-') : undefined);

 return (
 <div className="w-full space-y-1.5">
 {label && (
 <label htmlFor={selectId} className="block text-xs font-semibold uppercase tracking-wider text-graphite-700 dark:text-graphite-200">
 {label} {required && <span className="text-error-icon">*</span>}
 </label>
 )}
 <select
 ref={ref}
 id={selectId}
 className={`w-full px-3 py-2 text-sm bg-white dark:bg-graphite-900 border rounded-lg text-graphite-900 dark:text-graphite-100 focus:outline-none focus:ring-2 focus-visible:outline-focus-ring focus:border-transparent disabled:opacity-50 disabled:bg-graphite-50 dark:disabled:bg-graphite-950 transition-colors ${
 error ? 'border-error-border focus-visible:outline-focus-ring' : 'border-graphite-300 dark:border-graphite-700'
 } ${className}`}
 {...props}
 >
 {options ? options.map((opt) => (
 <option key={opt.value} value={opt.value} disabled={opt.disabled}>
 {opt.label}
 </option>
 )) : children}
 </select>
 {error && <p className="text-xs text-error-icon ">{error}</p>}
 {!error && helperText && <p className="text-xs text-graphite-500 dark:text-graphite-300">{helperText}</p>}
 </div>
 );
});

Select.displayName = 'Select';
