import React, { useCallback, useEffect, useState } from 'react';
import { FinanceMasterDataClient, type FinanceMasterDataSnapshot } from '../../api/financeMasterDataClient';

const empty: FinanceMasterDataSnapshot = { accounts: [], paymentMethods: [], categories: [] };

export const FinancialMasterDataView: React.FC = () => {
  const [data, setData] = useState<FinanceMasterDataSnapshot>(empty);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [accountName, setAccountName] = useState('');
  const [accountType, setAccountType] = useState('BANK');
  const [openingBalance, setOpeningBalance] = useState('0');
  const [methodName, setMethodName] = useState('');
  const [methodType, setMethodType] = useState('PIX');
  const [categoryName, setCategoryName] = useState('');
  const [categoryType, setCategoryType] = useState<'INCOME'|'EXPENSE'|'BOTH'>('EXPENSE');
  const [categoryParentId, setCategoryParentId] = useState('');

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try { setData(await FinanceMasterDataClient.list()); }
    catch (e) { setError(e instanceof Error ? e.message : 'Falha ao carregar dados financeiros'); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const run = async (action: () => Promise<void>) => {
    setError('');
    try { await action(); await load(); }
    catch (e) { setError(e instanceof Error ? e.message : 'Operação financeira não concluída'); }
  };

  if (loading && data.accounts.length === 0 && data.paymentMethods.length === 0 && data.categories.length === 0) {
    return <div className="p-6 text-sm text-slate-500">Carregando configurações financeiras...</div>;
  }

  return (
    <div className="space-y-6">
      {error && <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>}

      <section className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
        <h3 className="font-semibold">Contas financeiras</h3>
        <p className="mt-1 text-xs text-slate-500">O saldo inicial é definido apenas na criação. O saldo atual não pode ser editado diretamente.</p>
        <form className="mt-4 grid gap-2 md:grid-cols-4" onSubmit={(event) => { event.preventDefault(); void run(async () => { await FinanceMasterDataClient.createAccount({ name: accountName.trim(), type: accountType, initialBalance: Number(openingBalance) }); setAccountName(''); setOpeningBalance('0'); }); }}>
          <input className="rounded-lg border p-2 text-sm" value={accountName} onChange={(e) => setAccountName(e.target.value)} placeholder="Nome da conta" required />
          <select className="rounded-lg border p-2 text-sm" value={accountType} onChange={(e) => setAccountType(e.target.value)}>{['CASH','BANK','DIGITAL_ACCOUNT','CREDIT_CARD','INVESTMENT','OTHER'].map((item) => <option key={item}>{item}</option>)}</select>
          <input className="rounded-lg border p-2 text-sm" type="number" step="0.01" value={openingBalance} onChange={(e) => setOpeningBalance(e.target.value)} aria-label="Saldo inicial" />
          <button className="rounded-lg bg-blue-600 px-3 py-2 text-sm font-semibold text-white">Adicionar conta</button>
        </form>
        <div className="mt-4 divide-y">
          {data.accounts.map((item) => <div key={item.id} className="flex items-center justify-between gap-3 py-3 text-sm"><div><div className="font-medium">{item.name}</div><div className="text-xs text-slate-500">{item.type} · Saldo atual R$ {item.currentBalance.toFixed(2)}</div></div><button className="rounded-lg border px-3 py-1.5 text-xs" onClick={() => void run(() => FinanceMasterDataClient.setAccountStatus(item.id, item.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE'))}>{item.status === 'ACTIVE' ? 'Inativar' : 'Ativar'}</button></div>)}
        </div>
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
        <h3 className="font-semibold">Formas de pagamento</h3>
        <form className="mt-4 grid gap-2 md:grid-cols-3" onSubmit={(event) => { event.preventDefault(); void run(async () => { await FinanceMasterDataClient.createPaymentMethod({ name: methodName.trim(), type: methodType.trim() }); setMethodName(''); }); }}>
          <input className="rounded-lg border p-2 text-sm" value={methodName} onChange={(e) => setMethodName(e.target.value)} placeholder="Nome" required />
          <input className="rounded-lg border p-2 text-sm" value={methodType} onChange={(e) => setMethodType(e.target.value)} placeholder="Tipo (PIX, CARD...)" required />
          <button className="rounded-lg bg-blue-600 px-3 py-2 text-sm font-semibold text-white">Adicionar forma</button>
        </form>
        <div className="mt-4 divide-y">{data.paymentMethods.map((item) => <div key={item.id} className="flex items-center justify-between py-3 text-sm"><div><div className="font-medium">{item.name}</div><div className="text-xs text-slate-500">{item.type}</div></div><button className="rounded-lg border px-3 py-1.5 text-xs" onClick={() => void run(() => FinanceMasterDataClient.setPaymentMethodActive(item.id, !item.active))}>{item.active ? 'Inativar' : 'Ativar'}</button></div>)}</div>
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
        <h3 className="font-semibold">Categorias financeiras</h3>
        <form className="mt-4 grid gap-2 md:grid-cols-4" onSubmit={(event) => { event.preventDefault(); void run(async () => { await FinanceMasterDataClient.createCategory({ name: categoryName.trim(), type: categoryType, parentId: categoryParentId || undefined }); setCategoryName(''); setCategoryParentId(''); }); }}>
          <input className="rounded-lg border p-2 text-sm" value={categoryName} onChange={(e) => setCategoryName(e.target.value)} placeholder="Nome da categoria" required />
          <select className="rounded-lg border p-2 text-sm" value={categoryType} onChange={(e) => setCategoryType(e.target.value as 'INCOME'|'EXPENSE'|'BOTH')}><option value="INCOME">Receita</option><option value="EXPENSE">Despesa</option><option value="BOTH">Ambos</option></select>
          <select className="rounded-lg border p-2 text-sm" value={categoryParentId} onChange={(e) => setCategoryParentId(e.target.value)}><option value="">Sem categoria pai</option>{data.categories.filter((item) => item.active).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select>
          <button className="rounded-lg bg-blue-600 px-3 py-2 text-sm font-semibold text-white">Adicionar categoria</button>
        </form>
        <div className="mt-4 divide-y">{data.categories.map((item) => <div key={item.id} className="flex items-center justify-between py-3 text-sm"><div><div className="font-medium">{item.name}</div><div className="text-xs text-slate-500">{item.type}{item.parentId ? ' · categoria filha' : ''}</div></div><button className="rounded-lg border px-3 py-1.5 text-xs" onClick={() => void run(() => FinanceMasterDataClient.setCategoryActive(item.id, !item.active))}>{item.active ? 'Inativar' : 'Ativar'}</button></div>)}</div>
      </section>
    </div>
  );
};
