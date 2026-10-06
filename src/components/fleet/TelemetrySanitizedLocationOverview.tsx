import React,{useEffect,useState}from'react';
import { MapPin } from 'lucide-react';
import { TrackerClient } from '../../api/trackerClient';
import { TelemetrySanitizedLocationClient,type SanitizedTelemetryLocation,type TelemetryLocationFreshness } from '../../api/telemetrySanitizedLocationClient';
import { VehicleClient } from '../../api/vehicleClient';
import type { Tracker,Vehicle } from '../../types/entities';
import { Badge,Button,Card } from '../ui';

type Row={tracker:Tracker;vehicle:Vehicle|undefined;location:SanitizedTelemetryLocation|null;error:string};

const freshnessLabel=(freshness:TelemetryLocationFreshness):string=>freshness==='FRESH'?'Localização recente':freshness==='STALE'?'Localização antiga':freshness==='OFFLINE'?'Rastreador offline':'Sem localização';
const freshnessVariant=(freshness:TelemetryLocationFreshness):'success'|'warning'|'danger'|'secondary'=>freshness==='FRESH'?'success':freshness==='STALE'?'warning':freshness==='OFFLINE'?'danger':'secondary';
const coordinate=(value:number|null):string=>value===null?'Indisponível':new Intl.NumberFormat('pt-BR',{minimumFractionDigits:3,maximumFractionDigits:3}).format(value);

export const TelemetrySanitizedLocationOverview:React.FC=()=>{
  const[rows,setRows]=useState<Row[]>([]),[loading,setLoading]=useState(true),[error,setError]=useState('');
  const load=async()=>{
    setLoading(true);setError('');setRows([]);
    try{
      const[trackers,vehicles]=await Promise.all([TrackerClient.list(),VehicleClient.list()]);
      const vehicleById=new Map(vehicles.filter(item=>!item.isArchived).map(item=>[item.id,item]));
      const active=trackers.filter(item=>item.status==='ACTIVE');
      const resolved=await Promise.all(active.map(async tracker=>{
        try{return{tracker,vehicle:vehicleById.get(tracker.vehicleId),location:await TelemetrySanitizedLocationClient.get(tracker.id),error:''};}
        catch(err:unknown){return{tracker,vehicle:vehicleById.get(tracker.vehicleId),location:null,error:err instanceof Error?err.message:'Falha ao consultar localização telemétrica.'};}
      }));
      setRows(resolved);
    }catch(err:unknown){setError(err instanceof Error?err.message:'Falha ao carregar localização telemétrica da frota.');}
    finally{setLoading(false);}
  };
  useEffect(()=>{void load();},[]);

  return <div className="px-4 pt-4 sm:px-6 sm:pt-6 max-w-7xl mx-auto">
    <Card padding="md">
      <div className="space-y-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div><h3 className="flex items-center gap-2 text-sm font-bold"><MapPin className="h-4 w-4 text-blue-600"/>Localização operacional sanitizada — somente leitura</h3><p className="mt-1 text-xs text-slate-500">Mostra apenas a última posição aceita, já arredondada e classificada pelo servidor. Não cria geofence, bloqueio, multa, cobrança ou qualquer automação.</p></div>
          <Button size="sm" variant="outline" disabled={loading} onClick={()=>void load()}>{loading?'Consultando...':'Atualizar localização'}</Button>
        </div>
        {error&&<div className="rounded-lg border border-rose-300 bg-rose-50 p-3 text-xs text-rose-700">{error}</div>}
        {!error&&!loading&&rows.length===0&&<p className="rounded-lg border border-dashed p-4 text-xs text-slate-500">Nenhum rastreador ativo disponível.</p>}
        {rows.length>0&&<div className="grid gap-3 lg:grid-cols-2">{rows.map(row=><div key={row.tracker.id} className="rounded-xl border p-3 text-xs">
          <div className="flex items-start justify-between gap-3"><div><strong>{row.vehicle?`${row.vehicle.plate} — ${row.vehicle.brand} ${row.vehicle.model}`:row.tracker.equipmentModel||'Rastreador GPS'}</strong><p className="mt-0.5 text-[11px] text-slate-500">Rastreador {row.tracker.equipmentModel||row.tracker.id}</p></div>{row.location&&<Badge variant={freshnessVariant(row.location.freshness)}>{freshnessLabel(row.location.freshness)}</Badge>}</div>
          {row.error?<p className="mt-3 rounded-lg bg-rose-50 p-2 text-rose-700">Localização indisponível: {row.error}</p>:row.location&&<div className="mt-3 grid grid-cols-2 gap-1.5 rounded-lg bg-slate-50 p-2.5 text-[11px] dark:bg-slate-950/40">
            <span>Latitude: <strong>{coordinate(row.location.latitude)}</strong></span><span>Longitude: <strong>{coordinate(row.location.longitude)}</strong></span>
            <span className="col-span-2">Último evento aceito: <strong>{row.location.occurredAt?new Date(row.location.occurredAt).toLocaleString('pt-BR'):'Indisponível'}</strong></span>
            <p className="col-span-2 mt-1 text-slate-500">Estado: <strong>{freshnessLabel(row.location.freshness)}</strong>. Coordenadas e atualidade vêm do servidor; payload bruto, IMEI, companyId, segredos e credenciais não são expostos.</p>
          </div>}
        </div>)}</div>}
      </div>
    </Card>
  </div>;
};
