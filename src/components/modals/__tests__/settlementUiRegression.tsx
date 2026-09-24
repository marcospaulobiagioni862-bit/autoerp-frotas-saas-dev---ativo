import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import React, { useState } from 'react';
import { act, create } from 'react-test-renderer';
import { PaymentModal } from '../PaymentModal';
import { ReceiptModal } from '../ReceiptModal';
import { ConfirmDialog } from '../../ui/ConfirmDialog';
import { FinanceHubView } from '../../finance/FinanceHubView';
import { PayablesView } from '../../finance/PayablesView';
import { ReceivablesView } from '../../finance/ReceivablesView';
import { FinancialObligationDetailsModal } from '../../finance/FinancialObligationDetailsModal';
import { FinanceSettlementClient } from '../../../api/financeSettlementClient';
import { FinanceObligationClient } from '../../../api/financeObligationClient';
import { FinanceTransactionClient } from '../../../api/financeTransactionClient';
import { TrafficTicketClient } from '../../../api/trafficTicketClient';
import { MaintenanceClient } from '../../../api/maintenanceClient';
import { DriverClient } from '../../../api/driverClient';
import { VehicleClient } from '../../../api/vehicleClient';
import { ContractClient } from '../../../api/contractClient';
import { normalizeCurrencyDraft, parseCurrencyDraft } from '../../../shared/utils/currency';

// React component tests, with API doubles only. No database or network connection.
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
(globalThis as any).document = { body: { style: {} }, documentElement: { style: {} }, querySelector: () => null };
(globalThis as any).window = { addEventListener() {}, removeEventListener() {}, confirm: () => true };
(globalThis as any).alert = (message: string) => { throw new Error(message); };
const base: any = {
  id: 'p0-title', companyId: 'tenant-a', originType: 'MANUAL', originId: 'p0-origin',
  description: 'Título P0', categoryId: 'category', originalAmount: 500, updatedAmount: 500,
  balanceAmount: 500, paidAmount: 0, discountAmount: 0, fineAmount: 0, interestAmount: 0,
  dueDate: '2099-10-01', competenceDate: '2099-10-01', status: 'PENDING',
};
const options = {
  accounts: [{ id: 'account', name: 'Conta P0', status: 'ACTIVE', type: 'BANK', currentBalance: 1000 }],
  paymentMethods: [{ id: 'method', name: 'PIX P0', active: true }],
};
FinanceSettlementClient.getOptions = async () => structuredClone(options);
TrafficTicketClient.categories = async () => [{ id: 'category', name: 'Categoria P0', type: 'BOTH' }] as any;
MaintenanceClient.listSuppliers = async () => [];
DriverClient.list = async () => [];
VehicleClient.list = async () => [];
ContractClient.list = async () => [];

