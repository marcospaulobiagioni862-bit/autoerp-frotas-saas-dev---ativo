import React,{useEffect,useMemo,useState} from 'react';
import { AlertCircle,CheckCircle2,RefreshCw,Sparkles } from 'lucide-react';
import { VehicleDocumentIntakeClient,type VehicleIntakeDocumentType } from '../../api/vehicleDocumentIntakeClient';
import { DocumentAiClient,type DocumentAiExtraction } from '../../api/documentAiClient';
import { FileUpload } from '../documents/FileUpload';
import { ModalContainer } from '../ui/ModalContainer';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { Select } from '../ui/Select';

const FIELD_LABELS:Record<string,string>={
  plate:'Placa',renavam:'RENAVAM',chassis:'Chassi',brand:'Marca',model:'Modelo',
  manufactureYear:'Ano fabricação',modelYear:'Ano modelo',fuel:'Combustível',ownerName:'Titular do documento',
};
const FIELD_KEYS=Object.keys(FIELD_LABELS);

function analysisProgress(status:DocumentAiExtraction['status']|null):number{
  if(status==='PENDING')return 50;
  if(status==='PROCESSING')return 70;
  if(status==='REVIEW_REQUIRED'||status==='APPROVED'||status==='REJECTED'||status==='FAILED')return 100;
  return 45;
}

