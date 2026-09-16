import React, { useEffect, useState } from 'react';
import { AccountPayable } from '../../types/entities';
import { ObligationStatus, OriginType } from '../../types/enums';
import { FinanceObligationClient } from '../../api/financeObligationClient';
import { createManualPayable } from '../../api/manualPayableCommand';
import { useAuth } from '../../hooks/useAuth';
import { isAuthenticationExpiredError } from '../../auth/sessionExpiry';
import { TrafficTicketClient, type TrafficTicketFinancialCategory } from '../../api/trafficTicketClient';
import { CreditCard, Search, Filter, X, Plus } from 'lucide-react';
import { AttachmentModal } from '../documents/AttachmentModal';
import { FinancialObligationDetailsModal } from './FinancialObligationDetailsModal';
import { FolderOpen } from 'lucide-react';
import { Card, Button, Badge, Input, Skeleton, ModalContainer, ConfirmDialog } from '../ui';

interface PayablesViewProps {
  onOpenPaymentModal: (payable: AccountPayable) => void;
}

const originLabel = (origin: string): string => {
  const labels: Record<string, string> = {
    MAINTENANCE: 'Manutenção',
    INSURANCE: 'Seguro',
    TRACKER: 'Rastreador',
    DOCUMENTATION: 'Documentação',
    FINANCING: 'Financiamento',
    ADMINISTRATIVE: 'Administrativo',
    TRAFFIC_TICKET_COMPANY: 'Multa — Empresa',
    TRAFFIC_TICKET_NIC: 'Multa — NIC',
    MANUAL: 'Lançamento manual',
    RENEGOTIATION: 'Renegociação',
  };
  return labels[origin] || origin.replaceAll('_', ' ');
};

const statusLabel = (status: string): string => {
  const labels: Record<string, string> = {
    PENDING: 'Pendente',
    PARTIALLY_PAID: 'Pago parcialmente',
    PAID: 'Pago',
    OVERDUE: 'Vencido',
    CANCELLED: 'Cancelado',
    RENEGOTIATED: 'Renegociado',
    WRITTEN_OFF: 'Baixado',
  };
  return labels[status] || status;
};

