import React,{useEffect,useMemo,useState} from 'react';
import {AlertCircle,CheckCircle2,FileUp,RefreshCw,Sparkles} from 'lucide-react';
import {DriverClient} from '../../api/driverClient';
import {DocumentAiClient,type DocumentAiExtraction} from '../../api/documentAiClient';
import {TrafficTicketClient,type TrafficTicketFinancialCategory} from '../../api/trafficTicketClient';
import {
  TrafficTicketDocumentIntakeClient,
  type ApprovedTrafficTicketDraft,
  type TrafficTicketIntakeSuggestions,
} from '../../api/trafficTicketDocumentIntakeClient';
import {VehicleClient} from '../../api/vehicleClient';
import type {Driver,Vehicle} from '../../types/entities';
import {TicketResponsibility} from '../../types/enums';
import {Button,Input,ModalContainer,Select} from '../ui';

const FIELD_LABELS:Record<string,string>={
  plate:'Placa',noticeNumber:'Auto de infração',organName:'Órgão',infractionCode:'Código',description:'Descrição',
  infractionDate:'Data da infração',infractionTime:'Horário',infractionLocation:'Local',dueDate:'Vencimento',
  discountDueDate:'Limite do desconto',amount:'Valor original',discountAmount:'Valor com desconto',points:'Pontos',
};
const FIELD_KEYS=Object.keys(FIELD_LABELS);
const ALLOWED_TYPES=new Set(['application/pdf','image/jpeg','image/jpg','image/png','image/webp']);
const MAX_BYTES=15*1024*1024;

function analysisProgress(status:DocumentAiExtraction['status']|null):number{
  if(status==='PENDING')return 50;if(status==='PROCESSING')return 70;
  if(status==='REVIEW_REQUIRED'||status==='APPROVED'||status==='REJECTED'||status==='FAILED')return 100;return 45;
}
function valueText(value:unknown):string{return typeof value==='string'||typeof value==='number'?String(value):'';}
function failureMessage(code:string|null|undefined):string{
  if(code==='PROVIDER_RATE_LIMITED')return 'O provedor de IA atingiu o limite temporário. Aguarde e tente novamente mais tarde.';
  if(code==='PROVIDER_DISABLED')return 'O provedor de IA está desativado neste ambiente.';
  if(code==='PROVIDER_MISCONFIGURED')return 'A configuração do provedor de IA precisa ser corrigida no servidor.';
  return 'A IA não conseguiu concluir a leitura deste documento. Nenhuma multa, Conta a Pagar ou Conta a Receber foi criada.';
}

