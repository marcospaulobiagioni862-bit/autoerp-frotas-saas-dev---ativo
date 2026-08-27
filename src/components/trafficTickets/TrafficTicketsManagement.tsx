import React, { lazy, Suspense, useEffect, useMemo, useState } from 'react';
import { TrafficTicketClient } from '../../api/trafficTicketClient';
import { VehicleClient } from '../../api/vehicleClient';
import { DriverClient } from '../../api/driverClient';
import type { Driver, TrafficTicket, Vehicle } from '../../types/entities';
import { TicketResponsibility, TicketStatus } from '../../types/enums';
import { LazyModuleErrorBoundary } from '../common/LazyModuleErrorBoundary';
import { Badge, Button, Card, Input, PageHeader, Select } from '../ui';
import { AlertTriangle, DollarSign, Plus, ShieldAlert, User } from 'lucide-react';
import { formatCurrencyBRL } from '../../shared/utils/currency';

const TrafficTicketFormModal=lazy(()=>import('./TrafficTicketFormModal').then(module=>({default:module.TrafficTicketFormModal})));
const TrafficTicketDetailsModal=lazy(()=>import('./TrafficTicketDetailsModal').then(module=>({default:module.TrafficTicketDetailsModal})));

interface TrafficTicketsManagementProps { companyId?: string; }

