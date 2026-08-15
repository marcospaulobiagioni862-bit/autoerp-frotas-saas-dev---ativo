import React from 'react';
import { ObligationStatus } from '../../types/enums';

export interface BadgeProps {
  status?: ObligationStatus | string;
  variant?: 'success' | 'warning' | 'danger' | 'info' | 'neutral' | 'secondary' | 'indigo' | 'slate' | string;
  children?: React.ReactNode;
  className?: string;
}

export const Badge: React.FC<BadgeProps> = ({ status, variant = 'neutral', children, className = '' }) => {
  let computedVariant = variant;
  let label = children;

  if (status) {
    switch (status) {
      case ObligationStatus.PAID:
        computedVariant = 'success';
        label = label || 'PAGO';
        break;
      case 'RECEIVED':
        computedVariant = 'success';
        label = label || 'RECEBIDO';
        break;
      case ObligationStatus.PARTIALLY_PAID:
        computedVariant = 'warning';
        label = label || 'PARCIAL';
        break;
      case ObligationStatus.PENDING:
        computedVariant = 'info';
        label = label || 'PENDENTE';
        break;
      case ObligationStatus.OVERDUE:
        computedVariant = 'danger';
        label = label || 'ATRASADO';
        break;
      case ObligationStatus.CANCELLED:
        computedVariant = 'neutral';
        label = label || 'CANCELADO';
        break;
      default:
        label = label || String(status);
        break;
    }
  }

  const variantStyles: Record<string, string> = {
    success: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800/50',
    warning: 'bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300 border border-amber-200 dark:border-amber-800/50',
    danger: 'bg-rose-100 text-rose-800 dark:bg-rose-950/60 dark:text-rose-300 border border-rose-200 dark:border-rose-800/50',
    info: 'bg-sky-100 text-sky-800 dark:bg-sky-950/60 dark:text-sky-300 border border-sky-200 dark:border-sky-800/50',
    neutral: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300 border border-slate-200 dark:border-slate-700',
    secondary: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300 border border-slate-200 dark:border-slate-700',
    indigo: 'bg-indigo-100 text-indigo-800 dark:bg-indigo-950/60 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800/50',
    slate: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300 border border-slate-200 dark:border-slate-700',
  };

  const styleClass = variantStyles[computedVariant as string] || variantStyles.neutral;

  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold whitespace-nowrap ${styleClass} ${className}`}>
      {label}
    </span>
  );
};
