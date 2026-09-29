import { requestGuardedClose } from '../../app/unsavedChangesAuthority';
import React, { useEffect, useState } from 'react';
import { Car, FileText, Gauge, ShieldCheck, TrendingUp, User, Wrench, AlertTriangle } from 'lucide-react';
import { VehicleClient, type VehicleLifecycleEvent } from '../../api/vehicleClient';
import { VehicleLegacyDetailsBridge, type VehicleDetailedSummary } from '../../domain/services/VehicleLegacyDetailsBridge';
import { VehicleStatus } from '../../types/enums';
import { formatCurrencyBRL } from '../../shared/utils/currency';
import { AttachmentList } from '../documents/AttachmentList';
import { Badge } from '../ui/Badge';
import { Button } from '../ui/Button';
import { ModalContainer } from '../ui/ModalContainer';
import { Skeleton } from '../ui/Skeleton';

interface ArchivedVehicleHistoryModalProps {
  isOpen: boolean;
  onClose: () => void;
  vehicleId: string | null;
}

type Tab = 'overview' | 'driver' | 'km' | 'maintenance' | 'tickets' | 'documents' | 'financial' | 'lifecycle';

const dateBR = (value?: string) => value ? new Date(`${value.slice(0, 10)}T00:00:00`).toLocaleDateString('pt-BR') : '-';
const lifecycleLabel = (action: VehicleLifecycleEvent['action']) => action === 'SOLD' ? 'Venda' : action === 'RESTORED' ? 'Retorno ao estoque' : 'Arquivamento';
const contractStatusLabel = (value?: string) => ({
  DRAFT: 'Rascunho', AWAITING_SIGNATURE: 'Aguardando assinatura', ACTIVE: 'Ativo', SUSPENDED: 'Suspenso',
  FINISHED: 'Finalizado', CLOSED: 'Encerrado', CANCELLED: 'Cancelado', ARCHIVED: 'Arquivado',
}[String(value || '')] || 'Não informado');
const kmTypeLabel = (value?: string) => ({
  CHECK_IN: 'Entrada', CHECK_OUT: 'Saída', PERIODIC: 'Periódica', MAINTENANCE: 'Manutenção',
}[String(value || '')] || 'Outro');
const maintenanceTypeLabel = (value?: string) => ({
  PREVENTIVE: 'Preventiva', CORRECTIVE: 'Corretiva', REVISION: 'Revisão', OIL_CHANGE: 'Troca de óleo',
  TIRES: 'Pneus', BRAKES: 'Freios', SUSPENSION: 'Suspensão', ELECTRICAL: 'Elétrica', BODYWORK: 'Funilaria', OTHER: 'Outro',
}[String(value || '')] || 'Outro');
const ticketStatusLabel = (value?: string) => ({
  PENDING_IDENTIFICATION: 'Aguardando identificação', IDENTIFIED: 'Identificada', CHARGED_DRIVER: 'Cobrança gerada ao motorista',
  COMPANY_PAYABLE_CREATED: 'Conta a pagar criada', PAID_BY_COMPANY: 'Pago pela empresa', APPEALED: 'Em recurso', CANCELLED: 'Cancelada',
}[String(value || '')] || 'Não informado');