export function VehicleDocumentIntakeModal({isOpen,onClose,onCreated}:{isOpen:boolean;onClose:()=>void;onCreated:(vehicleId:string)=>void}){
  const[documentType,setDocumentType]=useState<VehicleIntakeDocumentType>('CRLV');
  const[intakeId,setIntakeId]=useState<string|null>(null);
  const[attachmentId,setAttachmentId]=useState<string|null>(null);
  const[extraction,setExtraction]=useState<DocumentAiExtraction|null>(null);
  const[corrections,setCorrections]=useState<Record<string,string>>({});
  const[busy,setBusy]=useState(false);
  const[error,setError]=useState<string|null>(null);
  const[message,setMessage]=useState<string|null>(null);

  const reset=()=>{setDocumentType('CRLV');setIntakeId(null);setAttachmentId(null);setExtraction(null);setCorrections({});setBusy(false);setError(null);setMessage(null);};
  useEffect(()=>{if(!isOpen)reset();},[isOpen]);

  const start=async()=>{
    setBusy(true);setError(null);
    try{
      const intake=await VehicleDocumentIntakeClient.create(`vehicle-ui-${crypto.randomUUID()}`,documentType);
      setIntakeId(intake.id);setMessage('Intake criado. Anexe o documento para iniciar a leitura.');
    }catch(e){setError(e instanceof Error?e.message:'Falha ao iniciar cadastro por IA.');}
    finally{setBusy(false);}
  };

  const refresh=async()=>{
    if(!attachmentId)return;
    const all=await DocumentAiClient.list();
    const current=all.filter(x=>x.attachmentId===attachmentId).sort((a,b)=>b.updatedAt.localeCompare(a.updatedAt))[0]||null;
    setExtraction(current);
    if(current?.status==='REVIEW_REQUIRED'){
      const initial:Record<string,string>={};
      for(const key of FIELD_KEYS){
        const value=current.proposedFields[key];
        if(typeof value==='string'||typeof value==='number') initial[key]=String(value);
      }
      setCorrections(initial);
    }
    return current;
  };

  const uploaded=async(attachment:any)=>{
    if(!intakeId)return;
    setAttachmentId(String(attachment.id));
    setBusy(true);setError(null);setMessage('Documento enviado. Solicitando leitura pela IA...');
    try{
      await VehicleDocumentIntakeClient.analyze(intakeId);
      setMessage('Leitura solicitada. Acompanhe o progresso estimado e use Atualizar análise para consultar o estado mais recente.');
      await refresh();
    }catch(e){setError(e instanceof Error?e.message:'Falha ao solicitar análise.');}
    finally{setBusy(false);}
  };

  const review=async(decision:'APPROVE'|'REJECT')=>{
    if(!extraction)return;
    setBusy(true);setError(null);
    try{
      const reviewed=await DocumentAiClient.review(extraction.id,{decision,corrections,notes:'Revisão humana do cadastro inicial do veículo'});
      setExtraction(reviewed);
      if(decision==='REJECT'){setMessage('Leitura rejeitada. Nenhum veículo foi criado.');return;}
      setMessage('Dados aprovados. Revise o resumo e confirme a criação do veículo.');
    }catch(e){setError(e instanceof Error?e.message:'Falha na revisão.');}
    finally{setBusy(false);}
  };

  const createVehicle=async()=>{
    if(!intakeId)return;
    setBusy(true);setError(null);
    try{
      const result=await VehicleDocumentIntakeClient.materialize(intakeId);
      setMessage(result.reused?'Veículo já havia sido criado por este documento.':'Veículo criado e documento original vinculado à ficha.');
      onCreated(result.vehicleId);
      reset();
      onClose();
    }catch(e){setError(e instanceof Error?e.message:'Falha ao criar veículo a partir do documento aprovado.');}
    finally{setBusy(false);}
  };

  const canEdit=extraction?.status==='REVIEW_REQUIRED';
  const approved=extraction?.status==='APPROVED';
  const progress=analysisProgress(extraction?.status||null);
  const analysisInProgress=!extraction||extraction.status==='PENDING'||extraction.status==='PROCESSING';

  return <ModalContainer isOpen={isOpen} onClose={onClose} size="5xl" title="Cadastrar veículo por documento com IA">
    <div className="space-y-4">
      <div className="rounded-xl border border-blue-200 bg-blue-50 p-3 text-xs text-blue-800 dark:border-blue-900 dark:bg-blue-950/30 dark:text-blue-200">
        <strong>Fluxo com revisão humana:</strong> a IA apenas propõe os dados. O veículo só é criado depois da sua aprovação explícita.
      </div>

      {!intakeId&&<div className="space-y-3">
        <Select label="Tipo de documento" value={documentType} onChange={e=>setDocumentType(e.target.value as VehicleIntakeDocumentType)} options={[
          {value:'CRLV',label:'CRLV'},{value:'CRV',label:'CRV'},{value:'ATPV_E',label:'ATPV-e'},
        ]}/>
        <Button onClick={()=>void start()} disabled={busy} className="gap-2"><Sparkles className="h-4 w-4"/>{busy?'Preparando...':'Começar leitura com IA'}</Button>
      </div>}

      {intakeId&&!attachmentId&&<FileUpload
        entityType="VehicleDocumentIntake"
        entityId={intakeId}
        documentType={documentType}
        allowedTypes={['application/pdf','image/jpeg','image/jpg','image/png','image/webp']}
        onUploadComplete={(attachment)=>void uploaded(attachment)}
      />}

      {attachmentId&&<div className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div><strong className="text-sm">Análise documental</strong><p className="text-xs text-slate-500">Status: {extraction?.status||'PROCESSANDO'}</p></div>
          <Button variant="outline" size="sm" onClick={()=>void refresh()} disabled={busy} className="gap-2"><RefreshCw className={`h-4 w-4 ${analysisInProgress?'animate-spin':''}`}/>Atualizar análise</Button>
        </div>

        <div className="space-y-1.5" aria-label="Progresso estimado da análise documental">
          <div className="flex items-center justify-between gap-3 text-xs">
            <span className="font-medium text-slate-700 dark:text-slate-200">{analysisInProgress?'Analisando documento':'Etapa concluída'}</span>
            <span className="font-semibold tabular-nums">{progress}% <span className="font-normal text-slate-500">estimado</span></span>
          </div>
          <div className="h-2.5 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700">
            <div
              className={`h-full rounded-full bg-blue-600 transition-[width] duration-500 ${analysisInProgress?'animate-pulse':''}`}
              style={{width:`${progress}%`}}
              role="progressbar"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={progress}
              aria-valuetext={`${progress}% estimado`}
            />
          </div>
          <p className="text-[11px] text-slate-500">Percentual estimado por etapa. A IA não fornece progresso contínuo em tempo real.</p>
        </div>

        {canEdit&&<div className="space-y-3">
          <p className="text-xs text-slate-500">Confira e corrija os campos abaixo antes de aprovar.</p>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {FIELD_KEYS.map(key=><Input key={key} label={FIELD_LABELS[key]} value={corrections[key]||''} onChange={e=>setCorrections(v=>({...v,[key]:e.target.value}))}/>)}
          </div>
          <div className="flex flex-wrap gap-2">
            <Button onClick={()=>void review('APPROVE')} disabled={busy} className="gap-2"><CheckCircle2 className="h-4 w-4"/>Aprovar dados</Button>
            <Button variant="outline" onClick={()=>void review('REJECT')} disabled={busy}>Rejeitar leitura</Button>
          </div>
        </div>}

        {approved&&<div className="space-y-3 rounded-xl border border-emerald-200 bg-emerald-50 p-4 dark:border-emerald-900 dark:bg-emerald-950/20">
          <div className="flex items-center gap-2 text-emerald-700 dark:text-emerald-300"><CheckCircle2 className="h-4 w-4"/><strong>Dados aprovados</strong></div>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3 text-xs">
            {FIELD_KEYS.map(key=><div key={key}><span className="text-slate-500">{FIELD_LABELS[key]}</span><div className="font-semibold">{corrections[key]||'—'}</div></div>)}
          </div>
          <Button onClick={()=>void createVehicle()} disabled={busy}>{busy?'Criando veículo...':'Confirmar e criar veículo'}</Button>
        </div>}
      </div>}

      {message&&<p className="rounded-lg bg-slate-100 p-3 text-xs text-slate-700 dark:bg-slate-800 dark:text-slate-200">{message}</p>}
      {error&&<div className="flex items-start gap-2 rounded-lg bg-red-50 p-3 text-xs text-red-700 dark:bg-red-950/30 dark:text-red-300"><AlertCircle className="mt-0.5 h-4 w-4 shrink-0"/><span>{error}</span></div>}
    </div>
  </ModalContainer>;
}
