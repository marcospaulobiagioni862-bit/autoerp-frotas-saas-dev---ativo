import React,{useMemo,useState}from'react';
import type { FleetTelemetryAttentionReason,FleetTelemetryHealthState,TelemetryFleetScorecardSummary,TelemetryMovementState } from '../../api/telemetryFleetScorecardClient';
import { Badge,Button } from '../ui';
import { createTelemetryScorecardTriageCounts,selectTelemetryScorecardVisibleItems,TELEMETRY_SCORECARD_INITIAL_VISIBLE_ITEMS,triageTelemetryScorecardItems,type TelemetryScorecardHealthFilter,type TelemetryScorecardMovementFilter,type TelemetryScorecardReasonFilter } from './telemetryFleetScorecardTriage';

const healthLabel=(state:FleetTelemetryHealthState):string=>state==='HEALTHY'?'Saudável':state==='ATTENTION'?'Atenção':state==='OFFLINE'?'Offline':state==='STALE'?'Comunicação antiga':'Sem dados';
const movementLabel=(state:TelemetryMovementState):string=>state==='MOVING'?'Em movimento':state==='STOPPED'?'Parado':state==='STALE'?'Leitura antiga':'Sem base suficiente';
const reasonLabel=(reason:FleetTelemetryAttentionReason):string=>reason==='HEALTH_ATTENTION'?'Saúde requer atenção':reason==='HEALTH_OFFLINE'?'Rastreador offline':reason==='HEALTH_STALE'?'Comunicação antiga':reason==='HEALTH_NO_DATA'?'Sem dados de saúde':reason==='MOVEMENT_STALE'?'Movimento com leitura antiga':'Movimento sem base suficiente';

const SelectField:React.FC<{label:string;value:string;onChange:(value:string)=>void;children:React.ReactNode}>=({label,value,onChange,children})=><label className="grid gap-1 text-[11px] font-medium text-slate-600 dark:text-slate-300"><span>{label}</span><select className="rounded-lg border bg-white px-2 py-1.5 text-[11px] dark:bg-slate-900" value={value} onChange={event=>onChange(event.target.value)}>{children}</select></label>;

