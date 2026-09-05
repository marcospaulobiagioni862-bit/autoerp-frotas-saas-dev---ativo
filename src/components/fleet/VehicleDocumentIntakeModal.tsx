import React,{useEffect,useRef,useState} from 'react';
import { AlertCircle,CheckCircle2,RefreshCw,Sparkles } from 'lucide-react';
import { VehicleDocumentIntakeClient,type VehicleIntakeDocumentType } from '../../api/vehicleDocumentIntakeClient';
import { VehicleClient } from '../../api/vehicleClient';
import { VEHICLE_CATEGORIES } from '../../types/enums';
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

type CompletionField='color'|'category'|'currentKm'|'acquisitionValue'|'currentValue'|'rentalValueBase'|'nextMaintenanceKm';
type CompletionErrors=Partial<Record<CompletionField,string>>;
type IdentifierField='plate'|'renavam'|'chassis';
type IdentifierErrors=Partial<Record<IdentifierField,string>>;

function analysisProgress(status:DocumentAiExtraction['status']|null):number{
  if(status==='PENDING')return 50;
  if(status==='PROCESSING')return 70;
  if(status==='REVIEW_REQUIRED'||status==='APPROVED'||status==='REJECTED'||status==='FAILED')return 100;
  return 45;
}
function normalizedIdentifier(value:unknown):string{
  return typeof value==='string'||typeof value==='number'?String(value).toUpperCase().replace(/[^A-Z0-9]/g,''):'';
}

