import React,{useEffect,useMemo,useState} from 'react';
import { ClipboardCheck,Plus } from 'lucide-react';
import { VehicleInspectionClient,type VehicleInspectionChecklist,type VehicleInspectionType,type VehicleInspection,type VehicleInspectionItemStatus,type VehicleInspectionTechnicalChecklist,type VehicleInspectionTechnicalKey,type VehicleInspectionResult } from '../../api/vehicleInspectionClient';
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

const TECHNICAL_ITEMS:[VehicleInspectionTechnicalKey,string][]=[
  ['tires','Pneus e rodas'],
  ['glassMirrors','Vidros e retrovisores'],
  ['bodyPaint','Carroceria e pintura'],
  ['interior','Interior'],
  ['dashboard','Painel e instrumentos'],
  ['lighting','Iluminação'],
  ['brakes','Freios'],
  ['suspension','Suspensão'],
  ['steering','Direção'],
  ['engine','Motor'],
  ['transmission','Transmissão'],
  ['safety','Itens de segurança'],
];
const TECHNICAL_OPTIONS:{value:VehicleInspectionItemStatus;label:string}[]=[
  {value:'OK',label:'OK'},
  {value:'ATTENTION',label:'Atenção'},
  {value:'FAILED',label:'Reprovado'},
  {value:'NOT_APPLICABLE',label:'Não se aplica'},
];
const CRITICAL_KEYS=new Set<VehicleInspectionTechnicalKey>(['tires','brakes','steering','safety']);

function derivePreview(items:Partial<Record<VehicleInspectionTechnicalKey,VehicleInspectionItemStatus>>):VehicleInspectionResult|null{
  if(!TECHNICAL_ITEMS.every(([key])=>Boolean(items[key]))) return null;
  for(const [key] of TECHNICAL_ITEMS){
    if(items[key]==='FAILED'&&CRITICAL_KEYS.has(key)) return 'BLOCKED_FOR_RENTAL';
  }
  if(TECHNICAL_ITEMS.some(([key])=>items[key]==='FAILED')) return 'FAILED';
  if(TECHNICAL_ITEMS.some(([key])=>items[key]==='ATTENTION')) return 'APPROVED_WITH_RESERVATIONS';
  return 'APPROVED';
}
function resultLabel(result:VehicleInspectionResult|undefined):string{
  if(result==='APPROVED')return 'Aprovado';
  if(result==='APPROVED_WITH_RESERVATIONS')return 'Aprovado com ressalvas';
  if(result==='FAILED')return 'Reprovado';
  if(result==='BLOCKED_FOR_RENTAL')return 'Bloqueado para locação';
  return 'Vistoria legada';
}

function emptyChecklist():VehicleInspectionChecklist{
  return Object.fromEntries(ITEMS.map(([key])=>[key,false])) as unknown as VehicleInspectionChecklist;
}

