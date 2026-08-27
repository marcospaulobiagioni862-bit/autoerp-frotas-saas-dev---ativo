import React, { lazy, Suspense, useEffect, useMemo, useState } from 'react';
import { FileText, FolderOpen, Package, Plus, Search, Users, Wrench } from 'lucide-react';
import { MaintenanceClient } from '../../api/maintenanceClient';
import { VehicleClient } from '../../api/vehicleClient';
import { FinanceObligationClient } from '../../api/financeObligationClient';
import { FinanceMasterDataClient } from '../../api/financeMasterDataClient';
import type { AccountPayable, Part, Supplier, Vehicle, WorkOrder } from '../../types/entities';
import { LazyModuleErrorBoundary } from '../common/LazyModuleErrorBoundary';
import { Badge, Button, Card, Input, PageHeader } from '../ui';
import { formatCurrencyBRL } from '../../shared/utils/currency';

const AttachmentModal=lazy(()=>import('../documents/AttachmentModal').then(module=>({default:module.AttachmentModal})));
const MaintenancePreventivePanel=lazy(()=>import('./MaintenancePreventivePanel').then(module=>({default:module.MaintenancePreventivePanel})));

interface MaintenanceManagementProps {
  companyId?: string;
  onOpenPaymentModal?: (payable: AccountPayable) => void;
}

type Tab = 'workOrders' | 'suppliers' | 'parts' | 'oilTires';

function statusBadge(status: WorkOrder['status']) {
  if (status === 'COMPLETED') return <Badge variant="success">Concluída</Badge>;
  if (status === 'CANCELLED') return <Badge variant="danger">Cancelada</Badge>;
  if (status === 'IN_PROGRESS') return <Badge variant="warning">Em andamento</Badge>;
  if (status === 'WAITING_PARTS') return <Badge variant="warning">Aguardando peças</Badge>;
  if (status === 'WAITING_APPROVAL') return <Badge variant="warning">Aguardando aprovação</Badge>;
  return <Badge variant="neutral">Aberta</Badge>;
}

