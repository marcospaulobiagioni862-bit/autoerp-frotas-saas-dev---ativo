import React,{useEffect,useState}from'react';
import { TrackerClient,type TelemetryKmDivergenceSummary } from '../../api/trackerClient';
import { TelemetryMaintenanceAdvisoryClient,type TelemetryMaintenanceAdvisorySummary,type TelemetryMaintenanceAdvisoryState } from '../../api/telemetryMaintenanceAdvisoryClient';
import { TelemetryContractExcessKmClient,type TelemetryContractExcessKmState,type TelemetryContractExcessKmSummary } from '../../api/telemetryContractExcessKmClient';
import { TelemetryMovementAdvisoryClient,type TelemetryMovementState,type TelemetryMovementSummary } from '../../api/telemetryMovementAdvisoryClient';
import { TelemetryFleetScorecardClient,type FleetTelemetryAttentionReason,type FleetTelemetryHealthState,type TelemetryFleetScorecardSummary } from '../../api/telemetryFleetScorecardClient';
import { VehicleClient } from '../../api/vehicleClient';
import type { Tracker,Vehicle } from '../../types/entities';
import { Badge,Button,Card } from '../ui';
import { Activity,Gauge,Wrench,Route,Navigation } from 'lucide-react';

type Row={tracker:Tracker;vehicle:Vehicle|undefined;summary:TelemetryKmDivergenceSummary|null;advisory:TelemetryMaintenanceAdvisorySummary|null;contractKm:TelemetryContractExcessKmSummary|null;movement:TelemetryMovementSummary|null;error:string;advisoryError:string;contractKmError:string;movementError:string};

const directionLabel=(direction:TelemetryKmDivergenceSummary['direction']):string=>direction==='ALIGNED'?'Alinhado':direction==='TELEMETRY_ABOVE'?'Telemetria acima':direction==='TELEMETRY_BELOW'?'Telemetria abaixo':'Sem leitura disponível';
const directionVariant=(direction:TelemetryKmDivergenceSummary['direction']):'success'|'warning'|'secondary'=>direction==='ALIGNED'?'success':direction==='UNAVAILABLE'?'secondary':'warning';
const advisoryLabel=(state:TelemetryMaintenanceAdvisoryState):string=>state==='DUE'?'Vencida por KM':state==='DUE_SOON'?'Próxima por KM':state==='NOT_DUE'?'Dentro do intervalo':'Sem base telemétrica';
const advisoryVariant=(state:TelemetryMaintenanceAdvisoryState):'success'|'warning'|'danger'|'secondary'=>state==='DUE'?'danger':state==='DUE_SOON'?'warning':state==='NOT_DUE'?'success':'secondary';
const contractKmLabel=(state:TelemetryContractExcessKmState):string=>state==='EXCEEDED'?'Limite excedido':state==='NEAR_LIMIT'?'Próximo do limite':state==='WITHIN_LIMIT'?'Dentro da franquia':'Base indisponível';
const contractKmVariant=(state:TelemetryContractExcessKmState):'success'|'warning'|'danger'|'secondary'=>state==='EXCEEDED'?'danger':state==='NEAR_LIMIT'?'warning':state==='WITHIN_LIMIT'?'success':'secondary';
const movementLabel=(state:TelemetryMovementState):string=>state==='MOVING'?'Em movimento':state==='STOPPED'?'Parado':state==='STALE'?'Leitura antiga':'Sem base suficiente';
const movementVariant=(state:TelemetryMovementState):'success'|'warning'|'secondary'=>state==='MOVING'?'success':state==='STALE'?'warning':'secondary';
const healthLabel=(state:FleetTelemetryHealthState):string=>state==='HEALTHY'?'Saudável':state==='ATTENTION'?'Atenção':state==='OFFLINE'?'Offline':state==='STALE'?'Comunicação antiga':'Sem dados';
const attentionReasonLabel=(reason:FleetTelemetryAttentionReason):string=>reason==='HEALTH_ATTENTION'?'Saúde requer atenção':reason==='HEALTH_OFFLINE'?'Rastreador offline':reason==='HEALTH_STALE'?'Comunicação antiga':reason==='HEALTH_NO_DATA'?'Sem dados de saúde':reason==='MOVEMENT_STALE'?'Movimento com leitura antiga':'Movimento sem base suficiente';
const km=(value:number|null):string=>value===null?'Indisponível':`${new Intl.NumberFormat('pt-BR',{maximumFractionDigits:3}).format(value)} km`;
const meters=(value:number|null):string=>value===null?'Indisponível':`${new Intl.NumberFormat('pt-BR',{maximumFractionDigits:0}).format(value)} m`;
const seconds=(value:number|null):string=>value===null?'Indisponível':`${new Intl.NumberFormat('pt-BR',{maximumFractionDigits:0}).format(value)} s`;

