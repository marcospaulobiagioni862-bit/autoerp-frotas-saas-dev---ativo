import React from 'react';
import { ObligationStatus } from '../../types/enums';
import { OBLIGATION_TONES, VEHICLE_TONES, toneClasses, type BadgeTone } from './statusTones';

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

  // AUTOERP-91 fase 6. O tom vem do mapa unico em statusTones.ts; o estado decide
  // a cor uma vez so, em vez de cada tela escolher a sua. As variantes antigas
  // (success/warning/danger/info...) continuam aceitas porque ha centenas de
  // chamadas usando elas - cada uma aponta para o tom equivalente do sistema.
  const variantTone: Record<string, BadgeTone> = {
    success: 'badge-petrol-t1',
    warning: 'badge-plum-t2',
    danger: 'badge-crimson-s2',
    info: 'badge-navy-t1',
    neutral: 'badge-graphite-t1',
    secondary: 'badge-graphite-t1',
    indigo: 'badge-navy-t2',
    slate: 'badge-graphite-t1',
  };

  // Estado explicito tem precedencia sobre a variante: e o caminho correto.
  const toneFromStatus = status ? (OBLIGATION_TONES[String(status)] || VEHICLE_TONES[String(status)]) : undefined;
  const variantStyles: Record<string, string> = Object.fromEntries(
    Object.entries(variantTone).map(([nome, tom]) => [nome, toneClasses(tom)])
  );
  if (toneFromStatus) variantStyles[computedVariant as string] = toneClasses(toneFromStatus);

  const styleClass = variantStyles[computedVariant as string] || variantStyles.neutral;

  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold whitespace-nowrap ${styleClass} ${className}`}>
      {label}
    </span>
  );
};