export function TrafficTicketDocumentIntakeModal({isOpen,onClose,onCreated}:{isOpen:boolean;onClose:()=>void;onCreated:(ticketId:string)=>void}){
  const[intakeId,setIntakeId]=useState<string|null>(null),[attachmentId,setAttachmentId]=useState<string|null>(null);
  const[extraction,setExtraction]=useState<DocumentAiExtraction|null>(null),[corrections,setCorrections]=useState<Record<string,string>>({});
  const[draft,setDraft]=useState<ApprovedTrafficTicketDraft|null>(null),[suggestions,setSuggestions]=useState<TrafficTicketIntakeSuggestions|null>(null);
  const[vehicles,setVehicles]=useState<Vehicle[]>([]),[drivers,setDrivers]=useState<Driver[]>([]),[categories,setCategories]=useState<TrafficTicketFinancialCategory[]>([]);
  const[vehicleId,setVehicleId]=useState(''),[driverId,setDriverId]=useState(''),[contractId,setContractId]=useState('');
  const[responsibility,setResponsibility]=useState<TicketResponsibility>(TicketResponsibility.UNIDENTIFIED);
  const[baseCategory,setBaseCategory]=useState(''),[incomeCategory,setIncomeCategory]=useState(''),[nicCategory,setNicCategory]=useState(''),[nicAmount,setNicAmount]=useState(''),[notes,setNotes]=useState('');
  const[busy,setBusy]=useState(false),[error,setError]=useState<string|null>(null),[message,setMessage]=useState<string|null>(null);

  const expenses=useMemo(()=>categories.filter(c=>c.type==='EXPENSE'||c.type==='BOTH'),[categories]);
  const income=useMemo(()=>categories.filter(c=>c.type==='INCOME'||c.type==='BOTH'),[categories]);
  const reset=()=>{setIntakeId(null);setAttachmentId(null);setExtraction(null);setCorrections({});setDraft(null);setSuggestions(null);setVehicleId('');setDriverId('');setContractId('');setResponsibility(TicketResponsibility.UNIDENTIFIED);setNicAmount('');setNotes('');setError(null);setMessage(null);setBusy(false);};
  useEffect(()=>{if(!isOpen)reset();},[isOpen]);

  const start=async()=>{setBusy(true);setError(null);try{const intake=await TrafficTicketDocumentIntakeClient.create(`traffic-ticket-ui-${crypto.randomUUID()}`);setIntakeId(intake.id);setMessage('Pré-cadastro criado. Envie o auto ou notificação para leitura.');}catch(e){setError(e instanceof Error?e.message:'Falha ao iniciar leitura.');}finally{setBusy(false);}};
  const refresh=async()=>{if(!attachmentId)return null;const all=await DocumentAiClient.list();const current=all.filter(x=>x.attachmentId===attachmentId).sort((a,b)=>b.updatedAt.localeCompare(a.updatedAt))[0]||null;setExtraction(current);if(current?.status==='REVIEW_REQUIRED'){const initial:Record<string,string>={};for(const key of FIELD_KEYS)initial[key]=valueText(current.proposedFields[key]);setCorrections(initial);setMessage('Leitura concluída. Confira os dados extraídos antes de aprovar.');}else if(current?.status==='FAILED'){setMessage(null);setError(failureMessage(current.failureCode));}return current;};
  const upload=async(file:File)=>{if(!intakeId)return;if(!ALLOWED_TYPES.has(file.type)||file.size===0||file.size>MAX_BYTES){setError('Envie PDF, JPG, PNG ou WEBP com até 15 MB.');return;}setBusy(true);setError(null);setMessage('Enviando documento e solicitando leitura...');try{const attachment=await TrafficTicketDocumentIntakeClient.upload(intakeId,file);setAttachmentId(attachment.id);await TrafficTicketDocumentIntakeClient.analyze(intakeId);setMessage('Leitura solicitada. Use Atualizar análise para consultar o resultado.');await refresh();}catch(e){setError(e instanceof Error?e.message:'Falha ao enviar/analisar documento.');}finally{setBusy(false);}};
  const review=async(decision:'APPROVE'|'REJECT')=>{if(!extraction||!intakeId)return;setBusy(true);setError(null);try{const reviewed=await DocumentAiClient.review(extraction.id,{decision,corrections,notes:'Revisão humana do auto de infração'});setExtraction(reviewed);if(decision==='REJECT'){setMessage('Leitura rejeitada. Nenhuma multa ou obrigação financeira foi criada.');return;}const [approved,suggested,v,d,c]=await Promise.all([TrafficTicketDocumentIntakeClient.getApprovedDraft(intakeId),TrafficTicketDocumentIntakeClient.getSuggestions(intakeId),VehicleClient.list(),DriverClient.list(),TrafficTicketClient.categories()]);setDraft(approved);setSuggestions(suggested);setVehicles(v);setDrivers(d);setCategories(c);if(suggested.vehicle)setVehicleId(suggested.vehicle.id);if(suggested.contract)setContractId(suggested.contract.id);if(suggested.driver)setDriverId(suggested.driver.id);const exp=c.find(x=>x.type==='EXPENSE'||x.type==='BOTH'),inc=c.find(x=>x.type==='INCOME'||x.type==='BOTH');if(exp){setBaseCategory(exp.id);setNicCategory(exp.id);}if(inc)setIncomeCategory(inc.id);setMessage('Dados aprovados. Confirme vínculos e categorias antes de criar a multa.');}catch(e){setError(e instanceof Error?e.message:'Falha na revisão.');}finally{setBusy(false);}};
  const materialize=async()=>{if(!intakeId||!draft)return;if(!vehicleId||!baseCategory){setError('Selecione veículo e categoria de despesa.');return;}if(responsibility===TicketResponsibility.DRIVER&&(!driverId||!incomeCategory)){setError('Para responsabilidade DRIVER, selecione motorista e categoria de receita.');return;}setBusy(true);setError(null);try{const result=await TrafficTicketDocumentIntakeClient.materialize(intakeId,{vehicleId,driverId:responsibility===TicketResponsibility.DRIVER?driverId||undefined:undefined,contractId:contractId||undefined,responsibility,baseExpenseCategoryId:baseCategory,driverIncomeCategoryId:responsibility===TicketResponsibility.DRIVER?incomeCategory:undefined,nicExpenseCategoryId:responsibility===TicketResponsibility.UNIDENTIFIED?(nicCategory||baseCategory):undefined,nicAmount:nicAmount?Number(nicAmount.replace(',','.')):undefined,notes:notes.trim()||undefined});onCreated(result.ticketId);reset();onClose();}catch(e){setError(e instanceof Error?e.message:'Falha ao confirmar multa.');}finally{setBusy(false);}};

  const canEdit=extraction?.status==='REVIEW_REQUIRED',approved=extraction?.status==='APPROVED',failed=extraction?.status==='FAILED';
  const progress=analysisProgress(extraction?.status||null),analysisInProgress=!extraction||extraction.status==='PENDING'||extraction.status==='PROCESSING';

  return <ModalContainer isOpen={isOpen} onClose={onClose} size="5xl" title="Cadastrar multa por documento com IA"><div className="space-y-4">
    <div className="rounded-xl border border-blue-200 bg-blue-50 p-3 text-xs text-blue-800 dark:border-blue-900 dark:bg-blue-950/30 dark:text-blue-200"><strong>Fluxo com revisão humana:</strong> a IA só propõe os dados. Multa, CP/CR e vínculo do documento são criados apenas na confirmação final.</div>
    {!intakeId&&<Button onClick={()=>void start()} disabled={busy} className="gap-2"><Sparkles className="h-4 w-4"/>{busy?'Preparando...':'Começar leitura com IA'}</Button>}
    {intakeId&&!attachmentId&&<label className="block rounded-xl border border-dashed p-6 text-center cursor-pointer"><FileUp className="mx-auto mb-2 h-7 w-7 text-slate-500"/><span className="text-sm font-medium">Selecionar auto/notificação</span><span className="block text-xs text-slate-500">PDF, JPG, PNG ou WEBP · até 15 MB</span><input className="hidden" type="file" accept="application/pdf,image/jpeg,image/png,image/webp" disabled={busy} onChange={e=>{const file=e.target.files?.[0];if(file)void upload(file);e.currentTarget.value='';}}/></label>}
    {attachmentId&&<div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2"><div><strong className="text-sm">Análise do auto</strong><p className="text-xs text-slate-500">Status: {extraction?.status||'PROCESSANDO'}</p></div><Button variant="outline" size="sm" onClick={()=>void refresh()} disabled={busy} className="gap-2"><RefreshCw className={`h-4 w-4 ${analysisInProgress?'animate-spin':''}`}/>Atualizar análise</Button></div>
      <div className="space-y-1.5"><div className="flex justify-between text-xs"><span>{failed?'Falha na leitura':analysisInProgress?'Analisando documento':'Etapa concluída'}</span><span>{failed?'interrompida':`${progress}% estimado`}</span></div><div className="h-2.5 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700"><div className={`h-full rounded-full ${failed?'bg-rose-600':'bg-blue-600'} transition-[width] ${analysisInProgress?'animate-pulse':''}`} style={{width:`${progress}%`}}/></div></div>
      {failed&&<div className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-xs text-rose-700 dark:border-rose-900 dark:bg-rose-950/30 dark:text-rose-300"><div className="flex items-start gap-2"><AlertCircle className="mt-0.5 h-4 w-4 shrink-0"/><div><strong>Falha no processamento da IA.</strong><p className="mt-1">{failureMessage(extraction.failureCode)}</p><p className="mt-1 text-[11px] opacity-80">O documento foi recebido pelo sistema. Para uma nova leitura, reinicie o fluxo e envie o arquivo novamente após a correção do provedor.</p></div></div><Button variant="outline" size="sm" className="mt-3" onClick={()=>{reset();void start();}} disabled={busy}>Iniciar nova leitura</Button></div>}
      {canEdit&&<div className="space-y-3"><p className="text-xs text-slate-500">Confira e corrija os dados extraídos antes de aprovar.</p><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{FIELD_KEYS.map(key=><Input key={key} label={FIELD_LABELS[key]} value={corrections[key]||''} onChange={e=>setCorrections(v=>({...v,[key]:e.target.value}))}/>)}</div><div className="flex gap-2"><Button onClick={()=>void review('APPROVE')} disabled={busy} className="gap-2"><CheckCircle2 className="h-4 w-4"/>Aprovar dados</Button><Button variant="outline" onClick={()=>void review('REJECT')} disabled={busy}>Rejeitar leitura</Button></div></div>}
      {approved&&draft&&<div className="space-y-4 rounded-xl border border-emerald-200 bg-emerald-50 p-4 dark:border-emerald-900 dark:bg-emerald-950/20"><div className="flex items-center gap-2 text-emerald-700 dark:text-emerald-300"><CheckCircle2 className="h-4 w-4"/><strong>Documento aprovado</strong></div><div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3 text-xs">{FIELD_KEYS.map(key=><div key={key}><span className="text-slate-500">{FIELD_LABELS[key]}</span><div className="font-semibold">{valueText(draft.fields[key as keyof typeof draft.fields])||'—'}</div></div>)}</div>
        {suggestions?.ambiguous&&<div className="rounded-lg bg-amber-100 p-3 text-xs text-amber-800">Há mais de um vínculo possível para a data da infração. Selecione manualmente; a IA não decidirá.</div>}
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3"><label>Veículo *<Select value={vehicleId} onChange={e=>setVehicleId(e.target.value)}><option value="">Selecione</option>{vehicles.map(v=><option key={v.id} value={v.id}>{v.plate} — {v.brand} {v.model}</option>)}</Select></label><label>Responsabilidade *<Select value={responsibility} onChange={e=>setResponsibility(e.target.value as TicketResponsibility)}>{Object.values(TicketResponsibility).map(v=><option key={v} value={v}>{v}</option>)}</Select></label>{responsibility===TicketResponsibility.DRIVER&&<label>Motorista *<Select value={driverId} onChange={e=>setDriverId(e.target.value)}><option value="">Selecione</option>{drivers.map(d=><option key={d.id} value={d.id}>{d.fullName}</option>)}</Select></label>}<label>Categoria AP-base *<Select value={baseCategory} onChange={e=>setBaseCategory(e.target.value)}><option value="">Selecione</option>{expenses.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</Select></label>{responsibility===TicketResponsibility.DRIVER&&<label>Categoria AR motorista *<Select value={incomeCategory} onChange={e=>setIncomeCategory(e.target.value)}><option value="">Selecione</option>{income.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</Select></label>}{responsibility===TicketResponsibility.UNIDENTIFIED&&<><label>Categoria AP-NIC *<Select value={nicCategory} onChange={e=>setNicCategory(e.target.value)}><option value="">Selecione</option>{expenses.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</Select></label><label>NIC explícita (opcional)<Input value={nicAmount} onChange={e=>setNicAmount(e.target.value)} placeholder="Vazio = valor original"/></label></>}<label className="sm:col-span-2">Observações<textarea className="mt-1 w-full rounded-xl border bg-transparent p-2" rows={2} value={notes} onChange={e=>setNotes(e.target.value)}/></label></div>
        <Button onClick={()=>void materialize()} disabled={busy}>{busy?'Confirmando...':'Confirmar e criar multa'}</Button>
      </div>}
    </div>}
    {message&&<p className="rounded-lg bg-slate-100 p-3 text-xs text-slate-700 dark:bg-slate-800 dark:text-slate-200">{message}</p>}
    {error&&<div className="flex items-start gap-2 rounded-lg bg-red-50 p-3 text-xs text-red-700 dark:bg-red-950/30 dark:text-red-300"><AlertCircle className="mt-0.5 h-4 w-4 shrink-0"/><span>{error}</span></div>}
  </div></ModalContainer>;
}