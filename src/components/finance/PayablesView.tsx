import React, { useEffect, useState } from 'react';
import type { AccountPayable, Contract, Driver, Supplier, Vehicle } from '../../types/entities';
import { ObligationStatus, OriginType } from '../../types/enums';
import { FinanceObligationClient } from '../../api/financeObligationClient';
import { MaintenanceClient } from '../../api/maintenanceClient';
import { DriverClient } from '../../api/driverClient';
import { VehicleClient } from '../../api/vehicleClient';
import { ContractClient } from '../../api/contractClient';
import { formatDateBR } from '../../shared/utils/date';
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
    PENDING: 'Em aberto',
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
  const [payables, setPayables] = useState<AccountPayable[]>([]);
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [originFilter, setOriginFilter] = useState<string>('ALL');
  const [loading, setLoading] = useState<boolean>(true);
  const [attachmentEntity, setAttachmentEntity] = useState<any>(null);
  const [detailsTarget, setDetailsTarget] = useState<AccountPayable | null>(null);
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [categories, setCategories] = useState<TrafficTicketFinancialCategory[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [contracts, setContracts] = useState<Contract[]>([]);

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
      const [list, categoryList, supplierList, driverList, vehicleList, contractList] = await Promise.all([
        FinanceObligationClient.listPayables(),
        TrafficTicketClient.categories(),
        MaintenanceClient.listSuppliers(),
        DriverClient.list(),
        VehicleClient.list(),
        ContractClient.list(),
      ]);
      const expenseCategories = categoryList.filter((category) => category.type === 'EXPENSE' || category.type === 'BOTH');
      setCategories(expenseCategories);
      setSuppliers(supplierList.filter((item) => item.status === 'ACTIVE').sort((a, b) => a.name.localeCompare(b.name, 'pt-BR')));
      setDrivers(driverList.filter((item) => !item.isArchived).sort((a, b) => a.fullName.localeCompare(b.fullName, 'pt-BR')));
      setVehicles(vehicleList.filter((item) => !item.isArchived).sort((a, b) => a.plate.localeCompare(b.plate, 'pt-BR')));
      setContracts(contractList.filter((item) => !item.isArchived));
      setCategoryId((current) => expenseCategories.some((category) => category.id === current) ? current : (expenseCategories[0]?.id || ''));
      setPayables(list.sort((a, b) => new Date(b.dueDate).getTime() - new Date(a.dueDate).getTime()));
    } catch (err) {
      if (isAuthenticationExpiredError(err)) return;
      const message = err instanceof Error ? err.message : 'Erro ao carregar contas a pagar.';
      alert(message);
      setPayables([]);
      setCategories([]);
      setSuppliers([]);
      setDrivers([]);
      setVehicles([]);
      setContracts([]);
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
      await FinanceObligationClient.createPayable({
        originType: OriginType.MANUAL,
        originId: 'manual-' + Date.now(),
        categoryId,
        description,
        totalAmount: parseFloat(totalAmount),
        dueDate,
        competenceDate: competenceDate || dueDate,
        installmentsCount: parseInt(installmentsCount) || 1,
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

  const today = new Date().toISOString().slice(0, 10);
  const filtered = payables.filter((p) => {
    const term = searchTerm.trim().toLocaleLowerCase('pt-BR');
    const categoryName = categories.find((category) => category.id === p.categoryId)?.name || '';
    const supplierName = p.supplierId ? suppliers.find((item) => item.id === p.supplierId)?.name || '' : '';
    const driverName = p.driverId ? drivers.find((item) => item.id === p.driverId)?.fullName || '' : '';
    const vehicle = p.vehicleId ? vehicles.find((item) => item.id === p.vehicleId) : undefined;
    const vehicleLabel = vehicle ? `${vehicle.plate} ${vehicle.brand} ${vehicle.model}` : '';
    const contractNumber = p.contractId ? contracts.find((item) => item.id === p.contractId)?.contractNumber || '' : '';
    const matchesSearch =
      !term ||
      [p.description, originLabel(String(p.originType)), categoryName, supplierName, driverName, vehicleLabel, contractNumber]
        .some((value) => value.toLocaleLowerCase('pt-BR').includes(term));

    const overdue = p.balanceAmount > 0 && p.dueDate < today &&
      ![ObligationStatus.PAID, ObligationStatus.CANCELLED, ObligationStatus.RENEGOTIATED, ObligationStatus.WRITTEN_OFF].includes(p.status);
    const matchesStatus = statusFilter === 'ALL' || (statusFilter === 'OVERDUE_VIEW' ? overdue : p.status === statusFilter);
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
            Contas a Pagar
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Obrigações da empresa, despesas operacionais e pagamentos.
          </p>
        </div>

        <Button
          onClick={() => setIsCreateOpen(true)}
          variant="outline"
          size="sm"
          icon={<Plus className="w-4 h-4" />}
          className="font-semibold"
        >
          Lançamento manual excepcional
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

          <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
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
            {['ALL', ObligationStatus.PENDING, ObligationStatus.PARTIALLY_PAID, 'OVERDUE_VIEW', ObligationStatus.PAID, ObligationStatus.CANCELLED].map((st) => (
              <button
                key={st}
                onClick={() => setStatusFilter(st)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors shrink-0 focus:outline-none focus:ring-2 focus:ring-indigo-500 ${
                  statusFilter === st
                    ? 'bg-indigo-600 text-white font-semibold shadow-2xs'
                    : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700'
                }`}
              >
                {st === 'ALL' ? 'Todos' : st === 'OVERDUE_VIEW' ? 'Vencidos' : statusLabel(String(st))}
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
          <div className="overflow-x-auto md:overflow-x-visible">
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
                  const isPending = [ObligationStatus.PENDING, ObligationStatus.PARTIALLY_PAID, ObligationStatus.OVERDUE].includes(item.status);
                  const isPaid = item.status === ObligationStatus.PAID;
                  const isOverdue = isPending && item.balanceAmount > 0 && item.dueDate < today;
                  const supplierName = item.supplierId ? suppliers.find((entry) => entry.id === item.supplierId)?.name : undefined;
                  const driverName = item.driverId ? drivers.find((entry) => entry.id === item.driverId)?.fullName : undefined;
                  const vehicle = item.vehicleId ? vehicles.find((entry) => entry.id === item.vehicleId) : undefined;
                  const contractNumber = item.contractId ? contracts.find((entry) => entry.id === item.contractId)?.contractNumber : undefined;
                  const context = [
                    supplierName && `Fornecedor: ${supplierName}`,
                    vehicle && `Veículo: ${vehicle.plate}`,
                    driverName && `Responsável: ${driverName}`,
                    contractNumber && `Contrato: ${contractNumber}`,
                  ].filter(Boolean);

                  return (
                    <tr key={item.id} className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition-colors">
                      <td className="p-3.5">
                        <div className="font-semibold text-slate-900 dark:text-slate-100">
                          {item.description}
                          {item.installmentNumber && item.totalInstallments ? <span className="ml-1 text-slate-500 font-normal">• Parcela {item.installmentNumber}/{item.totalInstallments}</span> : null}
                        </div>
                        <div className="mt-0.5 flex flex-wrap gap-x-2 gap-y-0.5 text-[11px] text-slate-500">
                          <span>Origem: <strong>{originLabel(String(item.originType))}</strong></span>
                          <span>Categoria: {categories.find((category) => category.id === item.categoryId)?.name || 'Não informada'}</span>
                        </div>
                        {context.length > 0 && <div className="mt-0.5 text-[11px] text-slate-500">{context.join(' • ')}</div>}
                      </td>
                      <td className="p-3.5 font-mono tabular-nums">
                        {formatDateBR(item.dueDate)}
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
                          {isOverdue ? 'Vencido' : statusLabel(String(item.status))}
                        </Badge>
                      </td>
                      <td className="p-3.5 text-right">
                        <div className="flex justify-end gap-2">
                          {isPending && (
                            <Button size="sm" variant="primary" onClick={() => onOpenPaymentModal(item)} className="!bg-indigo-600 hover:!bg-indigo-700 !text-white font-semibold">
                              Pagar
                            </Button>
                          )}
                          <Button size="sm" variant="outline" onClick={() => setDetailsTarget(item)}>Detalhes</Button>
                          {isPending && (
                            <details className="relative">
                              <summary aria-label="Mais ações" className="list-none cursor-pointer rounded-lg border border-slate-200 px-3 py-1.5 text-base font-bold text-slate-600 dark:border-slate-700 dark:text-slate-300">⋮</summary>
                              <div className="absolute right-0 z-20 mt-1 w-40 rounded-xl border border-slate-200 bg-white p-2 shadow-xl dark:border-slate-700 dark:bg-slate-900">
                                <button className="w-full rounded-lg px-2.5 py-2 text-left text-xs font-semibold text-rose-700 hover:bg-rose-50 dark:text-rose-300 dark:hover:bg-rose-950/30" onClick={() => setCancelTargetId(item.id)}>Cancelar título</button>
                              </div>
                            </details>
                          )}
                        </div>
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
          title="Lançamento manual excepcional"
          maxWidth="max-w-2xl"
        >
          <form onSubmit={handleCreatePayable} className="space-y-4">
            <p className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-300">
              Use este lançamento para despesas excepcionais. Obrigações de manutenção, seguro, rastreador, documentação e multas devem continuar sendo geradas pela origem operacional correspondente.
            </p>
            <Input
              label="Descrição da despesa *"
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

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-500 block">Fornecedor / beneficiário</label>
                <select value={supplierId} onChange={(e) => setSupplierId(e.target.value)} className="control w-full">
                  <option value="">Sem fornecedor cadastrado</option>
                  {suppliers.map((supplier) => <option key={supplier.id} value={supplier.id}>{supplier.name}</option>)}
                </select>
              </div>
              <Input label="Parcelas" type="number" min="1" value={installmentsCount} onChange={(e) => setInstallmentsCount(e.target.value)} />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-500 block">Veículo vinculado</label>
                <select value={vehicleId} onChange={(e) => setVehicleId(e.target.value)} className="control w-full">
                  <option value="">Sem veículo</option>
                  {vehicles.map((vehicle) => <option key={vehicle.id} value={vehicle.id}>{vehicle.plate} • {vehicle.brand} {vehicle.model}</option>)}
                </select>
              </div>
              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-500 block">Responsável / motorista</label>
                <select value={driverId} onChange={(e) => setDriverId(e.target.value)} className="control w-full">
                  <option value="">Move Flex / empresa</option>
                  {drivers.map((driver) => <option key={driver.id} value={driver.id}>{driver.fullName}</option>)}
                </select>
              </div>
            </div>
            <div className="space-y-1">
              <label className="text-xs font-semibold text-slate-500 block">Contrato vinculado</label>
              <select value={contractId} onChange={(e) => setContractId(e.target.value)} className="control w-full">
                <option value="">Sem contrato</option>
                {contracts.filter((contract) => !driverId || contract.driverId === driverId).map((contract) => <option key={contract.id} value={contract.id}>{contract.contractNumber}</option>)}
              </select>
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-slate-200 dark:border-slate-800">
              <Button type="button" variant="outline" onClick={() => setIsCreateOpen(false)}>
                Cancelar
              </Button>
              <Button type="submit" variant="primary" isLoading={createLoading} className="!bg-indigo-600 hover:!bg-indigo-700 !text-white">
                Criar despesa
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

