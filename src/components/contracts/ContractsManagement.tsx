import React, { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, Calendar, Car, DollarSign, Eye, FileText, Gauge, MessageSquare, Plus, Search, Settings2, TrendingUp, User } from 'lucide-react';
import { Badge, Button, Card, Input, PageHeader } from '../ui';
import { ContractClient } from '../../api/contractClient';
import { DriverClient } from '../../api/driverClient';
import { VehicleClient } from '../../api/vehicleClient';
import { WhatsappClient } from '../../api/whatsappClient';
import { FinanceObligationClient } from '../../api/financeObligationClient';
import type { AccountReceivable, Contract, Driver, Vehicle } from '../../types/entities';
import { ContractStatus } from '../../types/enums';
import { LazyModuleErrorBoundary } from '../common/LazyModuleErrorBoundary';
import { formatDateBR, getOperationalISODate } from '../../shared/utils/date';

const ContractFormModal=lazy(()=>import('./ContractFormModal').then(module=>({default:module.ContractFormModal})));
const ContractDetailsModal=lazy(()=>import('./ContractDetailsModal').then(module=>({default:module.ContractDetailsModal})));
const ContractTemplateManagementModal=lazy(()=>import('./ContractTemplateManagementModal').then(module=>({default:module.ContractTemplateManagementModal})));

interface ContractsManagementProps {
  companyId: string;
}

export function activeContractAction(
  contract: Pick<Contract, 'status' | 'startDate'>,
  now = new Date(),
): 'CANCEL' | 'CLOSE' | null {
  if (contract.status !== ContractStatus.ACTIVE) return null;
  return contract.startDate > getOperationalISODate(now) ? 'CANCEL' : 'CLOSE';
}

export const contractStatusLabel=(status:ContractStatus,signedContractUrl?:string,hasSignedEvidence?:boolean):string=>{
  const signed=hasSignedEvidence??Boolean(signedContractUrl);
  switch(status){
    case ContractStatus.DRAFT:return signed ? 'Assinado • aguardando ativação' : 'Rascunho';
    case ContractStatus.AWAITING_SIGNATURE:return signed ? 'Assinado • aguardando ativação' : 'Aguardando assinatura';
    case ContractStatus.ACTIVE:return 'Ativo';
    case ContractStatus.SUSPENDED:return 'Suspenso';
    case ContractStatus.FINISHED:return 'Finalizado';
    case ContractStatus.CLOSED:return 'Encerrado';
    case ContractStatus.CANCELLED:return 'Cancelado';
    case ContractStatus.ARCHIVED:return 'Arquivado';
    default:return status;
  }
};

