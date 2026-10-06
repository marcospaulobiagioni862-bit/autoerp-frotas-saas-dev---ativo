import React,{useEffect,useMemo,useState} from 'react';
import {ClipboardCheck,RefreshCw} from 'lucide-react';
import {VehicleClient} from '../../api/vehicleClient';
import type {Vehicle} from '../../types/entities';
import {Button,Card} from '../ui';
import {VehicleInspectionPanel} from './VehicleInspectionPanel';

export function VehicleInspectionsView(){
  const[vehicles,setVehicles]=useState<Vehicle[]>([]);
  const[selectedVehicleId,setSelectedVehicleId]=useState('');
  const[loading,setLoading]=useState(true);
  const[error,setError]=useState<string|null>(null);

  const load=async()=>{
    setLoading(true);setError(null);
    try{
      const rows=(await VehicleClient.list()).filter(vehicle=>!vehicle.isArchived);
      setVehicles(rows);
      setSelectedVehicleId(current=>current&&rows.some(vehicle=>vehicle.id===current)?current:(rows[0]?.id||''));
    }catch(error){
      setVehicles([]);
      setSelectedVehicleId('');
      setError(error instanceof Error?error.message:'Falha ao carregar veículos para vistoria.');
    }finally{setLoading(false);}
  };

  useEffect(()=>{void load();},[]);
  const selectedVehicle=useMemo(()=>vehicles.find(vehicle=>vehicle.id===selectedVehicleId)||null,[vehicles,selectedVehicleId]);

  return <div className="p-4 sm:p-6 space-y-4">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div>
        <p className="text-xs font-semibold uppercase tracking-wider text-violet-500">Operação • Vistorias</p>
        <h1 className="mt-1 flex items-center gap-2 text-2xl font-bold"><ClipboardCheck className="h-6 w-6"/>Vistorias de Veículos</h1>
        <p className="mt-1 text-sm text-slate-500">Check-in/check-out, KM, checklist técnico, pneus, bateria e evidências.</p>
      </div>
      <Button size="sm" variant="ghost" onClick={()=>void load()} icon={<RefreshCw className="h-4 w-4"/>}>Atualizar</Button>
    </div>

    <Card padding="md">
      <label className="block text-xs font-semibold text-slate-500">Veículo para vistoria</label>
      <select
        aria-label="Veículo para vistoria"
        className="mt-2 w-full rounded-lg border border-slate-300 bg-transparent p-2 text-sm dark:border-slate-700"
        value={selectedVehicleId}
        onChange={event=>setSelectedVehicleId(event.target.value)}
      >
        {vehicles.map(vehicle=><option key={vehicle.id} value={vehicle.id}>{vehicle.plate} — {vehicle.brand} {vehicle.model}</option>)}
      </select>
      {selectedVehicle&&<div className="mt-3 grid gap-2 text-xs text-slate-500 sm:grid-cols-3">
        <span><strong className="text-slate-700 dark:text-slate-200">Placa:</strong> {selectedVehicle.plate}</span>
        <span><strong className="text-slate-700 dark:text-slate-200">KM atual:</strong> {selectedVehicle.currentKm.toLocaleString('pt-BR')}</span>
        <span><strong className="text-slate-700 dark:text-slate-200">Status:</strong> {selectedVehicle.status}</span>
      </div>}
    </Card>

    {error&&<div className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-xs text-rose-700">{error}</div>}
    {loading?<div className="p-6 text-center text-sm text-slate-500">Carregando veículos...</div>:selectedVehicle?
      <VehicleInspectionPanel vehicleId={selectedVehicle.id} currentKm={selectedVehicle.currentKm}/>:
      <div className="rounded-xl border p-6 text-center text-sm text-slate-500">Nenhum veículo disponível para vistoria.</div>}
  </div>;
}
