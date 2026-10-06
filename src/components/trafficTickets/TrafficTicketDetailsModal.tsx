import React, { useEffect, useMemo, useState } from 'react';
import { AttachmentClient } from '../../api/attachmentClient';
import { ContractClient } from '../../api/contractClient';
import { DriverClient } from '../../api/driverClient';
import { TrafficTicketClient, type TrafficTicketDetails, type TrafficTicketDriverIndication, type TrafficTicketFinancialCategory, type TrafficTicketVehicleOperationalCause } from '../../api/trafficTicketClient';
import { VehicleClient } from '../../api/vehicleClient';
import { WhatsappClient } from '../../api/whatsappClient';
import type { Contract, Driver, Vehicle } from '../../types/entities';
import { TicketResponsibility, TicketStatus, TrafficTicketDriverIndicationStatus } from '../../types/enums';
import { AttachmentList } from '../documents/AttachmentList';
import { Badge, Button, Card, Input, ModalContainer, Select } from '../ui';
import { AlertTriangle, CheckCircle2, FileText, MessageSquare, ShieldAlert } from 'lucide-react';
import { formatCurrencyBRL } from '../../shared/utils/currency';

interface TrafficTicketDetailsModalProps {isOpen:boolean;onClose:()=>void;ticketId:string|null;onRefresh:()=>void;companyId?:string;}
const INDICATION_LABELS:Record<TrafficTicketDriverIndicationStatus,string>={PENDING:'Pendente',COMMUNICATED:'Comunicado',DOCUMENTS_SENT:'Documentos enviados',SIGNED:'Documentos assinados',INDICATED:'Indicado',COMPLETED:'Concluído',APPEAL:'Recurso',CANCELLED:'Cancelado'};
const NEXT_INDICATION:Partial<Record<TrafficTicketDriverIndicationStatus,TrafficTicketDriverIndicationStatus>>={PENDING:TrafficTicketDriverIndicationStatus.COMMUNICATED,COMMUNICATED:TrafficTicketDriverIndicationStatus.DOCUMENTS_SENT,DOCUMENTS_SENT:TrafficTicketDriverIndicationStatus.SIGNED,SIGNED:TrafficTicketDriverIndicationStatus.INDICATED,INDICATED:TrafficTicketDriverIndicationStatus.COMPLETED};
const RESPONSIBILITY_LABELS:Record<TicketResponsibility,string>={
  DRIVER:'Motorista responsável',
  COMPANY:'MoveFlex (Empresa)',
  UNIDENTIFIED:'Não identificado / Em investigação',
};
const TICKET_STATUS_LABELS:Record<TicketStatus,string>={
  PENDING_IDENTIFICATION:'Aguardando identificação',
  IDENTIFIED:'Identificada',
  CHARGED_DRIVER:'Cobrança gerada ao motorista',
  COMPANY_PAYABLE_CREATED:'Conta a pagar criada',
  PAID_BY_COMPANY:'Pago pela empresa',
  APPEALED:'Em recurso',
  CANCELLED:'Cancelada',
};
const OBLIGATION_STATUS_LABELS:Record<string,string>={
  PENDING:'Em aberto',
  PARTIALLY_PAID:'Pago parcialmente',
  PAID:'Pago',
  OVERDUE:'Vencido',
  CANCELLED:'Cancelado',
  RENEGOTIATED:'Renegociado',
  WRITTEN_OFF:'Baixado',
};
export const TrafficTicketDetailsModal:React.FC<TrafficTicketDetailsModalProps>=({isOpen,onClose,ticketId,onRefresh})=>{
  const [details,setDetails]=useState<TrafficTicketDetails|null>(null),[vehicle,setVehicle]=useState<Vehicle|null>(null),[driver,setDriver]=useState<Driver|null>(null),[contract,setContract]=useState<Contract|null>(null),[indication,setIndication]=useState<TrafficTicketDriverIndication|null>(null);
  const [drivers,setDrivers]=useState<Driver[]>([]),[categories,setCategories]=useState<TrafficTicketFinancialCategory[]>([]);
  const [loading,setLoading]=useState(false),[actionLoading,setActionLoading]=useState(false),[error,setError]=useState<string|null>(null),[success,setSuccess]=useState<string|null>(null);
  const [newResponsibility,setNewResponsibility]=useState<TicketResponsibility>(TicketResponsibility.DRIVER),[newDriverId,setNewDriverId]=useState(''),[incomeCategory,setIncomeCategory]=useState(''),[nicCategory,setNicCategory]=useState(''),[nicAmount,setNicAmount]=useState('');
  const [appealNotes,setAppealNotes]=useState(''),[cancelReason,setCancelReason]=useState(''),[uploading,setUploading]=useState(false),[attachmentVersion,setAttachmentVersion]=useState(0),[indicationDeadline,setIndicationDeadline]=useState(''),[indicationNotes,setIndicationNotes]=useState(''),[vehicleCause,setVehicleCause]=useState<TrafficTicketVehicleOperationalCause>('DOCUMENTATION');
  const income=useMemo(()=>categories.filter(c=>c.type==='INCOME'||c.type==='BOTH'),[categories]),expenses=useMemo(()=>categories.filter(c=>c.type==='EXPENSE'||c.type==='BOTH'),[categories]);

  const load=async()=>{if(!ticketId)return;setLoading(true);setError(null);try{
    const [d,allDrivers,allCategories,i]=await Promise.all([TrafficTicketClient.get(ticketId),DriverClient.list(),TrafficTicketClient.categories(),TrafficTicketClient.getDriverIndication(ticketId)]);
    setDetails(d);setIndication(i);setIndicationDeadline(i.indicationDeadline||'');setIndicationNotes(i.notes||'');setDrivers(allDrivers);setCategories(allCategories);setNewResponsibility(d.item.responsibility);setNewDriverId(d.item.driverId||'');
    const [v,dr,c]=await Promise.all([d.item.vehicleId?VehicleClient.get(d.item.vehicleId):Promise.resolve(null),d.item.driverId?DriverClient.get(d.item.driverId):Promise.resolve(null),d.item.contractId?ContractClient.get(d.item.contractId):Promise.resolve(null)]);
    setVehicle(v);setDriver(dr);setContract(c);
    const normalized=(value:string)=>value.trim().toLocaleLowerCase('pt-BR');
    const inc=allCategories.find(x=>normalized(x.name)==='multas de trânsito'&&(x.type==='INCOME'||x.type==='BOTH'))
      ||allCategories.find(x=>normalized(x.name).includes('multa')&&(x.type==='INCOME'||x.type==='BOTH'))
      ||allCategories.find(x=>x.type==='INCOME'||x.type==='BOTH');
    const exp=allCategories.find(x=>normalized(x.name)==='multas de trânsito'&&(x.type==='EXPENSE'||x.type==='BOTH'))
      ||allCategories.find(x=>normalized(x.name).includes('multa')&&(x.type==='EXPENSE'||x.type==='BOTH'))
      ||allCategories.find(x=>x.type==='EXPENSE'||x.type==='BOTH');
    if(inc)setIncomeCategory(current=>current||inc.id);if(exp)setNicCategory(current=>current||exp.id);
  }catch(err){setError(err instanceof Error?err.message:'Erro ao carregar multa.');setDetails(null);setIndication(null);}finally{setLoading(false);}};
  useEffect(()=>{if(isOpen&&ticketId)void load();else if(!isOpen){setDetails(null);setVehicle(null);setDriver(null);setContract(null);setIndication(null);setError(null);setSuccess(null);}},[isOpen,ticketId]);

  const run=async(task:()=>Promise<unknown>,message:string)=>{setActionLoading(true);setError(null);setSuccess(null);try{await task();setSuccess(message);await load();onRefresh();}catch(err){setError(err instanceof Error?err.message:'Operação falhou.');}finally{setActionLoading(false);}};
  const change=()=>run(()=>TrafficTicketClient.changeResponsibility(details!.item.id,{responsibility:newResponsibility,driverId:newResponsibility===TicketResponsibility.DRIVER?newDriverId||undefined:undefined,driverIncomeCategoryId:newResponsibility===TicketResponsibility.DRIVER?incomeCategory:undefined,nicExpenseCategoryId:newResponsibility===TicketResponsibility.UNIDENTIFIED?nicCategory:undefined,nicAmount:nicAmount?Number(nicAmount.replace(',','.')):undefined}),'Responsabilidade atualizada.');
  const advanceIndication=()=>{if(!details||!indication)return;const next=NEXT_INDICATION[indication.status];if(!next)return;void run(()=>TrafficTicketClient.updateDriverIndication(details.item.id,{status:next,indicationDeadline:indicationDeadline||undefined,notes:indicationNotes||undefined}),`Indicação atualizada: ${INDICATION_LABELS[next]}.`);};
  const prepareCommunication=()=>{if(!details)return;void run(()=>TrafficTicketClient.prepareDriverCommunication(details.item.id),'Comunicação preparada na fila segura do WhatsApp. Nenhuma mensagem foi enviada.');};
  const sendWaMeNotification=async()=>{if(!details?.item)return;setActionLoading(true);setError(null);try{const res=await WhatsappClient.getWaLink('TRAFFIC_TICKET',details.item.id);window.open(res.whatsappUrl,'_blank','noopener,noreferrer');setSuccess('Link do WhatsApp gerado com sucesso.');}catch(err){setError(err instanceof Error?err.message:'Falha ao gerar link do WhatsApp.');}finally{setActionLoading(false);}};
  const createVehicleAction=()=>{if(!details)return;void run(()=>TrafficTicketClient.createVehicleOperationalAction(details.item.id,vehicleCause),'Pendência operacional do veículo registrada.');};
  const upload=async(event:React.ChangeEvent<HTMLInputElement>)=>{const file=event.target.files?.[0];if(!file||!details)return;setUploading(true);setError(null);try{await AttachmentClient.upload({entityType:'TrafficTicket' as any,entityId:details.item.id,documentType:'TRAFFIC_TICKET_NOTICE',fileName:file.name,mimeType:file.type,content:file});setAttachmentVersion(v=>v+1);setSuccess('Evidência anexada.');}catch(err){setError(err instanceof Error?err.message:'Falha no upload.');}finally{setUploading(false);event.target.value='';}};

  if(!isOpen)return null;
  const t=details?.item,f=details?.financial,nextIndication=indication?NEXT_INDICATION[indication.status]:undefined;
  return <ModalContainer isOpen={isOpen} onClose={onClose} title={t?`Multa ${t.autoNumber}`:'Detalhes da multa'} size="xl">
    {loading?<div className="p-10 text-center text-sm text-slate-500">Carregando...</div>:!t?<div className="p-4 text-rose-700">{error||'Multa não encontrada.'}</div>:<div className="space-y-4 text-xs">
      {error&&<div className="p-3 rounded-xl bg-rose-50 text-rose-700 flex gap-2"><AlertTriangle className="w-4 h-4"/>{error}</div>}
      {success&&<div className="p-3 rounded-xl bg-emerald-50 text-emerald-700 flex gap-2"><CheckCircle2 className="w-4 h-4"/>{success}</div>}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card className="p-4 space-y-2"><h4 className="font-bold">Infração</h4><p><b>Auto:</b> {t.autoNumber}</p><p><b>Órgão:</b> {t.organName}</p><p><b>Código:</b> {t.infractionCode}</p><p><b>Descrição:</b> {t.description}</p><p><b>Data:</b> {t.infractionDate}{t.infractionTime?` às ${t.infractionTime}`:''}</p><p><b>Local:</b> {t.infractionLocation||'Não informado'}</p><p><b>Vencimento:</b> {t.dueDate}</p><p><b>Valor original:</b> {formatCurrencyBRL(t.originalAmount)}</p>{t.discountedAmount!==undefined&&<p><b>Desconto informado:</b> {formatCurrencyBRL(t.discountedAmount)} até {t.discountDueDate} — {f?.discountAvailable?'disponível hoje':'não disponível hoje'}</p>}<p><b>Status:</b> <Badge variant={t.status===TicketStatus.CANCELLED?'danger':t.status===TicketStatus.PAID_BY_COMPANY?'success':'secondary'}>{TICKET_STATUS_LABELS[t.status]}</Badge></p></Card>
        <Card className="p-4 space-y-2"><h4 className="font-bold">Vínculos</h4><p><b>Veículo:</b> {vehicle?`${vehicle.plate} — ${vehicle.brand} ${vehicle.model}`:t.vehiclePlate?`${t.vehiclePlate} — não cadastrado no ERP`:(t.vehicleId||'Não cadastrado')}</p><p><b>Motorista:</b> {driver?.fullName||'Não identificado'}</p><p><b>Contrato:</b> {contract?.contractNumber||t.contractId||'Sem vínculo inequívoco'}</p><p><b>Responsabilidade:</b> {RESPONSIBILITY_LABELS[t.responsibility]}</p>{t.responsibility===TicketResponsibility.UNIDENTIFIED&&<p className="text-amber-700 flex gap-2"><ShieldAlert className="w-4 h-4"/>NIC padrão: {formatCurrencyBRL(t.nicAmount??t.originalAmount)}</p>}</Card>
      </div>
      {t.status!==TicketStatus.CANCELLED&&<Card className={`p-4 space-y-3 ${t.responsibility===TicketResponsibility.UNIDENTIFIED?'border-amber-300':''}`}>
        <div>
          <h4 className="font-bold">{t.responsibility===TicketResponsibility.UNIDENTIFIED?'Definir quem assume a multa':'Alterar responsabilidade'}</h4>
          <p className="mt-1 text-slate-500">{t.responsibility===TicketResponsibility.UNIDENTIFIED?'Escolha a MoveFlex ou um motorista ativo. Contrato não é obrigatório para atribuir a cobrança ao motorista.':'A responsabilidade pode ser corrigida enquanto a multa não estiver cancelada.'}</p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <Select value={newResponsibility} onChange={e=>{setNewResponsibility(e.target.value as TicketResponsibility);if(e.target.value!==TicketResponsibility.DRIVER)setNewDriverId('');}}>
            <option value={TicketResponsibility.UNIDENTIFIED}>Não identificado / Em investigação</option>
            <option value={TicketResponsibility.DRIVER}>Motorista responsável</option>
            <option value={TicketResponsibility.COMPANY}>MoveFlex (Empresa)</option>
          </Select>
          {newResponsibility===TicketResponsibility.DRIVER&&<>
            <Select value={newDriverId} onChange={e=>setNewDriverId(e.target.value)}>
              <option value="">Selecione o motorista ativo</option>
              {drivers.filter(d=>String(d.status)==='ACTIVE').map(d=><option key={d.id} value={d.id}>{d.fullName}</option>)}
            </Select>
            <Select value={incomeCategory} onChange={e=>setIncomeCategory(e.target.value)}>
              <option value="">Categoria da cobrança</option>
              {income.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}
            </Select>
          </>}
          {newResponsibility===TicketResponsibility.UNIDENTIFIED&&<>
            <Select value={nicCategory} onChange={e=>setNicCategory(e.target.value)}>
              <option value="">Categoria da NIC</option>
              {expenses.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}
            </Select>
            <Input value={nicAmount} onChange={e=>setNicAmount(e.target.value)} placeholder="Valor da NIC (opcional)"/>
          </>}
        </div>
        {newResponsibility===TicketResponsibility.COMPANY&&<p className="text-emerald-700">A MoveFlex assume a multa. Não será exigido motorista nem contrato e não será criada cobrança ao motorista.</p>}
        {newResponsibility===TicketResponsibility.DRIVER&&<p className="text-blue-700">O motorista selecionado receberá a cobrança da multa. Contrato não é obrigatório.</p>}
        <Button onClick={change} disabled={actionLoading||newResponsibility===TicketResponsibility.DRIVER&&(!newDriverId||!incomeCategory)}>
          {newResponsibility===TicketResponsibility.COMPANY?'Atribuir à MoveFlex':newResponsibility===TicketResponsibility.DRIVER?'Cobrar do motorista':'Manter em investigação'}
        </Button>
      </Card>}
      <Card className="p-4 space-y-3"><h4 className="font-bold">Financeiro</h4><div className="grid grid-cols-1 md:grid-cols-3 gap-3"><div className="border rounded-lg p-3"><b>Conta a pagar da multa</b><p>{f?.basePayable?`${OBLIGATION_STATUS_LABELS[f.basePayable.status]||f.basePayable.status} · ${formatCurrencyBRL(f.basePayable.originalAmount)}`:'Ausente'}</p><p className="text-slate-500">{t.payableId}</p></div><div className="border rounded-lg p-3"><b>Conta a receber do motorista</b><p>{f?.receivable?`${OBLIGATION_STATUS_LABELS[f.receivable.status]||f.receivable.status} · ${formatCurrencyBRL(f.receivable.originalAmount)}`:'Não aplicável'}</p><p className="text-slate-500">{t.receivableId}</p></div><div className="border rounded-lg p-3"><b>Conta a pagar da NIC</b><p>{f?.nicPayable?`${OBLIGATION_STATUS_LABELS[f.nicPayable.status]||f.nicPayable.status} · ${formatCurrencyBRL(f.nicPayable.originalAmount)}`:'Não aplicável'}</p><p className="text-slate-500">{t.nicPayableId}</p></div></div></Card>
      {indication&&<Card className="p-4 space-y-3"><div className="flex items-center justify-between gap-3"><h4 className="font-bold">Indicação do condutor</h4><Badge variant={indication.status===TrafficTicketDriverIndicationStatus.COMPLETED?'success':indication.status===TrafficTicketDriverIndicationStatus.CANCELLED?'danger':'secondary'}>{INDICATION_LABELS[indication.status]}</Badge></div><div className="grid grid-cols-1 md:grid-cols-2 gap-3"><div><label className="block mb-1 font-medium">Prazo para indicação</label><Input type="date" value={indicationDeadline} onChange={e=>setIndicationDeadline(e.target.value)} disabled={actionLoading||!nextIndication}/></div><div><label className="block mb-1 font-medium">Observações</label><Input value={indicationNotes} onChange={e=>setIndicationNotes(e.target.value)} placeholder="Observações do processo" disabled={actionLoading||!nextIndication}/></div></div>{t.responsibility!==TicketResponsibility.DRIVER&&indication.status===TrafficTicketDriverIndicationStatus.PENDING&&<p className="text-amber-700 flex gap-2"><ShieldAlert className="w-4 h-4"/>Identifique o motorista responsável antes de avançar a indicação.</p>}<div className="flex flex-wrap gap-2"><Button variant="outline" onClick={prepareCommunication} disabled={actionLoading||t.status===TicketStatus.CANCELLED||t.responsibility!==TicketResponsibility.DRIVER||!t.driverId}>Preparar comunicação — sem enviar</Button><Button variant="outline" className="text-emerald-700 border-emerald-300 hover:bg-emerald-50 dark:text-emerald-300 dark:hover:bg-emerald-950/30" onClick={sendWaMeNotification} disabled={actionLoading||t.status===TicketStatus.CANCELLED||!t.driverId}><MessageSquare className="w-4 h-4 mr-1"/>Avisar Multa (wa.me)</Button>{nextIndication&&<Button onClick={advanceIndication} disabled={actionLoading||(t.responsibility!==TicketResponsibility.DRIVER&&nextIndication!==TrafficTicketDriverIndicationStatus.CANCELLED)}>Avançar para: {INDICATION_LABELS[nextIndication]}</Button>}</div><p className="text-slate-500">Esta ação prepara a comunicação pela integração de WhatsApp. O status “Comunicado” só muda após confirmação real do envio.</p></Card>}
      {t.status!==TicketStatus.CANCELLED&&Boolean(t.vehicleId)&&<Card className="p-4 space-y-3"><h4 className="font-bold">Providência no veículo</h4><p className="text-slate-500">Use somente quando a infração indicar problema de documentação, condição técnica ou outra causa operacional do veículo.</p><div className="grid grid-cols-1 md:grid-cols-2 gap-3"><Select value={vehicleCause} onChange={e=>setVehicleCause(e.target.value as TrafficTicketVehicleOperationalCause)}><option value="DOCUMENTATION">Documentação</option><option value="TECHNICAL_CONDITION">Condição técnica</option><option value="OTHER_OPERATIONAL">Outra causa operacional</option></Select><Button variant="outline" disabled={actionLoading} onClick={createVehicleAction}>Abrir pendência operacional do veículo</Button></div></Card>}
      <Card className="p-4 space-y-3"><h4 className="font-bold flex gap-2"><FileText className="w-4 h-4"/>Documentos e evidências</h4><input type="file" accept=".pdf,.jpg,.jpeg,.png,.webp,application/pdf,image/jpeg,image/png,image/webp" onChange={upload} disabled={uploading}/><div key={attachmentVersion}><AttachmentList entityType="TrafficTicket" entityId={t.id}/></div></Card>
      {t.status!==TicketStatus.CANCELLED&&<Card className="p-4 space-y-3"><h4 className="font-bold">Recurso / cancelamento</h4><Input value={appealNotes} onChange={e=>setAppealNotes(e.target.value)} placeholder="Detalhes do recurso"/><Button variant="outline" disabled={actionLoading||!appealNotes.trim()} onClick={()=>run(()=>TrafficTicketClient.appeal(t.id,appealNotes),'Recurso registrado.')}>Registrar recurso</Button><Input value={cancelReason} onChange={e=>setCancelReason(e.target.value)} placeholder="Motivo do cancelamento"/><Button variant="outline" disabled={actionLoading||!cancelReason.trim()} onClick={()=>{if(window.confirm('Cancelar esta multa e as obrigações abertas relacionadas?'))void run(()=>TrafficTicketClient.cancel(t.id,cancelReason),'Multa cancelada.');}}>Cancelar multa</Button></Card>}
    </div>}
  </ModalContainer>;
};