export const TelemetryKmDivergenceOverview:React.FC=()=>{
  const[rows,setRows]=useState<Row[]>([]),[scorecard,setScorecard]=useState<TelemetryFleetScorecardSummary|null>(null),[loading,setLoading]=useState(true),[error,setError]=useState(''),[scorecardError,setScorecardError]=useState('');
  const load=async()=>{
    setLoading(true);setError('');setScorecardError('');setRows([]);setScorecard(null);
    try{
      const[trackers,vehicles,scorecardResult]=await Promise.all([
        TrackerClient.list(),
        VehicleClient.list(),
        TelemetryFleetScorecardClient.get().then(value=>({value,error:''}),reason=>({value:null,error:reason instanceof Error?reason.message:'Falha ao consultar resumo telemétrico da frota.'})),
      ]);
      setScorecard(scorecardResult.value);setScorecardError(scorecardResult.error);
      const active=trackers.filter(item=>item.status==='ACTIVE');
      const vehicleById=new Map(vehicles.filter(item=>!item.isArchived).map(item=>[item.id,item]));
      const resolved=await Promise.all(active.map(async tracker=>{
        const vehicle=vehicleById.get(tracker.vehicleId);
        const[divergenceResult,advisoryResult,contractKmResult,movementResult]=await Promise.allSettled([TrackerClient.getTelemetryKmDivergence(tracker.id),TelemetryMaintenanceAdvisoryClient.get(tracker.id),TelemetryContractExcessKmClient.get(tracker.id),TelemetryMovementAdvisoryClient.get(tracker.id)]);
        return{
          tracker,
          vehicle,
          summary:divergenceResult.status==='fulfilled'?divergenceResult.value:null,
          advisory:advisoryResult.status==='fulfilled'?advisoryResult.value:null,
          contractKm:contractKmResult.status==='fulfilled'?contractKmResult.value:null,
          movement:movementResult.status==='fulfilled'?movementResult.value:null,
          error:divergenceResult.status==='rejected'?(divergenceResult.reason instanceof Error?divergenceResult.reason.message:'Falha ao consultar divergência de KM.'):'',
          advisoryError:advisoryResult.status==='rejected'?(advisoryResult.reason instanceof Error?advisoryResult.reason.message:'Falha ao consultar manutenção preventiva por telemetria.'):'',
          contractKmError:contractKmResult.status==='rejected'?(contractKmResult.reason instanceof Error?contractKmResult.reason.message:'Falha ao consultar KM contratual telemétrico.'):'',
          movementError:movementResult.status==='rejected'?(movementResult.reason instanceof Error?movementResult.reason.message:'Falha ao consultar estado de movimento.'):'',
        };
      }));
      setRows(resolved);
    }catch(err:unknown){setError(err instanceof Error?err.message:'Falha ao carregar rastreadores para a comparação de KM.');}
    finally{setLoading(false);}
  };
  useEffect(()=>{void load();},[]);

  return <div className="px-4 pt-4 sm:px-6 sm:pt-6 max-w-7xl mx-auto">
    <Card padding="md">
      <div className="space-y-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div><h3 className="flex items-center gap-2 text-sm font-bold"><Gauge className="h-4 w-4 text-blue-600"/>Telemetria operacional — leitura consultiva</h3><p className="mt-1 text-xs text-slate-500">Compara KM, manutenção, contrato e estado de movimento usando somente eventos aceitos e cálculos server-side. Nada nesta visão altera KM, abre OS, bloqueia veículo ou gera cobrança.</p></div>
          <Button size="sm" variant="outline" disabled={loading} onClick={()=>void load()}>{loading?'Consultando...':'Atualizar telemetria'}</Button>
        </div>
        {scorecardError&&<div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-xs text-amber-800">Resumo da frota indisponível: {scorecardError}</div>}
        {scorecard&&<div className="rounded-xl border bg-slate-50/70 p-3 dark:bg-slate-950/30">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between"><div className="flex items-center gap-2 text-xs font-semibold"><Activity className="h-4 w-4"/>Scorecard telemétrico sanitizado da frota</div><Badge variant={scorecard.attentionTotal>0?'warning':'success'}>{scorecard.attentionTotal} item(ns) para conferência</Badge></div>
          <div className="mt-3 grid grid-cols-2 gap-2 text-[11px] sm:grid-cols-4 lg:grid-cols-6">
            <div className="rounded-lg border bg-white p-2 dark:bg-slate-900"><span className="text-slate-500">Rastreadores ativos</span><strong className="mt-1 block text-sm">{scorecard.totalActiveTrackers}</strong></div>
            <div className="rounded-lg border bg-white p-2 dark:bg-slate-900"><span className="text-slate-500">Saudáveis</span><strong className="mt-1 block text-sm">{scorecard.healthCounts.HEALTHY}</strong></div>
            <div className="rounded-lg border bg-white p-2 dark:bg-slate-900"><span className="text-slate-500">Atenção/offline</span><strong className="mt-1 block text-sm">{scorecard.healthCounts.ATTENTION+scorecard.healthCounts.OFFLINE}</strong></div>
            <div className="rounded-lg border bg-white p-2 dark:bg-slate-900"><span className="text-slate-500">Comunicação antiga/sem dados</span><strong className="mt-1 block text-sm">{scorecard.healthCounts.STALE+scorecard.healthCounts.NO_DATA}</strong></div>
            <div className="rounded-lg border bg-white p-2 dark:bg-slate-900"><span className="text-slate-500">Em movimento</span><strong className="mt-1 block text-sm">{scorecard.movementCounts.MOVING}</strong></div>
            <div className="rounded-lg border bg-white p-2 dark:bg-slate-900"><span className="text-slate-500">Parados</span><strong className="mt-1 block text-sm">{scorecard.movementCounts.STOPPED}</strong></div>
          </div>
          {scorecard.attentionItems.length>0&&<div className="mt-3"><p className="mb-2 text-[11px] font-semibold">Prioridade consultiva</p><div className="grid gap-2 md:grid-cols-2">{scorecard.attentionItems.slice(0,6).map(item=><div key={item.trackerId} className="rounded-lg border bg-white p-2 text-[11px] dark:bg-slate-900"><div className="flex items-start justify-between gap-2"><div><strong>Rastreador {item.trackerId}</strong><p className="text-slate-500">Veículo {item.vehicleId}</p></div><Badge variant={item.healthState==='ATTENTION'||item.healthState==='OFFLINE'?'warning':'secondary'}>{healthLabel(item.healthState)}</Badge></div><p className="mt-1 text-slate-500">Movimento: <strong>{movementLabel(item.movementState)}</strong></p><p className="mt-1 text-slate-500">{item.reasons.map(attentionReasonLabel).join(' • ')}</p></div>)}</div></div>}
          <p className="mt-3 text-[11px] text-slate-500">Este scorecard apenas prioriza conferência visual. Não envia notificações, não altera disponibilidade, não cria geofence, bloqueio, multa, cobrança ou qualquer efeito financeiro/contratual.</p>
        </div>}
        {error&&<div className="rounded-lg border border-rose-300 bg-rose-50 p-3 text-xs text-rose-700">{error}</div>}
        {!error&&!loading&&rows.length===0&&<p className="rounded-lg border border-dashed p-4 text-xs text-slate-500">Nenhum rastreador ativo disponível para comparação.</p>}
        {rows.length>0&&<div className="grid gap-3 lg:grid-cols-2">{rows.map(row=><div key={row.tracker.id} className="rounded-xl border p-3 text-xs">
          <div className="flex items-start justify-between gap-3"><div><strong>{row.vehicle?`${row.vehicle.plate} — ${row.vehicle.brand} ${row.vehicle.model}`:row.tracker.equipmentModel||'Rastreador GPS'}</strong><p className="mt-0.5 text-[11px] text-slate-500">Rastreador {row.tracker.equipmentModel||row.tracker.id}</p></div>{row.summary&&<Badge variant={directionVariant(row.summary.direction)}>{directionLabel(row.summary.direction)}</Badge>}</div>
          {row.error?<p className="mt-3 rounded-lg bg-rose-50 p-2 text-rose-700">Comparação indisponível: {row.error}</p>:row.summary&&<div className="mt-3 grid grid-cols-2 gap-2 rounded-lg bg-slate-50 p-2.5 dark:bg-slate-950/40">
            <span>KM oficial: <strong>{km(row.summary.authoritativeVehicleKm)}</strong></span>
            <span>Odômetro aceito: <strong>{km(row.summary.telemetryOdometerKm)}</strong></span>
            <span>Diferença: <strong>{km(row.summary.differenceKm)}</strong></span>
            <span>Limiar informativo: <strong>{km(row.summary.thresholdKm)}</strong></span>
            <p className="col-span-2 text-[11px] text-slate-500">Estado: <strong>{directionLabel(row.summary.direction)}</strong>. Valores e classificação vêm do servidor; eventos em quarentena não são usados.</p>
          </div>}
          <div className="mt-3 border-t pt-3">
            <div className="mb-2 flex items-center justify-between gap-2"><div className="flex items-center gap-2 font-semibold"><Navigation className="h-3.5 w-3.5"/>Estado de movimento — conferência telemétrica</div>{row.movement&&<Badge variant={movementVariant(row.movement.state)}>{movementLabel(row.movement.state)}</Badge>}</div>
            {row.movementError&&<p className="rounded-lg bg-rose-50 p-2 text-rose-700">Movimento indisponível: {row.movementError}</p>}
            {!row.movementError&&row.movement&&<div className="grid grid-cols-2 gap-1.5 rounded-lg border p-2.5 text-[11px]">
              <span>Estado: <strong>{movementLabel(row.movement.state)}</strong></span><span>Distância entre leituras: <strong>{meters(row.movement.distanceMeters)}</strong></span>
              <span>Intervalo: <strong>{seconds(row.movement.elapsedSeconds)}</strong></span><span>Última leitura: <strong>{row.movement.latestOccurredAt?new Date(row.movement.latestOccurredAt).toLocaleString('pt-BR'):'Indisponível'}</strong></span>
              <p className="col-span-2 mt-1 text-slate-500">Classificação derivada no servidor somente das últimas posições aceitas. O navegador não recebe coordenadas nesta consulta e o resultado não cria geofence, bloqueio, multa, cobrança ou punição.</p>
            </div>}
          </div>
          <div className="mt-3 border-t pt-3">
            <div className="mb-2 flex items-center gap-2 font-semibold"><Wrench className="h-3.5 w-3.5"/>Manutenção preventiva por KM telemétrico</div>
            {row.advisoryError&&<p className="rounded-lg bg-rose-50 p-2 text-rose-700">Alerta preventivo indisponível: {row.advisoryError}</p>}
            {!row.advisoryError&&row.advisory&&row.advisory.plans.length===0&&<p className="rounded-lg border border-dashed p-2 text-slate-500">Nenhum plano preventivo ativo para este veículo.</p>}
            {!row.advisoryError&&row.advisory&&row.advisory.plans.length>0&&<div className="space-y-2">{row.advisory.plans.map(plan=><div key={plan.planId} className="rounded-lg border p-2.5">
              <div className="flex items-start justify-between gap-2"><div><strong>{plan.name}</strong><p className="text-[11px] text-slate-500">Prioridade {plan.priority}</p></div><Badge variant={advisoryVariant(plan.state)}>{advisoryLabel(plan.state)}</Badge></div>
              <div className="mt-2 grid grid-cols-2 gap-1.5 text-[11px]"><span>Próximo KM: <strong>{km(plan.nextDueKm)}</strong></span><span>Saldo telemétrico: <strong>{km(plan.telemetryKmRemaining)}</strong></span><span>KM oficial: <strong>{km(plan.authoritativeVehicleKm)}</strong></span><span>Odômetro aceito: <strong>{km(plan.telemetryOdometerKm)}</strong></span></div>
            </div>)}</div>}
            {row.advisory&&<p className="mt-2 text-[11px] text-slate-500">Limiar de proximidade definido pelo servidor: <strong>{km(row.advisory.dueSoonThresholdKm)}</strong>. O alerta é apenas consultivo.</p>}
          </div>
          <div className="mt-3 border-t pt-3">
            <div className="mb-2 flex items-center justify-between gap-2"><div className="flex items-center gap-2 font-semibold"><Route className="h-3.5 w-3.5"/>KM excedente contratual — conferência telemétrica</div>{row.contractKm&&<Badge variant={contractKmVariant(row.contractKm.state)}>{contractKmLabel(row.contractKm.state)}</Badge>}</div>
            {row.contractKmError&&<p className="rounded-lg bg-rose-50 p-2 text-rose-700">Conferência contratual indisponível: {row.contractKmError}</p>}
            {!row.contractKmError&&row.contractKm&&<div className="grid grid-cols-2 gap-1.5 rounded-lg border p-2.5 text-[11px]">
              <span>Contrato: <strong>{row.contractKm.contractNumber||'Indisponível'}</strong></span><span>Franquia: <strong>{km(row.contractKm.franchiseKm)}</strong></span>
              <span>KM referência: <strong>{km(row.contractKm.referenceKm)}</strong></span><span>Odômetro aceito: <strong>{km(row.contractKm.telemetryOdometerKm)}</strong></span>
              <span>Percorrido estimado: <strong>{km(row.contractKm.telemetryTravelledKm)}</strong></span><span>Saldo estimado: <strong>{km(row.contractKm.telemetryRemainingKm)}</strong></span>
              <span>Excedente estimado: <strong>{km(row.contractKm.telemetryExcessKm)}</strong></span><span>Limiar de alerta: <strong>{km(row.contractKm.nearLimitThresholdKm)}</strong></span>
              <p className="col-span-2 mt-1 text-slate-500">Estado: <strong>{contractKmLabel(row.contractKm.state)}</strong>. Esta apuração é somente consultiva: não altera contrato, KM oficial, Contas a Receber, recebimentos nem fluxo de caixa.</p>
            </div>}
          </div>
        </div>)}</div>}
      </div>
    </Card>
  </div>;
};
