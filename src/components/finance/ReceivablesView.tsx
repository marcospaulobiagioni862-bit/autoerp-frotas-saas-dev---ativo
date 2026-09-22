import React, { useEffect, useMemo, useState } from 'react';
import type { AccountReceivable, Contract, Driver, Vehicle } from '../../types/entities';
import { ObligationStatus, OriginType } from '../../types/enums';
import { FinanceObligationClient } from '../../api/financeObligationClient';
import { FinanceMasterDataClient } from '../../api/financeMasterDataClient';
import { DriverClient } from '../../api/driverClient';
import { VehicleClient } from '../../api/vehicleClient';
import { ContractClient } from '../../api/contractClient';
import { formatDateBR } from '../../shared/utils/date';
import { isAuthenticationExpiredError } from '../../auth/sessionExpiry';
import { TrafficTicketClient, type TrafficTicketFinancialCategory } from '../../api/trafficTicketClient';
import { roundCurrency } from '../../shared/utils/currency';
import { TrendingUp, Search, Filter, RefreshCw, X, Plus } from 'lucide-react';
import { FinancialObligationDetailsModal } from './FinancialObligationDetailsModal';
import { Card, Button, Badge, Input, ConfirmDialog, Skeleton, ModalContainer } from '../ui';

interface ReceivablesViewProps {
  onOpenReceiptModal: (receivable: AccountReceivable) => void;
  onOpenRenegotiationModal: (receivables: AccountReceivable[]) => void;
}

const OTHER_CATEGORY = '__OTHER_DIVERSE__';

function installmentPreview(total: number, count: number, firstDueDate: string): Array<{ number: number; dueDate: string; amount: number }> {
  if (!Number.isFinite(total) || total <= 0 || !Number.isInteger(count) || count < 1 || !firstDueDate) return [];
  const baseAmount = roundCurrency(total / count);
  return Array.from({ length: count }, (_, index) => {
    const number = index + 1;
    const due = new Date(firstDueDate);
    if (number > 1) due.setMonth(due.getMonth() + index);
    const amount = number === count ? roundCurrency(total - baseAmount * (count - 1)) : baseAmount;
    return { number, dueDate: due.toISOString().slice(0, 10), amount };
  });
}

