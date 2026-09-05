import React, { useEffect, useMemo, useState } from 'react';
import { DriverClient } from '../../api/driverClient';
import { TrafficTicketClient, type TrafficTicketFinancialCategory } from '../../api/trafficTicketClient';
import { VehicleClient } from '../../api/vehicleClient';
import type { Driver, Vehicle } from '../../types/entities';
import { TicketResponsibility } from '../../types/enums';
import { Button, Input, ModalContainer, Select } from '../ui';
import { AlertTriangle } from 'lucide-react';

interface TrafficTicketFormModalProps {
  isOpen:boolean;onClose:()=>void;onSuccess:()=>void;companyId?:string;initialVehicleId?:string;initialDriverId?:string;
}

const responsibilityLabel=(value:TicketResponsibility)=>value===TicketResponsibility.DRIVER?'Motorista':value===TicketResponsibility.COMPANY?'Empresa':'Não identificado';

export const TrafficTicketFormModal:React.FC<TrafficTicketFormModalProps>=({isOpen,onClose,onSuccess,initialVehicleId,initialDriverId})=>{
  const [vehicles,setVehicles]=useState<Vehicle[]>([]),[drivers,setDrivers]=useState<Driver[]>([]),[categories,setCategories]=useState<TrafficTicketFinancialCategory[]>([]);
  const [loading,setLoading]=useState(false),[submitting,setSubmitting]=useState(false),[error,setError]=useState<string|null>(null);
  const [vehicleId,setVehicleId]=useState(initialVehicleId||''),[driverId,setDriverId]=useState(initialDriverId||''),[autoNumber,setAutoNumber]=useState('');
  const [organName,setOrganName]=useState('DETRAN'),[infractionCode,setInfractionCode]=useState(''),[description,setDescription]=useState('');
  const [infractionDate,setInfractionDate]=useState(new Date().toISOString().slice(0,10)),[infractionTime,setInfractionTime]=useState(''),[dueDate,setDueDate]=useState(new Date(Date.now()+30*86400000).toISOString().slice(0,10));
  const [discountDueDate,setDiscountDueDate]=useState(''),[originalAmount,setOriginalAmount]=useState(''),[discountedAmount,setDiscountedAmount]=useState('');
  const [nicAmount,setNicAmount]=useState(''),[points,setPoints]=useState('0'),[responsibility,setResponsibility]=useState<TicketResponsibility>(TicketResponsibility.UNIDENTIFIED),[notes,setNotes]=useState('');
  const [baseCategory,setBaseCategory]=useState(''),[incomeCategory,setIncomeCategory]=useState(''),[nicCategory,setNicCategory]=useState('');
  const expenses=useMemo(()=>categories.filter(c=>c.type==='EXPENSE'||c.type==='BOTH'),[categories]),income=useMemo(()=>categories.filter(c=>c.type==='INCOME'||c.type==='BOTH'),[categories]);

  useEffect(()=>{if(!isOpen)return;setLoading(true);setError(null);void Promise.all([VehicleClient.list(),DriverClient.list(),TrafficTicketClient.categories()]).then(([v,d,c])=>{setVehicles(v);setDrivers(d);setCategories(c);const exp=c.find(x=>x.type==='EXPENSE'||x.type==='BOTH');const inc=c.find(x=>x.type==='INCOME'||x.type==='BOTH');if(exp){setBaseCategory(current=>current||exp.id);setNicCategory(current=>current||exp.id);}if(inc)setIncomeCategory(current=>current||inc.id);}).catch(err=>setError(err instanceof Error?err.message:'Erro ao carregar dados.')).finally(()=>setLoading(false));},[isOpen]);

  const number=(value:string)=>{const parsed=Number(value.replace(',','.'));return Number.isFinite(parsed)?parsed:NaN;};
  const submit=async(event:React.FormEvent)=>{event.preventDefault();setError(null);const original=number(originalAmount);if(!vehicleId||!autoNumber.trim()||!infractionCode.trim()||!description.trim()||!Number.isFinite(original)||original<=0||!baseCategory){setError('Preencha veículo, auto, infração, descrição, valor e categoria de despesa.');return;}if(responsibility===TicketResponsibility.DRIVER&&(!driverId||!incomeCategory)){setError('Para responsabilidade do motorista, selecione o motorista e a categoria de receita.');return;}setSubmitting(true);try{
    await TrafficTicketClient.create({vehicleId,driverId:responsibility===TicketResponsibility.DRIVER?driverId||undefined:undefined,autoNumber:autoNumber.trim(),organName:organName.trim()||'DETRAN',infractionCode:infractionCode.trim(),description:description.trim(),infractionDate,infractionTime:infractionTime||undefined,dueDate,discountDueDate:discountDueDate||undefined,originalAmount:original,discountedAmount:discountedAmount?number(discountedAmount):undefined,nicAmount:nicAmount?number(nicAmount):undefined,points:Number(points)||0,responsibility,notes:notes.trim()||undefined,baseExpenseCategoryId:baseCategory,driverIncomeCategoryId:responsibility===TicketResponsibility.DRIVER?incomeCategory:undefined,nicExpenseCategoryId:responsibility===TicketResponsibility.UNIDENTIFIED?(nicCategory||baseCategory):undefined});
    onSuccess();onClose();
  }catch(err){setError(err instanceof Error?err.message:'Erro ao salvar multa.');}finally{setSubmitting(false);}};
  return <ModalContainer isOpen={isOpen} onClose={onClose} title="Cadastrar Multa" size="5xl"><form onSubmit={submit} className="space-y-3 text-xs">
    {error&&<div className="p-3 rounded-xl bg-rose-50 text-rose-700 flex gap-2"><AlertTriangle className="w-4 h-4"/>{error}</div>}
    {loading?<div className="p-8 text-center">Carregando...</div>:<div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
      <label>Veículo *<Select value={vehicleId} onChange={e=>setVehicleId(e.target.value)}><option value="">Selecione</option>{vehicles.map(v=><option key={v.id} value={v.id}>{v.plate} — {v.brand} {v.model}</option>)}</Select></label>
      <label>Responsabilidade *<Select value={responsibility} onChange={e=>setResponsibility(e.target.value as TicketResponsibility)}>{Object.values(TicketResponsibility).map(v=><option key={v} value={v}>{responsibilityLabel(v)}</option>)}</Select></label>
      {responsibility===TicketResponsibility.DRIVER&&<label>Motorista *<Select value={driverId} onChange={e=>setDriverId(e.target.value)}><option value="">Selecione</option>{drivers.map(d=><option key={d.id} value={d.id}>{d.fullName}</option>)}</Select></label>}
      <label>Auto de infração *<Input value={autoNumber} onChange={e=>setAutoNumber(e.target.value.toUpperCase())}/></label>
      <label>Órgão *<Input value={organName} onChange={e=>setOrganName(e.target.value)}/></label>
      <label>Código *<Input value={infractionCode} onChange={e=>setInfractionCode(e.target.value)}/></label>
      <label className="md:col-span-2 xl:col-span-2">Descrição *<Input value={description} onChange={e=>setDescription(e.target.value)}/></label>
      <label>Data infração *<Input type="date" value={infractionDate} onChange={e=>setInfractionDate(e.target.value)}/></label>
      <label>Horário da infração<Input type="time" value={infractionTime} onChange={e=>setInfractionTime(e.target.value)}/></label>
      <label>Vencimento *<Input type="date" value={dueDate} onChange={e=>setDueDate(e.target.value)}/></label>
      <label>Valor original *<Input value={originalAmount} onChange={e=>setOriginalAmount(e.target.value)} placeholder="195,23"/></label>
      <label>Pontos<Input type="number" min="0" value={points} onChange={e=>setPoints(e.target.value)}/></label>
      <label>Valor com desconto<Input value={discountedAmount} onChange={e=>setDiscountedAmount(e.target.value)}/></label>
      <label>Limite do desconto<Input type="date" value={discountDueDate} onChange={e=>setDiscountDueDate(e.target.value)}/></label>
      {responsibility===TicketResponsibility.UNIDENTIFIED&&<label>NIC explícita (opcional)<Input value={nicAmount} onChange={e=>setNicAmount(e.target.value)} placeholder="Vazio = valor original"/></label>}
      <label>Categoria Contas a Pagar — multa *<Select value={baseCategory} onChange={e=>setBaseCategory(e.target.value)}><option value="">Selecione</option>{expenses.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</Select></label>
      {responsibility===TicketResponsibility.DRIVER&&<label>Categoria Contas a Receber — motorista *<Select value={incomeCategory} onChange={e=>setIncomeCategory(e.target.value)}><option value="">Selecione</option>{income.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</Select></label>}
      {responsibility===TicketResponsibility.UNIDENTIFIED&&<label>Categoria Contas a Pagar — NIC *<Select value={nicCategory} onChange={e=>setNicCategory(e.target.value)}><option value="">Selecione</option>{expenses.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</Select></label>}
      <label className="md:col-span-2">Observações<textarea className="w-full mt-1 p-2 border rounded-xl bg-transparent" rows={2} value={notes} onChange={e=>setNotes(e.target.value)}/></label>
    </div>}
    <div className="flex justify-end gap-2"><Button type="button" variant="outline" onClick={onClose}>Cancelar</Button><Button type="submit" disabled={loading||submitting}>{submitting?'Salvando...':'Salvar multa'}</Button></div>
  </form></ModalContainer>;
};