export const MaintenanceManagement: React.FC<MaintenanceManagementProps> = ({ onOpenPaymentModal }) => {
  const [tab, setTab] = useState<Tab>('workOrders');
  const [workOrders, setWorkOrders] = useState<WorkOrder[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [parts, setParts] = useState<Part[]>([]);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [payables, setPayables] = useState<AccountPayable[]>([]);
  const [expenseCategories, setExpenseCategories] = useState<Array<{ id: string; name: string }>>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [search, setSearch] = useState('');
  const [attachmentEntity, setAttachmentEntity] = useState<WorkOrder | null>(null);
  const [newWoOpen, setNewWoOpen] = useState(false);
  const [newSupplierOpen, setNewSupplierOpen] = useState(false);
  const [newPartOpen, setNewPartOpen] = useState(false);
  const [completeTarget, setCompleteTarget] = useState<WorkOrder | null>(null);
  const [woNumber, setWoNumber] = useState('');
  const [woVehicleId, setWoVehicleId] = useState('');
  const [woSupplierId, setWoSupplierId] = useState('');
  const [woEntryKm, setWoEntryKm] = useState('0');
  const [woDescription, setWoDescription] = useState('');
  const [woPartId, setWoPartId] = useState('');
  const [woPartQty, setWoPartQty] = useState('1');
  const [woLaborCost, setWoLaborCost] = useState('150');
  const [exitKm, setExitKm] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [installments, setInstallments] = useState('1');
  const [categoryId, setCategoryId] = useState('');
  const [supplierName, setSupplierName] = useState('');
  const [supplierDocument, setSupplierDocument] = useState('');
  const [supplierPhone, setSupplierPhone] = useState('');
  const [supplierCategory, setSupplierCategory] = useState('Oficina Mecânica');
  const [partCode, setPartCode] = useState('');
  const [partName, setPartName] = useState('');
  const [partCost, setPartCost] = useState('');
  const [partStock, setPartStock] = useState('0');

  const load = async () => {
    setLoading(true); setError(null);
    try {
      const [wo, sup, prt, veh, pay, masterData] = await Promise.all([MaintenanceClient.listWorkOrders(),MaintenanceClient.listSuppliers(),MaintenanceClient.listParts(),VehicleClient.list(),FinanceObligationClient.listPayables(),FinanceMasterDataClient.list()]);
      const eligibleExpenseCategories = masterData.categories.filter((item) => item.active && (item.type === 'EXPENSE' || item.type === 'BOTH'));
      setWorkOrders(wo); setSuppliers(sup); setParts(prt); setVehicles(veh.filter((item) => !item.isArchived)); setPayables(pay); setExpenseCategories(eligibleExpenseCategories);
      if (!woVehicleId && veh[0]) { setWoVehicleId(veh[0].id); setWoEntryKm(String(veh[0].currentKm)); }
      if (!woSupplierId && sup[0]) setWoSupplierId(sup[0].id);
      if (!woNumber) setWoNumber(`OS-${new Date().getFullYear()}-${String(Date.now()).slice(-6)}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao carregar manutenção.'); setWorkOrders([]); setSuppliers([]); setParts([]); setVehicles([]); setPayables([]); setExpenseCategories([]);
    } finally { setLoading(false); }
  };
  useEffect(() => { void load(); }, []);
  const vehicleLabel = (id: string) => { const vehicle = vehicles.find((item) => item.id === id); return vehicle ? `${vehicle.plate} — ${vehicle.brand} ${vehicle.model}` : id; };
  const supplierLabel = (id?: string) => suppliers.find((item) => item.id === id)?.name || 'Sem fornecedor';
  const payableFor = (wo: WorkOrder) => wo.accountPayableId ? payables.find((item) => item.id === wo.accountPayableId) : payables.find((item) => String(item.originType) === 'MAINTENANCE' && item.originId === wo.id);
  const filteredOrders = useMemo(() => { const term = search.trim().toLowerCase(); if (!term) return workOrders; return workOrders.filter((wo) => wo.number.toLowerCase().includes(term) || wo.description.toLowerCase().includes(term) || vehicleLabel(wo.vehicleId).toLowerCase().includes(term) || supplierLabel(wo.supplierId).toLowerCase().includes(term)); }, [workOrders, search, vehicles, suppliers]);
  const run = async (action: () => Promise<void>) => { setBusy(true); setError(null); try { await action(); await load(); } catch (err) { setError(err instanceof Error ? err.message : 'Operação de manutenção falhou.'); } finally { setBusy(false); } };
  const createWorkOrder = async (event: React.FormEvent) => { event.preventDefault(); const selectedPart = parts.find((item) => item.id === woPartId); await run(async () => { await MaintenanceClient.createWorkOrder({number: woNumber, vehicleId: woVehicleId, supplierId: woSupplierId || undefined,entryKm: Number(woEntryKm), description: woDescription || 'Manutenção preventiva/corretiva',parts: selectedPart ? [{ partId: selectedPart.id, quantity: Number(woPartQty) || 1 }] : [],laborItems: Number(woLaborCost) > 0 ? [{ description:'Mão de obra mecânica', hours:1, hourlyRate:Number(woLaborCost) }] : []}); setNewWoOpen(false); setWoDescription(''); setWoPartId(''); setWoNumber(`OS-${new Date().getFullYear()}-${String(Date.now()).slice(-6)}`); }); };
  const createSupplier = async (event: React.FormEvent) => { event.preventDefault(); await run(async () => { await MaintenanceClient.createSupplier({ name:supplierName, document:supplierDocument, phone:supplierPhone, category:supplierCategory }); setNewSupplierOpen(false); setSupplierName(''); setSupplierDocument(''); setSupplierPhone(''); }); };
  const createPart = async (event: React.FormEvent) => { event.preventDefault(); await run(async () => { await MaintenanceClient.createPart({ code:partCode, name:partName, category:'Geral', unit:'UN', currentCost:Number(partCost), minimumStock:0, currentStock:Number(partStock) }); setNewPartOpen(false); setPartCode(''); setPartName(''); setPartCost(''); setPartStock('0'); }); };
  const complete = async (event: React.FormEvent) => { event.preventDefault(); if (!completeTarget) return; if (!categoryId) { setError('Selecione uma categoria financeira de despesa para concluir a OS.'); return; } await run(async () => { await MaintenanceClient.completeWorkOrder(completeTarget.id, { exitKm:Number(exitKm), dueDate, categoryId, installmentsCount:Number(installments) || 1 }); setCompleteTarget(null); setExitKm(''); setCategoryId(''); }); };
  const activeCount = workOrders.filter((wo) => !['COMPLETED','CANCELLED'].includes(wo.status)).length;
  const vehicleMaintenanceCount = vehicles.filter((vehicle) => vehicle.status === 'MAINTENANCE').length;
  const totalCompleted = workOrders.filter((wo) => wo.status === 'COMPLETED').reduce((sum, wo) => sum + wo.total, 0);

  return <div className="p-4 sm:p-6 space-y-6 max-w-7xl mx-auto">
    <PageHeader title="Manutenção & Oficinas" description="Ordens de serviço, peças, preventivas, óleo e pneus com autoridade server-side." breadcrumb="Operação • Gestão de Manutenção" primaryAction={{ label:'Nova Ordem de Serviço', onClick:()=>setNewWoOpen(true), icon:<Plus className="w-4 h-4"/> }} />
    {error && <div className="p-3 rounded-xl border border-rose-200 bg-rose-50 text-rose-700 text-xs">{error}</div>}{loading && <div className="p-8 text-center text-xs text-slate-500">Carregando manutenção...</div>}
    {!loading && <>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3"><Card padding="sm"><span className="text-[11px] text-slate-500">OS ATIVAS</span><strong className="block text-2xl font-mono">{activeCount}</strong></Card><Card padding="sm"><span className="text-[11px] text-slate-500">VEÍCULOS EM MANUTENÇÃO</span><strong className="block text-2xl font-mono text-amber-600">{vehicleMaintenanceCount}</strong></Card><Card padding="sm"><span className="text-[11px] text-slate-500">FORNECEDORES</span><strong className="block text-2xl font-mono">{suppliers.length}</strong></Card><Card padding="sm"><span className="text-[11px] text-slate-500">CUSTO CONCLUÍDO</span><strong className="block text-xl font-mono text-emerald-600">{formatCurrencyBRL(totalCompleted)}</strong></Card></div>
      <div className="flex flex-wrap gap-2 border-b pb-2 border-slate-200 dark:border-slate-800"><Button size="sm" variant={tab==='workOrders'?'primary':'ghost'} onClick={()=>setTab('workOrders')} icon={<FileText className="w-4 h-4"/>}>Ordens</Button><Button size="sm" variant={tab==='suppliers'?'primary':'ghost'} onClick={()=>setTab('suppliers')} icon={<Users className="w-4 h-4"/>}>Fornecedores</Button><Button size="sm" variant={tab==='parts'?'primary':'ghost'} onClick={()=>setTab('parts')} icon={<Package className="w-4 h-4"/>}>Peças</Button><Button size="sm" variant={tab==='oilTires'?'primary':'ghost'} onClick={()=>setTab('oilTires')} icon={<Wrench className="w-4 h-4"/>}>Preventivas / Óleo / Pneus</Button></div>
      {tab==='workOrders' && <div className="space-y-3"><div className="relative max-w-md"><Search className="absolute left-3 top-2.5 w-4 h-4 text-slate-400"/><Input value={search} onChange={(e)=>setSearch(e.target.value)} placeholder="Buscar OS, placa, fornecedor..." className="pl-9"/></div><Card padding="none"><div className="overflow-x-auto"><table className="w-full text-xs"><thead className="bg-slate-50 dark:bg-slate-800/50"><tr><th className="p-3 text-left">OS</th><th className="p-3 text-left">Veículo</th><th className="p-3 text-left">Fornecedor</th><th className="p-3 text-left">KM</th><th className="p-3 text-left">Total</th><th className="p-3 text-left">Status</th><th className="p-3 text-right">Ações</th></tr></thead><tbody className="divide-y divide-slate-100 dark:divide-slate-800">{filteredOrders.length===0 && <tr><td colSpan={7} className="p-8 text-center text-slate-500">Nenhuma ordem de serviço.</td></tr>}{filteredOrders.map((wo)=>{const payable=payableFor(wo);return <tr key={wo.id}><td className="p-3"><strong>{wo.number}</strong><div className="text-slate-500 max-w-xs truncate">{wo.description}</div></td><td className="p-3">{vehicleLabel(wo.vehicleId)}</td><td className="p-3">{supplierLabel(wo.supplierId)}</td><td className="p-3 font-mono">{wo.entryKm.toLocaleString('pt-BR')}{wo.exitKm!==undefined?` → ${wo.exitKm.toLocaleString('pt-BR')}`:''}</td><td className="p-3 font-mono">{formatCurrencyBRL(wo.total)}</td><td className="p-3">{statusBadge(wo.status)}</td><td className="p-3"><div className="flex justify-end gap-2 flex-wrap"><Button size="sm" variant="ghost" onClick={()=>setAttachmentEntity(wo)} icon={<FolderOpen className="w-3.5 h-3.5"/>}>Anexos</Button>{['OPEN','WAITING_APPROVAL','WAITING_PARTS'].includes(wo.status) && <Button size="sm" disabled={busy} onClick={()=>void run(async()=>{await MaintenanceClient.startWorkOrder(wo.id);})}>Iniciar</Button>}{wo.status==='IN_PROGRESS' && <Button size="sm" disabled={busy} onClick={()=>{setCompleteTarget(wo);setCategoryId('');setExitKm(String(Math.max(wo.entryKm,vehicles.find(v=>v.id===wo.vehicleId)?.currentKm||wo.entryKm)));const d=new Date();d.setUTCDate(d.getUTCDate()+30);setDueDate(d.toISOString().slice(0,10));}}>Concluir</Button>}{!['COMPLETED','CANCELLED'].includes(wo.status) && <Button size="sm" variant="danger" disabled={busy} onClick={()=>{const reason=window.prompt('Motivo do cancelamento:');if(reason)void run(async()=>{await MaintenanceClient.cancelWorkOrder(wo.id,reason);});}}>Cancelar</Button>}{wo.status==='COMPLETED' && payable && onOpenPaymentModal && <Button size="sm" variant="outline" onClick={()=>onOpenPaymentModal(payable)}>Pagar título</Button>}</div></td></tr>;})}</tbody></table></div></Card></div>}
      {tab==='suppliers' && <div className="space-y-3"><div className="flex justify-between"><h3 className="font-semibold">Fornecedores & Oficinas</h3><Button size="sm" onClick={()=>setNewSupplierOpen(true)} icon={<Plus className="w-4 h-4"/>}>Novo fornecedor</Button></div><div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">{suppliers.map((s)=><Card key={s.id} padding="md"><div className="flex justify-between"><strong>{s.name}</strong><Badge variant={s.status==='ACTIVE'?'success':'neutral'}>{s.status}</Badge></div><div className="mt-2 text-xs text-slate-500">{s.document}<br/>{s.category}<br/>{s.phone||'Sem telefone'}</div></Card>)}</div></div>}
      {tab==='parts' && <div className="space-y-3"><div className="flex justify-between"><h3 className="font-semibold">Catálogo de peças</h3><Button size="sm" onClick={()=>setNewPartOpen(true)} icon={<Plus className="w-4 h-4"/>}>Nova peça</Button></div><Card padding="none"><div className="overflow-x-auto"><table className="w-full text-xs"><thead><tr><th className="p-3 text-left">Código</th><th className="p-3 text-left">Peça</th><th className="p-3 text-left">Custo</th><th className="p-3 text-left">Estoque</th><th className="p-3 text-left">Status</th></tr></thead><tbody>{parts.map((p)=><tr key={p.id} className="border-t"><td className="p-3 font-mono">{p.code}</td><td className="p-3">{p.name}</td><td className="p-3 font-mono">{formatCurrencyBRL(p.currentCost)}</td><td className="p-3 font-mono">{p.currentStock} {p.unit}</td><td className="p-3"><Badge variant={p.status==='ACTIVE'?'success':'neutral'}>{p.status}</Badge></td></tr>)}</tbody></table></div></Card></div>}
      {tab==='oilTires' && <LazyModuleErrorBoundary resetKey="preventive" onRetry={()=>window.location.reload()}><Suspense fallback={<div role="status" className="p-8 text-center text-xs text-slate-500">Carregando manutenção preventiva...</div>}><MaintenancePreventivePanel vehicles={vehicles} workOrders={workOrders}/></Suspense></LazyModuleErrorBoundary>}
    </>}
    {newWoOpen && <div className="fixed inset-0 z-50 bg-slate-950/60 flex items-center justify-center p-4"><Card className="w-full max-w-lg"><form onSubmit={createWorkOrder} className="space-y-3"><h3 className="font-bold">Nova Ordem de Serviço</h3><Input value={woNumber} onChange={(e)=>setWoNumber(e.target.value)} placeholder="Número da OS" required/><select className="w-full p-2 border rounded-lg bg-white dark:bg-slate-900" value={woVehicleId} onChange={(e)=>{setWoVehicleId(e.target.value);const v=vehicles.find(x=>x.id===e.target.value);if(v)setWoEntryKm(String(v.currentKm));}} required><option value="">Veículo...</option>{vehicles.map(v=><option key={v.id} value={v.id}>{vehicleLabel(v.id)}</option>)}</select><select className="w-full p-2 border rounded-lg bg-white dark:bg-slate-900" value={woSupplierId} onChange={(e)=>setWoSupplierId(e.target.value)}><option value="">Sem fornecedor</option>{suppliers.filter(s=>s.status==='ACTIVE').map(s=><option key={s.id} value={s.id}>{s.name}</option>)}</select><Input type="number" min="0" value={woEntryKm} onChange={(e)=>setWoEntryKm(e.target.value)} placeholder="KM de entrada" required/><Input value={woDescription} onChange={(e)=>setWoDescription(e.target.value)} placeholder="Descrição / diagnóstico" required/><select className="w-full p-2 border rounded-lg bg-white dark:bg-slate-900" value={woPartId} onChange={(e)=>setWoPartId(e.target.value)}><option value="">Sem peça do catálogo</option>{parts.filter(p=>p.status==='ACTIVE').map(p=><option key={p.id} value={p.id}>{p.name} — {formatCurrencyBRL(p.currentCost)}</option>)}</select>{woPartId && <Input type="number" min="0.001" step="0.001" value={woPartQty} onChange={(e)=>setWoPartQty(e.target.value)} placeholder="Quantidade"/>}<Input type="number" min="0" step="0.01" value={woLaborCost} onChange={(e)=>setWoLaborCost(e.target.value)} placeholder="Mão de obra"/><div className="flex justify-end gap-2"><Button type="button" variant="ghost" onClick={()=>setNewWoOpen(false)}>Cancelar</Button><Button type="submit" isLoading={busy}>Criar OS</Button></div></form></Card></div>}
    {completeTarget && <div className="fixed inset-0 z-50 bg-slate-950/60 flex items-center justify-center p-4"><Card className="w-full max-w-md"><form onSubmit={complete} className="space-y-3"><h3 className="font-bold">Concluir {completeTarget.number}</h3><p className="text-xs text-slate-500">A conclusão cria a Conta a Pagar, atualiza veículo/KM e auditoria em uma única transação.</p><Input type="number" min={completeTarget.entryKm} value={exitKm} onChange={(e)=>setExitKm(e.target.value)} placeholder="KM de saída" required/><Input type="date" value={dueDate} onChange={(e)=>setDueDate(e.target.value)} required/><Input type="number" min="1" max="60" value={installments} onChange={(e)=>setInstallments(e.target.value)} placeholder="Parcelas" required/><select className="w-full p-2 border rounded-lg bg-white dark:bg-slate-900" value={categoryId} onChange={(e)=>setCategoryId(e.target.value)} required><option value="">Categoria financeira de manutenção...</option>{expenseCategories.map((category)=><option key={category.id} value={category.id}>{category.name}</option>)}</select>{expenseCategories.length===0 && <p className="text-xs text-amber-700">Nenhuma categoria financeira ativa de despesa está disponível. Cadastre ou ative uma categoria antes de concluir a OS.</p>}<div className="flex justify-end gap-2"><Button type="button" variant="ghost" onClick={()=>{setCompleteTarget(null);setCategoryId('');}}>Cancelar</Button><Button type="submit" isLoading={busy} disabled={expenseCategories.length===0}>Concluir & gerar CP</Button></div></form></Card></div>}
    {newSupplierOpen && <div className="fixed inset-0 z-50 bg-slate-950/60 flex items-center justify-center p-4"><Card className="w-full max-w-md"><form onSubmit={createSupplier} className="space-y-3"><h3 className="font-bold">Novo fornecedor / oficina</h3><Input value={supplierName} onChange={(e)=>setSupplierName(e.target.value)} placeholder="Nome" required/><Input value={supplierDocument} onChange={(e)=>setSupplierDocument(e.target.value)} placeholder="CNPJ / CPF" required/><Input value={supplierPhone} onChange={(e)=>setSupplierPhone(e.target.value)} placeholder="Telefone"/><Input value={supplierCategory} onChange={(e)=>setSupplierCategory(e.target.value)} placeholder="Categoria" required/><div className="flex justify-end gap-2"><Button type="button" variant="ghost" onClick={()=>setNewSupplierOpen(false)}>Cancelar</Button><Button type="submit" isLoading={busy}>Salvar</Button></div></form></Card></div>}
    {newPartOpen && <div className="fixed inset-0 z-50 bg-slate-950/60 flex items-center justify-center p-4"><Card className="w-full max-w-md"><form onSubmit={createPart} className="space-y-3"><h3 className="font-bold">Nova peça</h3><Input value={partCode} onChange={(e)=>setPartCode(e.target.value)} placeholder="Código" required/><Input value={partName} onChange={(e)=>setPartName(e.target.value)} placeholder="Nome" required/><Input type="number" min="0" step="0.01" value={partCost} onChange={(e)=>setPartCost(e.target.value)} placeholder="Custo" required/><Input type="number" min="0" step="0.001" value={partStock} onChange={(e)=>setPartStock(e.target.value)} placeholder="Estoque" required/><div className="flex justify-end gap-2"><Button type="button" variant="ghost" onClick={()=>setNewPartOpen(false)}>Cancelar</Button><Button type="submit" isLoading={busy}>Salvar</Button></div></form></Card></div>}
    {attachmentEntity && <LazyModuleErrorBoundary resetKey={`attachment:${attachmentEntity.id}`} onRetry={()=>window.location.reload()}><Suspense fallback={<div role="status" className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/20"><div className="rounded-xl bg-white px-4 py-3 text-sm text-slate-600 shadow-xl dark:bg-slate-900 dark:text-slate-300">Carregando anexos da manutenção...</div></div>}><AttachmentModal isOpen onClose={()=>setAttachmentEntity(null)} entityType="MaintenanceWorkOrder" entityId={attachmentEntity.id} documentType="MAINTENANCE_DOCUMENT" title={`Anexos: OS ${attachmentEntity.number}`} /></Suspense></LazyModuleErrorBoundary>}
  </div>;
};