export const TelemetryFleetScorecardTriagePanel:React.FC<{scorecard:TelemetryFleetScorecardSummary}>=({scorecard})=>{
  const[health,setHealth]=useState<TelemetryScorecardHealthFilter>('ALL'),[movement,setMovement]=useState<TelemetryScorecardMovementFilter>('ALL'),[reason,setReason]=useState<TelemetryScorecardReasonFilter>('ALL'),[expanded,setExpanded]=useState(false);
  const counts=useMemo(()=>createTelemetryScorecardTriageCounts(scorecard.attentionItems),[scorecard.attentionItems]);
  const filtered=useMemo(()=>triageTelemetryScorecardItems(scorecard.attentionItems,{health,movement,reason}),[scorecard.attentionItems,health,movement,reason]);
  const visible=useMemo(()=>selectTelemetryScorecardVisibleItems(filtered,expanded),[filtered,expanded]);
  const hiddenCount=Math.max(0,filtered.length-visible.length),hasFilters=health!=='ALL'||movement!=='ALL'||reason!=='ALL';
  const changeHealth=(value:string)=>{setHealth(value as TelemetryScorecardHealthFilter);setExpanded(false);};
  const changeMovement=(value:string)=>{setMovement(value as TelemetryScorecardMovementFilter);setExpanded(false);};
  const changeReason=(value:string)=>{setReason(value as TelemetryScorecardReasonFilter);setExpanded(false);};
  const clear=()=>{setHealth('ALL');setMovement('ALL');setReason('ALL');setExpanded(false);};
  if(scorecard.attentionItems.length===0)return null;
  return <div className="mt-3 rounded-lg border bg-white p-3 dark:bg-slate-900">
    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between"><div><p className="text-[11px] font-semibold">Triagem local do scorecard</p><p className="text-[10px] text-slate-500">Filtros aplicados somente aos itens sanitizados já recebidos; nenhum dado é recalculado ou enviado ao servidor.</p></div><Badge variant={filtered.length>0?'warning':'secondary'}>{filtered.length} de {scorecard.attentionItems.length}</Badge></div>
    <div className="mt-3 grid gap-2 sm:grid-cols-3">
      <SelectField label="Saúde" value={health} onChange={changeHealth}><option value="ALL">Todos ({scorecard.attentionItems.length})</option><option value="OFFLINE">Offline ({counts.health.OFFLINE})</option><option value="ATTENTION">Atenção ({counts.health.ATTENTION})</option><option value="STALE">Comunicação antiga ({counts.health.STALE})</option><option value="NO_DATA">Sem dados ({counts.health.NO_DATA})</option><option value="HEALTHY">Saudável ({counts.health.HEALTHY})</option></SelectField>
      <SelectField label="Movimento" value={movement} onChange={changeMovement}><option value="ALL">Todos ({scorecard.attentionItems.length})</option><option value="STALE">Leitura antiga ({counts.movement.STALE})</option><option value="UNAVAILABLE">Sem base ({counts.movement.UNAVAILABLE})</option><option value="STOPPED">Parado ({counts.movement.STOPPED})</option><option value="MOVING">Em movimento ({counts.movement.MOVING})</option></SelectField>
      <SelectField label="Motivo" value={reason} onChange={changeReason}><option value="ALL">Todos os motivos</option><option value="HEALTH_OFFLINE">Rastreador offline ({counts.reason.HEALTH_OFFLINE})</option><option value="HEALTH_ATTENTION">Saúde requer atenção ({counts.reason.HEALTH_ATTENTION})</option><option value="HEALTH_STALE">Comunicação antiga ({counts.reason.HEALTH_STALE})</option><option value="HEALTH_NO_DATA">Sem dados de saúde ({counts.reason.HEALTH_NO_DATA})</option><option value="MOVEMENT_STALE">Movimento antigo ({counts.reason.MOVEMENT_STALE})</option><option value="MOVEMENT_UNAVAILABLE">Movimento sem base ({counts.reason.MOVEMENT_UNAVAILABLE})</option></SelectField>
    </div>
    {hasFilters&&<div className="mt-2 flex justify-end"><Button size="sm" variant="outline" onClick={clear}>Limpar filtros</Button></div>}
    {filtered.length===0?<p className="mt-3 rounded-lg border border-dashed p-3 text-[11px] text-slate-500">Nenhum item corresponde aos filtros atuais. Os itens sanitizados originais continuam preservados; limpe os filtros para exibi-los.</p>:<>
      <div className="mt-3 flex flex-col gap-2 text-[11px] text-slate-500 sm:flex-row sm:items-center sm:justify-between"><span>Exibindo {visible.length} de {filtered.length}{hiddenCount>0?` — ${hiddenCount} oculto${hiddenCount===1?'':'s'}`:''}.</span>{filtered.length>TELEMETRY_SCORECARD_INITIAL_VISIBLE_ITEMS&&<Button size="sm" variant="outline" onClick={()=>setExpanded(value=>!value)}>{expanded?'Mostrar menos':'Exibir todos'}</Button>}</div>
      <div className="mt-2 grid gap-2 md:grid-cols-2">{visible.map(item=><div key={item.trackerId} className="rounded-lg border p-2 text-[11px]"><div className="flex items-start justify-between gap-2"><div><strong>Rastreador {item.trackerId}</strong><p className="text-slate-500">Veículo {item.vehicleId}</p></div><Badge variant={item.healthState==='ATTENTION'||item.healthState==='OFFLINE'?'warning':'secondary'}>{healthLabel(item.healthState)}</Badge></div><p className="mt-1 text-slate-500">Movimento: <strong>{movementLabel(item.movementState)}</strong></p><p className="mt-1 text-slate-500">{item.reasons.map(reasonLabel).join(' • ')}</p></div>)}</div>
    </>}
  </div>;
};