export const PayablesView: React.FC<PayablesViewProps> = ({ onOpenPaymentModal }) => {
  const { user } = useAuth();
  const [payables, setPayables] = useState<AccountPayable[]>([]);
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [originFilter, setOriginFilter] = useState<string>('ALL');
  const [loading, setLoading] = useState<boolean>(true);
  const [attachmentEntity, setAttachmentEntity] = useState<any>(null);
  const [detailsTarget, setDetailsTarget] = useState<AccountPayable | null>(null);
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [categories, setCategories] = useState<TrafficTicketFinancialCategory[]>([]);

  // Manual Creation State
  const [isCreateOpen, setIsCreateOpen] = useState<boolean>(false);
  const [description, setDescription] = useState<string>('');
  const [totalAmount, setTotalAmount] = useState<string>('');
  const [dueDate, setDueDate] = useState<string>('');
  const [competenceDate, setCompetenceDate] = useState<string>('');
  const [categoryId, setCategoryId] = useState<string>('');
  const [installmentsCount, setInstallmentsCount] = useState<string>('1');
  const [supplierId, setSupplierId] = useState<string>('');
  const [driverId, setDriverId] = useState<string>('');
  const [vehicleId, setVehicleId] = useState<string>('');
  const [contractId, setContractId] = useState<string>('');
  const [createLoading, setCreateLoading] = useState<boolean>(false);

  // Cancellation state if any
  const [cancelTargetId, setCancelTargetId] = useState<string | null>(null);

  useEffect(() => {
    loadPayables();
  }, []);

  const loadPayables = async () => {
    setLoading(true);
    try {
      const [list, categoryList] = await Promise.all([
        FinanceObligationClient.listPayables(),
        TrafficTicketClient.categories(),
      ]);
      const expenseCategories = categoryList.filter((category) => category.type === 'EXPENSE' || category.type === 'BOTH');
      setCategories(expenseCategories);
      setCategoryId((current) => expenseCategories.some((category) => category.id === current) ? current : (expenseCategories[0]?.id || ''));
      setPayables(list.sort((a, b) => new Date(b.dueDate).getTime() - new Date(a.dueDate).getTime()));
    } catch (err) {
      if (isAuthenticationExpiredError(err)) return;
      const message = err instanceof Error ? err.message : 'Erro ao carregar contas a pagar.';
      alert(message);
      setPayables([]);
      setCategories([]);
      setCategoryId('');
    } finally {
      setLoading(false);
    }
  };

  const handleCreatePayable = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!description.trim() || !totalAmount || !dueDate || !categoryId) {
      alert('Por favor, preencha todos os campos obrigatórios.');
      return;
    }
    setCreateLoading(true);
    try {
      await createManualPayable(user?.companyId || '', {
        categoryId,
        description,
        totalAmount: parseFloat(totalAmount),
        dueDate,
        competenceDate: competenceDate || dueDate,
        installmentsCount: Number(installmentsCount),
        supplierId: supplierId.trim() || undefined,
        driverId: driverId.trim() || undefined,
        vehicleId: vehicleId.trim() || undefined,
        contractId: contractId.trim() || undefined,
      });
      setActionMessage('Nova obrigação a pagar criada com sucesso!');
      setIsCreateOpen(false);
      // Reset form
      setDescription('');
      setTotalAmount('');
      setDueDate('');
      setCompetenceDate('');
      setCategoryId(categories[0]?.id || '');
      setInstallmentsCount('1');
      setSupplierId('');
      setDriverId('');
      setVehicleId('');
      setContractId('');
      // Reload
      await loadPayables();
    } catch (err: any) {
      if (isAuthenticationExpiredError(err)) return;
      alert(err.message || 'Erro ao criar obrigação a pagar.');
    } finally {
      setCreateLoading(false);
    }
  };

  const confirmCancel = async () => {
    if (!cancelTargetId) return;
    try {
      const item = payables.find((p) => p.id === cancelTargetId);
      if (!item) {
        alert('Título a pagar não encontrado na lista atual.');
        setCancelTargetId(null);
        return;
      }
      await FinanceObligationClient.cancelPayable(cancelTargetId, 'Cancelamento manual via interface');
      setActionMessage('Título a pagar cancelado com sucesso.');
      setCancelTargetId(null);
      await loadPayables();
    } catch (err: any) {
      if (isAuthenticationExpiredError(err)) return;
      alert(err.message || 'Erro ao cancelar título');
      setCancelTargetId(null);
    }
  };

  const filtered = payables.filter((p) => {
    const term = searchTerm.trim().toLowerCase();
    const categoryName = categories.find((category) => category.id === p.categoryId)?.name || '';
    const matchesSearch =
      !term ||
      p.description.toLowerCase().includes(term) ||
      String(p.originType).toLowerCase().includes(term) ||
      originLabel(String(p.originType)).toLowerCase().includes(term) ||
      categoryName.toLowerCase().includes(term) ||
      (p.supplierId && p.supplierId.toLowerCase().includes(term)) ||
      (p.vehicleId && p.vehicleId.toLowerCase().includes(term));

    const matchesStatus = statusFilter === 'ALL' || p.status === statusFilter;
    const matchesOrigin = originFilter === 'ALL' || String(p.originType) === originFilter;
    return matchesSearch && matchesStatus && matchesOrigin;
  });

  const originOptions: string[] = Array.from(new Set<string>(payables.map((item) => String(item.originType)))).sort((a: string, b: string) =>
    originLabel(a).localeCompare(originLabel(b), 'pt-BR')
  );

  return (
    <div className="p-4 sm:p-6 space-y-6 max-w-7xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
            <CreditCard className="w-6 h-6 text-indigo-600" />
            Contas a Pagar (Payables) & Faturas
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Gestão de fornecedores, peças, seguros, rastreadores e faturas de cartão de crédito.
          </p>
        </div>

        <Button
          onClick={() => setIsCreateOpen(true)}
          variant="primary"
          size="sm"
          icon={<Plus className="w-4 h-4" />}
          className="!bg-indigo-600 hover:!bg-indigo-700 !text-white font-semibold"
        >
          Novo Título a Pagar
        </Button>
      </div>

      {actionMessage && (
        <div className="p-3 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-900/50 rounded-lg text-xs text-emerald-800 dark:text-emerald-300 flex items-center justify-between">
          <span>{actionMessage}</span>
          <button onClick={() => setActionMessage(null)} className="p-1 font-bold text-slate-500 hover:text-slate-700">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Filters */}
      <Card padding="sm">
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="w-full sm:w-80">
            <Input
              type="text"
              placeholder="Buscar fornecedor, veículo, descrição..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              icon={<Search className="w-4 h-4 text-slate-400" />}
            />
          </div>

          <div className="flex items-center gap-2 w-full sm:w-auto overflow-x-auto pb-1 sm:pb-0">
            <Filter className="w-3.5 h-3.5 text-slate-400 shrink-0" />
            <select
              aria-label="Filtrar contas a pagar por origem"
              value={originFilter}
              onChange={(event) => setOriginFilter(event.target.value)}
              className="shrink-0 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
            >
              <option value="ALL">Todas as origens</option>
              {originOptions.map((origin) => <option key={origin} value={origin}>{originLabel(origin)}</option>)}
            </select>
            {['ALL', ObligationStatus.PENDING, ObligationStatus.PARTIALLY_PAID, ObligationStatus.OVERDUE, ObligationStatus.PAID, ObligationStatus.CANCELLED].map((st) => (
              <button
                key={st}
                onClick={() => setStatusFilter(st)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors shrink-0 focus:outline-none focus:ring-2 focus:ring-indigo-500 ${
                  statusFilter === st
                    ? 'bg-indigo-600 text-white font-semibold shadow-2xs'
                    : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700'
                }`}
              >
                {st === 'ALL' ? 'Todos' : statusLabel(String(st))}
              </button>
            ))}
          </div>
        </div>
      </Card>

      {/* Table */}
      <Card padding="none">
        {loading ? (
          <div className="p-6 space-y-3">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 dark:bg-slate-800/60 text-slate-500 font-semibold uppercase tracking-wider border-b border-slate-100 dark:border-slate-800">
                <tr>
                  <th className="p-3.5">Descrição / Origem</th>
                  <th className="p-3.5">Vencimento</th>
                  <th className="p-3.5">Valor Original</th>
                  <th className="p-3.5">Saldo a Pagar</th>
                  <th className="p-3.5 text-center">Status</th>
                  <th className="p-3.5 text-right">Ação Operacional</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-slate-700 dark:text-slate-300">
                {filtered.length === 0 && (
                  <tr><td colSpan={6} className="p-8 text-center text-slate-500">Nenhuma conta a pagar encontrada para os filtros atuais.</td></tr>
                )}
                {filtered.map((item) => {
                  const isPending = item.status === ObligationStatus.PENDING || item.status === ObligationStatus.PARTIALLY_PAID || item.status === ObligationStatus.OVERDUE;
                  const isPaid = item.status === ObligationStatus.PAID;
                  const isOverdue = isPending && item.dueDate < new Date().toISOString().split('T')[0];

                  return (
                    <tr key={item.id} className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition-colors">
                      <td className="p-3.5">
                        <div className="font-semibold text-slate-900 dark:text-slate-100">{item.description}</div>
                        <div className="mt-0.5 flex flex-wrap gap-x-2 gap-y-0.5 text-[11px] text-slate-500">
                          <span>Origem: <strong>{originLabel(String(item.originType))}</strong></span>
                          <span>Categoria: {categories.find((category) => category.id === item.categoryId)?.name || item.categoryId}</span>
                          {item.installmentNumber && item.totalInstallments && (
                            <span className="font-semibold">Parcela {item.installmentNumber}/{item.totalInstallments}</span>
                          )}
                        </div>
                        <div className="text-[10px] text-slate-400 font-mono truncate">
                          Chave: {item.idempotencyKey}
                        </div>
                      </td>
                      <td className="p-3.5 font-mono tabular-nums">
                        {new Date(`${item.dueDate}T00:00:00`).toLocaleDateString('pt-BR')}
                        {isOverdue && (
                          <span className="block text-[10px] text-red-600 dark:text-red-400 font-bold">EM ATRASO</span>
                        )}
                      </td>
                      <td className="p-3.5 font-mono tabular-nums font-semibold">
                        R$ {item.originalAmount.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                      </td>
                      <td className="p-3.5 font-mono tabular-nums font-bold text-indigo-600 dark:text-indigo-400">
                        R$ {item.balanceAmount.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                      </td>
                      <td className="p-3.5 text-center">
                        <Badge
                          variant={
                            isPaid
                              ? 'success'
                              : isPending
                              ? isOverdue
                                ? 'danger'
                                : 'warning'
                              : 'neutral'
                          }
                        >
                          {statusLabel(String(item.status))}
                        </Badge>
                      </td>
                      <td className="p-3.5 text-right space-x-2">
                        <Button size="sm" variant="outline" onClick={() => setDetailsTarget(item)}>
                          Detalhes
                        </Button>
                        {isPending && (
                          <Button
                            size="sm"
                            variant="primary"
                            onClick={() => onOpenPaymentModal(item)}
                            className="!bg-indigo-600 hover:!bg-indigo-700 !text-white font-semibold"
                          >
                            Liquidar (Pagar)
                          </Button>
                        )}

                        {isPending && (
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => setCancelTargetId(item.id)}
                            className="text-slate-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/40 ml-2"
                          >
                            Cancelar
                          </Button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <ConfirmDialog
        isOpen={!!cancelTargetId}
        title="Cancelar Título a Pagar"
        message="Deseja realmente cancelar esta obrigação a pagar? Esta operação será auditada e processada no servidor."
        confirmText="Confirmar Cancelamento"
        confirmVariant="danger"
        onConfirm={confirmCancel}
        onCancel={() => setCancelTargetId(null)}
      />

      {/* MODAL DE CRIAÇÃO MANUAL */}
      {isCreateOpen && (
        <ModalContainer
          isOpen={isCreateOpen}
          onClose={() => setIsCreateOpen(false)}
          title="Lançar Obrigação a Pagar (Payable Manual)"
          maxWidth="max-w-lg"
        >
          <form onSubmit={handleCreatePayable} className="space-y-4">
            <Input
              label="Descrição da Obrigação *"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Ex: Peças para Oficina, Seguro Frota, Aluguel Escritório..."
              required
            />

            <div className="grid grid-cols-2 gap-4">
              <Input
                label="Valor Total (R$) *"
                type="number"
                step="0.01"
                value={totalAmount}
                onChange={(e) => setTotalAmount(e.target.value)}
                placeholder="0.00"
                required
              />

              <Input
                label="Vencimento *"
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                required
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <Input
                label="Data de Competência"
                type="date"
                value={competenceDate}
                onChange={(e) => setCompetenceDate(e.target.value)}
                placeholder="Opcional"
              />

              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-500 block">Categoria *</label>
                <select
                  value={categoryId}
                  onChange={(e) => setCategoryId(e.target.value)}
                  className="w-full text-xs p-2.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-1 focus:ring-indigo-500 text-xs"
                  required
                >
                  <option value="">Selecione uma categoria de despesa</option>
                  {categories.map((category) => (
                    <option key={category.id} value={category.id}>{category.name}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <Input
                label="Fornecedor / Supplier ID (Opcional)"
                value={supplierId}
                onChange={(e) => setSupplierId(e.target.value)}
                placeholder="Ex: sup-1"
              />

              <Input
                label="Parcelas"
                type="number"
                min="1"
                value={installmentsCount}
                onChange={(e) => setInstallmentsCount(e.target.value)}
              />
            </div>

            <div className="grid grid-cols-3 gap-3">
              <Input
                label="Motorista ID (Opcional)"
                value={driverId}
                onChange={(e) => setDriverId(e.target.value)}
                placeholder="Ex: drv-1"
              />

              <Input
                label="Veículo ID (Opcional)"
                value={vehicleId}
                onChange={(e) => setVehicleId(e.target.value)}
                placeholder="Ex: veh-1"
              />

              <Input
                label="Contrato ID (Opcional)"
                value={contractId}
                onChange={(e) => setContractId(e.target.value)}
                placeholder="Ex: ctr-1"
              />
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-slate-200 dark:border-slate-800">
              <Button type="button" variant="outline" onClick={() => setIsCreateOpen(false)}>
                Cancelar
              </Button>
              <Button type="submit" variant="primary" isLoading={createLoading} className="!bg-indigo-600 hover:!bg-indigo-700 !text-white">
                Lançar Obrigação
              </Button>
            </div>
          </form>
        </ModalContainer>
      )}

      <FinancialObligationDetailsModal
        obligation={detailsTarget}
        type="PAYABLE"
        onClose={() => setDetailsTarget(null)}
      />

      {attachmentEntity && (
        <AttachmentModal
          isOpen={!!attachmentEntity}
          onClose={() => setAttachmentEntity(null)}
          entityType="FinancialPayable"
          entityId={attachmentEntity.id}
          documentType="FINANCIAL_DOCUMENT"
          title={`Anexos: ${attachmentEntity.description}`}
        />
      )}
    </div>
  );
};