export const ArchivedVehicleHistoryModal: React.FC<ArchivedVehicleHistoryModalProps> = ({ isOpen, onClose, vehicleId }) => {
  const [summary, setSummary] = useState<VehicleDetailedSummary | null>(null);
  const [lifecycle, setLifecycle] = useState<VehicleLifecycleEvent[]>([]);
  const [activeTab, setActiveTab] = useState<Tab>('overview');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen || !vehicleId) return;
    void (async () => {
      setLoading(true);
      setError(null);
      try {
        const [vehicle, kmRecords, lifecycleResult] = await Promise.all([
          VehicleClient.get(vehicleId),
          VehicleClient.listKm(vehicleId),
          VehicleClient.lifecycle(vehicleId),
        ]);
        setSummary(await new VehicleLegacyDetailsBridge().compose(vehicle, kmRecords));
        setLifecycle(lifecycleResult.lifecycle);
      } catch (err: any) {
        setError(err.message || 'Não foi possível carregar o histórico do veículo.');
      } finally {
        setLoading(false);
      }
    })();
  }, [isOpen, vehicleId]);

  if (!isOpen || !vehicleId) return null;
  const vehicle = summary?.vehicle;
  const isSold = vehicle?.status === VehicleStatus.SOLD;

  const tabs: Array<{ id: Tab; label: string; icon: React.ElementType; count?: number }> = [
    { id: 'overview', label: 'Visão Geral', icon: Car },
    { id: 'lifecycle', label: 'Ciclo de Vida', icon: FileText, count: lifecycle.length },
    { id: 'driver', label: 'Motorista & Contrato', icon: User },
    { id: 'km', label: 'Odômetro', icon: Gauge, count: summary?.kmRecords.length },
    { id: 'maintenance', label: 'Manutenções', icon: Wrench, count: summary?.maintenances.length },
    { id: 'tickets', label: 'Multas', icon: AlertTriangle, count: summary?.trafficTickets.length },
    { id: 'documents', label: 'Documentos', icon: ShieldCheck },
    { id: 'financial', label: 'Rentabilidade', icon: TrendingUp },
  ];

  return (
    <ModalContainer
      isOpen={isOpen}
      onClose={onClose}
      title={vehicle ? `Histórico somente leitura — ${vehicle.plate} (${vehicle.brand} ${vehicle.model})` : 'Histórico do veículo'}
      subtitle="Visualização somente leitura. Venda, reentrada ou arquivamento não apagam vínculos, documentos nem histórico operacional."
      maxWidth="4xl"
    >
      {loading ? (
        <div className="space-y-4"><Skeleton className="h-12 w-full"/><Skeleton className="h-64 w-full"/></div>
      ) : error || !summary || !vehicle ? (
        <div className="p-4 rounded-xl border border-red-200 bg-red-50 text-sm text-red-700">{error || 'Histórico indisponível.'}</div>
      ) : (
        <div className="space-y-5">
          <div className="rounded-xl border bg-slate-50 dark:bg-slate-800/40 p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <div className="flex items-center gap-2">
                <span className="font-mono text-base font-black px-3 py-1 bg-slate-900 text-white rounded-md tracking-widest">{vehicle.plate}</span>
                <Badge variant="default">{isSold ? 'Vendido' : 'Arquivado'}</Badge>
              </div>
              <p className="mt-2 text-xs text-slate-500">RENAVAM {vehicle.renavam} • Chassi {vehicle.chassis}</p>
            </div>
            <div className="text-xs font-semibold text-slate-500">Somente leitura</div>
          </div>

          <div className="grid grid-cols-2 gap-2 border-b pb-3 sm:grid-cols-3 lg:grid-cols-4">
            {tabs.map((tab) => {
              const Icon = tab.icon;
              const selected = activeTab === tab.id;
              return (
                <button key={tab.id} onClick={() => setActiveTab(tab.id)} className={`min-h-11 px-3 py-2 rounded-lg text-xs font-medium flex items-center justify-center gap-1.5 ${selected ? 'bg-blue-600 text-white font-semibold' : 'border border-slate-200 text-slate-600 hover:bg-slate-100 dark:border-slate-800'}`}>
                  <Icon className="w-3.5 h-3.5"/>{tab.label}
                  {tab.count !== undefined && <span className={`ml-1 px-1.5 rounded-full text-[10px] ${selected ? 'bg-blue-700 text-white' : 'bg-slate-200 text-slate-700'}`}>{tab.count}</span>}
                </button>
              );
            })}
          </div>

          {activeTab === 'overview' && (
            <div className="space-y-4 text-xs">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="p-3 border rounded-xl"><span className="text-slate-400 block">KM final/atual</span><strong className="text-lg font-mono">{vehicle.currentKm.toLocaleString('pt-BR')} KM</strong></div>
                <div className="p-3 border rounded-xl"><span className="text-slate-400 block">Valor de aquisição</span><strong className="text-lg font-mono">{formatCurrencyBRL(vehicle.acquisitionValue)}</strong></div>
                <div className="p-3 border rounded-xl"><span className="text-slate-400 block">Último valor de mercado</span><strong className="text-lg font-mono">{formatCurrencyBRL(vehicle.currentValue)}</strong></div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="p-4 border rounded-xl space-y-2"><h4 className="font-bold">Dados técnicos</h4><p>Ano: <strong>{vehicle.yearFabrication}/{vehicle.yearModel}</strong></p><p>Cor: <strong>{vehicle.color}</strong></p><p>Combustível: <strong>{vehicle.fuelType}</strong></p><p>Categoria: <strong>{vehicle.category}</strong></p></div>
                <div className="p-4 border rounded-xl space-y-2"><h4 className="font-bold">Identificadores</h4><p>RENAVAM: <strong className="font-mono">{vehicle.renavam}</strong></p><p>Chassi: <strong className="font-mono">{vehicle.chassis}</strong></p><p>Cadastro: <strong>{dateBR(vehicle.createdAt)}</strong></p></div>
              </div>
              {vehicle.notes && <div className="p-3 border rounded-xl"><strong>Anotações preservadas</strong><p className="mt-1 text-slate-500">{vehicle.notes}</p></div>}
            </div>
          )}

          {activeTab === 'lifecycle' && (
            <div className="space-y-2 text-xs">
              {lifecycle.length === 0 ? <p className="p-5 border rounded-xl text-slate-500 text-center">Nenhum evento de ciclo de vida registrado.</p> : lifecycle.map((event) => (
                <div key={event.id} className="p-4 border rounded-xl space-y-2">
                  <div className="flex justify-between gap-3"><strong>{lifecycleLabel(event.action)}</strong><span>{dateBR(event.effectiveDate)}</span></div>
                  {event.action === 'SOLD' ? (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1">
                      <p><strong>Tipo da baixa:</strong> {event.disposalType || 'Venda'}</p>
                      <p><strong>Valor da venda:</strong> {event.saleValue !== undefined ? formatCurrencyBRL(event.saleValue) : '-'}</p>
                      <p><strong>KM na venda:</strong> {event.finalKm !== undefined ? `${event.finalKm.toLocaleString('pt-BR')} KM` : '-'}</p>
                      <p><strong>Motivo:</strong> {event.reason}</p>
                      <p><strong>Comprador:</strong> {event.buyerName || 'Não informado'}</p>
                      <p><strong>CPF/CNPJ do comprador:</strong> {event.buyerDocument || 'Não informado'}</p>
                      <p className="sm:col-span-2"><strong>Registrado por:</strong> {event.createdByName || event.createdBy || 'Não identificado'}</p>
                      {event.notes && <p className="sm:col-span-2 text-slate-500"><strong>Observações:</strong> {event.notes}</p>}
                    </div>
                  ) : (
                    <>
                      <p>Motivo: {event.reason}</p>
                      <p className="text-slate-500">Registrado por: {event.createdByName || event.createdBy || 'Não identificado'}</p>
                    </>
                  )}
                </div>
              ))}
            </div>
          )}

          {activeTab === 'driver' && (
            <div className="space-y-3 text-xs">
              <div className="p-4 border rounded-xl"><h4 className="font-bold mb-2">Último vínculo visível</h4>{summary.driver ? <><p>Motorista: <strong>{summary.driver.name}</strong></p><p>CPF: <strong className="font-mono">{summary.driver.cpf}</strong></p><p>CNH: <strong className="font-mono">{summary.driver.cnhNumber}</strong></p></> : <p className="text-slate-500">Sem motorista atualmente vinculado.</p>}</div>
              <div className="p-4 border rounded-xl"><h4 className="font-bold mb-2">Contrato</h4>{summary.activeContract ? <><p>Número: <strong>{summary.activeContract.contractNumber}</strong></p><p>Status: <strong>{contractStatusLabel(summary.activeContract.status)}</strong></p><p>Início: <strong>{dateBR(summary.activeContract.startDate)}</strong></p></> : <p className="text-slate-500">Sem contrato ativo.</p>}</div>
            </div>
          )}

          {activeTab === 'km' && (
            <div className="overflow-x-auto border rounded-xl text-xs"><table className="w-full text-left"><thead className="bg-slate-50 border-b"><tr><th className="p-2.5">Data</th><th className="p-2.5">Leitura</th><th className="p-2.5">Tipo</th><th className="p-2.5">Observação</th></tr></thead><tbody>{summary.kmRecords.map((row) => <tr key={row.id} className="border-b"><td className="p-2.5">{dateBR(row.recordDate)}</td><td className="p-2.5 font-mono font-bold">{row.kmValue.toLocaleString('pt-BR')} KM</td><td className="p-2.5">{kmTypeLabel(row.readingType)}</td><td className="p-2.5 text-slate-500">{row.notes || '-'}</td></tr>)}</tbody></table></div>
          )}

          {activeTab === 'maintenance' && (
            <div className="space-y-2 text-xs">{summary.maintenances.length === 0 ? <p className="p-5 border rounded-xl text-center text-slate-500">Nenhuma manutenção registrada.</p> : summary.maintenances.map((m: any) => <div key={m.id} className="p-3 border rounded-xl flex justify-between gap-3"><div><strong>{maintenanceTypeLabel(m.type)}</strong><p className="text-slate-500">{m.description}</p><p>{dateBR(m.startDate)} • {m.kmAtMaintenance?.toLocaleString('pt-BR') || '-'} KM</p></div><strong className="font-mono">{formatCurrencyBRL(m.totalCost || 0)}</strong></div>)}</div>
          )}

          {activeTab === 'tickets' && (
            <div className="space-y-2 text-xs">{summary.trafficTickets.length === 0 ? <p className="p-5 border rounded-xl text-center text-slate-500">Nenhuma multa registrada.</p> : summary.trafficTickets.map((ticket: any) => <div key={ticket.id} className="p-3 border rounded-xl flex justify-between gap-3"><div><strong className="font-mono">{ticket.noticeNumber}</strong><p>{ticket.description}</p><p className="text-slate-500">{dateBR(ticket.ticketDate)} • {ticketStatusLabel(ticket.status)}</p></div><strong className="font-mono">{formatCurrencyBRL(ticket.amount || 0)}</strong></div>)}</div>
          )}

          {activeTab === 'documents' && (
            <div className="space-y-4 text-xs">
              <div className="p-3 border rounded-xl bg-slate-50 dark:bg-slate-800/40">Documentos preservados em modo somente leitura. Upload e importação de CRLV ficam desativados para veículo vendido ou arquivado.</div>
              <AttachmentList entityType="Vehicle" entityId={vehicle.id}/>
              {summary.insurances.map((insurance: any) => <div key={insurance.id} className="p-3 border rounded-xl"><strong>Seguro — {insurance.insuranceCompany}</strong><p>Apólice: {insurance.policyNumber}</p><AttachmentList entityType="Insurance" entityId={insurance.id}/></div>)}
            </div>
          )}

          {activeTab === 'financial' && (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
              <div className="p-3 border rounded-xl"><span className="text-slate-500 block">Receitas recebidas</span><strong className="text-lg font-mono">{formatCurrencyBRL(summary.financialSummary.totalRevenue)}</strong></div>
              <div className="p-3 border rounded-xl"><span className="text-slate-500 block">Despesas pagas</span><strong className="text-lg font-mono">{formatCurrencyBRL(summary.financialSummary.totalExpenses)}</strong></div>
              <div className="p-3 border rounded-xl"><span className="text-slate-500 block">Resultado líquido</span><strong className="text-lg font-mono">{formatCurrencyBRL(summary.financialSummary.netProfit)}</strong></div>
            </div>
          )}

          <div className="flex justify-end pt-3 border-t"><Button variant="outline" onClick={(event)=>requestGuardedClose(event,onClose)}>Fechar histórico</Button></div>
        </div>
      )}
    </ModalContainer>
  );
};