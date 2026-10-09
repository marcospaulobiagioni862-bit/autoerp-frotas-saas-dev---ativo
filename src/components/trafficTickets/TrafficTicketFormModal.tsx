import { requestGuardedClose } from '../../app/unsavedChangesAuthority';
import React, { useEffect, useMemo, useState } from 'react';
import { DriverClient } from '../../api/driverClient';
import { TrafficTicketClient, type TrafficTicketFinancialCategory, type InfractionMatchContext } from '../../api/trafficTicketClient';
import { VehicleClient } from '../../api/vehicleClient';
import type { Driver, Vehicle } from '../../types/entities';
import { TicketResponsibility } from '../../types/enums';
import { Button, Input, ModalContainer, Select } from '../ui';
import { AlertTriangle, CheckCircle, Info, ShieldAlert, Wrench } from 'lucide-react';

interface TrafficTicketFormModalProps {
  isOpen:boolean;onClose:()=>void;onSuccess:()=>void;companyId?:string;initialVehicleId?:string;initialDriverId?:string;
}

export const TrafficTicketFormModal:React.FC<TrafficTicketFormModalProps>=({isOpen,onClose,onSuccess,initialVehicleId,initialDriverId})=>{
  const [vehicles,setVehicles]=useState<Vehicle[]>([]),[drivers,setDrivers]=useState<Driver[]>([]),[categories,setCategories]=useState<TrafficTicketFinancialCategory[]>([]);
  const [loading,setLoading]=useState(false),[submitting,setSubmitting]=useState(false),[error,setError]=useState<string|null>(null),[fieldErrors,setFieldErrors]=useState<Record<string,string>>({});
  const [vehicleId,setVehicleId]=useState(initialVehicleId||''),[driverId,setDriverId]=useState(initialDriverId||''),[autoNumber,setAutoNumber]=useState('');
  const [organName,setOrganName]=useState(''),[infractionCode,setInfractionCode]=useState(''),[description,setDescription]=useState('');
  const [infractionDate,setInfractionDate]=useState(''),[infractionTime,setInfractionTime]=useState(''),[dueDate,setDueDate]=useState('');
  const [discountDueDate,setDiscountDueDate]=useState(''),[originalAmount,setOriginalAmount]=useState(''),[discountedAmount,setDiscountedAmount]=useState('');
  const [nicAmount,setNicAmount]=useState(''),[points,setPoints]=useState(''),[responsibility,setResponsibility]=useState<''|TicketResponsibility>(''),[notes,setNotes]=useState('');
  const [baseCategory,setBaseCategory]=useState(''),[incomeCategory,setIncomeCategory]=useState(''),[nicCategory,setNicCategory]=useState('');
  const [expenses,income]=useMemo(()=>[categories.filter(c=>c.type==='EXPENSE'||c.type==='BOTH'),categories.filter(c=>c.type==='INCOME'||c.type==='BOTH')],[categories]);
  const [matchLoading,setMatchLoading]=useState(false),[matchContext,setMatchContext]=useState<InfractionMatchContext|null>(null);

  useEffect(()=>{if(!isOpen)return;setLoading(true);setError(null);void Promise.all([VehicleClient.list(),DriverClient.list(),TrafficTicketClient.categories()]).then(([v,d,c])=>{setVehicles(v);setDrivers(d);setCategories(c);}).catch(err=>setError(err instanceof Error?err.message:'Erro ao carregar dados.')).finally(()=>setLoading(false));},[isOpen]);

  useEffect(()=>{
    if(!vehicleId||!infractionDate){setMatchContext(null);return;}
    let active=true;setMatchLoading(true);
    TrafficTicketClient.getMatchContext(vehicleId,infractionDate,infractionTime||undefined)
      .then(ctx=>{
        if(!active)return;
        setMatchContext(ctx);
        if(ctx.matchStatus==='MATCHED_CONTRACT'&&ctx.matchedContract){
          setResponsibility(TicketResponsibility.DRIVER);
          setDriverId(ctx.matchedContract.driverId);
          clearFieldError('driverId');clearFieldError('responsibility');
        }else if((ctx.matchStatus==='VEHICLE_IN_MAINTENANCE'||ctx.matchStatus==='NO_ACTIVE_CONTRACT')&&!responsibility){
          setResponsibility(TicketResponsibility.COMPANY);
          clearFieldError('responsibility');
        }
      })
      .catch(()=>{if(active)setMatchContext(null);})
      .finally(()=>{if(active)setMatchLoading(false);});
    return ()=>{active=false;};
  },[vehicleId,infractionDate,infractionTime]);

  const responsibilityLabel=(value:''|TicketResponsibility)=>value===TicketResponsibility.DRIVER?'Motorista responsável':value===TicketResponsibility.COMPANY?'MoveFlex (Empresa)':value===TicketResponsibility.UNIDENTIFIED?'Não identificado / Em investigação':'Selecione';
  const financialSummary=responsibility===TicketResponsibility.DRIVER?'A empresa paga a multa e o valor é cobrado do motorista (Conta a Pagar + Conta a Receber).':responsibility===TicketResponsibility.COMPANY?'A MoveFlex assume o custo da multa (somente Conta a Pagar).':responsibility===TicketResponsibility.UNIDENTIFIED?'Use temporariamente enquanto o responsável estiver sendo apurado; a multa permanece como obrigação da empresa e a NIC pode ser registrada quando aplicável.':'Selecione quem vai assumir a multa para visualizar o efeito financeiro.';
  const clearFieldError=(field:string)=>setFieldErrors(current=>{if(!current[field])return current;const next={...current};delete next[field];return next;});
  const number=(value:string)=>{const parsed=Number(value.replace(',','.'));return Number.isFinite(parsed)?parsed:NaN;};
  const submit=async(event:React.FormEvent)=>{event.preventDefault();setError(null);const original=number(originalAmount);const discount=discountedAmount?number(discountedAmount):undefined;const nextErrors:Record<string,string>={};if(!vehicleId)nextErrors.vehicleId='Selecione o veículo.';if(!responsibility)nextErrors.responsibility='Selecione a responsabilidade.';if(!autoNumber.trim())nextErrors.autoNumber='Informe o auto de infração.';if(!organName.trim())nextErrors.organName='Informe o órgão.';if(!infractionCode.trim())nextErrors.infractionCode='Informe o código da infração.';if(!description.trim())nextErrors.description='Informe a descrição.';if(!infractionDate)nextErrors.infractionDate='Informe a data da infração.';if(!dueDate)nextErrors.dueDate='Informe o vencimento.';if(infractionDate&&dueDate&&dueDate<infractionDate)nextErrors.dueDate='O vencimento não pode ser anterior à infração.';if(discountDueDate&&infractionDate&&discountDueDate<infractionDate)nextErrors.discountDueDate='O limite do desconto não pode ser anterior à infração.';if(discountDueDate&&dueDate&&discountDueDate>dueDate)nextErrors.discountDueDate='O limite do desconto não pode ser posterior ao vencimento.';if(discountedAmount&&(!Number.isFinite(discount)||discount!<=0||!Number.isFinite(original)||discount!>=original))nextErrors.discountedAmount='Informe um valor com desconto menor que o valor original.';if(discountedAmount&&!discountDueDate)nextErrors.discountDueDate='Informe o limite do desconto.';if(!Number.isFinite(original)||original<=0)nextErrors.originalAmount='Informe um valor original válido.';if(!baseCategory)nextErrors.baseCategory='Selecione a categoria de Contas a Pagar.';if(responsibility===TicketResponsibility.DRIVER){if(!driverId)nextErrors.driverId='Selecione o motorista.';if(!incomeCategory)nextErrors.incomeCategory='Selecione a categoria de Contas a Receber.';if(matchContext?.matchStatus==='MATCHED_CONTRACT'&&matchContext.matchedContract&&driverId!==matchContext.matchedContract.driverId){nextErrors.driverId=`O veículo estava locado para ${matchContext.matchedContract.driverName} na data da infração. Não é permitido indicar outro motorista.`;}}if(responsibility===TicketResponsibility.UNIDENTIFIED&&!nicCategory)nextErrors.nicCategory='Selecione a categoria de Contas a Pagar da NIC.';setFieldErrors(nextErrors);if(Object.keys(nextErrors).length){setError('Corrija os campos destacados em vermelho antes de salvar a multa.');return;}setSubmitting(true);try{
    await TrafficTicketClient.create({vehicleId,driverId:responsibility===TicketResponsibility.DRIVER?driverId||undefined:undefined,contractId:responsibility===TicketResponsibility.DRIVER?(matchContext?.matchedContract?.id||undefined):undefined,autoNumber:autoNumber.trim(),organName:organName.trim(),infractionCode:infractionCode.trim(),description:description.trim(),infractionDate,infractionTime:infractionTime||undefined,dueDate,discountDueDate:discountDueDate||undefined,originalAmount:original,discountedAmount:discountedAmount?number(discountedAmount):undefined,nicAmount:nicAmount?number(nicAmount):undefined,points:points?Number(points):0,responsibility,notes:notes.trim()||undefined,baseExpenseCategoryId:baseCategory,driverIncomeCategoryId:responsibility===TicketResponsibility.DRIVER?incomeCategory:undefined,nicExpenseCategoryId:responsibility===TicketResponsibility.UNIDENTIFIED?nicCategory:undefined});
    onSuccess();onClose();
  }catch(err){setError(err instanceof Error?err.message:'Erro ao salvar multa.');}finally{setSubmitting(false);}};
  return <ModalContainer isOpen={isOpen} onClose={onClose} title="Cadastrar Multa" size="5xl"><form onSubmit={submit} className="space-y-3 text-xs">
    {error&&<div className="p-3 rounded-xl bg-rose-50 text-rose-700 flex gap-2"><AlertTriangle className="w-4 h-4"/>{error}</div>}
    {matchContext&&<div className="space-y-2">
      {matchContext.matchStatus==='MATCHED_CONTRACT'&&matchContext.matchedContract&&<div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-900 flex flex-col gap-1 text-xs">
        <div className="flex items-center gap-2 font-bold"><CheckCircle className="w-4 h-4 text-emerald-600 shrink-0"/><span>Contrato #{matchContext.matchedContract.contractNumber} ativo para {matchContext.matchedContract.driverName}</span></div>
        <div className="text-[11px] text-emerald-800">{matchContext.matchedContract.driverCpf&&<span>CPF: {matchContext.matchedContract.driverCpf} • </span>}{matchContext.matchedContract.driverCnh&&<span>CNH: {matchContext.matchedContract.driverCnh} • </span>}<span>Vigência: {matchContext.matchedContract.startDate} até {matchContext.matchedContract.endDate||'vigente'}</span>{matchContext.matchedContract.checkOutDate&&<div className="mt-0.5 text-emerald-700 font-medium">Posse real comprovada por vistoria de saída: {matchContext.matchedContract.checkOutDate.slice(0,16).replace('T',' ')}</div>}</div>
      </div>}
      {matchContext.matchStatus==='VEHICLE_IN_MAINTENANCE'&&<div className="p-3 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 flex flex-col gap-1 text-xs">
        <div className="flex items-center gap-2 font-bold"><Wrench className="w-4 h-4 text-amber-600 shrink-0"/><span>Veículo em Manutenção/Oficina na data da infração (OS #{matchContext.maintenanceOrder?.type})</span></div>
        <div className="text-[11px] text-amber-800">{matchContext.maintenanceOrder?.description&&<span>Serviço: {matchContext.maintenanceOrder.description} • </span>}<span>Status da OS: {matchContext.maintenanceOrder?.status}. Sem contrato de locação ativo. A responsabilidade deve ser atribuída à MoveFlex (Empresa).</span></div>
      </div>}
      {matchContext.matchStatus==='NO_ACTIVE_CONTRACT'&&<div className="p-3 rounded-xl bg-slate-50 border border-slate-200 text-slate-800 flex flex-col gap-1 text-xs">
        <div className="flex items-center gap-2 font-bold"><Info className="w-4 h-4 text-slate-600 shrink-0"/><span>Veículo sem locação ativa na data da infração (em pátio)</span></div>
        <div className="text-[11px] text-slate-600">Nenhum contrato ativo cobrindo {infractionDate}. Recomenda-se registrar a responsabilidade para a MoveFlex (Empresa) para evitar imputação indevida de débitos.</div>
      </div>}
      {matchContext.matchStatus==='AMBIGUOUS'&&<div className="p-3 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 flex flex-col gap-1 text-xs">
        <div className="flex items-center gap-2 font-bold"><AlertTriangle className="w-4 h-4 text-amber-600 shrink-0"/><span>Mais de um contrato ativo no mesmo dia</span></div>
        <div className="text-[11px] text-amber-800">Informe o horário da infração para desempate automático pelas vistorias de entrega e devolução (check-in/check-out).</div>
      </div>}
      <div className="p-2.5 rounded-xl bg-purple-50 border border-purple-200 text-purple-950 flex flex-col gap-1 text-xs">
        <div className="flex items-center justify-between"><span className="font-bold flex items-center gap-1.5">Titularidade (CRLV): {matchContext.vehicle.ownerName||matchContext.vehicle.plate} ({matchContext.ownershipFlow.flowType})</span>{matchContext.ownershipFlow.riskOfNic&&<span className="px-2 py-0.5 rounded text-[10px] font-bold bg-rose-600 text-white flex items-center gap-1"><ShieldAlert className="w-3 h-3"/> RISCO NIC</span>}</div>
        <p className="text-[11px] text-purple-900 opacity-90">{matchContext.ownershipFlow.instructions}</p>
      </div>
    </div>}
    {loading?<div className="p-8 text-center">Carregando...</div>:<div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
      <label>Veículo *<Select value={vehicleId} error={fieldErrors.vehicleId} onChange={e=>{setVehicleId(e.target.value);clearFieldError('vehicleId');}}><option value="">Selecione</option>{vehicles.map(v=><option key={v.id} value={v.id}>{v.plate} — {v.brand} {v.model}</option>)}</Select></label>
      <label>Quem vai assumir a multa? *<Select value={responsibility} error={fieldErrors.responsibility} onChange={e=>{setResponsibility(e.target.value as ''|TicketResponsibility);clearFieldError('responsibility');clearFieldError('driverId');clearFieldError('incomeCategory');clearFieldError('nicCategory');}}><option value="">Selecione</option>{Object.values(TicketResponsibility).map(v=><option key={v} value={v}>{responsibilityLabel(v)}</option>)}</Select></label>
      {responsibility===TicketResponsibility.DRIVER&&<label>Motorista *<Select value={driverId} error={fieldErrors.driverId} onChange={e=>{setDriverId(e.target.value);clearFieldError('driverId');}}><option value="">Selecione</option>{drivers.map(d=><option key={d.id} value={d.id}>{d.fullName}</option>)}</Select></label>}
      <label>Auto de infração *<Input value={autoNumber} error={fieldErrors.autoNumber} onChange={e=>{setAutoNumber(e.target.value.toUpperCase());clearFieldError('autoNumber');}}/></label>
      <label>Órgão *<Input value={organName} error={fieldErrors.organName} onChange={e=>{setOrganName(e.target.value);clearFieldError('organName');}}/></label>
      <label>Código *<Input value={infractionCode} error={fieldErrors.infractionCode} onChange={e=>{setInfractionCode(e.target.value);clearFieldError('infractionCode');}}/></label>
      <label className="md:col-span-2 xl:col-span-2">Descrição *<Input value={description} error={fieldErrors.description} onChange={e=>{setDescription(e.target.value);clearFieldError('description');}}/></label>
      <label>Data infração *<Input type="date" value={infractionDate} error={fieldErrors.infractionDate} onChange={e=>{setInfractionDate(e.target.value);clearFieldError('infractionDate');clearFieldError('dueDate');clearFieldError('discountDueDate');}}/></label>
      <label>Horário da infração<Input type="time" value={infractionTime} onChange={e=>setInfractionTime(e.target.value)}/></label>
      <label>Vencimento *<Input type="date" value={dueDate} error={fieldErrors.dueDate} onChange={e=>{setDueDate(e.target.value);clearFieldError('dueDate');clearFieldError('discountDueDate');}}/></label>
      <label>Valor original *<Input value={originalAmount} error={fieldErrors.originalAmount} onChange={e=>{setOriginalAmount(e.target.value);clearFieldError('originalAmount');}} placeholder="195,23"/></label>
      <label>Pontos<Input type="number" min="0" value={points} onChange={e=>setPoints(e.target.value)}/></label>
      <label>Valor com desconto<Input value={discountedAmount} error={fieldErrors.discountedAmount} onChange={e=>{setDiscountedAmount(e.target.value);clearFieldError('discountedAmount');}}/></label>
      <label>Limite do desconto<Input type="date" value={discountDueDate} error={fieldErrors.discountDueDate} onChange={e=>{setDiscountDueDate(e.target.value);clearFieldError('discountDueDate');}}/></label>
      {responsibility===TicketResponsibility.UNIDENTIFIED&&<label>Valor da NIC (opcional)<Input value={nicAmount} onChange={e=>setNicAmount(e.target.value)} placeholder="Vazio = valor original"/></label>}
      <label>Categoria Contas a Pagar — multa *<Select value={baseCategory} error={fieldErrors.baseCategory} onChange={e=>{setBaseCategory(e.target.value);clearFieldError('baseCategory');}}><option value="">Selecione</option>{expenses.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</Select></label>
      {responsibility===TicketResponsibility.DRIVER&&<label>Categoria Contas a Receber — motorista *<Select value={incomeCategory} error={fieldErrors.incomeCategory} onChange={e=>{setIncomeCategory(e.target.value);clearFieldError('incomeCategory');}}><option value="">Selecione</option>{income.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</Select></label>}
      {responsibility===TicketResponsibility.UNIDENTIFIED&&<label>Categoria Contas a Pagar — NIC *<Select value={nicCategory} error={fieldErrors.nicCategory} onChange={e=>{setNicCategory(e.target.value);clearFieldError('nicCategory');}}><option value="">Selecione</option>{expenses.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</Select></label>}
      <label className="md:col-span-2">Observações<textarea className="w-full mt-1 p-2 border rounded-xl bg-transparent" rows={2} value={notes} onChange={e=>setNotes(e.target.value)}/></label>
    </div>}
    {!loading&&<div className="rounded-xl border border-blue-200 bg-blue-50 p-3 text-xs text-blue-900 dark:border-blue-900 dark:bg-blue-950/30 dark:text-blue-200"><strong className="block mb-1">Integração financeira</strong>{financialSummary}<div className="mt-1 text-[11px] opacity-80">Veículo e contrato permanecem vinculados como origem operacional; o responsável financeiro depende da responsabilidade selecionada.</div></div>}
    <div className="flex justify-end gap-2"><Button type="button" variant="outline" onClick={(event)=>requestGuardedClose(event,onClose)}>Cancelar</Button><Button type="submit" disabled={loading||submitting||matchLoading}>{submitting?'Salvando...':'Salvar multa'}</Button></div>
  </form></ModalContainer>;
};
