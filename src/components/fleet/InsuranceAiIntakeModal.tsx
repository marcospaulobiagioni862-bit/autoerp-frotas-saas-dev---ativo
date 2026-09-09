import { requestGuardedClose } from '../../app/unsavedChangesAuthority';
import React,{useEffect,useMemo,useState}from'react';
import { Sparkles,ShieldCheck } from 'lucide-react';
import { DocumentAiClient,type DocumentAiExtraction } from '../../api/documentAiClient';
import type { Vehicle } from '../../types/entities';
import { Button,Input,ModalContainer } from '../ui';
import { FileUpload } from '../documents/FileUpload';
import { documentAiFieldLabel } from '../documents/documentAiFieldLabels';

export interface InsuranceAiDraft{
  vehicleId:string;
  sourceAttachmentId:string;
  insuranceCompany:string;
  policyNumber:string;
  coverageDetails:string;
  deductibleAmount:string;
  totalPremiumAmount:string;
  installmentsCount:string;
  startDate:string;
  endDate:string;
  brokerName:string;
  brokerPhone:string;
}

interface Props{
  isOpen:boolean;
  vehicles:Vehicle[];
  onClose:()=>void;
  onUseDraft:(draft:InsuranceAiDraft)=>void;
}

const value=(input:unknown):string=>input===undefined||input===null?'':String(input);
const mapDraft=(fields:Record<string,unknown>,vehicleId:string,attachmentId:string):InsuranceAiDraft=>({
  vehicleId,
  sourceAttachmentId:attachmentId,
  insuranceCompany:value(fields.insurer),
  policyNumber:value(fields.policyNumber),
  coverageDetails:value(fields.coverageDetails),
  deductibleAmount:value(fields.deductibleAmount),
  totalPremiumAmount:value(fields.premiumAmount),
  installmentsCount:value(fields.installmentCount),
  startDate:value(fields.startDate).slice(0,10),
  endDate:value(fields.endDate).slice(0,10),
  brokerName:value(fields.brokerName),
  brokerPhone:value(fields.brokerContact),
});

