import React,{useEffect,useMemo,useState} from 'react';
import {AlertCircle,CheckCircle2,FileUp,RefreshCw,Sparkles} from 'lucide-react';
import {DocumentAiClient,type DocumentAiExtraction} from '../../api/documentAiClient';
import {DriverClient} from '../../api/driverClient';
import {FinanceMasterDataClient} from '../../api/financeMasterDataClient';
import {TrafficTicketClient,type TrafficTicketFinancialCategory} from '../../api/trafficTicketClient';
import {
  TrafficTicketDocumentIntakeClient,
  type ApprovedTrafficTicketDraft,
  type TrafficTicketIntakeSuggestions,
} from '../../api/trafficTicketDocumentIntakeClient';
import type {Driver} from '../../types/entities';
import {DriverStatus,TicketResponsibility} from '../../types/enums';
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
const MONEY_FIELD_KEYS=new Set(['amount','discountAmount']);
const DATE_FIELD_KEYS=new Set(['infractionDate','dueDate','discountDueDate']);
function sourceMoney(value:unknown):number|undefined{
  if(typeof value==='number'&&Number.isFinite(value))return value;
  if(typeof value!=='string')return undefined;
  const raw=value.trim().replace(/\s/g,'').replace(/^R\$/i,'');
  if(!raw)return undefined;
  const normalized=raw.includes(',')?raw.replace(/\./g,'').replace(',','.'):raw;
  const parsed=Number(normalized);
  return Number.isFinite(parsed)?parsed:undefined;
}
function moneyDisplay(value:unknown):string{
  const parsed=sourceMoney(value);if(parsed===undefined)return '';
  return parsed.toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2});
}
function moneyMask(raw:string):string{
  const digits=raw.replace(/\D/g,'').slice(0,13);if(!digits)return '';
  return (Number(digits)/100).toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2});
}
function moneyNumber(raw:string):number|undefined{
  const clean=raw.trim();if(!clean)return undefined;
  const parsed=Number(clean.replace(/\./g,'').replace(',','.'));
  return Number.isFinite(parsed)?Math.round(parsed*100)/100:undefined;
}
function dateInputValue(value:unknown):string{
  const raw=valueText(value).trim();if(!raw)return '';
  if(/^\d{4}-\d{2}-\d{2}$/.test(raw))return raw;
  const br=raw.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  return br?`${br[3]}-${br[2]}-${br[1]}`:raw;
}
function displayReviewedValue(key:string,value:unknown):string{
  if(MONEY_FIELD_KEYS.has(key))return moneyDisplay(value)||'—';
  if(DATE_FIELD_KEYS.has(key)){
    const iso=dateInputValue(value);if(/^\d{4}-\d{2}-\d{2}$/.test(iso)){
      return new Date(`${iso}T00:00:00Z`).toLocaleDateString('pt-BR',{timeZone:'UTC'});
    }
  }
  return valueText(value)||'—';
}
function reviewCorrections(input:Record<string,string>):Record<string,string>{
  const output={...input};
  for(const key of MONEY_FIELD_KEYS){
    if(!output[key])continue;
    const parsed=moneyNumber(output[key]);output[key]=parsed===undefined?'':parsed.toFixed(2);
  }
  return output;
}
function trafficTicketReviewError(input:Record<string,string>):string|undefined{
  const required:[string,string][]=[
    ['plate','placa'],['noticeNumber','auto de infração'],['organName','órgão'],['infractionCode','código'],
    ['description','descrição'],['infractionDate','data da infração'],['dueDate','vencimento'],['amount','valor original'],
  ];
  const missing=required.filter(([key])=>!String(input[key]||'').trim()).map(([,label])=>label);
  if(missing.length)return `Preencha antes de aprovar: ${missing.join(', ')}.`;
  if(!moneyNumber(input.amount))return 'Informe um valor original válido para a multa.';
  if(!/^\d{4}-\d{2}-\d{2}$/.test(dateInputValue(input.infractionDate)))return 'Informe uma data da infração válida.';
  if(!/^\d{4}-\d{2}-\d{2}$/.test(dateInputValue(input.dueDate)))return 'Informe um vencimento válido.';
  return undefined;
}
function failureMessage(code:string|null|undefined):string{
  if(code==='PROVIDER_RATE_LIMITED')return 'O provedor de IA atingiu o limite temporário. Aguarde e tente novamente mais tarde.';
  if(code==='PROVIDER_DISABLED')return 'O provedor de IA está desativado neste ambiente.';
  if(code==='PROVIDER_MISCONFIGURED')return 'A configuração do provedor de IA precisa ser corrigida no servidor.';
  return 'A IA não conseguiu concluir a leitura deste documento. Nenhuma multa, Conta a Pagar ou Conta a Receber foi criada.';
}