export const ContractsManagement: React.FC<ContractsManagementProps> = ({ companyId }) => {
  const requestVersionRef = useRef(0);
  const [contracts, setContracts] = useState<Contract[]>([]);
  const [vehicles, setVehicles] = useState<Record<string, Vehicle>>({});
  const [drivers, setDrivers] = useState<Record<string, Driver>>({});
  const [receivables, setReceivables] = useState<Record<string, AccountReceivable[]>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [templateManagerOpen, setTemplateManagerOpen] = useState(false);
  const [contractToEdit, setContractToEdit] = useState<Contract | null>(null);
  const [selectedContractId, setSelectedContractId] = useState<string | null>(null);
  const [detailsFocus, setDetailsFocus] = useState<'OVERVIEW' | 'PDF_SIGNATURE' | 'FINANCIAL'>('OVERVIEW');

  const loadData = async () => {
    const version = ++requestVersionRef.current;
    setLoading(true);
    setError(null);
    try {
      const [contractList, vehicleList, driverList, receivableList] = await Promise.all([
        ContractClient.list(),
        VehicleClient.list(),
        DriverClient.list(),
        FinanceObligationClient.listReceivables(),
      ]);
      if (version !== requestVersionRef.current) return;
      setContracts(contractList);
      setVehicles(Object.fromEntries(vehicleList.map((item) => [item.id, item])));
      setDrivers(Object.fromEntries(driverList.map((item) => [item.id, item])));
      const grouped: Record<string, AccountReceivable[]> = {};
      for (const item of receivableList) {
        if (!item.contractId) continue;
        (grouped[item.contractId] ||= []).push(item);
      }
      setReceivables(grouped);
    } catch (caught) {
      if (version !== requestVersionRef.current) return;
      setContracts([]);
      setVehicles({});
      setDrivers({});
      setReceivables({});
      setError(caught instanceof Error ? caught.message : 'Erro ao carregar contratos.');
    } finally {
      if (version === requestVersionRef.current) setLoading(false);
    }
  };

  useEffect(() => {
    setContracts([]);
    setVehicles({});
    setDrivers({});
    setReceivables({});
    setSelectedContractId(null);
    setContractToEdit(null);
    setFormOpen(false);
    setDetailsOpen(false);
    setTemplateManagerOpen(false);
    void loadData();
    return () => { requestVersionRef.current += 1; };
  }, [companyId]);

  const runAction = async (contractId: string, action: () => Promise<unknown>) => {
    setActionLoadingId(contractId);
    setError(null);
    try {
      await action();
      await loadData();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Falha na operação do contrato.');
    } finally {
      setActionLoadingId(null);
    }
  };

  const openContractDetails = (id: string, focus: 'OVERVIEW' | 'PDF_SIGNATURE' | 'FINANCIAL' = 'OVERVIEW') => {
    setSelectedContractId(id);
    setDetailsFocus(focus);
    setDetailsOpen(true);
  };
  const handleContractSaved = async (result: { contract: Contract; openPdfSignature: boolean; warning?: string }) => {
    setFormOpen(false);
    setContractToEdit(null);
    await loadData();
    if (result.warning) setError(result.warning);
    if (result.openPdfSignature) openContractDetails(result.contract.id, 'PDF_SIGNATURE');
  };
  const handleClose = (id: string) => {
    if (!confirm('Deseja encerrar este contrato? O vínculo do veículo será liberado de forma atômica.')) return;
    return runAction(id, () => ContractClient.close(id, { reason: 'Encerrado via gestão de contratos' }));
  };
  const handleCancel = (id: string) => {
    if (!confirm('Deseja cancelar este contrato antes do início da vigência? O vínculo do veículo será liberado de forma atômica.')) return;
    return runAction(id, () => ContractClient.cancel(id, 'Cancelado antes do início da vigência via gestão de contratos'));
  };
  const handleArchive = (id: string) => {
    if (!confirm('Deseja arquivar este contrato? O histórico será preservado.')) return;
    return runAction(id, () => ContractClient.archive(id, 'Arquivado via gestão de contratos'));
  };

  const handleSendWhatsApp = async (contractId: string) => {
    setActionLoadingId(contractId);
    setError(null);
    try {
      const res = await ContractClient.getShareLink(contractId);
      if (res.whatsappUrl) {
        window.open(res.whatsappUrl, '_blank', 'noopener,noreferrer');
      } else {
        alert(`Link do contrato gerado:\n${res.publicPdfUrl}\n\nO motorista não possui telefone válido com DDD cadastrado para abertura direta do WhatsApp.`);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao gerar link para o WhatsApp.');
    } finally {
      setActionLoadingId(null);
    }
  };

  const handleRequestKm = async (contractId: string) => {
    setActionLoadingId(contractId);
    setError(null);
    try {
      const res = await WhatsappClient.getWaLink('KM_REQUEST', contractId);
      window.open(res.whatsappUrl, '_blank', 'noopener,noreferrer');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao gerar link de pedido de KM.');
    } finally {
      setActionLoadingId(null);
    }
  };

  const activeContracts = contracts.filter((item) => item.status === ContractStatus.ACTIVE);
  const totalVehicles = Object.keys(vehicles).length;
  const occupancyRate = totalVehicles ? ((activeContracts.length / totalVehicles) * 100).toFixed(1) : '0.0';
  const weeklyRevenue = activeContracts.reduce((sum, item) => {
    if (item.billingPeriodicity === 'MONTHLY') return sum + item.rentalAmount / 4;
    if (item.billingPeriodicity === 'WEEKLY') return sum + item.rentalAmount;
    return sum + item.rentalAmount;
  }, 0);
  const today = new Date().toISOString().slice(0, 10);
  const overdueContracts = contracts.filter((item) =>
    (receivables[item.id] || []).some((receivable) => receivable.balanceAmount > 0 && receivable.dueDate < today && receivable.status !== 'CANCELLED')
  );

  const filteredContracts = useMemo(() => {
    const search = searchTerm.trim().toLowerCase();
    return contracts.filter((item) => {
      if (statusFilter !== 'ALL' && item.status !== statusFilter) return false;
      if (!search) return true;
      const vehicle = vehicles[item.vehicleId];
      const driver = drivers[item.driverId];
      return item.contractNumber.toLowerCase().includes(search)
        || Boolean(vehicle?.plate.toLowerCase().includes(search))
        || Boolean(vehicle?.model.toLowerCase().includes(search))
        || Boolean(driver?.fullName.toLowerCase().includes(search));
    });
  }, [contracts, drivers, vehicles, searchTerm, statusFilter]);

  const contractModalResetKey = formOpen
    ? `form:${contractToEdit?.id ?? 'new'}`
    : detailsOpen
      ? `details:${selectedContractId ?? 'none'}`
      : templateManagerOpen
        ? 'templates'
        : 'none';

  return (
    <div className="p-4 sm:p-6 space-y-6 max-w-7xl mx-auto">
      <PageHeader
        title="Contratos"
        description="Ciclo de vida, vínculo motorista-veículo e faturamento de locação"
        breadcrumb="Operação • Gestão de Contratos"
        primaryAction={{
          label: 'Novo Contrato',
          onClick: () => { setContractToEdit(null); setFormOpen(true); },
          icon: <Plus className="w-4 h-4" />,
        }}
        secondaryActions={
          <Button size="sm" variant="outline" onClick={() => setTemplateManagerOpen(true)}>
            <Settings2 className="w-4 h-4" />Modelos de Contrato
          </Button>
        }
      />

      {error && (
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-300">
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card padding="sm"><Kpi icon={<FileText className="w-5 h-5" />} label="Contratos Ativos" value={String(activeContracts.length)} helper="Em locação" /></Card>
        <Card padding="sm"><Kpi icon={<TrendingUp className="w-5 h-5" />} label="Taxa de Ocupação" value={`${occupancyRate}%`} helper={`${activeContracts.length} de ${totalVehicles} veículos`} /></Card>
        <Card padding="sm"><Kpi icon={<DollarSign className="w-5 h-5" />} label="Receita Est. / Sem" value={weeklyRevenue.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })} helper="Contratos ativos" /></Card>
        <Card padding="sm"><Kpi icon={<AlertTriangle className="w-5 h-5" />} label="Com Atraso" value={String(overdueContracts.length)} helper="Saldo vencido" /></Card>
      </div>

      <Card padding="sm">
        <div className="flex flex-col md:flex-row gap-3 md:items-center md:justify-between">
          <div className="md:w-96">
            <Input value={searchTerm} onChange={(event) => setSearchTerm(event.target.value)} placeholder="Buscar contrato, placa ou motorista..." icon={<Search className="w-4 h-4" />} />
          </div>
          <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)} className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900">
            <option value="ALL">Todos os status</option>
            {Object.values(ContractStatus).filter((value) => value !== ContractStatus.ARCHIVED).map((value) => <option key={value} value={value}>{contractStatusLabel(value)}</option>)}
          </select>
        </div>
      </Card>

      <Card padding="none">
        {loading ? (
          <div className="p-10 text-center text-sm text-slate-500">Carregando contratos...</div>
        ) : filteredContracts.length === 0 ? (
          <div className="p-10 text-center text-sm text-slate-500">Nenhum contrato encontrado.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 dark:bg-slate-900/70 text-slate-500 text-xs uppercase">
                <tr>
                  <th className="px-4 py-3 text-left">Contrato</th>
                  <th className="px-4 py-3 text-left">Veículo</th>
                  <th className="px-4 py-3 text-left">Motorista</th>
                  <th className="px-4 py-3 text-left">Vigência</th>
                  <th className="px-4 py-3 text-right">Aluguel</th>
                  <th className="px-4 py-3 text-left">Status</th>
                  <th className="px-4 py-3 text-right">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {filteredContracts.map((item) => {
                  const vehicle = vehicles[item.vehicleId];
                  const driver = drivers[item.driverId];
                  const busy = actionLoadingId === item.id;
                  const lifecycleAction = activeContractAction(item);
                  const hasOverdue = (receivables[item.id] || []).some((receivable) =>
                    receivable.balanceAmount > 0 && receivable.dueDate < today && receivable.status !== 'CANCELLED'
                  );
                  return (
                    <tr key={item.id} className="hover:bg-slate-50/70 dark:hover:bg-slate-900/40">
                      <td className="px-4 py-3 font-mono font-semibold whitespace-nowrap">{item.contractNumber}</td>
                      <td className="px-4 py-3"><div className="flex items-center gap-2"><Car className="w-4 h-4 text-slate-400" /><span>{vehicle ? `${vehicle.plate} • ${vehicle.model}` : '—'}</span></div></td>
                      <td className="px-4 py-3"><div className="flex items-center gap-2"><User className="w-4 h-4 text-slate-400" /><span>{driver?.fullName || '—'}</span></div></td>
                      <td className="px-4 py-3"><div className="flex items-center gap-2"><Calendar className="w-4 h-4 text-slate-400" /><span>{item.endDate ? `${formatDateBR(item.startDate)} → ${formatDateBR(item.endDate)}` : `Início: ${formatDateBR(item.startDate)}`}</span></div></td>
                      <td className="px-4 py-3 text-right font-mono">{item.rentalAmount.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</td>
                      <td className="px-4 py-3">
                        <div className="flex flex-col items-start gap-1">
                          <Badge variant={item.status === ContractStatus.ACTIVE || ([ContractStatus.DRAFT, ContractStatus.AWAITING_SIGNATURE].includes(item.status) && (item.hasSignedEvidence ?? Boolean(item.signedContractUrl))) ? 'success' : item.status === ContractStatus.CANCELLED ? 'danger' : item.status === ContractStatus.CLOSED ? 'neutral' : 'warning'}>{contractStatusLabel(item.status,item.signedContractUrl,item.hasSignedEvidence)}</Badge>
                          {hasOverdue && (
                            <button type="button" onClick={() => openContractDetails(item.id, 'FINANCIAL')} className="text-[10px] font-semibold text-rose-600 hover:underline">
                              Cobrança vencida
                            </button>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex justify-end gap-2">
                          <Button size="sm" variant="primary" onClick={() => openContractDetails(item.id, 'OVERVIEW')}><Eye className="w-4 h-4 mr-1" />Detalhes</Button>
                          <details className="relative">
                            <summary aria-label={`Mais ações do contrato ${item.contractNumber}`} className="list-none cursor-pointer rounded-lg border border-slate-200 px-3 py-1.5 text-base font-bold text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800">⋮</summary>
                            <div className="absolute right-0 z-20 mt-1 w-52 space-y-1 rounded-xl border border-slate-200 bg-white p-2 text-left shadow-xl dark:border-slate-700 dark:bg-slate-900">
                              {[ContractStatus.DRAFT, ContractStatus.AWAITING_SIGNATURE, ContractStatus.ACTIVE].includes(item.status) && (
                                <button className="w-full rounded-lg px-2.5 py-2 text-left text-xs font-semibold text-slate-700 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800" onClick={() => { setContractToEdit(item); setFormOpen(true); }}>
                                  Editar contrato
                                </button>
                              )}
                              <button
                                disabled={busy}
                                className="flex w-full items-center gap-1.5 rounded-lg px-2.5 py-2 text-left text-xs font-semibold text-emerald-700 hover:bg-emerald-50 disabled:opacity-50 dark:text-emerald-300 dark:hover:bg-emerald-950/30"
                                onClick={() => void handleSendWhatsApp(item.id)}
                              >
                                <MessageSquare className="w-3.5 h-3.5" /> Enviar WhatsApp (wa.me)
                              </button>
                              <button
                                disabled={busy}
                                className="flex w-full items-center gap-1.5 rounded-lg px-2.5 py-2 text-left text-xs font-semibold text-emerald-700 hover:bg-emerald-50 disabled:opacity-50 dark:text-emerald-300 dark:hover:bg-emerald-950/30"
                                onClick={() => void handleRequestKm(item.id)}
                              >
                                <Gauge className="w-3.5 h-3.5" /> Pedir KM (wa.me)
                              </button>
                              {[ContractStatus.DRAFT, ContractStatus.AWAITING_SIGNATURE, ContractStatus.ACTIVE].includes(item.status) && (
                                <button className="w-full rounded-lg px-2.5 py-2 text-left text-xs font-semibold text-slate-700 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800" onClick={() => openContractDetails(item.id, 'PDF_SIGNATURE')}>
                                  Documento / Assinatura
                                </button>
                              )}
                              {item.status === ContractStatus.ACTIVE && <button disabled={busy} className="w-full rounded-lg px-2.5 py-2 text-left text-xs font-semibold text-amber-700 hover:bg-amber-50 disabled:opacity-50 dark:text-amber-300 dark:hover:bg-amber-950/30" onClick={() => void (lifecycleAction === 'CANCEL' ? handleCancel(item.id) : handleClose(item.id))}>{lifecycleAction === 'CANCEL' ? 'Cancelar contrato' : 'Encerrar contrato'}</button>}
                              {item.status !== ContractStatus.ACTIVE && item.status !== ContractStatus.SUSPENDED && <button disabled={busy} className="w-full rounded-lg px-2.5 py-2 text-left text-xs font-semibold text-slate-700 hover:bg-slate-100 disabled:opacity-50 dark:text-slate-300 dark:hover:bg-slate-800" onClick={() => void handleArchive(item.id)}>Arquivar</button>}
                            </div>
                          </details>
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

      <LazyModuleErrorBoundary resetKey={contractModalResetKey} onRetry={()=>window.location.reload()}>
        <Suspense fallback={<div role="status" className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/20"><div className="rounded-xl bg-white px-4 py-3 text-sm text-slate-600 shadow-xl dark:bg-slate-900 dark:text-slate-300">Carregando dados do contrato...</div></div>}>
          {formOpen&&<ContractFormModal
            isOpen
            onClose={() => setFormOpen(false)}
            contractToEdit={contractToEdit}
            companyId={companyId}
            onSuccess={(result) => { void handleContractSaved(result); }}
          />}
          {templateManagerOpen&&<ContractTemplateManagementModal isOpen onClose={() => setTemplateManagerOpen(false)} />}
          {detailsOpen&&selectedContractId&&<ContractDetailsModal
            isOpen
            onClose={() => setDetailsOpen(false)}
            contractId={selectedContractId}
            companyId={companyId}
            onRefresh={() => void loadData()}
            initialFocus={detailsFocus}
          />}
        </Suspense>
      </LazyModuleErrorBoundary>
    </div>
  );
};

const Kpi: React.FC<{ icon: React.ReactNode; label: string; value: string; helper: string }> = ({ icon, label, value, helper }) => (
  <div className="flex items-center justify-between gap-3">
    <div>
      <span className="text-[11px] font-semibold uppercase text-slate-500">{label}</span>
      <div className="mt-1 text-xl font-black text-slate-900 dark:text-slate-100">{value}</div>
      <span className="text-[10px] text-slate-400">{helper}</span>
    </div>
    <div className="rounded-xl bg-slate-100 p-2.5 text-slate-500 dark:bg-slate-800">{icon}</div>
  </div>
);
