import React,{useEffect,useState}from'react';
import { TrackerClient,type TelemetryKmDivergenceSummary } from '../../api/trackerClient';
import { VehicleClient } from '../../api/vehicleClient';
import type { Tracker,Vehicle } from '../../types/entities';
import { Badge,Button,Card } from '../ui';
import { Gauge } from 'lucide-react';

type Row={tracker:Tracker;vehicle:Vehicle|undefined;summary:TelemetryKmDivergenceSummary|null;error:string};

const directionLabel=(direction:TelemetryKmDivergenceSummary['direction']):string=>direction==='ALIGNED'?'Alinhado':direction==='TELEMETRY_ABOVE'?'Telemetria acima':direction==='TELEMETRY_BELOW'?'Telemetria abaixo':'Sem leitura disponível';
const directionVariant=(direction:TelemetryKmDivergenceSummary['direction']):'success'|'warning'|'secondary'=>direction==='ALIGNED'?'success':direction==='UNAVAILABLE'?'secondary':'warning';
const km=(value:number|null):string=>value===null?'Indisponível':`${new Intl.NumberFormat('pt-BR',{maximumFractionDigits:3}).format(value)} km`;

export const TelemetryKmDivergenceOverview:React.FC=()=>{
  const[rows,setRows]=useState<Row[]>([]),[loading,setLoading]=useState(true),[error,setError]=useState('');
  const load=async()=>{
    setLoading(true);setError('');setRows([]);
    try{
      const[trackers,vehicles]=await Promise.all([TrackerClient.list(),VehicleClient.list()]);
      const active=trackers.filter(item=>item.status==='ACTIVE');
      const vehicleById=new Map(vehicles.filter(item=>!item.isArchived).map(item=>[item.id,item]));
      const resolved=await Promise.all(active.map(async tracker=>{
        try{return{tracker,vehicle:vehicleById.get(tracker.vehicleId),summary:await TrackerClient.getTelemetryKmDivergence(tracker.id),error:''};}
        catch(err:unknown){return{tracker,vehicle:vehicleById.get(tracker.vehicleId),summary:null,error:err instanceof Error?err.message:'Falha ao consultar divergência de KM.'};}
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
          <div><h3 className="flex items-center gap-2 text-sm font-bold"><Gauge className="h-4 w-4 text-blue-600"/>Divergência de KM — leitura autoritativa</h3><p className="mt-1 text-xs text-slate-500">Compara o KM oficial do veículo com o último odômetro telemétrico aceito. A tela não recalcula nem aplica valores.</p></div>
          <Button size="sm" variant="outline" disabled={loading} onClick={()=>void load()}>{loading?'Consultando...':'Atualizar comparação'}</Button>
        </div>
        {error&&<div className="rounded-lg border border-rose-300 bg-rose-50 p-3 text-xs text-rose-700">{error}</div>}
        {!error&&!loading&&rows.length===0&&<p className="rounded-lg border border-dashed p-4 text-xs text-slate-500">Nenhum rastreador ativo disponível para comparação.</p>}
        {rows.length>0&&<div className="grid gap-3 lg:grid-cols-2">{rows.map(row=><div key={row.tracker.id} className="rounded-xl border p-3 text-xs">
          <div className="flex items-start justify-between gap-3"><div><strong>{row.vehicle?`${row.vehicle.plate} — ${row.vehicle.brand} ${row.vehicle.model}`:row.tracker.equipmentModel||'Rastreador GPS'}</strong><p className="mt-0.5 text-[11px] text-slate-500">Rastreador {row.tracker.equipmentModel||row.tracker.id}</p></div>{row.summary&&<Badge variant={directionVariant(row.summary.direction)}>{directionLabel(row.summary.direction)}</Badge>}</div>
          {row.error?<p className="mt-3 rounded-lg bg-rose-50 p-2 text-rose-700">Comparação indisponível: {row.error}</p>:row.summary&&<div className="mt-3 grid grid-cols-2 gap-2 rounded-lg bg-slate-50 p-2.5 dark:bg-slate-950/40">
            <span>KM oficial: <strong>{km(row.summary.authoritativeVehicleKm)}</strong></span>
            <span>Odômetro aceito: <strong>{km(row.summary.telemetryOdometerKm)}</strong></span>
            <span>Diferença: <strong>{km(row.summary.differenceKm)}</strong></span>
            <span>Limiar informativo: <strong>{km(row.summary.thresholdKm)}</strong></span>
            <p className="col-span-2 text-[11px] text-slate-500">Estado: <strong>{directionLabel(row.summary.direction)}</strong>. Valores e classificação vêm do servidor; eventos em quarentena não são usados e nenhum botão desta visão altera o KM oficial.</p>
          </div>}
        </div>)}</div>}
      </div>
    </Card>
  </div>;
};
