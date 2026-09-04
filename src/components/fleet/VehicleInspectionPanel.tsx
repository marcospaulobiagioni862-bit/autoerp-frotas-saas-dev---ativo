import React,{useEffect,useMemo,useState} from 'react';
import { ClipboardCheck,Plus } from 'lucide-react';
import { VehicleInspectionClient,type VehicleInspectionChecklist,type VehicleInspectionType,type VehicleInspection } from '../../api/vehicleInspectionClient';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { FileUpload } from '../documents/FileUpload';
import { AttachmentList } from '../documents/AttachmentList';

const ITEMS=[
  ['keyMain','Chave principal'],['keySpare','Chave reserva'],['crlvPrinted','CRLV impresso'],
  ['phoneHolder','Suporte para celular'],['jack','Macaco'],['triangle','Triângulo'],
  ['wheelWrench','Chave de roda'],['spareTire','Estepe'],['seatCover','Capa de banco'],
  ['ownerManual','Manual do proprietário'],['floorMats','Tapetes'],['multimedia','Multimídia'],
] as const;

function emptyChecklist():VehicleInspectionChecklist{
  return Object.fromEntries(ITEMS.map(([key])=>[key,false])) as unknown as VehicleInspectionChecklist;
}

export function VehicleInspectionPanel({vehicleId,currentKm}:{vehicleId:string;currentKm:number}){
  const[items,setItems]=useState<VehicleInspection[]>([]);
  const[type,setType]=useState<VehicleInspectionType>('EXIT');
  const[odometer,setOdometer]=useState(String(currentKm));
  const[fuelLevel,setFuelLevel]=useState('100');
  const[notes,setNotes]=useState('');
  const[checklist,setChecklist]=useState<VehicleInspectionChecklist>(emptyChecklist());
  const[loading,setLoading]=useState(false);
  const[error,setError]=useState<string|null>(null);
  const[expanded,setExpanded]=useState<string|null>(null);

  const load=async()=>{try{setItems(await VehicleInspectionClient.list(vehicleId));}catch(e){setError(e instanceof Error?e.message:'Falha ao carregar vistorias.');}};
  useEffect(()=>{void load();},[vehicleId]);
  useEffect(()=>{setOdometer(String(currentKm));},[currentKm]);
  const checked=useMemo(()=>Object.values(checklist).filter(Boolean).length,[checklist]);

  const create=async()=>{
    setLoading(true);setError(null);
    try{
      const km=Number(odometer),fuel=Number(fuelLevel);
      if(!Number.isInteger(km)||km<currentKm)throw new Error('A KM da vistoria não pode ser menor que a KM atual do veículo.');
      if(!Number.isInteger(fuel)||fuel<0||fuel>100)throw new Error('Informe combustível entre 0% e 100%.');
      const item=await VehicleInspectionClient.create(vehicleId,{inspectionType:type,odometer:km,fuelLevel:fuel,checklist,notes:notes.trim()||undefined});
      setItems(current=>[item,...current]);setExpanded(item.id);setNotes('');setChecklist(emptyChecklist());
    }catch(e){setError(e instanceof Error?e.message:'Falha ao criar vistoria.');}
    finally{setLoading(false);}
  };

  return <div className="space-y-4">
    <div className="rounded-xl border p-4 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div><h4 className="font-bold flex items-center gap-2"><ClipboardCheck className="w-4 h-4"/>Nova vistoria</h4><p className="text-xs text-slate-500">Entrada e saída usam exatamente o mesmo checklist.</p></div>
        <div className="flex gap-2">
          <Button size="sm" variant={type==='ENTRY'?'primary':'outline'} onClick={()=>setType('ENTRY')}>Entrada</Button>
          <Button size="sm" variant={type==='EXIT'?'primary':'outline'} onClick={()=>setType('EXIT')}>Saída</Button>
        </div>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <Input label="Quilometragem" type="number" value={odometer} onChange={e=>setOdometer(e.target.value)}/>
        <Input label="Combustível (%)" type="number" min="0" max="100" value={fuelLevel} onChange={e=>setFuelLevel(e.target.value)}/>
      </div>
      <div>
        <p className="text-xs font-semibold text-slate-700 dark:text-slate-200 mb-2">Checklist ({checked}/{ITEMS.length})</p>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {ITEMS.map(([key,label])=><label key={key} className="flex items-center gap-2 rounded-lg border p-2 text-xs">
            <input type="checkbox" checked={checklist[key]} onChange={e=>setChecklist(v=>({...v,[key]:e.target.checked}))}/>
            <span>{label}</span>
          </label>)}
        </div>
      </div>
      <div><label className="text-xs font-semibold text-slate-700 dark:text-slate-200">Observações</label><textarea value={notes} onChange={e=>setNotes(e.target.value)} rows={3} className="mt-1 w-full rounded-lg border border-slate-300 bg-white p-3 text-sm dark:border-slate-700 dark:bg-slate-900"/></div>
      {error&&<p className="rounded-lg bg-red-50 p-2 text-xs text-red-700">{error}</p>}
      <Button onClick={()=>void create()} disabled={loading} className="gap-2"><Plus className="w-4 h-4"/>{loading?'Salvando...':'Salvar vistoria'}</Button>
    </div>

    <div className="space-y-2">
      <h4 className="font-bold text-sm">Histórico de vistorias</h4>
      {items.length===0?<p className="rounded-xl border p-5 text-center text-xs text-slate-500">Nenhuma vistoria registrada.</p>:items.map(item=><div key={item.id} className="rounded-xl border p-3 space-y-3">
        <button type="button" onClick={()=>setExpanded(expanded===item.id?null:item.id)} className="w-full text-left">
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
            <div><strong>{item.inspectionType==='ENTRY'?'Vistoria de entrada':'Vistoria de saída'}</strong><p className="text-slate-500">{new Date(item.inspectionDate).toLocaleString('pt-BR')}</p></div>
            <div className="text-right"><strong>{item.odometer.toLocaleString('pt-BR')} KM</strong><p className="text-slate-500">Combustível: {item.fuelLevel}%</p></div>
          </div>
        </button>
        {expanded===item.id&&<div className="space-y-3 border-t pt-3">
          <div className="grid gap-1 sm:grid-cols-2 lg:grid-cols-3 text-xs">{ITEMS.map(([key,label])=><div key={key} className="flex justify-between rounded bg-slate-50 px-2 py-1 dark:bg-slate-800"><span>{label}</span><strong>{item.checklist[key]?'OK':'Não'}</strong></div>)}</div>
          {item.notes&&<p className="text-xs text-slate-600 dark:text-slate-300">{item.notes}</p>}
          <div className="rounded-lg border p-3 space-y-3">
            <p className="text-xs font-semibold">Fotos e vídeos desta vistoria</p>
            <FileUpload entityType="VehicleInspection" entityId={item.id} documentType="INSPECTION_MEDIA" multiple allowedTypes={['image/jpeg','image/jpg','image/png','image/webp','video/mp4']} maxSizeMB={20} onUploadComplete={()=>void load()}/>
            <AttachmentList entityType="VehicleInspection" entityId={item.id}/>
          </div>
        </div>}
      </div>)}
    </div>
  </div>;
}
