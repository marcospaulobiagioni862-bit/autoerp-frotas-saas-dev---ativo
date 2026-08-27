import React, { useEffect, useMemo, useState } from 'react';
import { Landmark, RefreshCw, Search, Upload, Unlink, Link2, Ban } from 'lucide-react';
import { BankReconciliationClient, type BankStatementDirection, type BankStatementEntry, type BankStatementStatus, type ReconciliationSuggestion } from '../../api/bankReconciliationClient';
import { FinanceTransactionClient } from '../../api/financeTransactionClient';
import type { SettlementAccountOption } from '../../api/financeSettlementClient';
import { Badge, Button, Card, Input, Skeleton } from '../ui';

const currency = (value: number) => value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

type StatusFilter = 'ALL' | BankStatementStatus;

const STATUS_OPTIONS: Array<{ value: StatusFilter; label: string }> = [
  { value: 'ALL', label: 'Todos os status' },
  { value: 'UNMATCHED', label: 'Não conciliado' },
  { value: 'SUGGESTED', label: 'Com sugestão' },
  { value: 'MATCHED', label: 'Conciliado' },
  { value: 'IGNORED', label: 'Ignorado' },
  { value: 'REVERSED', label: 'Revertido' },
];

function badgeVariant(status: BankStatementStatus): 'success' | 'warning' | 'neutral' | 'info' {
  if (status === 'MATCHED') return 'success';
  if (status === 'UNMATCHED' || status === 'SUGGESTED') return 'warning';
  if (status === 'REVERSED') return 'info';
  return 'neutral';
}

