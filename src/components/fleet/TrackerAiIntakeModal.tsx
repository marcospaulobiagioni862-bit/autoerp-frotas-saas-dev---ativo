import React,{useEffect,useMemo,useState}from'react';
import { Radio,Sparkles } from 'lucide-react';
import { DocumentAiClient,type DocumentAiExtraction } from '../../api/documentAiClient';
import type { Vehicle } from '../../types/entities';
import { Button,Input,ModalContainer } from '../ui';
import { FileUpload } from '../documents/FileUpload';

export interface TrackerAiDraft{vehicleId:string;sourceAttachmentId:string;equipmentModel:string;imei:string;serialNumber:string;chipCarrier:string;chipNumber:string;installationDate:string;monthlyCost:string;notes:string;}
interface Props{isOpen:boolean;vehicles:Vehicle[];onClose:()=>void;onUseDraft:(draft:TrackerAiDraft)=>void;}
const value=(v:unknown)=>v===undefined||v===null?'':String(v);
const mapDraft=(fields:Record<string,unknown>,vehicleId:string,attachmentId:string):TrackerAiDraft=>({vehicleId,sourceAttachmentId:attachmentId,equipmentModel:value(fields.equipmentModel),imei:value(fields.imei),serialNumber:value(fields.serialNumber),chipCarrier:value(fields.chipCarrier),chipNumber:value(fields.chipNumber),installationDate:value(fields.installationDate).slice(0,10),monthlyCost:value(fields.monthlyCost),notes:[fields.providerName?'Provedor: '+value(fields.providerName):'',fields.supplierName?'Fornecedor: '+value(fields.supplierName):''].filter(Boolean).join(' · ')});

export const TrackerAiIntakeModal:React.FC<Props>=({isOpen,vehicles,onClose,onUseDraft})=>{
  const[vehicleId,setVehicleId]=useState(''),[attachmentId,setAttachmentId]=useState(''),[extraction,setExtraction]=useState<DocumentAiExtraction|null>(null);
  const[draft,setDraft]=useState<Record<string,string>>({}),[busy,setBusy]=useState(false),[error,setError]=useState('');
  const reset=()=>{setVehicleId('');setAttachmentId('');setExtraction(null);setDraft({});setBusy(false);setError('');};
  useEffect(()=>{if(!isOpen)reset();},[isOpen]);
  useEffect(()=>{if(!isOpen||!extraction||!['PENDING','PROCESSING'].includes(extraction.status))return;const timer=window.setInterval(()=>{void DocumentAiClient.list().then(items=>{const current=items.find(item=>item.id===extraction.id||item.attachmentId===attachmentId);if(current)setExtraction(current);}).catch(()=>undefined);},4000);return()=>window.clearInterval(timer);},[isOpen,extraction?.id,extraction?.status,attachmentId]);
  useEffect(()=>{if(extraction?.status==='REVIEW_REQUIRED')setDraft(Object.fromEntries(Object.entries(extraction.proposedFields).map(([k,v])=>[k,value(v)])));},[extraction?.id,extraction?.status]);
  const selectedVehicle=useMemo(()=>vehicles.find(v=>v.id===vehicleId),[vehicles,vehicleId]);
  const uploaded=async(att:any)=>{setAttachmentId(att.id);setBusy(true);setError('');try{setExtraction(await DocumentAiClient.create({attachmentId:att.id,idempotencyKey:'tracker-ai:'+att.id}));}catch(err:unknown){setError(err instanceof Error?err.message:'Não foi possível iniciar a leitura do documento.');}finally{setBusy(false);}};
  const approve=async()=>{if(!extraction||extraction.status!=='REVIEW_REQUIRED'||!vehicleId||!attachmentId)return;setBusy(true);setError('');try{const corrections:Record<string,unknown>={};for(const[k,original]of Object.entries(extraction.proposedFields)){const candidate=draft[k]??'';if(String(original??'')!==candidate)corrections[k]=candidate;}await DocumentAiClient.review(extraction.id,{decision:'APPROVE',corrections,notes:'Documento de rastreador revisado para preenchimento assistido'});onUseDraft(mapDraft({...extraction.proposedFields,...corrections},vehicleId,attachmentId));onClose();}catch(err:unknown){setError(err instanceof Error?err.message:'Não foi possível aprovar os dados.');}finally{setBusy(false);}};
  if(!isOpen)return null;
  const fields=extraction?.status==='REVIEW_REQUIRED'?Object.entries(extraction.proposedFields):[];
  return <ModalContainer isOpen={isOpen} onClose={onClose} title="Ler documento do Rastreador com IA" maxWidth="lg"><div className="space-y-4">
    <div className="rounded-lg border border-blue-200 bg-blue-50 p-3 text-xs text-blue-900 dark:border-blue-900 dark:bg-blue-950/30 dark:text-blue-200"><strong className="flex items-center gap-2"><Sparkles className="h-4 w-4"/>Preenchimento assistido</strong><p className="mt-1">A IA propõe dados do equipamento. Você revisa antes de usar. Categoria financeira e fornecedor cadastrado continuam manuais.</p></div>
    <div><label className="mb-1 block text-xs font-semibold">Veículo *</label><select className="w-full rounded-lg border border-slate-300 bg-white p-2.5 text-sm dark:border-slate-700 dark:bg-slate-900" value={vehicleId} onChange={e=>{setVehicleId(e.target.value);setAttachmentId('');setExtraction(null);setDraft({});}} disabled={busy||Boolean(attachmentId)}><option value="">Selecione o veículo</option>{vehicles.map(v=><option key={v.id} value={v.id}>{v.plate} — {v.brand} {v.model}</option>)}</select></div>
    {vehicleId&&!attachmentId&&<FileUpload entityType="Vehicle" entityId={vehicleId} documentType="TRACKER_EVIDENCE" onUploadComplete={uploaded}/>} 
    {attachmentId&&<div className="rounded-lg border p-3 text-xs"><strong>Documento original anexado</strong><p className="mt-1 text-slate-500">{selectedVehicle?.plate} · anexo {attachmentId}</p></div>}
    {extraction&&['PENDING','PROCESSING'].includes(extraction.status)&&<div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">Analisando documento… atualização automática.</div>}
    {extraction?.status==='FAILED'&&<div className="rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-700">A leitura falhou. Tente novamente com um documento mais legível.</div>}
    {extraction?.status==='REVIEW_REQUIRED'&&<div className="space-y-3"><div className="flex items-center gap-2"><Radio className="h-4 w-4 text-emerald-600"/><strong className="text-sm">Revise os dados encontrados</strong></div><div className="grid grid-cols-1 sm:grid-cols-2 gap-3">{fields.map(([key,original])=><Input key={key} label={key} value={draft[key]??value(original)} onChange={e=>setDraft(cur=>({...cur,[key]:e.target.value}))}/>)}</div><p className="text-[11px] text-slate-500">Campos ausentes continuam vazios e poderão ser preenchidos no formulário normal.</p></div>}
    {error&&<div className="rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-700">{error}</div>}
    <div className="flex justify-end gap-2"><Button variant="ghost" onClick={onClose} disabled={busy}>Cancelar</Button>{extraction?.status==='REVIEW_REQUIRED'&&<Button onClick={()=>void approve()} isLoading={busy}>Usar dados no Rastreador</Button>}</div>
  </div></ModalContainer>;
};