export const TrafficTicketsManagement: React.FC<TrafficTicketsManagementProps> = (_props) => {
  const [tickets,setTickets]=useState<TrafficTicket[]>([]);
  const [vehicles,setVehicles]=useState<Vehicle[]>([]);
  const [drivers,setDrivers]=useState<Driver[]>([]);
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState<string|null>(null);
  const [searchTerm,setSearchTerm]=useState('');
  const [statusFilter,setStatusFilter]=useState('ALL');
  const [responsibilityFilter,setResponsibilityFilter]=useState('ALL');
  const [isFormOpen,setIsFormOpen]=useState(false);
  const [selectedTicketId,setSelectedTicketId]=useState<string|null>(null);

  const loadData=async()=>{setLoading(true);setError(null);try{
    const [tList,vList,dList]=await Promise.all([TrafficTicketClient.list(),VehicleClient.list(),DriverClient.list()]);
    setTickets([...tList].sort((a,b)=>b.infractionDate.localeCompare(a.infractionDate)));setVehicles(vList);setDrivers(dList);
  }catch(err){setError(err instanceof Error?err.message:'Erro ao carregar multas.');}finally{setLoading(false);}};
  useEffect(()=>{void loadData();},[]);

  const vehicleInfo=(id:string)=>{const v=vehicles.find(item=>item.id===id);return v?`${v.plate} (${v.brand} ${v.model})`:id;};
  const driverInfo=(id?:string)=>{if(!id)return 'Não identificado';const d=drivers.find(item=>item.id===id);return d?d.fullName:id;};
  const filtered=useMemo(()=>tickets.filter(t=>{
    const term=searchTerm.toLowerCase();
    return (!term||t.autoNumber.toLowerCase().includes(term)||t.description.toLowerCase().includes(term)||vehicleInfo(t.vehicleId).toLowerCase().includes(term)||driverInfo(t.driverId).toLowerCase().includes(term))
      &&(statusFilter==='ALL'||t.status===statusFilter)&&(responsibilityFilter==='ALL'||t.responsibility===responsibilityFilter);
  }),[tickets,vehicles,drivers,searchTerm,statusFilter,responsibilityFilter]);

  const total=tickets.reduce((sum,t)=>sum+t.originalAmount,0);
  const pending=tickets.filter(t=>t.responsibility===TicketResponsibility.UNIDENTIFIED).length;
  const driverCharges=tickets.filter(t=>t.responsibility===TicketResponsibility.DRIVER&&Boolean(t.receivableId)).length;
  const ticketModalResetKey=isFormOpen?'form':selectedTicketId?`details:${selectedTicketId}`:'none';

  return <div className="p-4 sm:p-6 space-y-6 max-w-7xl mx-auto">
    <PageHeader title="Multas de Trânsito" description="Autoridade server-side, vínculo financeiro e NIC auditável" breadcrumb="Operação • Gestão de Multas" primaryAction={{label:'Nova Multa',onClick:()=>setIsFormOpen(true),icon:<Plus className="w-4 h-4"/>}}/>
    {error&&<Card className="p-4 text-sm text-rose-700 bg-rose-50">{error}</Card>}
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      <Card className="p-4"><span className="text-xs text-slate-500">Multas</span><div className="text-2xl font-bold">{tickets.length}</div><AlertTriangle className="w-5 h-5 text-amber-500"/></Card>
      <Card className="p-4"><span className="text-xs text-slate-500">Não identificadas / NIC</span><div className="text-2xl font-bold">{pending}</div><ShieldAlert className="w-5 h-5 text-amber-500"/></Card>
      <Card className="p-4"><span className="text-xs text-slate-500">Reembolsos de motorista</span><div className="text-2xl font-bold">{driverCharges}</div><User className="w-5 h-5 text-indigo-500"/></Card>
      <Card className="p-4"><span className="text-xs text-slate-500">Valor original acumulado</span><div className="text-xl font-bold">{formatCurrencyBRL(total)}</div><DollarSign className="w-5 h-5 text-emerald-500"/></Card>
    </div>
    <Card className="p-4 grid grid-cols-1 md:grid-cols-3 gap-3">
      <Input value={searchTerm} onChange={e=>setSearchTerm(e.target.value)} placeholder="Auto, descrição, placa ou motorista..."/>
      <Select value={responsibilityFilter} onChange={e=>setResponsibilityFilter(e.target.value)}>
        <option value="ALL">Todas as responsabilidades</option>
        {Object.values(TicketResponsibility).map(value=><option key={value} value={value}>{value}</option>)}
      </Select>
      <Select value={statusFilter} onChange={e=>setStatusFilter(e.target.value)}>
        <option value="ALL">Todos os status</option>
        {Object.values(TicketStatus).map(value=><option key={value} value={value}>{value}</option>)}
      </Select>
    </Card>
    <Card className="overflow-x-auto">
      {loading?<div className="p-10 text-center text-sm text-slate-500">Carregando multas...</div>:filtered.length===0?<div className="p-10 text-center text-sm text-slate-500">Nenhuma multa encontrada.</div>:
      <table className="w-full text-xs"><thead><tr className="border-b"><th className="p-3 text-left">Auto</th><th className="p-3 text-left">Veículo</th><th className="p-3 text-left">Motorista</th><th className="p-3 text-left">Vencimento</th><th className="p-3 text-left">Valor</th><th className="p-3 text-left">Responsabilidade</th><th className="p-3 text-left">Status</th><th className="p-3"/></tr></thead>
      <tbody>{filtered.map(t=><tr key={t.id} className="border-b last:border-0"><td className="p-3 font-mono font-semibold">{t.autoNumber}</td><td className="p-3">{vehicleInfo(t.vehicleId)}</td><td className="p-3">{driverInfo(t.driverId)}</td><td className="p-3">{new Date(`${t.dueDate}T00:00:00`).toLocaleDateString('pt-BR')}</td><td className="p-3">{formatCurrencyBRL(t.originalAmount)}</td><td className="p-3"><Badge variant={t.responsibility===TicketResponsibility.UNIDENTIFIED?'warning':t.responsibility===TicketResponsibility.DRIVER?'indigo':'slate'}>{t.responsibility}</Badge></td><td className="p-3"><Badge variant={t.status===TicketStatus.CANCELLED?'danger':t.status===TicketStatus.PAID_BY_COMPANY?'success':t.status===TicketStatus.APPEALED?'warning':'secondary'}>{t.status}</Badge></td><td className="p-3 text-right"><Button variant="outline" size="sm" onClick={()=>setSelectedTicketId(t.id)}>Detalhes</Button></td></tr>)}</tbody></table>}
    </Card>
    <LazyModuleErrorBoundary resetKey={ticketModalResetKey} onRetry={()=>window.location.reload()}>
      <Suspense fallback={<div role="status" className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/20"><div className="rounded-xl bg-white px-4 py-3 text-sm text-slate-600 shadow-xl dark:bg-slate-900 dark:text-slate-300">Carregando dados da multa...</div></div>}>
        {isFormOpen&&<TrafficTicketFormModal isOpen onClose={()=>setIsFormOpen(false)} onSuccess={()=>void loadData()}/>}
        {selectedTicketId&&<TrafficTicketDetailsModal isOpen onClose={()=>setSelectedTicketId(null)} ticketId={selectedTicketId} onRefresh={()=>void loadData()}/>}
      </Suspense>
    </LazyModuleErrorBoundary>
  </div>;
};
