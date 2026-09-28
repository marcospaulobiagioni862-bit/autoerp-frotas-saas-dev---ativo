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
const title: any = {id:'daily-ui',companyId:'daily-company',originType:'MANUAL',description:'Daily UI',originalAmount:100,updatedAmount:100,paidAmount:10,balanceAmount:90,fineAmount:0,interestAmount:0,discountAmount:0,dueDate:'2026-09-16',competenceDate:'2026-09-01',status:'PARTIALLY_PAID'};
FinanceSettlementClient.getOptions = async () => ({accounts:[{id:'daily-account',name:'Conta',type:'BANK',status:'ACTIVE',currentBalance:1000}],paymentMethods:[{id:'daily-method',name:'PIX',active:true}],fixedDailyInterest:{RECEIVABLE:2,PAYABLE:2}});

for(const kind of ['Receipt','Payment'] as const) {
  const Component = kind === 'Receipt' ? ReceiptModal : PaymentModal;
  const method = kind === 'Receipt' ? 'registerReceipt' : 'registerPayment';
  const entity = kind === 'Receipt' ? 'receivable' : 'payable';
  const commands: any[] = [];
  FinanceSettlementClient[method] = async (_id,command) => { commands.push(command); };
  let tree: any;
  await act(async () => { tree = create(<Component {...{[entity]:title} as any} isOpen onClose={()=>{}} onSuccess={()=>{}} />); });
  const amount = () => tree.root.findByProps({inputMode:'decimal'});
  const date = () => tree.root.findByProps({type:'date'});
  for(const [effective,total] of [['2026-09-15','90,00'],['2026-09-16','90,00'],['2026-09-17','92,00'],['2026-09-28','114,00']]) {
    await act(async () => { date().props.onChange({target:{value:effective}}); });
    assert.equal(amount().props.value,total,`${kind}: date change updates suggested amount`);
  }
  const displayed=JSON.stringify(tree.toJSON());
  for(const value of ['Saldo principal','Juros/dia','Juros calculado','24,00','114,00']) assert(displayed.includes(value),value);
  await act(async () => { amount().props.onChange({target:{value:'50,00'}}); });
  await act(async () => { date().props.onChange({target:{value:'2026-09-29'}}); });
  assert.equal(amount().props.value,'50,00','date change must preserve an operator-entered partial amount');
  await act(async () => { date().props.onChange({target:{value:'2026-09-28'}}); });
  await act(async () => { await tree.root.findByType('form').props.onSubmit({preventDefault(){}}); });
  const dialog=tree.root.findByType(ConfirmDialog);
  assert.equal(dialog.props.isOpen,true);
  await act(async () => { await dialog.props.onConfirm(); });
  assert.equal(commands[0].paymentAmount,50);
  assert.equal(commands[0].interestAmount,24);
  assert.equal(commands[0].paymentDate,'2026-09-28');
  await act(async () => tree.unmount());
}
console.log('CR/CP daily interest UI, effective-date recalculation and partial amount: PASS');