function responsibilityLabel(value:TicketResponsibility):string{
  if(value===TicketResponsibility.DRIVER)return 'Motorista responsável';
  if(value===TicketResponsibility.COMPANY)return 'Empresa responsável pelo pagamento';
  return 'Não identificado / Em investigação';
}
function responsibilityHelp(value:TicketResponsibility):string{
  if(value===TicketResponsibility.DRIVER)return 'A empresa paga a multa e o valor é cobrado do motorista.';
  if(value===TicketResponsibility.COMPANY)return 'A empresa assume a multa. Será gerado somente o Conta a Pagar; contrato e motorista não são necessários.';
  return 'Use temporariamente enquanto o responsável ainda estiver sendo apurado.';
}

export function TrafficTicketDocumentIntakeModal({isOpen,onClose,onCreated}:{isOpen:boolean;onClose:()=>void;onCreated:(ticketId:string)=>void}){
  const[intakeId,setIntakeId]=useState<string|null>(null),[attachmentId,setAttachmentId]=useState<string|null>(null);
  const[extraction,setExtraction]=useState<DocumentAiExtraction|null>(null),[corrections,setCorrections]=useState<Record<string,string>>({});
  const[draft,setDraft]=useState<ApprovedTrafficTicketDraft|null>(null),[suggestions,setSuggestions]=useState<TrafficTicketIntakeSuggestions|null>(null);
  const[categories,setCategories]=useState<TrafficTicketFinancialCategory[]>([]),[drivers,setDrivers]=useState<Driver[]>([]);
  const[vehicleId,setVehicleId]=useState(''),[driverId,setDriverId]=useState(''),[contractId,setContractId]=useState('');
  const[responsibility,setResponsibility]=useState<TicketResponsibility>(TicketResponsibility.UNIDENTIFIED);
  const[baseCategory,setBaseCategory]=useState(''),[incomeCategory,setIncomeCategory]=useState(''),[nicCategory,setNicCategory]=useState(''),[nicAmount,setNicAmount]=useState(''),[notes,setNotes]=useState('');
  const[busy,setBusy]=useState(false),[error,setError]=useState<string|null>(null),[message,setMessage]=useState<string|null>(null);

  const expenses=useMemo(()=>categories.filter(c=>c.type==='EXPENSE'||c.type==='BOTH'),[categories]);
  const income=useMemo(()=>categories.filter(c=>c.type==='INCOME'||c.type==='BOTH'),[categories]);
  const activeDrivers=useMemo(()=>drivers.filter(driver=>!driver.isArchived&&driver.status===DriverStatus.ACTIVE).sort((a,b)=>a.fullName.localeCompare(b.fullName,'pt-BR')),[drivers]);
  const reset=()=>{setIntakeId(null);setAttachmentId(null);setExtraction(null);setCorrections({});setDraft(null);setSuggestions(null);setCategories([]);setDrivers([]);setVehicleId('');setDriverId('');setContractId('');setResponsibility(TicketResponsibility.UNIDENTIFIED);setNicAmount('');setNotes('');setError(null);setMessage(null);setBusy(false);};
  useEffect(()=>{if(!isOpen)reset();},[isOpen]);

  const start=async()=>{setBusy(true);setError(null);try{const intake=await TrafficTicketDocumentIntakeClient.create(`traffic-ticket-ui-${crypto.randomUUID()}`);setIntakeId(intake.id);setMessage('Pré-cadastro criado. Envie o auto ou notificação para leitura.');}catch(e){setError(e instanceof Error?e.message:'Falha ao iniciar leitura.');}finally{setBusy(false);}};
  const refresh=async()=>{if(!attachmentId)return null;const all=await DocumentAiClient.list();const current=all.filter(x=>x.attachmentId===attachmentId).sort((a,b)=>b.updatedAt.localeCompare(a.updatedAt))[0]||null;setExtraction(current);if(current?.status==='REVIEW_REQUIRED'){const initial:Record<string,string>={};for(const key of FIELD_KEYS){const raw=current.proposedFields[key];initial[key]=MONEY_FIELD_KEYS.has(key)?moneyDisplay(raw):DATE_FIELD_KEYS.has(key)?dateInputValue(raw):valueText(raw);}setCorrections(initial);setMessage('Leitura concluída. Confira os dados extraídos antes de aprovar.');}else if(current?.status==='FAILED'){setMessage(null);setError(failureMessage(current.failureCode));}return current;};
  const upload=async(file:File)=>{if(!intakeId)return;if(!ALLOWED_TYPES.has(file.type)||file.size===0||file.size>MAX_BYTES){setError('Envie PDF, JPG, PNG ou WEBP com até 15 MB.');return;}setBusy(true);setError(null);setMessage('Enviando documento e solicitando leitura...');try{const attachment=await TrafficTicketDocumentIntakeClient.upload(intakeId,file);setAttachmentId(attachment.id);await TrafficTicketDocumentIntakeClient.analyze(intakeId);setMessage('Leitura solicitada. Use Atualizar análise para consultar o resultado.');await refresh();}catch(e){setError(e instanceof Error?e.message:'Falha ao enviar/analisar documento.');}finally{setBusy(false);}};
  const review=async(decision:'APPROVE'|'REJECT')=>{if(!extraction||!intakeId)return;if(decision==='APPROVE'){const validationError=trafficTicketReviewError(corrections);if(validationError){setError(validationError);return;}}setBusy(true);setError(null);try{const reviewed=await DocumentAiClient.review(extraction.id,{decision,corrections:reviewCorrections(corrections),notes:'Revisão humana do auto de infração'});setExtraction(reviewed);if(decision==='REJECT'){setMessage('Leitura rejeitada. Nenhuma multa ou obrigação financeira foi criada.');return;}const [approved,suggested,c,driverList]=await Promise.all([TrafficTicketDocumentIntakeClient.getApprovedDraft(intakeId),TrafficTicketDocumentIntakeClient.getSuggestions(intakeId),TrafficTicketClient.categories(),DriverClient.list()]);setDraft(approved);setSuggestions(suggested);setCategories(c);setDrivers(driverList);setVehicleId(suggested.vehicle?.id||'');setContractId(suggested.contract?.id||'');setDriverId(suggested.driver?.id||'');const normalized=(value:string)=>value.trim().toLocaleLowerCase('pt-BR');
      const fineExpense=c.find(x=>normalized(x.name)==='multas de trânsito'&&(x.type==='EXPENSE'||x.type==='BOTH'))
        ||c.find(x=>normalized(x.name).includes('multa')&&(x.type==='EXPENSE'||x.type==='BOTH'));
      const fineIncome=c.find(x=>normalized(x.name)==='multas de trânsito'&&(x.type==='INCOME'||x.type==='BOTH'))
        ||c.find(x=>normalized(x.name).includes('multa')&&(x.type==='INCOME'||x.type==='BOTH'));
      if(fineExpense){setBaseCategory(fineExpense.id);setNicCategory(fineExpense.id);}else{setBaseCategory('');setNicCategory('');}
      if(fineIncome)setIncomeCategory(fineIncome.id);else setIncomeCategory('');setMessage('Dados aprovados. Confirme vínculos e categorias antes de criar a multa.');}catch(e){setError(e instanceof Error?e.message:'Falha na revisão.');}finally{setBusy(false);}};
  const createTicketCategory=async()=>{setBusy(true);setError(null);try{await FinanceMasterDataClient.createCategory({name:'Multas de trânsito',type:'BOTH'});const c=await TrafficTicketClient.categories();setCategories(c);const created=c.find(item=>item.name.toLocaleLowerCase('pt-BR')==='multas de trânsito'&&(item.type==='BOTH'||item.type==='EXPENSE'||item.type==='INCOME'));if(created){setBaseCategory(created.id);setIncomeCategory(created.id);setNicCategory(created.id);}setMessage('Categoria financeira “Multas de trânsito” criada. Revise os vínculos e confirme a multa.');}catch(e){setError(e instanceof Error?e.message:'Não foi possível criar a categoria financeira da multa.');}finally{setBusy(false);}};
  const materialize=async()=>{if(!intakeId||!draft)return;if(!vehicleId){setError('A placa extraída não corresponde exatamente a um veículo cadastrado.');return;}if(!baseCategory){setError('Selecione a categoria de despesa da multa.');return;}if(responsibility===TicketResponsibility.DRIVER&&!driverId){setError('Selecione o motorista responsável pela multa.');return;}if(responsibility===TicketResponsibility.DRIVER&&!incomeCategory){setError('Selecione a categoria de receita para a cobrança do motorista.');return;}setBusy(true);setError(null);try{const result=await TrafficTicketDocumentIntakeClient.materialize(intakeId,{vehicleId,driverId:responsibility===TicketResponsibility.DRIVER?driverId||undefined:undefined,contractId:responsibility===TicketResponsibility.DRIVER?(contractId||undefined):undefined,responsibility,baseExpenseCategoryId:baseCategory,driverIncomeCategoryId:responsibility===TicketResponsibility.DRIVER?incomeCategory:undefined,nicExpenseCategoryId:responsibility===TicketResponsibility.UNIDENTIFIED?(nicCategory||baseCategory):undefined,nicAmount:moneyNumber(nicAmount),notes:notes.trim()||undefined});onCreated(result.ticketId);reset();onClose();}catch(e){setError(e instanceof Error?e.message:'Falha ao confirmar multa.');}finally{setBusy(false);}};

  const canEdit=extraction?.status==='REVIEW_REQUIRED',approved=extraction?.status==='APPROVED',failed=extraction?.status==='FAILED';
  const progress=analysisProgress(extraction?.status||null),analysisInProgress=!extraction||extraction.status==='PENDING'||extraction.status==='PROCESSING';
  const missingRequiredCategory=expenses.length===0||(responsibility===TicketResponsibility.DRIVER&&income.length===0);

  return <ModalContainer isOpen={isOpen} onClose={onClose} size="5xl" title="Cadastrar multa por documento com IA"><div className="space-y-4">
    <div className="rounded-xl border border-blue-200 bg-blue-50 p-3 text-xs text-blue-800 dark:border-blue-900 dark:bg-blue-950/30 dark:text-blue-200"><strong>Fluxo com revisão humana:</strong> a IA só propõe os dados. Multa, CP/CR e vínculo do documento são criados apenas na confirmação final.</div>
    {!intakeId&&<Button onClick={()=>void start()} disabled={busy} className="gap-2"><Sparkles className="h-4 w-4"/>{busy?'Preparando...':'Começar leitura com IA'}</Button>}
    {intakeId&&!attachmentId&&<label className="block rounded-xl border border-dashed p-6 text-center cursor-pointer"><FileUp className="mx-auto mb-2 h-7 w-7 text-slate-500"/><span className="text-sm font-medium">Selecionar auto/notificação</span><span className="block text-xs text-slate-500">PDF, JPG, PNG ou WEBP · até 15 MB</span><input className="hidden" type="file" accept="application/pdf,image/jpeg,image/png,image/webp" disabled={busy} onChange={e=>{const file=e.target.files?.[0];if(file)void upload(file);e.currentTarget.value='';}}/></label>}
    {attachmentId&&<div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2"><div><strong className="text-sm">Análise do auto</strong><p className="text-xs text-slate-500">Status: {extraction?.status||'PROCESSANDO'}</p></div><Button variant="outline" size="sm" onClick={()=>void refresh()} disabled={busy} className="gap-2"><RefreshCw className={`h-4 w-4 ${analysisInProgress?'animate-spin':''}`}/>Atualizar análise</Button></div>
      <div className="space-y-1.5"><div className="flex justify-between text-xs"><span>{failed?'Falha na leitura':analysisInProgress?'Analisando documento':'Etapa concluída'}</span><span>{failed?'interrompida':`${progress}% estimado`}</span></div><div className="h-2.5 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700"><div className={`h-full rounded-full ${failed?'bg-rose-600':'bg-blue-600'} transition-[width] ${analysisInProgress?'animate-pulse':''}`} style={{width:`${progress}%`}}/></div></div>
      {failed&&<div className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-xs text-rose-700 dark:border-rose-900 dark:bg-rose-950/30 dark:text-rose-300"><div className="flex items-start gap-2"><AlertCircle className="mt-0.5 h-4 w-4 shrink-0"/><div><strong>Falha no processamento da IA.</strong><p className="mt-1">{failureMessage(extraction.failureCode)}</p><p className="mt-1 text-[11px] opacity-80">O documento foi recebido pelo sistema. Para uma nova leitura, reinicie o fluxo e envie o arquivo novamente após a correção do provedor.</p></div></div><Button variant="outline" size="sm" className="mt-3" onClick={()=>{reset();void start();}} disabled={busy}>Iniciar nova leitura</Button></div>}
      {canEdit&&<div className="space-y-3"><p className="text-xs text-slate-500">Confira e corrija os dados extraídos antes de aprovar. Valores usam o padrão brasileiro e datas podem ser escolhidas no calendário.</p><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{FIELD_KEYS.map(key=>{
        if(MONEY_FIELD_KEYS.has(key))return <Input key={key} label={FIELD_LABELS[key]} inputMode="decimal" value={corrections[key]||''} onChange={e=>setCorrections(v=>({...v,[key]:moneyMask(e.target.value)}))} placeholder="0,00"/>;
        if(DATE_FIELD_KEYS.has(key))return <Input key={key} label={FIELD_LABELS[key]} type="date" value={corrections[key]||''} onChange={e=>setCorrections(v=>({...v,[key]:e.target.value}))}/>;
        if(key==='infractionTime')return <Input key={key} label={FIELD_LABELS[key]} type="time" value={corrections[key]||''} onChange={e=>setCorrections(v=>({...v,[key]:e.target.value}))}/>;
        return <Input key={key} label={FIELD_LABELS[key]} value={corrections[key]||''} onChange={e=>setCorrections(v=>({...v,[key]:e.target.value}))}/>;
      })}</div><div className="flex gap-2"><Button onClick={()=>void review('APPROVE')} disabled={busy} className="gap-2"><CheckCircle2 className="h-4 w-4"/>Aprovar dados</Button><Button variant="outline" onClick={()=>void review('REJECT')} disabled={busy}>Rejeitar leitura</Button></div></div>}
      {approved&&draft&&<div className="space-y-4 rounded-xl border border-emerald-200 bg-emerald-50 p-4 dark:border-emerald-900 dark:bg-emerald-950/20"><div className="flex items-center gap-2 text-emerald-700 dark:text-emerald-300"><CheckCircle2 className="h-4 w-4"/><strong>Documento aprovado</strong></div><div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3 text-xs">{FIELD_KEYS.map(key=><div key={key}><span className="text-slate-500">{FIELD_LABELS[key]}</span><div className="font-semibold">{displayReviewedValue(key,draft.fields[key as keyof typeof draft.fields])}</div></div>)}</div>
        {responsibility===TicketResponsibility.DRIVER&&suggestions?.ambiguous&&<div className="rounded-lg bg-amber-100 p-3 text-xs text-amber-800">Há mais de um contrato possível para a data da infração. Selecione o motorista manualmente; nenhum contrato será inventado ou vinculado automaticamente.</div>}{suggestions&&!suggestions.vehicle&&<div className="rounded-lg bg-amber-100 p-3 text-xs text-amber-800">Veículo não cadastrado / Outro. A placa extraída não possui correspondência exata no cadastro; corrija ou cadastre o veículo antes de confirmar a multa.</div>}{responsibility===TicketResponsibility.DRIVER&&suggestions?.vehicle&&!suggestions.driver&&<div className="rounded-lg bg-slate-100 p-3 text-xs text-slate-700 dark:bg-slate-800 dark:text-slate-200">Não foi localizado um único motorista por contrato nesta data. Selecione o motorista responsável manualmente.</div>}{responsibility===TicketResponsibility.COMPANY&&suggestions?.vehicle&&<div className="rounded-lg bg-emerald-100 p-3 text-xs text-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-300"><strong>Empresa assume:</strong> esta multa será criada com Conta a Pagar para pagamento. Nenhum contrato, motorista, Conta a Receber ou NIC será exigido.</div>}
        {missingRequiredCategory&&<div className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-xs text-rose-700 dark:border-rose-900 dark:bg-rose-950/20 dark:text-rose-300"><p>Nenhuma categoria financeira compatível está disponível para concluir esta multa.</p><Button type="button" size="sm" variant="outline" className="mt-2" onClick={()=>void createTicketCategory()} disabled={busy}>Criar “Multas de trânsito” (Ambos)</Button></div>}
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3"><label>Veículo *<Select value={vehicleId} disabled><option value="">Veículo não cadastrado / Outro</option>{suggestions?.vehicle&&<option value={suggestions.vehicle.id}>{suggestions.vehicle.plate} — {suggestions.vehicle.brand} {suggestions.vehicle.model}</option>}</Select></label><label>Quem vai assumir a multa? *<Select value={responsibility} onChange={e=>{const next=e.target.value as TicketResponsibility;setResponsibility(next);if(next===TicketResponsibility.DRIVER){setDriverId(current=>current||suggestions?.driver?.id||'');setContractId(current=>current||suggestions?.contract?.id||'');}else{setDriverId('');setContractId('');}}}>{Object.values(TicketResponsibility).map(v=><option key={v} value={v}>{responsibilityLabel(v)}</option>)}</Select><span className="mt-1 block text-[11px] text-slate-500">{responsibilityHelp(responsibility)}</span></label>{responsibility===TicketResponsibility.DRIVER&&<label>Motorista *<Select value={driverId} onChange={e=>{const selected=e.target.value;setDriverId(selected);setContractId(selected&&selected===suggestions?.driver?.id?suggestions?.contract?.id||'':'');}}><option value="">Selecione um motorista ativo</option>{activeDrivers.map(driver=><option key={driver.id} value={driver.id}>{driver.fullName}</option>)}</Select>{activeDrivers.length===0&&<span className="mt-1 block text-[11px] text-rose-600">Nenhum motorista ativo disponível.</span>}</label>}<label>Categoria da despesa da multa *<Select value={baseCategory} onChange={e=>setBaseCategory(e.target.value)}><option value="">Selecione categoria de multa</option>{expenses.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</Select></label>{responsibility===TicketResponsibility.DRIVER&&<label>Categoria da cobrança do motorista *<Select value={incomeCategory} onChange={e=>setIncomeCategory(e.target.value)}><option value="">Selecione categoria de cobrança da multa</option>{income.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</Select></label>}{responsibility===TicketResponsibility.UNIDENTIFIED&&<><label>Categoria da NIC *<Select value={nicCategory} onChange={e=>setNicCategory(e.target.value)}><option value="">Selecione</option>{expenses.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</Select></label><label>Valor da NIC (opcional)<Input value={nicAmount} inputMode="decimal" onChange={e=>setNicAmount(moneyMask(e.target.value))} placeholder="0,00 · vazio = valor original"/></label></>}<label className="sm:col-span-2">Observações<textarea className="mt-1 w-full rounded-xl border bg-transparent p-2" rows={2} value={notes} onChange={e=>setNotes(e.target.value)}/></label></div>
        <Button onClick={()=>void materialize()} disabled={busy}>{busy?'Confirmando...':responsibility===TicketResponsibility.COMPANY?'Criar multa e Conta a Pagar':responsibility===TicketResponsibility.DRIVER?'Criar multa, CP e cobrança do motorista':'Confirmar multa em investigação'}</Button>
      </div>}
    </div>}
    {message&&<p className="rounded-lg bg-slate-100 p-3 text-xs text-slate-700 dark:bg-slate-800 dark:text-slate-200">{message}</p>}
    {error&&<div className="flex items-start gap-2 rounded-lg bg-red-50 p-3 text-xs text-red-700 dark:bg-red-950/30 dark:text-red-300"><AlertCircle className="mt-0.5 h-4 w-4 shrink-0"/><span>{error}</span></div>}
  </div></ModalContainer>;
}