function deferred() {
  let resolve!: () => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<void>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
const input = (tree: any) => tree.root.findByProps({ inputMode: 'decimal' });
const confirmation = (tree: any) => tree.root.findAllByType(ConfirmDialog).find((node: any) => node.props.isOpen);
const submit = async (tree: any) => { await act(async () => { await tree.root.findByType('form').props.onSubmit({ preventDefault() {} }); }); };
const change = async (tree: any, value: string) => { await act(async () => { input(tree).props.onChange({ target: { value } }); }); };

for (const [draft, amount] of [['500,00', 500], ['300,00', 300], ['125,40', 125.4], ['0,01', .01]] as const) {
  assert.equal(parseCurrencyDraft(draft), amount);
}
assert.equal(normalizeCurrencyDraft('0500,00'), '500,00');
assert.equal(normalizeCurrencyDraft(''), '');
assert.equal(normalizeCurrencyDraft('1,234'), null, 'never silently round typed fractions of a cent');
assert(Number.isNaN(parseCurrencyDraft('')));

for (const kind of ['Receipt', 'Payment'] as const) {
  const method = kind === 'Receipt' ? 'registerReceipt' : 'registerPayment';
  const Component = kind === 'Receipt' ? ReceiptModal : PaymentModal;
  const entityProp = kind === 'Receipt' ? 'receivable' : 'payable';
  let success = 0, closed = 0;
  const calls: any[] = [];
  let pending = deferred();
  FinanceSettlementClient[method] = async (id, command) => { calls.push({ id, ...command }); return pending.promise; };
  let tree: any;
  await act(async () => { tree = create(<Component {...{ [entityProp]: base } as any} isOpen onClose={() => closed++} onSuccess={() => success++} />); });
  await change(tree, '');
  assert.equal(input(tree).props.value, '');
  await submit(tree);
  assert.equal(confirmation(tree), undefined, 'empty amount must not reach confirmation');
  for (const value of ['500,00', '300,00', '125,40']) {
    await change(tree, value);
    assert.equal(input(tree).props.value, value);
  }
  await change(tree, '0500,00');
  assert.equal(input(tree).props.value, '500,00');
  await change(tree, '0125,40');
  assert.equal(input(tree).props.value, '125,40');
  await submit(tree);
  assert.equal(calls.length, 0, 'opening confirmation must not mutate');
  const summary = JSON.stringify(confirmation(tree).findByType('dl').children.map((node: any) => node.findByType('dd').children));
  for (const text of ['Título P0', 'MANUAL', '125,40', 'Conta P0', 'PIX P0']) assert(summary.includes(text), text);
  await act(async () => { confirmation(tree).props.onCancel(); });
  assert.equal(calls.length, 0, 'cancelling confirmation must not mutate');
  await submit(tree);
  let first!: Promise<void>;
  await act(async () => {
    const confirm = confirmation(tree).props.onConfirm;
    first = confirm();
    await confirm(); // same tick, before React has rendered disabled state
  });
  assert.equal(calls.length, 1, `${kind} double click must send exactly one request`);
  assert.equal(tree.root.findByType('fieldset').props.disabled, true);
  assert.equal(confirmation(tree).props.isLoading, true);
  await act(async () => { confirmation(tree).props.onCancel(); });
  assert(confirmation(tree), 'cannot close confirmation while processing');
  await act(async () => { pending.reject(new Error('Servidor recusou')); await first; });
  assert.equal(success, 0, 'server error must not refresh as a successful settlement');
  assert.equal(closed, 0);
  assert(JSON.stringify(tree.toJSON()).includes('Servidor recusou'));
  assert.equal(tree.root.findByType('fieldset').props.disabled, false);
  pending = deferred();
  await submit(tree);
  const staleConfirm = confirmation(tree).props.onConfirm;
  await act(async () => { first = staleConfirm(); });
  assert.equal(calls[0].idempotencyKey, calls[1].idempotencyKey, 'unchanged retry must preserve backend idempotency');
  assert.equal(calls[1].paymentAmount, 125.4);
  await act(async () => { pending.resolve(); await first; });
  assert.equal(success, 1);
  assert.equal(closed, 1);
  await act(async () => { await staleConfirm(); });
  assert.equal(calls.length, 2, 'successful command must remain latched until modal unmounts');
  await act(async () => { tree.unmount(); });
  console.log(`PASS ${kind}: money input, confirmation/cancel, same-tick double-submit, processing, error and idempotent retry`);
}

// Render the real FinanceHub and its list/detail components. Only server reads and
// writes are doubled; refresh must fetch the committed row, never invent balances.
for (const kind of ['Receipt', 'Payment'] as const) {
  let persisted = { ...base }, reads = 0, historyReads = 0, writes = 0, rejectNext = true;
  const list = async () => { reads++; return [{ ...persisted }]; };
  FinanceObligationClient.listReceivables = list;
  FinanceObligationClient.listPayables = list;
  FinanceTransactionClient.listByObligation = async () => {
    historyReads++;
    return writes ? [{ id: 'transaction', type: kind === 'Receipt' ? 'INCOME' : 'EXPENSE',
      amount: 300, description: 'Movimento confirmado', transactionDate: '2099-10-01', createdAt: '2099-10-01' }] as any : [];
  };
  FinanceSettlementClient[kind === 'Receipt' ? 'registerReceipt' : 'registerPayment'] = async (_id, command) => {
    if (rejectNext) { rejectNext = false; throw new Error('Falha sem liquidação'); }
    writes++;
    persisted = { ...persisted, paidAmount: command.paymentAmount, balanceAmount: 500 - command.paymentAmount, status: 'PARTIALLY_PAID' };
  };
  function Harness() {
    const [version, setVersion] = useState(0);
    const [selected, setSelected] = useState<any>(null);
    const onSuccess = () => setVersion(value => value + 1);
    return <>
      <FinanceHubView initialSubTab={kind === 'Receipt' ? 'receivables' : 'payables'} refreshVersion={version}
        onOpenReceiptModal={setSelected} onOpenPaymentModal={setSelected} onOpenTransferModal={() => {}} onOpenRenegotiationModal={() => {}} />
      {selected && (kind === 'Receipt'
        ? <ReceiptModal isOpen receivable={selected} onSuccess={onSuccess} onClose={() => setSelected(null)} />
        : <PaymentModal isOpen payable={selected} onSuccess={onSuccess} onClose={() => setSelected(null)} />)}
    </>;
  }
  let tree: any;
  await act(async () => { tree = create(<Harness />); });
  const View = kind === 'Receipt' ? ReceivablesView : PayablesView;
  // React.lazy may resolve in a subsequent event-loop turn under tsx.
  for (let i = 0; i < 100 && !tree.root.findAllByType(View).length; i++) {
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 10)); });
  }
  assert.equal(reads, 1);
  const listView = () => tree.root.findByType(View);
  const action = kind === 'Receipt' ? 'onOpenReceiptModal' : 'onOpenPaymentModal';
  await act(async () => { listView().props[action]({ ...persisted }); });
  await change(tree, '300,00');
  await submit(tree);
  await act(async () => { await confirmation(tree).props.onConfirm(); });
  assert.equal(writes, 0);
  assert.equal(reads, 1, 'server failure must not invalidate the list as a committed settlement');
  assert.equal(persisted.status, 'PENDING');
  assert.equal(persisted.balanceAmount, 500);
  assert(JSON.stringify(tree.toJSON()).includes('Falha sem liquidação'));
  await submit(tree);
  await act(async () => { await confirmation(tree).props.onConfirm(); });
  assert.equal(writes, 1);
  assert.equal(reads, 2, `${kind} must refetch the visible list immediately, without F5`);
  assert(listView(), 'refresh must preserve the active financial subtab');
  const detailButton = listView().findAllByType('button').find((node: any) => node.children.includes('Detalhes'));
  await act(async () => { detailButton.props.onClick(); });
  const details = tree.root.findByType(FinancialObligationDetailsModal);
  assert.equal(details.props.obligation.paidAmount, 300);
  assert.equal(details.props.obligation.balanceAmount, 200);
  assert.equal(details.props.obligation.status, 'PARTIALLY_PAID');
  assert.equal(historyReads, 1, 'details must read authoritative transaction history');
  assert(JSON.stringify(tree.toJSON()).includes('Movimento confirmado'));
  await act(async () => { tree.unmount(); });
  console.log(`PASS ${kind}: immediate authoritative list/status/balance/detail/history reconciliation`);
}

// The application's success wiring must reach the tested refresh mechanism.
const app = readFileSync(new URL('../../../App.tsx', import.meta.url), 'utf8');
for (const modal of ['ReceiptModal', 'PaymentModal']) assert.match(app, new RegExp(`<${modal}[^\\r\\n]*onSuccess=\\{handleSettlementSuccess\\}`));
assert.match(app, /setSettlementRefreshVersion\(version=>version\+1\)/);
assert.match(app, /<FinanceHubView refreshVersion=\{settlementRefreshVersion\}/);
assert.match(app, /<OverviewDashboard key=\{settlementRefreshVersion\}/);
assert.match(app, /<MaintenanceManagement key=\{settlementRefreshVersion\}/);
console.log('V2 P0 settlement UI regressions: PASS');
