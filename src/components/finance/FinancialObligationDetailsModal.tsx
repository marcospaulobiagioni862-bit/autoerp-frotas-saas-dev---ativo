import { requestGuardedClose } from '../../app/unsavedChangesAuthority';
import React, { useEffect, useState } from 'react';
import type { AccountPayable, AccountReceivable, FinancialTransaction } from '../../types/entities';
import { FinanceTransactionClient } from '../../api/financeTransactionClient';
import { DriverClient } from '../../api/driverClient';
import { VehicleClient } from '../../api/vehicleClient';
import { ContractClient } from '../../api/contractClient';
import { MaintenanceClient } from '../../api/maintenanceClient';
import { isAuthenticationExpiredError } from '../../auth/sessionExpiry';
import { Badge, Button, ModalContainer, Skeleton } from '../ui';

type FinancialObligation = AccountReceivable | AccountPayable;
type ObligationKind = 'RECEIVABLE' | 'PAYABLE';

interface FinancialObligationDetailsModalProps {
  obligation: FinancialObligation | null;
  type: ObligationKind;
  onClose: () => void;
}

const currency = (value: number) =>
  value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

const dateLabel = (value?: string) =>
  value ? new Date(`${value.slice(0, 10)}T00:00:00`).toLocaleDateString('pt-BR') : '—';

const statusLabel = (status: string): string => ({
  PENDING: 'Em aberto',
  PARTIALLY_PAID: 'Pago parcialmente',
  PAID: 'Pago',
  OVERDUE: 'Vencido',
  CANCELLED: 'Cancelado',
  RENEGOTIATED: 'Renegociado',
  WRITTEN_OFF: 'Baixado',
}[status] || status);

const originLabel = (origin: string): string => ({
  CONTRACT_RENT: 'Aluguel de contrato',
  CONTRACT_FINE: 'Cobrança contratual',
  KM_EXCESS: 'KM excedente',
  SECURITY_DEPOSIT: 'Caução',
  TRAFFIC_TICKET_DRIVER: 'Multa do motorista',
  TRAFFIC_TICKET_COMPANY: 'Multa da empresa',
  TRAFFIC_TICKET_NIC: 'Multa NIC',
  MAINTENANCE: 'Manutenção',
  INSURANCE: 'Seguro',
  TRACKER: 'Rastreador',
  DOCUMENTATION: 'Documentação',
  FINANCING: 'Financiamento',
  ADMINISTRATIVE: 'Administrativo',
  MANUAL: 'Lançamento manual',
  RENEGOTIATION: 'Renegociação',
}[origin] || origin.replaceAll('_', ' '));

const transactionTypeLabel = (type: string): string => ({
  INCOME: 'Entrada',
  EXPENSE: 'Saída',
  TRANSFER: 'Transferência',
  REVERSAL: 'Estorno',
}[type] || type);

