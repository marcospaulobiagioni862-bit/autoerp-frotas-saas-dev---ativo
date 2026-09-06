import React,{useEffect,useMemo,useState}from'react';
import { Sparkles,Wrench } from 'lucide-react';
import { DocumentAiClient,type DocumentAiExtraction } from '../../api/documentAiClient';
import type { Vehicle } from '../../types/entities';
import { Button,Input,ModalContainer } from '../ui';
import { FileUpload } from '../documents/FileUpload';

export interface MaintenanceAiDraft{vehicleId:string;sourceAttachmentId:string;serviceDate:string;entryKm:string;description:string;supplierName:string;supplierDocument:string;amount:string;}
interface Props{isOpen:boolean;vehicles:Vehicle[];onClose:()=>void;onUseDraft:(draft:MaintenanceAiDraft)=>void;}
const value=(v:unknown)=>v===undefined||v===null?'':String(v);
export const MaintenanceAiIntakeModal:React.FC<Props>=({isOpen,vehicles,onClose,onUseDraft})=>{
 const[vehicleId,setVehicleId]=useState(''),[attachmentId,setAttachmentId]=useState(''),[extraction,setExtraction]=useState<DocumentAiExtraction|null>(null),[draft,setDraft]=useState<Record<string,string>>({}),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const reset=()=>{setVehicleId('');setAttachmentId('');setExtraction(null);setDraft({});setBusy(false);setError('');};
 useEffect(()=>{if(!isOpen)reset();},[isOpen]);
 useEffect(()=>{if(!isOpen||!extraction||!['PENDING','PROCESSING'].includes(extraction.status))return;const timer=window.setInterval(()=>{void DocumentAiClient.list().then(items=>{const current=items.find(item=>item.id===extraction.id||item.attachmentId===attachmentId);if(current)setExtraction(current);}).catch(()=>undefined);},4000);return()=>window.clearInterval(timer);},[isOpen,extraction?.id,extraction?.status,attachmentId]);
 useEffect(()=>{if(extraction?.status==='REVIEW_REQUIRED')setDraft(Object.fromEntries(Object.entries(extraction.proposedFields).map(([k,v])=>[k,value(v)])));},[extraction?.id,extraction?.status]);
 const selectedVehicle=useMemo(()=>vehicles.find(v=>v.id===vehicleId),[vehicles,vehicleId]);
 const uploaded=async(att:any)=>{setAttachmentId(att.id);setBusy(true);setError('');try{setExtraction(await DocumentAiClient.create({attachmentId:att.id,idempotencyKey:'maintenance-ai:'+att.id}));}catch(err:unknown){setError(err instanceof Error?err.message:'Não foi possível iniciar a leitura do documento de manutenção.');}finally{setBusy(false);}};
 const approve=async()=>{if(!extraction||extraction.status!=='REVIEW_REQUIRED'||!vehicleId||!attachmentId)return;setBusy(true);setError('');try{const corrections:Record<string,unknown>={};for(const[k,original]of Object.entries(extraction.proposedFields)){const candidate=draft[k]??'';if(String(original??'')!==candidate)corrections[k]=candidate;}await DocumentAiClient.review(extraction.id,{decision:'APPROVE',corrections,notes:'Documento de manutenção revisado para preenchimento assistido da OS'});const merged={...extraction.proposedFields,...corrections};onUseDraft({vehicleId,sourceAttachmentId:attachmentId,serviceDate:value(merged.serviceDate).slice(0,10),entryKm:value(merged.odometer),description:value(merged.description),supplierName:value(merged.supplierName),supplierDocument:value(merged.supplierDocument),amount:value(merged.amount)});onClose();}catch(err:unknown){setError(err instanceof Error?err.message:'Não foi possível aprovar os dados de manutenção.');}finally{setBusy(false);}};
 if(!isOpen)return null;
 const fields=extraction?.status==='REVIEW_REQUIRED'?Object.entries(extraction.proposedFields):[];
 return <ModalContainer isOpen={isOpen} onClose={onClose} title="Ler nota / ordem de manutenção com IA" maxWidth="lg"><div className="space-y-4">
  <div className="rounded-lg border border-blue-200 bg-blue-50 p-3 text-xs text-blue-900 dark:border-blue-900 dark:bg-blue-950/30 dark:text-blue-200"><strong className="flex items-center gap-2"><Sparkles className="h-4 w-4"/>Preenchimento assistido</strong><p className="mt-1">A IA propõe data, KM, descrição, fornecedor e valor encontrados. Você revisa antes de usar. O valor encontrado não gera Conta a Pagar automaticamente.</p></div>
  <div><label className="mb-1 block text-xs font-semibold">Veículo *</label><select className="w-full rounded-lg border border-slate-300 bg-white p-2.5 text-sm dark:border-slate-700 dark:bg-slate-900" value={vehicleId} onChange={e=>{setVehicleId(e.target.value);setAttachmentId('');setExtraction(null);setDraft({});}} disabled={busy||Boolean(attachmentId)}><option value="">Selecione o veículo</option>{vehicles.map(v=><option key={v.id} value={v.id}>{v.plate} — {v.brand} {v.model}</option>)}</select></div>
  {vehicleId&&!attachmentId&&<FileUpload entityType="Vehicle" entityId={vehicleId} documentType="MAINTENANCE_EVIDENCE" onUploadComplete={uploaded}/>} 
  {attachmentId&&<div className="rounded-lg border p-3 text-xs"><strong>Documento original anexado</strong><p className="mt-1 text-slate-500">{selectedVehicle?.plate} · anexo {attachmentId}</p></div>}
  {extraction&&['PENDING','PROCESSING'].includes(extraction.status)&&<div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">Analisando documento… atualização automática.</div>}
  {extraction?.status==='FAILED'&&<div className="rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-700">A leitura falhou. Tente novamente com um documento mais legível.</div>}
  {extraction?.status==='REVIEW_REQUIRED'&&<div className="space-y-3"><div className="flex items-center gap-2"><Wrench className="h-4 w-4 text-emerald-600"/><strong className="text-sm">Revise os dados encontrados</strong></div><div className="grid grid-cols-1 sm:grid-cols-2 gap-3">{fields.map(([key,original])=><Input key={key} label={key} value={draft[key]??value(original)} onChange={e=>setDraft(cur=>({...cur,[key]:e.target.value}))}/>)}</div></div>}
  {error&&<div className="rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-700">{error}</div>}
  <div className="flex justify-end gap-2"><Button variant="ghost" onClick={onClose} disabled={busy}>Cancelar</Button>{extraction?.status==='REVIEW_REQUIRED'&&<Button onClick={()=>void approve()} isLoading={busy}>Usar dados na OS</Button>}</div>
 </div></ModalContainer>;
};