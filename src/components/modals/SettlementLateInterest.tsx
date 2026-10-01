import { formatDateBR } from '../../shared/utils/date';
import React from 'react';
import { fixedSettlementQuote } from '../../domain/finance/dailyLateInterest';
import { formatCurrencyBRL } from '../../shared/utils/currency';

export function settlementLocalDate(now = new Date()): string {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

export function settlementQuote(obligation: {dueDate: string; balanceAmount: number} | null, date: string, daily: number | null, periodStartDate?: string) {
  if (!obligation || daily == null || !date) return null;
  try { return fixedSettlementQuote(obligation, date, daily, periodStartDate); } catch { return null; }
}

export function SettlementLateInterest({ quote, balanceAmount, hasPreviousAdjustments, dueDate, kind }: {
  quote: ReturnType<typeof settlementQuote>; balanceAmount: number; hasPreviousAdjustments: boolean; dueDate: string; kind: 'receber' | 'pagar';
}) {
  if (!quote || quote.daysOverdue === 0) return null;
  return <dl aria-label="Composição de juros por atraso" className="rounded-lg border border-amber-200 p-3 text-xs space-y-1">
    <div>{hasPreviousAdjustments ? 'Saldo atual (inclui ajustes anteriores)' : 'Saldo principal'}: {formatCurrencyBRL(balanceAmount)}</div>
    <div>Vencimento: {formatDateBR(dueDate)}</div>
    <div>Período desta diária: {formatDateBR(quote.periodStartDate)} → {formatDateBR(quote.effectiveDate)}</div>
    <div>{quote.daysOverdue} diárias nesta baixa</div>
    <div>Valor por diária: {formatCurrencyBRL(quote.dailyInterestAmount)}</div>
    <div>Diárias desta baixa: {formatCurrencyBRL(quote.additionalInterest)}</div>
    <div className="font-semibold">Total a {kind}: {formatCurrencyBRL(quote.totalAmount)}</div>
  </dl>;
}