export const FinancialObligationDetailsModal: React.FC<FinancialObligationDetailsModalProps> = ({
  obligation,
  type,
  onClose,
}) => {
  const [transactions, setTransactions] = useState<FinancialTransaction[]>([]);
  const [loadingTransactions, setLoadingTransactions] = useState(false);
  const [transactionsError, setTransactionsError] = useState<string | null>(null);
  const [linkedEntities, setLinkedEntities] = useState<Array<[string, string]>>([]);

  useEffect(() => {
    let active = true;
    if (!obligation) {
      setLinkedEntities([]);
      return () => { active = false; };
    }

    const tasks: Array<Promise<[string, string] | null>> = [];
    if (obligation.driverId) {
      tasks.push(DriverClient.list().then((items) => {
        const item = items.find((entry) => entry.id === obligation.driverId);
        return item ? ['Motorista', item.fullName] : null;
      }));
    }
    if (obligation.vehicleId) {
      tasks.push(VehicleClient.list().then((items) => {
        const item = items.find((entry) => entry.id === obligation.vehicleId);
        return item ? ['Veículo', `${item.plate} • ${item.brand} ${item.model}`] : null;
      }));
    }
    if (obligation.contractId) {
      tasks.push(ContractClient.list().then((items) => {
        const item = items.find((entry) => entry.id === obligation.contractId);
        return item ? ['Contrato', item.contractNumber] : null;
      }));
    }
    const supplierId = 'supplierId' in obligation ? obligation.supplierId : undefined;
    if (supplierId) {
      tasks.push(MaintenanceClient.listSuppliers().then((items) => {
        const item = items.find((entry) => entry.id === supplierId);
        return item ? ['Fornecedor', item.name] : null;
      }));
    }

    if (tasks.length === 0) {
      setLinkedEntities([]);
      return () => { active = false; };
    }

    void Promise.allSettled(tasks).then((results) => {
      if (!active) return;
      const resolved = results
        .filter((result): result is PromiseFulfilledResult<[string, string] | null> => result.status === 'fulfilled')
        .map((result) => result.value)
        .filter((item): item is [string, string] => Boolean(item));
      setLinkedEntities(resolved);
    });

    return () => { active = false; };
  }, [obligation]);

  useEffect(() => {
    let active = true;

    if (!obligation) {
      setTransactions([]);
      setTransactionsError(null);
      setLoadingTransactions(false);
      return () => {
        active = false;
      };
    }

    setLoadingTransactions(true);
    setTransactions([]);
    setTransactionsError(null);

    FinanceTransactionClient.listByObligation(type, obligation.id)
      .then((items) => {
        if (!active) return;
        const ordered = [...items].sort((a, b) => {
          const dateDifference =
            new Date(b.transactionDate).getTime() - new Date(a.transactionDate).getTime();
          return dateDifference || new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
        });
        setTransactions(ordered);
      })
      .catch((error: unknown) => {
        if (!active || isAuthenticationExpiredError(error)) return;
        setTransactions([]);
        setTransactionsError('Não foi possível carregar o histórico autorizado deste título.');
      })
      .finally(() => {
        if (active) setLoadingTransactions(false);
      });

    return () => {
      active = false;
    };
  }, [obligation, type]);

  if (!obligation) return null;

  const amountRows = [
    ['Valor original', obligation.originalAmount],
    ['Descontos', obligation.discountAmount],
    ['Multas', obligation.fineAmount],
    ['Juros', obligation.interestAmount],
    ['Valor atualizado', obligation.updatedAmount],
    ['Valor liquidado', obligation.paidAmount],
    ['Saldo atual', obligation.balanceAmount],
  ] as const;

  return (
    <ModalContainer
      isOpen={Boolean(obligation)}
      onClose={onClose}
      title={type === 'RECEIVABLE' ? 'Detalhes da conta a receber' : 'Detalhes da conta a pagar'}
      subtitle="Composição e histórico fornecidos pelo servidor"
      maxWidth="4xl"
    >
      <div className="space-y-5">
        <section className="space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                {obligation.description}
              </h3>
              <p className="text-[11px] text-slate-500">{type === 'RECEIVABLE' ? 'Cobrança' : 'Obrigação'} financeira</p>
            </div>
            <Badge variant={obligation.status === 'PAID' ? 'success' : obligation.status === 'CANCELLED' ? 'neutral' : 'warning'}>
              {statusLabel(String(obligation.status))}
            </Badge>
          </div>
          <dl className="grid grid-cols-2 gap-3 rounded-xl bg-slate-50 p-3 text-xs dark:bg-slate-800/50 sm:grid-cols-4">
            <div><dt className="text-slate-500">Vencimento</dt><dd className="font-semibold">{dateLabel(obligation.dueDate)}</dd></div>
            <div><dt className="text-slate-500">Competência</dt><dd className="font-semibold">{dateLabel(obligation.competenceDate)}</dd></div>
            <div><dt className="text-slate-500">Origem</dt><dd className="font-semibold">{originLabel(String(obligation.originType))}</dd></div>
            <div><dt className="text-slate-500">Parcela</dt><dd className="font-semibold">{obligation.installmentNumber && obligation.totalInstallments ? `${obligation.installmentNumber}/${obligation.totalInstallments}` : 'Única'}</dd></div>
          </dl>
          {linkedEntities.length > 0 && (
            <dl className="grid grid-cols-1 gap-2 text-xs sm:grid-cols-2">
              {linkedEntities.map(([label, value]) => (
                <div key={label} className="flex gap-2">
                  <dt className="text-slate-500">{label}:</dt>
                  <dd className="font-semibold text-slate-700 dark:text-slate-300">{value}</dd>
                </div>
              ))}
            </dl>
          )}
        </section>

        <section>
          <h3 className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-500">Composição financeira</h3>
          <dl className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {amountRows.map(([label, value]) => (
              <div key={label} className="rounded-xl border border-slate-200 p-3 dark:border-slate-800">
                <dt className="text-[11px] text-slate-500">{label}</dt>
                <dd className="mt-1 font-mono text-sm font-semibold tabular-nums">{currency(value)}</dd>
              </div>
            ))}
          </dl>
        </section>

        <section>
          <h3 className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-500">Histórico de liquidações e estornos</h3>
          {loadingTransactions ? (
            <div className="space-y-2"><Skeleton className="h-10 w-full" /><Skeleton className="h-10 w-full" /></div>
          ) : transactionsError ? (
            <div role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300">
              {transactionsError}
            </div>
          ) : transactions.length === 0 ? (
            <p className="rounded-lg bg-slate-50 p-3 text-xs text-slate-500 dark:bg-slate-800/50">
              Nenhuma transação autorizada vinculada a este título.
            </p>
          ) : (
            <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-800">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 text-slate-500 dark:bg-slate-800/60">
                  <tr><th className="p-3">Data</th><th className="p-3">Tipo</th><th className="p-3">Descrição</th><th className="p-3 text-right">Valor</th></tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {transactions.map((transaction) => (
                    <tr key={transaction.id}>
                      <td className="p-3 font-mono">{dateLabel(transaction.transactionDate)}</td>
                      <td className="p-3">
                        <Badge variant={transaction.type === 'REVERSAL' || transaction.isReversed ? 'warning' : 'neutral'}>
                          {transactionTypeLabel(String(transaction.type))}
                        </Badge>
                        {transaction.isReversed && <span className="ml-2 text-[10px] text-amber-700 dark:text-amber-400">Estornada</span>}
                      </td>
                      <td className="p-3">
                        <div>{transaction.description}</div>
                        {transaction.reversalTransactionId && <div className="text-[10px] text-slate-400">Estorno relacionado</div>}
                      </td>
                      <td className="p-3 text-right font-mono font-semibold tabular-nums">{currency(transaction.amount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <div className="flex justify-end border-t border-slate-200 pt-3 dark:border-slate-800">
          <Button type="button" variant="outline" onClick={(event)=>requestGuardedClose(event,onClose)}>Fechar</Button>
        </div>
      </div>
    </ModalContainer>
  );
};