function formatMoney(value: number): string {
  return value.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function statusLabel(status: ObligationStatus, overdue: boolean): string {
  if (overdue && [ObligationStatus.PENDING, ObligationStatus.PARTIALLY_PAID, ObligationStatus.OVERDUE].includes(status)) return 'Vencido';
  switch (status) {
    case ObligationStatus.PENDING: return 'Em aberto';
    case ObligationStatus.PARTIALLY_PAID: return 'Pago parcialmente';
    case ObligationStatus.PAID: return 'Pago';
    case ObligationStatus.CANCELLED: return 'Cancelado';
    case ObligationStatus.RENEGOTIATED: return 'Renegociado';
    case ObligationStatus.WRITTEN_OFF: return 'Baixado';
    case ObligationStatus.OVERDUE: return 'Vencido';
    default: return String(status);
  }
}

function originLabel(originType: OriginType): string {
  switch (originType) {
    case OriginType.CONTRACT_RENT: return 'Aluguel';
    case OriginType.SECURITY_DEPOSIT: return 'Caução';
    case OriginType.TRAFFIC_TICKET_DRIVER: return 'Multa';
    case OriginType.KM_EXCESS: return 'KM excedente';
    case OriginType.MANUAL: return 'Cobrança avulsa';
    default: return 'Cobrança';
  }
}

export const ReceivablesView: React.FC<ReceivablesViewProps> = ({ onOpenReceiptModal, onOpenRenegotiationModal }) => {
  const [receivables, setReceivables] = useState<AccountReceivable[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [detailsTarget, setDetailsTarget] = useState<AccountReceivable | null>(null);
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [categories, setCategories] = useState<TrafficTicketFinancialCategory[]>([]);

  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [description, setDescription] = useState('');
  const [totalAmount, setTotalAmount] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [competenceDate, setCompetenceDate] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [otherCategoryName, setOtherCategoryName] = useState('');
  const [installmentsCount, setInstallmentsCount] = useState('1');
  const [driverId, setDriverId] = useState('');
  const [vehicleId, setVehicleId] = useState('');
  const [contractId, setContractId] = useState('');
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [contracts, setContracts] = useState<Contract[]>([]);
  const [manualOptionsLoading, setManualOptionsLoading] = useState(false);
  const [manualOptionsError, setManualOptionsError] = useState<string | null>(null);
  const [createLoading, setCreateLoading] = useState(false);
  const [cancelTargetId, setCancelTargetId] = useState<string | null>(null);

  const preview = useMemo(
    () => installmentPreview(Number(totalAmount), Math.max(1, Number.parseInt(installmentsCount, 10) || 1), dueDate),
    [totalAmount, installmentsCount, dueDate]
  );

  const loadReceivables = async () => {
    setLoading(true);
    try {
      const [list, categoryList, driverList, vehicleList, contractList] = await Promise.all([
        FinanceObligationClient.listReceivables(),
        TrafficTicketClient.categories(),
        DriverClient.list(),
        VehicleClient.list(),
        ContractClient.list(),
      ]);
      const incomeCategories = categoryList.filter((category) => category.type === 'INCOME' || category.type === 'BOTH');
      setCategories(incomeCategories);
      setDrivers(driverList.filter((item) => !item.isArchived).sort((a, b) => a.fullName.localeCompare(b.fullName, 'pt-BR')));
      setVehicles(vehicleList.filter((item) => !item.isArchived).sort((a, b) => a.plate.localeCompare(b.plate, 'pt-BR')));
      setContracts(contractList.filter((item) => !item.isArchived));
      setCategoryId((current) => current === OTHER_CATEGORY || incomeCategories.some((category) => category.id === current)
        ? current
        : (incomeCategories[0]?.id || ''));
      setReceivables(list.sort((a, b) => new Date(b.dueDate).getTime() - new Date(a.dueDate).getTime()));
    } catch (err) {
      if (isAuthenticationExpiredError(err)) return;
      alert(err instanceof Error ? err.message : 'Erro ao carregar contas a receber.');
      setReceivables([]);
      setCategories([]);
      setDrivers([]);
      setVehicles([]);
      setContracts([]);
      setCategoryId('');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void loadReceivables(); }, []);

  useEffect(() => {
    setManualOptionsLoading(false);
    setManualOptionsError(null);
  }, [isCreateOpen]);

  const resolveCategoryId = async (): Promise<string> => {
    if (categoryId !== OTHER_CATEGORY) return categoryId;
    const name = otherCategoryName.trim();
    if (!name) throw new Error('Informe qual é a categoria em Outros / Diversos.');
    const existing = categories.find((category) => category.name.trim().toLocaleLowerCase('pt-BR') === name.toLocaleLowerCase('pt-BR'));
    if (existing) return existing.id;
    await FinanceMasterDataClient.createCategory({ name, type: 'INCOME' });
    const masterData = await FinanceMasterDataClient.list();
    const created = masterData.categories.find((category) =>
      category.active && (category.type === 'INCOME' || category.type === 'BOTH') &&
      category.name.trim().toLocaleLowerCase('pt-BR') === name.toLocaleLowerCase('pt-BR')
    );
    if (!created) throw new Error('A categoria foi solicitada, mas não pôde ser confirmada pela autoridade financeira.');
    const refreshed = masterData.categories
      .filter((category) => category.active && (category.type === 'INCOME' || category.type === 'BOTH'))
      .map((category) => ({ id: category.id, name: category.name, type: category.type } as TrafficTicketFinancialCategory));
    setCategories(refreshed);
    return created.id;
  };

  const resetCreateForm = () => {
    setDescription('');
    setTotalAmount('');
    setDueDate('');
    setCompetenceDate('');
    setInstallmentsCount('1');
    setDriverId('');
    setVehicleId('');
    setContractId('');
    setOtherCategoryName('');
    setCategoryId(categories[0]?.id || '');
    setManualOptionsError(null);
  };

  const handleCreateReceivable = async (event: React.FormEvent) => {
    event.preventDefault();
    const total = Number(totalAmount);
    const installments = Math.max(1, Number.parseInt(installmentsCount, 10) || 1);
    if (!description.trim() || !Number.isFinite(total) || total <= 0 || !dueDate || !categoryId || !driverId) {
      alert('Preencha motorista/responsável, descrição, valor maior que zero, vencimento e categoria.');
      return;
    }
    if (installments > 120) {
      alert('A quantidade de parcelas deve estar entre 1 e 120.');
      return;
    }
    setCreateLoading(true);
    try {
      const effectiveCategoryId = await resolveCategoryId();
      await FinanceObligationClient.createReceivable({
        originType: OriginType.MANUAL,
        originId: `manual-${Date.now()}`,
        categoryId: effectiveCategoryId,
        description: description.trim(),
        totalAmount: total,
        dueDate,
        competenceDate: competenceDate || dueDate,
        installmentsCount: installments,
        driverId: driverId || undefined,
        vehicleId: vehicleId || undefined,
        contractId: contractId.trim() || undefined,
      });
      setActionMessage(installments > 1 ? `${installments} parcelas a receber criadas com sucesso.` : 'Novo título a receber criado com sucesso.');
      setIsCreateOpen(false);
      resetCreateForm();
      await loadReceivables();
    } catch (err) {
      if (isAuthenticationExpiredError(err)) return;
      alert(err instanceof Error ? err.message : 'Erro ao criar título a receber.');
    } finally {
      setCreateLoading(false);
    }
  };

  const confirmCancel = async () => {
    if (!cancelTargetId) return;
    try {
      const item = receivables.find((receivable) => receivable.id === cancelTargetId);
      if (!item) throw new Error('Título a receber não encontrado na lista atual.');
      await FinanceObligationClient.cancelReceivable(cancelTargetId, 'Cancelamento via interface');
      setActionMessage('Título a receber cancelado com sucesso.');
      setCancelTargetId(null);
      await loadReceivables();
    } catch (err) {
      if (isAuthenticationExpiredError(err)) return;
      alert(err instanceof Error ? err.message : 'Erro ao cancelar título.');
      setCancelTargetId(null);
    }
  };

  const toggleSelect = (id: string) => setSelectedIds((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]);
  const selectedReceivables = receivables.filter((item) => selectedIds.includes(item.id));
  const filtered = receivables.filter((item) => {
    const needle = searchTerm.trim().toLocaleLowerCase('pt-BR');
    const driverName = item.driverId ? drivers.find((driver) => driver.id === item.driverId)?.fullName || '' : '';
    const vehicleLabel = item.vehicleId ? (() => {
      const vehicle = vehicles.find((entry) => entry.id === item.vehicleId);
      return vehicle ? `${vehicle.plate} ${vehicle.brand} ${vehicle.model}` : '';
    })() : '';
    const contractNumber = item.contractId ? contracts.find((contract) => contract.id === item.contractId)?.contractNumber || '' : '';
    const matchesSearch = !needle || [item.description, driverName, vehicleLabel, contractNumber].some((value) => value.toLocaleLowerCase('pt-BR').includes(needle));
    const overdue = item.balanceAmount > 0 && item.dueDate < new Date().toISOString().slice(0, 10) &&
      ![ObligationStatus.PAID, ObligationStatus.CANCELLED, ObligationStatus.RENEGOTIATED, ObligationStatus.WRITTEN_OFF].includes(item.status);
    const matchesStatus = statusFilter === 'ALL'
      || (statusFilter === 'OVERDUE_VIEW' ? overdue : item.status === statusFilter);
    return matchesSearch && matchesStatus;
  });

  return (
    <div className="p-4 sm:p-6 space-y-6 max-w-7xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2"><TrendingUp className="w-6 h-6 text-emerald-600" />Contas a Receber</h2>
          <p className="text-xs text-slate-500 mt-0.5">Gestão de mensalidades, cobranças de motoristas e cauções a receber.</p>
        </div>
        <div className="flex gap-2">
          {selectedIds.length > 0 && <Button onClick={() => onOpenRenegotiationModal(selectedReceivables)} variant="warning" size="sm" icon={<RefreshCw className="w-4 h-4" />}>Renegociar Selecionados ({selectedIds.length})</Button>}
          <Button onClick={() => setIsCreateOpen(true)} variant="primary" size="sm" icon={<Plus className="w-4 h-4" />} className="!bg-emerald-600 hover:!bg-emerald-700 !text-white font-semibold">Nova cobrança</Button>
        </div>
      </div>

      {actionMessage && <div className="p-3 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-900/50 rounded-lg text-xs text-emerald-800 dark:text-emerald-300 flex items-center justify-between"><span>{actionMessage}</span><button onClick={() => setActionMessage(null)} className="p-1 font-bold text-slate-500 hover:text-slate-700"><X className="w-4 h-4" /></button></div>}

      <Card padding="sm">
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="w-full sm:w-80"><Input type="text" placeholder="Buscar por descrição, motorista, veículo..." value={searchTerm} onChange={(event) => setSearchTerm(event.target.value)} icon={<Search className="w-4 h-4 text-slate-400" />} /></div>
          <div className="flex items-center gap-1.5 w-full sm:w-auto overflow-x-auto pb-1 sm:pb-0">
            <Filter className="w-3.5 h-3.5 text-slate-400 shrink-0 mr-1" />
            {[
              ['ALL', 'Todos'],
              [ObligationStatus.PENDING, 'Em aberto'],
              [ObligationStatus.PARTIALLY_PAID, 'Pagos parcialmente'],
              ['OVERDUE_VIEW', 'Vencidos'],
              [ObligationStatus.PAID, 'Pagos'],
              [ObligationStatus.CANCELLED, 'Cancelados'],
              [ObligationStatus.RENEGOTIATED, 'Renegociados'],
            ].map(([status, label]) => <button key={status} onClick={() => setStatusFilter(status)} className={`px-3 py-1.5 rounded-lg text-xs font-medium shrink-0 ${statusFilter === status ? 'bg-emerald-600 text-white' : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400'}`}>{label}</button>)}
          </div>
        </div>
      </Card>

      <Card padding="none">
        {loading ? <div className="p-6 space-y-3"><Skeleton className="h-10 w-full" /><Skeleton className="h-10 w-full" /><Skeleton className="h-10 w-full" /></div> : (
          <div className="overflow-x-auto"><table className="w-full text-left text-xs">
            <thead className="bg-slate-50 dark:bg-slate-800/60 text-slate-500 font-semibold uppercase tracking-wider border-b border-slate-100 dark:border-slate-800"><tr><th className="p-3.5 w-10 text-center"><input aria-label="Selecionar títulos em aberto" type="checkbox" checked={filtered.some((item) => [ObligationStatus.PENDING, ObligationStatus.PARTIALLY_PAID, ObligationStatus.OVERDUE].includes(item.status)) && filtered.filter((item) => [ObligationStatus.PENDING, ObligationStatus.PARTIALLY_PAID, ObligationStatus.OVERDUE].includes(item.status)).every((item) => selectedIds.includes(item.id))} onChange={(event) => { const eligible = filtered.filter((item) => [ObligationStatus.PENDING, ObligationStatus.PARTIALLY_PAID, ObligationStatus.OVERDUE].includes(item.status)).map((item) => item.id); setSelectedIds((current) => event.target.checked ? Array.from(new Set([...current, ...eligible])) : current.filter((id) => !eligible.includes(id))); }} /></th><th className="p-3.5">Descrição / Origem</th><th className="p-3.5">Vencimento</th><th className="p-3.5">Valor Original</th><th className="p-3.5">Saldo Restante</th><th className="p-3.5 text-center">Status</th><th className="p-3.5 text-right">Ações Operacionais</th></tr></thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-slate-700 dark:text-slate-300">
              {filtered.map((item) => {
                const isPending = [ObligationStatus.PENDING, ObligationStatus.PARTIALLY_PAID, ObligationStatus.OVERDUE].includes(item.status);
                const isPaid = item.status === ObligationStatus.PAID;
                const isOverdue = isPending && item.balanceAmount > 0 && item.dueDate < new Date().toISOString().split('T')[0];
                const driverName = item.driverId ? drivers.find((driver) => driver.id === item.driverId)?.fullName : undefined;
                const vehicle = item.vehicleId ? vehicles.find((entry) => entry.id === item.vehicleId) : undefined;
                const contractNumber = item.contractId ? contracts.find((contract) => contract.id === item.contractId)?.contractNumber : undefined;
                const context = [driverName, vehicle?.plate, contractNumber].filter(Boolean).join(' • ');
                return <tr key={item.id} className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40">
                  <td className="p-3.5 text-center"><input type="checkbox" checked={selectedIds.includes(item.id)} onChange={() => toggleSelect(item.id)} disabled={!isPending} /></td>
                  <td className="p-3.5"><div className="font-semibold text-slate-900 dark:text-slate-100">{originLabel(item.originType)}{contractNumber ? ` • ${contractNumber}` : ''}</div><div className="text-[11px] text-slate-500">{context || item.description}</div></td>
                  <td className="p-3.5 font-mono">{formatDateBR(item.dueDate)}{isOverdue && <span className="block text-[10px] text-red-600 font-bold">Em atraso</span>}</td>
                  <td className="p-3.5 font-mono font-semibold">R$ {formatMoney(item.originalAmount)}</td>
                  <td className="p-3.5 font-mono font-bold text-emerald-700 dark:text-emerald-400"><span className="block">R$ {formatMoney(item.balanceAmount)}</span>{item.paidAmount > 0 && <span className="block text-[10px] font-normal text-slate-500">Recebido R$ {formatMoney(item.paidAmount)}</span>}</td>
                  <td className="p-3.5 text-center"><Badge variant={isPaid ? 'success' : isOverdue ? 'danger' : isPending ? 'warning' : 'neutral'}>{statusLabel(item.status, isOverdue)}</Badge></td>
                  <td className="p-3.5 text-right"><div className="flex justify-end gap-2">{isPending && <Button size="sm" variant="primary" onClick={() => onOpenReceiptModal(item)}>Receber</Button>}<Button size="sm" variant="outline" onClick={() => setDetailsTarget(item)}>Detalhes</Button>{isPending && <details className="relative"><summary aria-label="Mais ações" className="list-none cursor-pointer rounded-lg border border-slate-200 px-3 py-1.5 text-base font-bold text-slate-600 dark:border-slate-700 dark:text-slate-300">⋮</summary><div className="absolute right-0 z-20 mt-1 w-40 rounded-xl border border-slate-200 bg-white p-2 shadow-xl dark:border-slate-700 dark:bg-slate-900"><button className="w-full rounded-lg px-2.5 py-2 text-left text-xs font-semibold text-rose-700 hover:bg-rose-50 dark:text-rose-300 dark:hover:bg-rose-950/30" onClick={() => setCancelTargetId(item.id)}>Cancelar título</button></div></details>}</div></td>
                </tr>;
              })}
            </tbody>
          </table></div>
        )}
      </Card>

      <ConfirmDialog isOpen={!!cancelTargetId} title="Cancelar Título a Receber" message="Deseja realmente cancelar este título a receber? Esta operação será auditada e processada no servidor." confirmText="Confirmar Cancelamento" confirmVariant="danger" onConfirm={confirmCancel} onCancel={() => setCancelTargetId(null)} />

      {isCreateOpen && <ModalContainer isOpen={isCreateOpen} onClose={() => setIsCreateOpen(false)} title="Nova cobrança" maxWidth="max-w-2xl">
        <form onSubmit={handleCreateReceivable} className="space-y-4">
          {manualOptionsError && <div className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-xs text-rose-700">{manualOptionsError}</div>}
          <Input label="Descrição da cobrança *" value={description} onChange={(event) => setDescription(event.target.value)} placeholder="Ex: Mensalidade avulsa, cobrança de sinistro..." required />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4"><Input label="Valor Total (R$) *" type="number" min="0.01" step="0.01" value={totalAmount} onChange={(event) => setTotalAmount(event.target.value)} required /><Input label="Primeiro vencimento *" type="date" value={dueDate} onChange={(event) => setDueDate(event.target.value)} required /></div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4"><Input label="Data de Competência" type="date" value={competenceDate} onChange={(event) => setCompetenceDate(event.target.value)} /><Input label="Parcelas" type="number" min="1" max="120" value={installmentsCount} onChange={(event) => setInstallmentsCount(event.target.value)} /></div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1"><label className="text-xs font-semibold text-slate-500 block">Motorista / responsável *</label><select value={driverId} onChange={(event) => setDriverId(event.target.value)} disabled={manualOptionsLoading} className="control w-full"><option value="">Selecione o motorista</option>{drivers.map((driver) => <option key={driver.id} value={driver.id}>{driver.fullName} • CPF {driver.cpf}</option>)}</select></div>
            <div className="space-y-1"><label className="text-xs font-semibold text-slate-500 block">Veículo vinculado</label><select value={vehicleId} onChange={(event) => setVehicleId(event.target.value)} disabled={manualOptionsLoading} className="control w-full"><option value="">Sem veículo</option>{vehicles.map((vehicle) => <option key={vehicle.id} value={vehicle.id}>{vehicle.plate} • {vehicle.brand} {vehicle.model}</option>)}</select></div>
          </div>

          <div className="space-y-1"><label className="text-xs font-semibold text-slate-500 block">Contrato vinculado (opcional)</label><select value={contractId} onChange={(event) => setContractId(event.target.value)} className="control w-full"><option value="">Sem contrato</option>{contracts.filter((contract) => !driverId || contract.driverId === driverId).map((contract) => <option key={contract.id} value={contract.id}>{contract.contractNumber}</option>)}</select></div>

          <div className="space-y-1"><label className="text-xs font-semibold text-slate-500 block">Categoria *</label><select value={categoryId} onChange={(event) => setCategoryId(event.target.value)} className="control w-full" required><option value="">Selecione uma categoria de receita</option>{categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}<option value={OTHER_CATEGORY}>Outros / Diversos…</option></select></div>
          {categoryId === OTHER_CATEGORY && <Input label="Qual categoria? *" value={otherCategoryName} onChange={(event) => setOtherCategoryName(event.target.value)} placeholder="Ex: Avaria, taxa administrativa, outros" required />}

          {preview.length > 1 && <div className="rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden"><div className="px-3 py-2 bg-slate-50 dark:bg-slate-900 text-xs font-semibold">Prévia das parcelas</div><div className="max-h-48 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800">{preview.map((item) => <div key={item.number} className="flex items-center justify-between px-3 py-2 text-xs"><span>Parcela {item.number}/{preview.length} • vencimento {item.dueDate}</span><b>R$ {formatMoney(item.amount)}</b></div>)}</div><div className="px-3 py-2 text-[11px] text-slate-500">Soma: R$ {formatMoney(preview.reduce((sum, item) => roundCurrency(sum + item.amount), 0))}. As parcelas seguintes usam periodicidade mensal, igual à autoridade financeira atual.</div></div>}

          <div className="flex justify-end gap-2 pt-2 border-t border-slate-200 dark:border-slate-800"><Button type="button" variant="outline" onClick={() => setIsCreateOpen(false)}>Cancelar</Button><Button type="submit" variant="primary" isLoading={createLoading} disabled={manualOptionsLoading}>Criar cobrança</Button></div>
        </form>
      </ModalContainer>}

      <FinancialObligationDetailsModal obligation={detailsTarget} type="RECEIVABLE" onClose={() => setDetailsTarget(null)} />
    </div>
  );
};