export const InsuranceAiIntakeModal:React.FC<Props>=({isOpen,vehicles,onClose,onUseDraft})=>{
  const[vehicleId,setVehicleId]=useState('');
  const[attachmentId,setAttachmentId]=useState('');
  const[extraction,setExtraction]=useState<DocumentAiExtraction|null>(null);
  const[draft,setDraft]=useState<Record<string,string>>({});
  const[busy,setBusy]=useState(false);
  const[error,setError]=useState('');

  const reset=()=>{setVehicleId('');setAttachmentId('');setExtraction(null);setDraft({});setBusy(false);setError('');};
  useEffect(()=>{if(!isOpen)reset();},[isOpen]);

  useEffect(()=>{
    if(!isOpen||!extraction||!['PENDING','PROCESSING'].includes(extraction.status))return;
    const timer=window.setInterval(()=>{void DocumentAiClient.list().then(items=>{
      const current=items.find(item=>item.id===extraction.id||item.attachmentId===attachmentId);
      if(current)setExtraction(current);
    }).catch(()=>undefined);},4000);
    return()=>window.clearInterval(timer);
  },[isOpen,extraction?.id,extraction?.status,attachmentId]);

  useEffect(()=>{
    if(extraction?.status!=='REVIEW_REQUIRED')return;
    setDraft(Object.fromEntries(Object.entries(extraction.proposedFields).map(([key,item])=>[key,value(item)])));
  },[extraction?.id,extraction?.status]);

  const selectedVehicle=useMemo(()=>vehicles.find(item=>item.id===vehicleId),[vehicles,vehicleId]);

  const uploaded=async(attachment:any)=>{
    setAttachmentId(attachment.id);setBusy(true);setError('');
    try{
      const created=await DocumentAiClient.create({attachmentId:attachment.id,idempotencyKey:`insurance-ai:${attachment.id}`});
      setExtraction(created);
    }catch(err:unknown){setError(err instanceof Error?err.message:'Não foi possível iniciar a leitura da apólice.');}
    finally{setBusy(false);}
  };

  const approve=async()=>{
    if(!extraction||extraction.status!=='REVIEW_REQUIRED'||!vehicleId||!attachmentId)return;
    setBusy(true);setError('');
    try{
      const corrections:Record<string,unknown>={};
      for(const[key,original]of Object.entries(extraction.proposedFields)){
        const candidate=draft[key]??'';
        if(String(original??'')!==candidate)corrections[key]=candidate;
      }
      await DocumentAiClient.review(extraction.id,{decision:'APPROVE',corrections,notes:'Apólice revisada para preenchimento assistido do Seguro'});
      const merged={...extraction.proposedFields,...corrections};
      onUseDraft(mapDraft(merged,vehicleId,attachmentId));
      onClose();
    }catch(err:unknown){setError(err instanceof Error?err.message:'Não foi possível aprovar os dados da apólice.');}
    finally{setBusy(false);}
  };

  if(!isOpen)return null;
  const fields=extraction?.status==='REVIEW_REQUIRED'?Object.entries(extraction.proposedFields):[];

  return <ModalContainer isOpen={isOpen} onClose={onClose} title="Ler apólice com IA" maxWidth="lg">
    <div className="space-y-4">
      <div className="rounded-lg border border-blue-200 bg-blue-50 p-3 text-xs text-blue-900 dark:border-blue-900 dark:bg-blue-950/30 dark:text-blue-200">
        <strong className="flex items-center gap-2"><Sparkles className="h-4 w-4"/>Preenchimento assistido</strong>
        <p className="mt-1">A IA extrai os dados visíveis da apólice. Você revisa antes de usar no cadastro. Categoria financeira e efeitos em Contas a Pagar nunca são escolhidos pela IA.</p>
      </div>
      <div>
        <label className="mb-1 block text-xs font-semibold">Veículo *</label>
        <select className="w-full rounded-lg border border-slate-300 bg-white p-2.5 text-sm dark:border-slate-700 dark:bg-slate-900" value={vehicleId} onChange={e=>{setVehicleId(e.target.value);setAttachmentId('');setExtraction(null);setDraft({});}} disabled={busy||Boolean(attachmentId)}>
          <option value="">Selecione o veículo</option>
          {vehicles.map(vehicle=><option key={vehicle.id} value={vehicle.id}>{vehicle.plate} — {vehicle.brand} {vehicle.model}</option>)}
        </select>
      </div>
      {vehicleId&&!attachmentId&&<FileUpload entityType="Vehicle" entityId={vehicleId} documentType="INSURANCE_POLICY" onUploadComplete={uploaded}/>}
      {attachmentId&&<div className="rounded-lg border p-3 text-xs"><strong>Apólice original anexada</strong><p className="mt-1 text-slate-500">{selectedVehicle?.plate} · anexo {attachmentId}</p></div>}
      {extraction&&['PENDING','PROCESSING'].includes(extraction.status)&&<div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-200">Analisando apólice… o status é atualizado automaticamente.</div>}
      {extraction?.status==='FAILED'&&<div className="rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-700">A leitura falhou. Feche e tente novamente com um documento mais legível.</div>}
      {extraction?.status==='REVIEW_REQUIRED'&&<div className="space-y-3">
        <div className="flex items-center gap-2"><ShieldCheck className="h-4 w-4 text-emerald-600"/><strong className="text-sm">Revise os dados encontrados</strong></div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {fields.map(([key,original])=><Input key={key} label={documentAiFieldLabel(key)} value={draft[key]??value(original)} onChange={e=>setDraft(current=>({...current,[key]:e.target.value}))}/>)}
        </div>
        <p className="text-[11px] text-slate-500">Campos ausentes no documento continuarão vazios e poderão ser preenchidos no formulário normal.</p>
      </div>}
      {error&&<div className="rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-700">{error}</div>}
      <div className="flex justify-end gap-2"><Button variant="ghost" onClick={(event)=>requestGuardedClose(event,onClose)} disabled={busy}>Cancelar</Button>{extraction?.status==='REVIEW_REQUIRED'&&<Button onClick={()=>void approve()} isLoading={busy}>Usar dados no Seguro</Button>}</div>
    </div>
  </ModalContainer>;
};
