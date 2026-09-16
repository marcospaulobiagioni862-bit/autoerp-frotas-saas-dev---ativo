import React from 'react';

export interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  padding?: 'none' | 'sm' | 'md' | 'lg';
  hoverEffect?: boolean;
}

export const Card: React.FC<CardProps> = ({
  children,
  padding = 'md',
  className = '',
  hoverEffect,
  ...props
}) => {
  const paddingStyles = {
    none: 'p-0',
    sm: 'p-4',
    md: 'p-6',
    lg: 'p-8',
  };

  return (
    <div
      className={`bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700/80 rounded-xl shadow-xs transition-all ${paddingStyles[padding]} ${hoverEffect ? 'hover:shadow-md hover:border-slate-300 dark:hover:border-slate-600' : ''} ${className}`}
      {...props}
    >
      {children}
    </div>
  );
};