export const BankReconciliationView: React.FC = () => {
  const [accounts, setAccounts] = useState<SettlementAccountOption[]>([]);
  const [accountId, setAccountId] = useState('');
  const [status, setStatus] = useState<StatusFilter>('ALL');
  const [entries, setEntries] = useState<BankStatementEntry[]>([]);
  const [suggestions, setSuggestions] = useState<ReconciliationSuggestion[]>([]);
  const [candidateSelection, setCandidateSelection] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [query, setQuery] = useState('');

  const [importDate, setImportDate] = useState(new Date().toISOString().slice(0, 10));
  const [importDescription, setImportDescription] = useState('');
  const [importAmount, setImportAmount] = useState('');
  const [importDirection, setImportDirection] = useState<BankStatementDirection>('CREDIT');
  const [importDocument, setImportDocument] = useState('');
  const [importExternalId, setImportExternalId] = useState('');

  const load = async (preferredAccount?: string) => {
    setLoading(true);
    setMessage(null);
    try {
      const options = await FinanceTransactionClient.getOptions();
      const available = options.accounts;
      const selected = preferredAccount && available.some((item) => item.id === preferredAccount)
        ? preferredAccount
        : accountId && available.some((item) => item.id === accountId)
          ? accountId
          : available[0]?.id || '';
      setAccounts(available);
      setAccountId(selected);
      if (!selected) {
        setEntries([]);
        setSuggestions([]);
        setCandidateSelection({});
        return;
      }
      const [entryList, suggestionList] = await Promise.all([
        BankReconciliationClient.listEntries(selected, status === 'ALL' ? undefined : status),
        BankReconciliationClient.suggestions(selected),
      ]);
      setEntries(entryList);
      setSuggestions(suggestionList);
      setCandidateSelection({});
    } catch (error) {
      setEntries([]);
      setSuggestions([]);
      setCandidateSelection({});
      setMessage(error instanceof Error ? error.message : 'Não foi possível carregar a conciliação bancária.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, []);

  useEffect(() => {
    if (!accountId) return;
    let active = true;
    setLoading(true);
    Promise.all([
      BankReconciliationClient.listEntries(accountId, status === 'ALL' ? undefined : status),
      BankReconciliationClient.suggestions(accountId),
    ]).then(([entryList, suggestionList]) => {
      if (!active) return;
      setEntries(entryList);
      setSuggestions(suggestionList);
      setCandidateSelection({});
      setMessage(null);
    }).catch((error: unknown) => {
      if (!active) return;
      setEntries([]);
      setSuggestions([]);
      setCandidateSelection({});
      setMessage(error instanceof Error ? error.message : 'Não foi possível atualizar a conciliação bancária.');
    }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [accountId, status]);

  const suggestionByEntry = useMemo(() => new Map(suggestions.map((item) => [item.statementEntry.id, item])), [suggestions]);
  const normalizedQuery = query.trim().toLocaleLowerCase('pt-BR');
  const visibleEntries = normalizedQuery
    ? entries.filter((item) => [item.description, item.documentNumber, item.externalId, item.matchedTransactionId, item.id]
        .filter(Boolean).some((value) => String(value).toLocaleLowerCase('pt-BR').includes(normalizedQuery)))
    : entries;

  const refresh = async () => { if (accountId) await load(accountId); };

  const importOne = async () => {
    const amount = Number(importAmount.replace(',', '.'));
    if (!accountId || !importDate || !importDescription.trim() || !Number.isFinite(amount) || amount <= 0) {
      setMessage('Preencha data, descrição e valor válido antes de importar.');
      return;
    }
    setBusyId('IMPORT');
    try {
      const result = await BankReconciliationClient.importEntries(accountId, [{
        date: importDate,
        description: importDescription.trim(),
        amount,
        direction: importDirection,
        documentNumber: importDocument.trim() || undefined,
        externalId: importExternalId.trim() || undefined,
        importSource: 'MANUAL_UI',
      }]);
      setMessage(result.skippedDuplicates > 0 ? 'Lançamento já existente: duplicidade ignorada com segurança.' : 'Lançamento bancário importado com sucesso.');
      setImportDescription('');
      setImportAmount('');
      setImportDocument('');
      setImportExternalId('');
      await refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Falha ao importar lançamento bancário.');
    } finally { setBusyId(null); }
  };

  const act = async (entry: BankStatementEntry, action: 'MATCH' | 'UNMATCH' | 'IGNORE', transactionId?: string) => {
    if (action === 'MATCH' && !transactionId) {
      setMessage('Escolha explicitamente uma transação candidata antes de conciliar.');
      return;
    }
    setBusyId(entry.id);
    try {
      if (action === 'MATCH' && transactionId) await BankReconciliationClient.match(entry.id, transactionId);
      if (action === 'UNMATCH') await BankReconciliationClient.unmatch(entry.id, 'Desconciliação solicitada pela interface financeira');
      if (action === 'IGNORE') await BankReconciliationClient.ignore(entry.id, 'Ignorado pela revisão financeira');
      setMessage(action === 'MATCH' ? 'Lançamento conciliado.' : action === 'UNMATCH' ? 'Conciliação desfeita.' : 'Lançamento ignorado.');
      await refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Operação de conciliação falhou.');
    } finally { setBusyId(null); }
  };

  return (
    <div className="p-4 sm:p-6 space-y-6 max-w-7xl mx-auto">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="flex items-center gap-2 text-xl font-bold text-slate-900 dark:text-slate-100"><Landmark className="h-6 w-6 text-blue-600" /> Conciliação Bancária</h2>
          <p className="mt-1 text-xs text-slate-500">Vincule entradas de extrato a transações já existentes. Esta área não altera saldo nem cria movimentações financeiras.</p>
        </div>
        <Button size="sm" variant="outline" onClick={() => void refresh()} icon={<RefreshCw className="h-4 w-4" />}>Atualizar</Button>
      </div>

      {message && <div role="status" className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs text-slate-700 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300">{message}</div>}

      <Card padding="sm">
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-4">
          <label className="text-xs font-semibold text-slate-600 dark:text-slate-400">Conta financeira<select value={accountId} onChange={(event) => setAccountId(event.target.value)} className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs dark:border-slate-700 dark:bg-slate-900">{accounts.length === 0 && <option value="">Nenhuma conta disponível</option>}{accounts.map((account) => <option key={account.id} value={account.id}>{account.name} ({account.type})</option>)}</select></label>
          <label className="text-xs font-semibold text-slate-600 dark:text-slate-400">Status<select value={status} onChange={(event) => setStatus(event.target.value as StatusFilter)} className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs dark:border-slate-700 dark:bg-slate-900">{STATUS_OPTIONS.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></label>
          <div className="lg:col-span-2"><span className="text-xs font-semibold text-slate-600 dark:text-slate-400">Buscar</span><Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Descrição, documento, ID ou transação..." icon={<Search className="h-4 w-4 text-slate-400" />} /></div>
        </div>
      </Card>

      <Card padding="sm">
        <div className="mb-3 flex items-center gap-2"><Upload className="h-4 w-4 text-blue-600" /><h3 className="text-sm font-bold">Importação manual estruturada</h3></div>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-6">
          <Input type="date" value={importDate} onChange={(event) => setImportDate(event.target.value)} />
          <Input value={importDescription} onChange={(event) => setImportDescription(event.target.value)} placeholder="Descrição" />
          <Input value={importAmount} onChange={(event) => setImportAmount(event.target.value)} placeholder="Valor" inputMode="decimal" />
          <select value={importDirection} onChange={(event) => setImportDirection(event.target.value as BankStatementDirection)} className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs dark:border-slate-700 dark:bg-slate-900"><option value="CREDIT">Crédito</option><option value="DEBIT">Débito</option></select>
          <Input value={importDocument} onChange={(event) => setImportDocument(event.target.value)} placeholder="Documento (opcional)" />
          <Input value={importExternalId} onChange={(event) => setImportExternalId(event.target.value)} placeholder="ID externo (opcional)" />
        </div>
        <div className="mt-3 flex justify-end"><Button size="sm" onClick={() => void importOne()} disabled={!accountId || busyId === 'IMPORT'}>Importar lançamento</Button></div>
      </Card>

      <Card padding="none">
        {loading ? <div className="space-y-3 p-6"><Skeleton className="h-12 w-full" /><Skeleton className="h-12 w-full" /><Skeleton className="h-12 w-full" /></div> : visibleEntries.length === 0 ? <div className="p-6 text-center text-sm text-slate-500">Nenhum lançamento bancário encontrado para os filtros atuais.</div> : (
          <div className="overflow-x-auto"><table className="w-full text-left text-xs"><thead className="border-b border-slate-200 bg-slate-50 uppercase tracking-wide text-slate-500 dark:border-slate-800 dark:bg-slate-800/60"><tr><th className="p-3">Data / Descrição</th><th className="p-3">Direção</th><th className="p-3 text-right">Valor</th><th className="p-3">Status / vínculo</th><th className="p-3">Sugestão</th><th className="p-3 text-right">Ações</th></tr></thead><tbody className="divide-y divide-slate-100 dark:divide-slate-800">
            {visibleEntries.map((entry) => {
              const suggestion = suggestionByEntry.get(entry.id);
              const selectedCandidateId = candidateSelection[entry.id] || suggestion?.bestMatch?.id || '';
              return <tr key={entry.id}>
                <td className="p-3"><div className="font-mono font-semibold">{entry.date}</div><div className="font-semibold text-slate-900 dark:text-slate-100">{entry.description}</div><div className="text-[10px] font-mono text-slate-400">{entry.documentNumber || entry.externalId || entry.id}</div></td>
                <td className="p-3"><Badge variant={entry.direction === 'CREDIT' ? 'success' : 'info'}>{entry.direction || 'LEGADO'}</Badge></td>
                <td className="p-3 text-right font-mono font-bold tabular-nums">{currency(entry.amount)}</td>
                <td className="p-3"><Badge variant={badgeVariant(entry.status)}>{entry.status}</Badge>{entry.matchedTransactionId && <div className="mt-1 text-[10px] font-mono text-slate-400">TX: {entry.matchedTransactionId}</div>}</td>
                <td className="p-3">{suggestion && suggestion.candidates.length > 0 ? <select aria-label={`Candidato para ${entry.id}`} value={selectedCandidateId} onChange={(event) => setCandidateSelection((current) => ({ ...current, [entry.id]: event.target.value }))} className="max-w-xs rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-[11px] dark:border-slate-700 dark:bg-slate-900"><option value="">Escolha um candidato</option>{suggestion.candidates.map((candidate) => <option key={candidate.transaction.id} value={candidate.transaction.id}>{candidate.confidence} • {candidate.transaction.transactionDate} • {currency(candidate.transaction.amount)} • {candidate.transaction.description}</option>)}</select> : <span className="text-slate-400">Sem correspondência candidata</span>}</td>
                <td className="p-3 text-right"><div className="flex justify-end gap-1">
                  {entry.status !== 'MATCHED' && suggestion && suggestion.candidates.length > 0 && <Button size="sm" variant="outline" disabled={busyId === entry.id || !selectedCandidateId} onClick={() => void act(entry, 'MATCH', selectedCandidateId)} icon={<Link2 className="h-3.5 w-3.5" />}>Conciliar</Button>}
                  {entry.status === 'MATCHED' && <Button size="sm" variant="outline" disabled={busyId === entry.id} onClick={() => void act(entry, 'UNMATCH')} icon={<Unlink className="h-3.5 w-3.5" />}>Desconciliar</Button>}
                  {entry.status !== 'MATCHED' && entry.status !== 'IGNORED' && <Button size="sm" variant="ghost" disabled={busyId === entry.id} onClick={() => void act(entry, 'IGNORE')} icon={<Ban className="h-3.5 w-3.5" />}>Ignorar</Button>}
                </div></td>
              </tr>;
            })}
          </tbody></table></div>
        )}
      </Card>
    </div>
  );
};