export function VehicleDocumentIntakeModal({isOpen,onClose,onCreated}:{isOpen:boolean;onClose:()=>void;onCreated:(vehicleId:string)=>void}){
  const[documentType,setDocumentType]=useState<VehicleIntakeDocumentType>('CRLV');
  const[intakeId,setIntakeId]=useState<string|null>(null);
  const[attachmentId,setAttachmentId]=useState<string|null>(null);
  const[extraction,setExtraction]=useState<DocumentAiExtraction|null>(null);
  const[corrections,setCorrections]=useState<Record<string,string>>({});
  const[completion,setCompletion]=useState({
    color:'',category:'',currentKm:'',acquisitionValue:'',currentValue:'',rentalValueBase:'',
    version:'',nextMaintenanceKm:'',notes:'',
  });
  const[fieldErrors,setFieldErrors]=useState<CompletionErrors>({});
  const[identifierErrors,setIdentifierErrors]=useState<IdentifierErrors>({});
  const[busy,setBusy]=useState(false);
  const[error,setError]=useState<string|null>(null);
  const[message,setMessage]=useState<string|null>(null);
  const materializingRef=useRef(false);

  const reset=()=>{setDocumentType('CRLV');setIntakeId(null);setAttachmentId(null);setExtraction(null);setCorrections({});setCompletion({color:'',category:'',currentKm:'',acquisitionValue:'',currentValue:'',rentalValueBase:'',version:'',nextMaintenanceKm:'',notes:''});setFieldErrors({});setIdentifierErrors({});materializingRef.current=false;setBusy(false);setError(null);setMessage(null);};
  useEffect(()=>{if(!isOpen)reset();},[isOpen]);

  const clearFieldError=(field:CompletionField)=>setFieldErrors(current=>{if(!current[field])return current;const next={...current};delete next[field];return next;});

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
      for(const key of FIELD_KEYS){const value=current.proposedFields[key];if(typeof value==='string'||typeof value==='number')initial[key]=String(value);}
      setCorrections(initial);
    }
    return current;
  };

  const uploaded=async(attachment:any)=>{
    if(!intakeId)return;
    setAttachmentId(String(attachment.id));setBusy(true);setError(null);setMessage('Documento enviado. Solicitando leitura pela IA...');
    try{await VehicleDocumentIntakeClient.analyze(intakeId);setMessage('Leitura solicitada. Acompanhe o progresso estimado e use Atualizar análise para consultar o estado mais recente.');await refresh();}
    catch(e){setError(e instanceof Error?e.message:'Falha ao solicitar análise.');}
    finally{setBusy(false);}
  };

  const review=async(decision:'APPROVE'|'REJECT')=>{
    if(!extraction)return;
    setBusy(true);setError(null);setIdentifierErrors({});
    try{
      const reviewed=await DocumentAiClient.review(extraction.id,{decision,corrections,notes:'Revisão humana do cadastro inicial do veículo'});
      setExtraction(reviewed);
      if(decision==='REJECT'){setMessage('Leitura rejeitada. Nenhum veículo foi criado.');return;}
      setMessage('Dados do documento aprovados. Complete agora os dados operacionais e financeiros obrigatórios antes de criar o veículo.');
    }catch(e){setError(e instanceof Error?e.message:'Falha na revisão.');}
    finally{setBusy(false);}
  };

  const createVehicle=async()=>{
    if(!intakeId||materializingRef.current)return;
    const currentKm=Number(completion.currentKm),acquisitionValue=Number(completion.acquisitionValue),currentValue=Number(completion.currentValue),rentalValueBase=Number(completion.rentalValueBase);
    const nextMaintenanceKm=completion.nextMaintenanceKm?Number(completion.nextMaintenanceKm):undefined;
    const validation:CompletionErrors={};
    if(!completion.color.trim())validation.color='Informe a cor do veículo.';
    if(!completion.category)validation.category='Selecione a categoria do veículo.';
    if(completion.currentKm===''||!Number.isFinite(currentKm)||currentKm<0)validation.currentKm='Informe um KM atual válido (zero ou maior).';
    if(!completion.acquisitionValue||!Number.isFinite(acquisitionValue)||acquisitionValue<=0)validation.acquisitionValue='Informe um valor de compra maior que zero.';
    if(!completion.currentValue||!Number.isFinite(currentValue)||currentValue<=0)validation.currentValue='Informe um valor comercial maior que zero.';
    if(!completion.rentalValueBase||!Number.isFinite(rentalValueBase)||rentalValueBase<=0)validation.rentalValueBase='Informe um aluguel semanal maior que zero.';
    if(nextMaintenanceKm!==undefined&&(!Number.isFinite(nextMaintenanceKm)||nextMaintenanceKm<currentKm))validation.nextMaintenanceKm='A próxima manutenção não pode ser menor que o KM atual.';
    setFieldErrors(validation);
    if(Object.keys(validation).length>0){setError('Corrija os campos destacados em vermelho antes de criar o veículo.');return;}

    materializingRef.current=true;setBusy(true);setError(null);setIdentifierErrors({});
    try{
      const vehicles=await VehicleClient.list();
      const identifierValidation:IdentifierErrors={};
      const plate=normalizedIdentifier(corrections.plate),renavam=normalizedIdentifier(corrections.renavam),chassis=normalizedIdentifier(corrections.chassis);
      const duplicatePlate=plate&&vehicles.find(vehicle=>normalizedIdentifier(vehicle.plate)===plate);
      const duplicateRenavam=renavam&&vehicles.find(vehicle=>normalizedIdentifier(vehicle.renavam)===renavam);
      const duplicateChassis=chassis&&vehicles.find(vehicle=>normalizedIdentifier(vehicle.chassis)===chassis);
      if(duplicatePlate)identifierValidation.plate=`Placa já cadastrada no veículo ${duplicatePlate.plate}.`;
      if(duplicateRenavam)identifierValidation.renavam=`RENAVAM já cadastrado no veículo ${duplicateRenavam.plate}.`;
      if(duplicateChassis)identifierValidation.chassis=`Chassi já cadastrado no veículo ${duplicateChassis.plate}.`;
      if(Object.keys(identifierValidation).length>0){setIdentifierErrors(identifierValidation);setError('Este documento pertence a um veículo que já está cadastrado. Confira os identificadores destacados em vermelho.');return;}

      const result=await VehicleDocumentIntakeClient.materialize(intakeId,{
        color:completion.color.trim(),category:completion.category,currentKm,acquisitionValue,currentValue,rentalValueBase,
        version:completion.version.trim()||undefined,nextMaintenanceKm,notes:completion.notes.trim()||undefined,
      });
      setMessage(result.reused?'Veículo já havia sido criado por este documento.':'Veículo criado e documento original vinculado à ficha.');
      onCreated(result.vehicleId);reset();onClose();
    }catch(e){
      const detail=e instanceof Error?e.message:'Falha ao criar veículo a partir do documento aprovado.';
      setError(detail==='Vehicle document intake conflict'?'Não foi possível concluir: o documento já foi consumido ou os identificadores já pertencem a outro veículo. Atualize a lista e confira o cadastro existente.':detail);
    }finally{materializingRef.current=false;setBusy(false);}
  };

  const canEdit=extraction?.status==='REVIEW_REQUIRED';
  const approved=extraction?.status==='APPROVED';
  const progress=analysisProgress(extraction?.status||null);
  const analysisInProgress=!extraction||extraction.status==='PENDING'||extraction.status==='PROCESSING';

  return <ModalContainer isOpen={isOpen} onClose={onClose} size="5xl" title="Cadastrar veículo por documento com IA">
    <div className="space-y-4">
      <div className="rounded-xl border border-blue-200 bg-blue-50 p-3 text-xs text-blue-800 dark:border-blue-900 dark:bg-blue-950/30 dark:text-blue-200"><strong>Fluxo com revisão humana:</strong> a IA apenas propõe os dados. O veículo só é criado depois da sua aprovação explícita.</div>

      {!intakeId&&<div className="space-y-3"><Select label="Tipo de documento" value={documentType} onChange={e=>setDocumentType(e.target.value as VehicleIntakeDocumentType)} options={[{value:'CRLV',label:'CRLV'},{value:'CRV',label:'CRV'},{value:'ATPV_E',label:'ATPV-e'}]}/><Button onClick={()=>void start()} disabled={busy} className="gap-2"><Sparkles className="h-4 w-4"/>{busy?'Preparando...':'Começar leitura com IA'}</Button></div>}

      {intakeId&&!attachmentId&&<FileUpload entityType="VehicleDocumentIntake" entityId={intakeId} documentType={documentType} allowedTypes={['application/pdf','image/jpeg','image/jpg','image/png','image/webp']} onUploadComplete={(attachment)=>void uploaded(attachment)}/>}

      {attachmentId&&<div className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2"><div><strong className="text-sm">Análise documental</strong><p className="text-xs text-slate-500">Status: {extraction?.status||'PROCESSANDO'}</p></div><Button variant="outline" size="sm" onClick={()=>void refresh()} disabled={busy} className="gap-2"><RefreshCw className={`h-4 w-4 ${analysisInProgress?'animate-spin':''}`}/>Atualizar análise</Button></div>
        <div className="space-y-1.5" aria-label="Progresso estimado da análise documental"><div className="flex items-center justify-between gap-3 text-xs"><span className="font-medium text-slate-700 dark:text-slate-200">{analysisInProgress?'Analisando documento':'Etapa concluída'}</span><span className="font-semibold tabular-nums">{progress}% <span className="font-normal text-slate-500">estimado</span></span></div><div className="h-2.5 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700"><div className={`h-full rounded-full bg-blue-600 transition-[width] duration-500 ${analysisInProgress?'animate-pulse':''}`} style={{width:`${progress}%`}} role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress} aria-valuetext={`${progress}% estimado`}/></div><p className="text-[11px] text-slate-500">Percentual estimado por etapa. A IA não fornece progresso contínuo em tempo real.</p></div>

        {canEdit&&<div className="space-y-3"><p className="text-xs text-slate-500">Confira e corrija os campos abaixo antes de aprovar.</p><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{FIELD_KEYS.map(key=><Input key={key} label={FIELD_LABELS[key]} value={corrections[key]||''} onChange={e=>setCorrections(v=>({...v,[key]:e.target.value}))}/>)}</div><div className="flex flex-wrap gap-2"><Button onClick={()=>void review('APPROVE')} disabled={busy} className="gap-2"><CheckCircle2 className="h-4 w-4"/>Aprovar dados</Button><Button variant="outline" onClick={()=>void review('REJECT')} disabled={busy}>Rejeitar leitura</Button></div></div>}

        {approved&&<div className="space-y-4 rounded-xl border border-emerald-200 bg-emerald-50 p-4 dark:border-emerald-900 dark:bg-emerald-950/20">
          <div className="flex items-center gap-2 text-emerald-700 dark:text-emerald-300"><CheckCircle2 className="h-4 w-4"/><strong>Dados do documento aprovados</strong></div>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3 text-xs">{FIELD_KEYS.map(key=>{const identifierError=identifierErrors[key as IdentifierField];return <div key={key} className={identifierError?'rounded-lg border border-red-500 bg-red-50 p-2 text-red-700 dark:bg-red-950/30 dark:text-red-300':'p-2'}><span className={identifierError?'font-semibold':'text-slate-500'}>{FIELD_LABELS[key]}</span><div className="font-semibold">{corrections[key]||'—'}</div>{identifierError&&<div className="mt-1 text-[11px]">{identifierError}</div>}</div>;})}</div>

          <div className="space-y-3 rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
            <div><strong className="text-sm">Completar cadastro do veículo</strong><p className="text-xs text-slate-500">Os campos abaixo não são definidos pelo CRLV e devem ser informados antes da criação.</p></div>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <Input label="Cor *" required error={fieldErrors.color} value={completion.color} onChange={e=>{clearFieldError('color');setCompletion(v=>({...v,color:e.target.value}));}}/>
              <Select label="Categoria *" required error={fieldErrors.category} value={completion.category} onChange={e=>{clearFieldError('category');setCompletion(v=>({...v,category:e.target.value}));}} options={[{value:'',label:'Selecione...'},...VEHICLE_CATEGORIES.map(category=>({value:category,label:category}))]}/>
              <Input label="KM Atual *" type="number" min="0" required error={fieldErrors.currentKm} value={completion.currentKm} onChange={e=>{clearFieldError('currentKm');setCompletion(v=>({...v,currentKm:e.target.value}));}}/>
              <Input label="Versão" value={completion.version} onChange={e=>setCompletion(v=>({...v,version:e.target.value}))} placeholder="Ex.: LT Turbo Flex"/>
              <Input label="Próx. Manutenção (KM)" type="number" min="0" error={fieldErrors.nextMaintenanceKm} value={completion.nextMaintenanceKm} onChange={e=>{clearFieldError('nextMaintenanceKm');setCompletion(v=>({...v,nextMaintenanceKm:e.target.value}));}}/>
            </div>
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-800/50"><h4 className="mb-3 text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300">Valores obrigatórios</h4><div className="grid gap-3 sm:grid-cols-3"><Input label="Valor de Compra (R$) *" type="number" min="0.01" step="0.01" required error={fieldErrors.acquisitionValue} value={completion.acquisitionValue} onChange={e=>{clearFieldError('acquisitionValue');setCompletion(v=>({...v,acquisitionValue:e.target.value}));}}/><Input label="Valor Comercial Atual (R$) *" type="number" min="0.01" step="0.01" required error={fieldErrors.currentValue} value={completion.currentValue} onChange={e=>{clearFieldError('currentValue');setCompletion(v=>({...v,currentValue:e.target.value}));}}/><Input label="Aluguel Semanal (R$) *" type="number" min="0.01" step="0.01" required error={fieldErrors.rentalValueBase} value={completion.rentalValueBase} onChange={e=>{clearFieldError('rentalValueBase');setCompletion(v=>({...v,rentalValueBase:e.target.value}));}}/></div><p className="mt-2 text-[11px] text-slate-500">Nenhum valor financeiro é preenchido automaticamente pela IA.</p></div>
            <div><label className="mb-1 block text-xs font-semibold text-slate-700 dark:text-slate-300">Observações</label><textarea rows={2} value={completion.notes} onChange={e=>setCompletion(v=>({...v,notes:e.target.value}))} className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs dark:border-slate-700 dark:bg-slate-900"/></div>
          </div>
          <Button onClick={()=>void createVehicle()} disabled={busy||materializingRef.current}>{busy?'Criando veículo...':'Concluir cadastro e criar veículo'}</Button>
        </div>}
      </div>}

      {message&&<p className="rounded-lg bg-slate-100 p-3 text-xs text-slate-700 dark:bg-slate-800 dark:text-slate-200">{message}</p>}
      {error&&<div className="flex items-start gap-2 rounded-lg bg-red-50 p-3 text-xs text-red-700 dark:bg-red-950/30 dark:text-red-300"><AlertCircle className="mt-0.5 h-4 w-4 shrink-0"/><span>{error}</span></div>}
    </div>
  </ModalContainer>;
}