export function VehicleInspectionPanel({vehicleId,currentKm}:{vehicleId:string;currentKm:number}){
  const[items,setItems]=useState<VehicleInspection[]>([]);
  const[type,setType]=useState<VehicleInspectionType>('EXIT');
  const[odometer,setOdometer]=useState(String(currentKm));
  const[fuelLevel,setFuelLevel]=useState('100');
  const[notes,setNotes]=useState('');
  const[tireBrand,setTireBrand]=useState(''),[tireModel,setTireModel]=useState(''),[tireMeasure,setTireMeasure]=useState('');
  const[batteryBrand,setBatteryBrand]=useState(''),[batteryModel,setBatteryModel]=useState('');
  const[checklist,setChecklist]=useState<VehicleInspectionChecklist>(emptyChecklist());
  const[technicalChecklist,setTechnicalChecklist]=useState<Partial<Record<VehicleInspectionTechnicalKey,VehicleInspectionItemStatus>>>({});
  const[loading,setLoading]=useState(false);
  const[error,setError]=useState<string|null>(null);
  const[expanded,setExpanded]=useState<string|null>(null);

  const load=async()=>{try{setItems(await VehicleInspectionClient.list(vehicleId));}catch(e){setError(e instanceof Error?e.message:'Falha ao carregar vistorias.');}};
  useEffect(()=>{void load();},[vehicleId]);
  useEffect(()=>{setOdometer(String(currentKm));},[currentKm]);
  const checked=useMemo(()=>Object.values(checklist).filter(Boolean).length,[checklist]);
  const technicalCompleted=useMemo(()=>TECHNICAL_ITEMS.filter(([key])=>Boolean(technicalChecklist[key])).length,[technicalChecklist]);
  const resultPreview=useMemo(()=>derivePreview(technicalChecklist),[technicalChecklist]);

  const create=async()=>{
    setLoading(true);setError(null);
    try{
      const km=Number(odometer),fuel=Number(fuelLevel);
      if(!Number.isInteger(km)||km<currentKm)throw new Error('A KM da vistoria não pode ser menor que a KM atual do veículo.');
      if(!Number.isInteger(fuel)||fuel<0||fuel>100)throw new Error('Informe combustível entre 0% e 100%.');
      if(!resultPreview)throw new Error('Avalie todos os itens da vistoria técnica antes de salvar.');
      if(!tireBrand.trim()||!tireModel.trim()||!tireMeasure.trim()||!batteryBrand.trim()||!batteryModel.trim())throw new Error('Informe marca, modelo e medida dos pneus e marca/modelo da bateria.');
      const item=await VehicleInspectionClient.create(vehicleId,{
        inspectionType:type,odometer:km,fuelLevel:fuel,checklist,
        technicalChecklist:technicalChecklist as VehicleInspectionTechnicalChecklist,
        equipmentSnapshot:{tireBrand:tireBrand.trim(),tireModel:tireModel.trim(),tireMeasure:tireMeasure.trim(),batteryBrand:batteryBrand.trim(),batteryModel:batteryModel.trim()},
        notes:notes.trim()||undefined,
      });
      setItems(current=>[item,...current]);setExpanded(item.id);setNotes('');setChecklist(emptyChecklist());setTechnicalChecklist({});
      setTireBrand('');setTireModel('');setTireMeasure('');setBatteryBrand('');setBatteryModel('');
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
      <div className="rounded-xl border p-3 space-y-3">
        <p className="text-xs font-semibold text-slate-700 dark:text-slate-200">Pneus e bateria — estado na vistoria</p>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <Input label="Marca dos pneus *" value={tireBrand} onChange={e=>setTireBrand(e.target.value)}/>
          <Input label="Modelo dos pneus *" value={tireModel} onChange={e=>setTireModel(e.target.value)}/>
          <Input label="Medida / dimensões dos pneus *" value={tireMeasure} onChange={e=>setTireMeasure(e.target.value)} placeholder="Ex.: 195/55 R15"/>
          <Input label="Marca da bateria *" value={batteryBrand} onChange={e=>setBatteryBrand(e.target.value)}/>
          <Input label="Modelo da bateria *" value={batteryModel} onChange={e=>setBatteryModel(e.target.value)}/>
        </div>
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
      <div className="space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-xs font-semibold text-slate-700 dark:text-slate-200">Vistoria técnica ({technicalCompleted}/{TECHNICAL_ITEMS.length})</p>
          <strong className="text-xs">{resultPreview?resultLabel(resultPreview):'Resultado pendente'}</strong>
        </div>
        <div className="grid gap-2 sm:grid-cols-2">
          {TECHNICAL_ITEMS.map(([key,label])=><label key={key} className="grid grid-cols-[1fr_auto] items-center gap-3 rounded-lg border p-2 text-xs">
            <span>{label}{CRITICAL_KEYS.has(key)?' • crítico':''}</span>
            <select
              aria-label={label}
              value={technicalChecklist[key]||''}
              onChange={e=>setTechnicalChecklist(current=>({...current,[key]:e.target.value as VehicleInspectionItemStatus}))}
              className="rounded-md border border-slate-300 bg-white px-2 py-1 text-xs dark:border-slate-700 dark:bg-slate-900"
            >
              <option value="">Avaliar...</option>
              {TECHNICAL_OPTIONS.map(option=><option key={option.value} value={option.value}>{option.label}</option>)}
            </select>
          </label>)}
        </div>
        {resultPreview==='BLOCKED_FOR_RENTAL'&&<p className="rounded-lg border border-rose-300 bg-rose-50 p-2 text-xs font-semibold text-rose-700">Falha crítica: ao salvar, o veículo será bloqueado para locação. O desbloqueio nunca é automático.</p>}
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
            <div><strong>{item.inspectionType==='ENTRY'?'Vistoria de entrada':'Vistoria de saída'}</strong><p className="text-slate-500">{new Date(item.inspectionDate).toLocaleString('pt-BR')} • {resultLabel(item.result)}</p></div>
            <div className="text-right"><strong>{item.odometer.toLocaleString('pt-BR')} KM</strong><p className="text-slate-500">Combustível: {item.fuelLevel}%</p></div>
          </div>
        </button>
        {expanded===item.id&&<div className="space-y-3 border-t pt-3">
          <div className="grid gap-1 sm:grid-cols-2 lg:grid-cols-3 text-xs">{ITEMS.map(([key,label])=><div key={key} className="flex justify-between rounded bg-slate-50 px-2 py-1 dark:bg-slate-800"><span>{label}</span><strong>{item.checklist[key]?'OK':'Não'}</strong></div>)}</div>
          {item.equipmentSnapshot&&<div className="rounded-lg border p-3 text-xs"><p className="mb-2 font-semibold">Pneus e bateria registrados</p><div className="grid gap-1 sm:grid-cols-2"><p><strong>Pneus:</strong> {item.equipmentSnapshot.tireBrand} {item.equipmentSnapshot.tireModel} — {item.equipmentSnapshot.tireMeasure}</p><p><strong>Bateria:</strong> {item.equipmentSnapshot.batteryBrand} {item.equipmentSnapshot.batteryModel}</p></div></div>}
          {item.technicalChecklist&&<div className="space-y-2"><p className="text-xs font-semibold">Resultado técnico: {resultLabel(item.result)}</p><div className="grid gap-1 sm:grid-cols-2 lg:grid-cols-3 text-xs">{TECHNICAL_ITEMS.map(([key,label])=><div key={key} className="flex justify-between rounded bg-slate-50 px-2 py-1 dark:bg-slate-800"><span>{label}</span><strong>{TECHNICAL_OPTIONS.find(option=>option.value===item.technicalChecklist?.[key])?.label||'—'}</strong></div>)}</div></div>}
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
