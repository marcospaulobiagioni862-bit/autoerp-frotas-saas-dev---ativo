import assert from 'node:assert/strict';
import React from 'react';
import { act, create } from 'react-test-renderer';
import { ReceiptModal } from '../ReceiptModal';
import { PaymentModal } from '../PaymentModal';
import { ConfirmDialog } from '../../ui/ConfirmDialog';
import { settlementLocalDate } from '../SettlementLateInterest';
import { FinanceSettlementClient } from '../../../api/financeSettlementClient';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
(globalThis as any).document = { body: { style: {} }, documentElement: { style: {} }, querySelector: () => null };
(globalThis as any).window = { addEventListener() {}, removeEventListener() {}, confirm: () => true };
const previousTimezone = process.env.TZ;
process.env.TZ = 'America/Sao_Paulo';
assert.equal(settlementLocalDate(new Date('2026-09-29T01:30:00Z')), '2026-09-28', 'effective date defaults to local day, not tomorrow in UTC');
if (previousTimezone == null) delete process.env.TZ; else process.env.TZ = previousTimezone;
const title: any = {id:'daily-ui',companyId:'daily-company',originType:'MANUAL',description:'Daily UI',originalAmount:100,updatedAmount:100,paidAmount:10,balanceAmount:90,fineAmount:0,interestAmount:0,additionalAmount:0,discountAmount:0,dueDate:'2026-09-16',competenceDate:'2026-09-01',status:'PARTIALLY_PAID'};
FinanceSettlementClient.getOptions = async () => ({accounts:[{id:'daily-account',name:'Conta',type:'BANK',status:'ACTIVE',currentBalance:1000}],paymentMethods:[{id:'daily-method',name:'PIX',active:true}]});

for(const kind of ['Receipt','Payment'] as const) {
  const Component = kind === 'Receipt' ? ReceiptModal : PaymentModal;
  const method = kind === 'Receipt' ? 'registerReceipt' : 'registerPayment';
  const entity = kind === 'Receipt' ? 'receivable' : 'payable';
  const commands: any[] = [];
  FinanceSettlementClient[method] = async (_id,command) => { commands.push(command); };
  let tree: any;
  await act(async () => { tree = create(<Component {...{[entity]:title} as any} isOpen onClose={()=>{}} onSuccess={()=>{}} />); });
  const amount = () => tree.root.findByProps({'aria-label': kind === 'Receipt' ? 'Valor a Receber (R$)' : 'Valor a Pagar (R$)'});
  if(kind === 'Receipt') await act(async () => tree.root.findByProps({'aria-label':'Diária de atraso (R$)'}).props.onChange({target:{value:'2,00'}}));
  const date = () => tree.root.findByProps({type:'date'});
  for(const [effective,total] of [['2026-09-15','90,00'],['2026-09-16','90,00'],['2026-09-17','92,00'],['2026-09-28','114,00']]) {
    await act(async () => { date().props.onChange({target:{value:effective}}); });
    assert.equal(amount().props.value,kind === 'Receipt' ? total : '90,00',`${kind}: date change updates suggested amount`);
  }
  const displayed=JSON.stringify(tree.toJSON());
  for(const value of kind === 'Receipt'
    ? ['Saldo principal','Juros/dia','Juros calculado','Juros manual (R$)','Acréscimo (R$)','24,00','114,00']
    : ['Saldo atual','Juros desta baixa','Acréscimo','Total previsto','Valor efetivamente pago']) assert(displayed.includes(value),value);
  await act(async () => { amount().props.onChange({target:{value:'50,00'}}); });
  await act(async () => { date().props.onChange({target:{value:'2026-09-29'}}); });
  assert.equal(amount().props.value,'50,00','date change must preserve an operator-entered partial amount');
  await act(async () => { date().props.onChange({target:{value:'2026-09-28'}}); });
  await act(async () => { await tree.root.findByType('form').props.onSubmit({preventDefault(){}}); });
  const dialog=tree.root.findByType(ConfirmDialog);
  assert.equal(dialog.props.isOpen,true);
  await act(async () => { await dialog.props.onConfirm(); });
  assert.equal(commands[0].paymentAmount,50);
  if(kind === 'Receipt') {
    assert.equal(commands[0].interestAmount,24);
    assert.equal(commands[0].dailyInterestAmount,2);
  } else {
    assert.equal(commands[0].interestAmount,0);
    assert.equal(commands[0].settleRemainingBalance,false);
  }
  assert.equal(commands[0].additionalAmount,0);
  assert.equal(commands[0].paymentDate,'2026-09-28');
  await act(async () => tree.unmount());
}
for (const kind of ['Receipt','Payment'] as const) {
  const Component=kind === 'Receipt' ? ReceiptModal : PaymentModal;
  const entity=kind === 'Receipt' ? 'receivable' : 'payable';
  const method=kind === 'Receipt' ? 'registerReceipt' : 'registerPayment';
  const commands:any[]=[]; FinanceSettlementClient[method]=async (_id,command)=>{commands.push(command);};
  let tree:any;
  await act(async()=>{tree=create(<Component {...{[entity]:{...title,originalAmount:1300,updatedAmount:1300,paidAmount:0,balanceAmount:1300,status:'PENDING'}} as any} isOpen onClose={()=>{}} onSuccess={()=>{}}/>);});
  const amount=()=>tree.root.findByProps({'aria-label': kind === 'Receipt' ? 'Valor a Receber (R$)' : 'Valor a Pagar (R$)'});
  await act(async()=>tree.root.findByProps({type:'date'}).props.onChange({target:{value:'2026-09-21'}}));
  assert.equal(amount().props.value,'1300,00');
  const interestLabel = kind === 'Receipt' ? 'Juros manual (R$)' : 'Juros (R$)';
  await act(async()=>tree.root.findByProps({'aria-label':interestLabel}).props.onChange({target:{value:'50,00'}}));
  assert.equal(amount().props.value,'1350,00');
  await act(async()=>tree.root.findByProps({'aria-label':'Acréscimo (R$)'}).props.onChange({target:{value:'25,00'}}));
  assert.equal(amount().props.value,'1375,00');
  await act(async()=>tree.root.findByType('form').props.onSubmit({preventDefault(){}}));
  await act(async()=>tree.root.findByType(ConfirmDialog).props.onConfirm());
  assert.equal(commands[0].paymentAmount,1375);
  assert.equal(commands[0].interestAmount,50);
  assert.equal(commands[0].additionalAmount,25);
  if(kind === 'Receipt') assert.equal(commands[0].dailyInterestAmount,undefined);else assert.equal(commands[0].settleRemainingBalance,true);
  await act(async()=>tree.unmount());
}
console.log('CR/CP interest/addition UI, daily interest, effective-date recalculation and partial amount: PASS');
