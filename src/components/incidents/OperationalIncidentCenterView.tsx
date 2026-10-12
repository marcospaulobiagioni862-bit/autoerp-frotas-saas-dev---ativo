import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2, Loader2, Plus, RefreshCw, Search, ShieldAlert } from 'lucide-react';
import { OperationalAuthorityClient } from '../../api/operationalAuthorityClient';
import type { IncidentCategory, IncidentSeverity, IncidentStatus, ProductionIncident } from '../../domain/incident-management/types';
import { useAuth } from '../../hooks/useAuth';

interface OperationalIncidentCenterViewProps {
  companyId?: string;
  onNavigate?: (tab: string) => void;
  vehicles?: unknown[];
  contracts?: unknown[];
  drivers?: unknown[];
  maintenances?: unknown[];
  vehicleDocuments?: unknown[];
  driverDocuments?: unknown[];
  tickets?: unknown[];
  insurances?: unknown[];
  trackers?: unknown[];
}

const ACTIVE = new Set<IncidentStatus>(['DETECTED','TRIAGED','ACKNOWLEDGED','INVESTIGATING','CONTAINING','MITIGATED','VALIDATING','ESCALATED','REOPENED']);
const SEVERITY_CLASS:Record<IncidentSeverity,string>={SEV0:'bg-error-bg text-error-text',SEV1:'bg-orange-100 text-orange-800',SEV2:'bg-warning-bg text-warning-text',SEV3:'bg-info-bg text-info-text',SEV4:'bg-graphite-100 text-graphite-700'};

function nextTransition(status:IncidentStatus):IncidentStatus|null{
  switch(status){
    case 'DETECTED':case 'TRIAGED':return 'ACKNOWLEDGED';
    case 'ACKNOWLEDGED':return 'INVESTIGATING';
    case 'INVESTIGATING':return 'CONTAINING';
    case 'CONTAINING':case 'MITIGATED':case 'ESCALATED':return 'RESOLVED';
    case 'RESOLVED':case 'VALIDATING':return 'CLOSED';
    case 'CLOSED':case 'CANCELLED':return 'REOPENED';
    case 'REOPENED':return 'INVESTIGATING';
    default:return null;
  }
}
function transitionLabel(status:IncidentStatus):string{
  const next=nextTransition(status);if(!next)return 'Sem ação';
  return ({ACKNOWLEDGED:'Reconhecer',INVESTIGATING:'Investigar',CONTAINING:'Conter',RESOLVED:'Resolver',CLOSED:'Encerrar',REOPENED:'Reabrir'} as Record<string,string>)[next]||next;
}

export const OperationalIncidentCenterView:React.FC<OperationalIncidentCenterViewProps>=({onNavigate})=>{
  const {user}=useAuth();
  const [items,setItems]=useState<ProductionIncident[]>([]);
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState<string|null>(null);
  const [search,setSearch]=useState('');
  const [severity,setSeverity]=useState<'ALL'|IncidentSeverity>('ALL');
  const [status,setStatus]=useState<'ALL'|'ACTIVE'|'RESOLVED'>('ACTIVE');
  const [creating,setCreating]=useState(false);
  const [busyId,setBusyId]=useState<string|null>(null);
  const [form,setForm]=useState<{title:string;description:string;severity:IncidentSeverity;category:IncidentCategory}>({title:'',description:'',severity:'SEV2',category:'OPERATIONAL_ERROR'});

  const load=useCallback(async()=>{setLoading(true);setError(null);try{setItems(await OperationalAuthorityClient.listIncidents());}catch(err){setItems([]);setError(err instanceof Error?err.message:'Falha ao carregar incidentes');}finally{setLoading(false);}},[]);
  useEffect(()=>{void load();},[load]);

  const filtered=useMemo(()=>items.filter(item=>{
    if(search&&!(item.title+' '+item.description).toLowerCase().includes(search.toLowerCase()))return false;
    if(severity!=='ALL'&&item.severity!==severity)return false;
    if(status==='ACTIVE'&&!ACTIVE.has(item.status))return false;
    if(status==='RESOLVED'&&!['RESOLVED','CLOSED'].includes(item.status))return false;
    return true;
  }),[items,search,severity,status]);
  const activeCount=items.filter(item=>ACTIVE.has(item.status)).length;
  const criticalCount=items.filter(item=>ACTIVE.has(item.status)&&['SEV0','SEV1'].includes(item.severity)).length;

  async function createIncident(event:React.FormEvent){event.preventDefault();setError(null);try{setBusyId('new');const created=await OperationalAuthorityClient.createIncident({title:form.title,description:form.description,severity:form.severity,priority:form.severity==='SEV0'?'P0':form.severity==='SEV1'?'P1':'P2',source:'MANUAL',category:form.category,impactDescription:form.description});setItems(current=>[created,...current]);setCreating(false);setForm({title:'',description:'',severity:'SEV2',category:'OPERATIONAL_ERROR'});}catch(err){setError(err instanceof Error?err.message:'Falha ao criar incidente');}finally{setBusyId(null);}}
  async function advance(item:ProductionIncident){const target=nextTransition(item.status);if(!target)return;setError(null);setBusyId(item.id);try{const updated=await OperationalAuthorityClient.transitionIncident(item.id,{status:target,comment:`${transitionLabel(item.status)} por ${user.name}`});setItems(current=>current.map(value=>value.id===updated.id?updated:value));}catch(err){setError(err instanceof Error?err.message:'Falha ao atualizar incidente');}finally{setBusyId(null);}}

  return <div className="space-y-6 p-6">
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div><div className="flex items-center gap-2"><ShieldAlert className="h-6 w-6 text-error-icon"/><h1 className="text-2xl font-bold text-graphite-900">Central de Incidentes Operacionais</h1></div><p className="mt-1 text-sm text-graphite-500">Sessão: {user.name}</p></div>
      <div className="flex gap-2"><button onClick={()=>void load()} className="inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium"><RefreshCw className="h-4 w-4"/>Atualizar</button><button onClick={()=>setCreating(value=>!value)} className="inline-flex items-center gap-2 rounded-lg bg-graphite-900 px-3 py-2 text-sm font-medium text-white"><Plus className="h-4 w-4"/>Novo incidente</button></div>
    </div>

    <div className="grid gap-3 sm:grid-cols-3"><div className="rounded-xl border bg-white p-4"><div className="text-xs uppercase text-graphite-500">Ativos</div><div className="mt-1 text-2xl font-bold">{activeCount}</div></div><div className="rounded-xl border bg-white p-4"><div className="text-xs uppercase text-graphite-500">Críticos</div><div className="mt-1 text-2xl font-bold text-error-icon">{criticalCount}</div></div><div className="rounded-xl border bg-white p-4"><div className="text-xs uppercase text-graphite-500">Total</div><div className="mt-1 text-2xl font-bold">{items.length}</div></div></div>

    {creating&&<form onSubmit={createIncident} className="grid gap-3 rounded-xl border bg-white p-4 md:grid-cols-2"><input required maxLength={300} value={form.title} onChange={event=>setForm({...form,title:event.target.value})} placeholder="Título do incidente" className="rounded-lg border px-3 py-2"/><select value={form.severity} onChange={event=>setForm({...form,severity:event.target.value as IncidentSeverity})} className="rounded-lg border px-3 py-2"><option value="SEV0">SEV0</option><option value="SEV1">SEV1</option><option value="SEV2">SEV2</option><option value="SEV3">SEV3</option><option value="SEV4">SEV4</option></select><textarea required maxLength={5000} value={form.description} onChange={event=>setForm({...form,description:event.target.value})} placeholder="Descrição e impacto" className="min-h-24 rounded-lg border px-3 py-2 md:col-span-2"/><div className="flex gap-2 md:col-span-2"><button disabled={busyId==='new'} className="rounded-lg bg-action-destructive px-4 py-2 text-sm font-semibold text-on-action-destructive disabled:opacity-50">{busyId==='new'?'Criando...':'Registrar incidente'}</button><button type="button" onClick={()=>setCreating(false)} className="rounded-lg border px-4 py-2 text-sm">Cancelar</button></div></form>}

    {error&&<div className="flex items-center gap-2 rounded-lg border border-error-border bg-error-bg p-3 text-sm text-error-text"><AlertTriangle className="h-4 w-4"/>{error}</div>}

    <div className="flex flex-wrap gap-3 rounded-xl border bg-white p-3"><label className="flex min-w-64 flex-1 items-center gap-2 rounded-lg border px-3"><Search className="h-4 w-4 text-graphite-400"/><input value={search} onChange={event=>setSearch(event.target.value)} placeholder="Buscar incidente" className="w-full py-2 outline-none"/></label><select value={severity} onChange={event=>setSeverity(event.target.value as 'ALL'|IncidentSeverity)} className="rounded-lg border px-3 py-2"><option value="ALL">Todas gravidades</option><option value="SEV0">SEV0</option><option value="SEV1">SEV1</option><option value="SEV2">SEV2</option><option value="SEV3">SEV3</option><option value="SEV4">SEV4</option></select><select value={status} onChange={event=>setStatus(event.target.value as typeof status)} className="rounded-lg border px-3 py-2"><option value="ACTIVE">Ativos</option><option value="RESOLVED">Resolvidos/fechados</option><option value="ALL">Todos</option></select></div>

    {loading?<div className="flex items-center justify-center gap-2 rounded-xl border bg-white p-12 text-graphite-500"><Loader2 className="h-5 w-5 animate-spin"/>Carregando incidentes...</div>:filtered.length===0?<div className="rounded-xl border bg-white p-12 text-center text-graphite-500"><CheckCircle2 className="mx-auto mb-2 h-8 w-8 text-success-icon"/>Nenhum incidente neste filtro.</div>:<div className="space-y-3">{filtered.map(item=><article key={item.id} className="rounded-xl border bg-white p-4 shadow-sm"><div className="flex flex-wrap items-start justify-between gap-3"><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><span className={`rounded-full px-2 py-1 text-xs font-semibold ${SEVERITY_CLASS[item.severity]}`}>{item.severity}</span><span className="rounded-full bg-graphite-100 px-2 py-1 text-xs font-medium">{item.status}</span><span className="text-xs text-graphite-400">{item.category}</span></div><h2 className="mt-2 font-semibold text-graphite-900">{item.title}</h2><p className="mt-1 text-sm text-graphite-600">{item.description}</p><div className="mt-3 flex flex-wrap gap-4 text-xs text-graphite-500"><span>Detectado: {new Date(item.detectedAt).toLocaleString('pt-BR')}</span>{item.assignedTo&&<span>Responsável: {item.assignedTo}</span>}<span>Correlação: {item.correlationId.slice(0,8)}</span></div></div>{nextTransition(item.status)&&<button disabled={busyId===item.id} onClick={()=>void advance(item)} className="rounded-lg border px-3 py-2 text-sm font-medium disabled:opacity-50">{busyId===item.id?'Processando...':transitionLabel(item.status)}</button>}</div>{item.affectedEntityId&&onNavigate&&<button onClick={()=>onNavigate(item.affectedEntityType?.toLowerCase()||'dashboard')} className="mt-3 text-xs font-medium text-info-icon">Abrir entidade relacionada</button>}</article>)}</div>}
  </div>;
};
