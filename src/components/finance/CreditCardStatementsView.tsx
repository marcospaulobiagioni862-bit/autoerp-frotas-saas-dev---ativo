import React, { useEffect, useMemo, useState } from 'react';
import { CreditCard, Eye, RefreshCw, X } from 'lucide-react';
import { CreditCardStatementClient, type CreditCardProfileSummary, type CreditCardStatementDetail, type CreditCardStatementStatus, type CreditCardStatementSummary } from '../../api/creditCardStatementClient';
import { Badge, Button, Card, Skeleton } from '../ui';

const currency = (value: number) => value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

type DueFilter = '' | 'OVERDUE' | 'CURRENT';

function statusVariant(status: CreditCardStatementStatus, isOverdue: boolean): 'success' | 'warning' | 'neutral' | 'info' {
  if (status === 'PAID') return 'success';
  if (isOverdue || status === 'PARTIALLY_PAID') return 'warning';
  if (status === 'CLOSED') return 'info';
  return 'neutral';
}

function statusLabel(status: CreditCardStatementStatus): string {
  if (status === 'OPEN') return 'Aberta';
  if (status === 'CLOSED') return 'Fechada';
  if (status === 'PARTIALLY_PAID') return 'Parcialmente paga';
  return 'Paga';
}

export const CreditCardStatementsView: React.FC = () => {
  const [profiles, setProfiles] = useState<CreditCardProfileSummary[]>([]);
  const [statements, setStatements] = useState<CreditCardStatementSummary[]>([]);
  const [profileId, setProfileId] = useState('');
  const [statusFilter, setStatusFilter] = useState<CreditCardStatementStatus | ''>('');
  const [dueFilter, setDueFilter] = useState<DueFilter>('');
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<string | null>(null);
  const [detail, setDetail] = useState<CreditCardStatementDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailMessage, setDetailMessage] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setMessage(null);
    try {
      const [profileList, statementList] = await Promise.all([
        CreditCardStatementClient.listProfiles(),
        CreditCardStatementClient.listStatements(),
      ]);
      setProfiles(profileList);
      setStatements(statementList);
      if (profileId && !profileList.some((profile) => profile.id === profileId)) setProfileId('');
    } catch (error) {
      setProfiles([]);
      setStatements([]);
      setProfileId('');
      setMessage(error instanceof Error ? error.message : 'Não foi possível carregar cartões e faturas.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, []);

  const loadDetail = async (statementId: string) => {
    setDetail(null);
    setDetailMessage(null);
    setDetailLoading(true);
    try {
      setDetail(await CreditCardStatementClient.getStatementDetail(statementId));
    } catch (error) {
      setDetailMessage(error instanceof Error ? error.message : 'Não foi possível carregar o detalhe autoritativo da fatura.');
    } finally {
      setDetailLoading(false);
    }
  };

  const visibleStatements = useMemo(
    () => statements.filter((statement) => {
      if (profileId && statement.creditCardProfileId !== profileId) return false;
      if (statusFilter && statement.status !== statusFilter) return false;
      if (dueFilter === 'OVERDUE' && !statement.isOverdue) return false;
      if (dueFilter === 'CURRENT' && statement.isOverdue) return false;
      return true;
    }),
    [dueFilter, profileId, statements, statusFilter],
  );
  const profileById = useMemo(() => new Map(profiles.map((profile) => [profile.id, profile])), [profiles]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="flex items-center gap-2 text-xl font-bold text-slate-900 dark:text-slate-100"><CreditCard className="h-6 w-6 text-blue-600" /> Cartões / Faturas</h2>
          <p className="mt-1 text-xs text-slate-500">Visão somente leitura. Status, saldo e atraso são exibidos exatamente como retornados pela autoridade financeira do servidor.</p>
        </div>
        <Button size="sm" variant="outline" onClick={() => void load()} icon={<RefreshCw className="h-4 w-4" />}>Atualizar</Button>
      </div>

      {message && <div role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-700 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-300">{message}</div>}

      <Card padding="sm">
        <div className="grid gap-3 md:grid-cols-3">
          <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400">
            Perfil de cartão
            <select value={profileId} onChange={(event) => setProfileId(event.target.value)} className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs dark:border-slate-700 dark:bg-slate-900">
              <option value="">Todos os perfis</option>
              {profiles.map((profile) => <option key={profile.id} value={profile.id}>Conta {profile.financialAccountId} • fecha dia {profile.closingDay} • vence dia {profile.dueDay}</option>)}
            </select>
          </label>
          <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400">
            Status da fatura
            <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as CreditCardStatementStatus | '')} className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs dark:border-slate-700 dark:bg-slate-900">
              <option value="">Todos os status</option>
              <option value="OPEN">Aberta</option>
              <option value="CLOSED">Fechada</option>
              <option value="PARTIALLY_PAID">Parcialmente paga</option>
              <option value="PAID">Paga</option>
            </select>
          </label>
          <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400">
            Vencimento autoritativo
            <select value={dueFilter} onChange={(event) => setDueFilter(event.target.value as DueFilter)} className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs dark:border-slate-700 dark:bg-slate-900">
              <option value="">Todos os vencimentos</option>
              <option value="OVERDUE">Vencidas</option>
              <option value="CURRENT">A vencer / hoje</option>
            </select>
          </label>
        </div>
        <p className="mt-2 text-[11px] text-slate-500">Filtros atuam somente sobre o read-model já retornado pelo servidor; nenhum status financeiro é recalculado no navegador.</p>
      </Card>

      {loading ? (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3"><Skeleton className="h-28 w-full" /><Skeleton className="h-28 w-full" /><Skeleton className="h-28 w-full" /></div>
      ) : profiles.length === 0 ? (
        <Card padding="sm"><div className="py-6 text-center text-sm text-slate-500">Nenhum perfil de cartão autorizado foi encontrado.</div></Card>
      ) : (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
          {profiles.map((profile) => <Card key={profile.id} padding="sm"><div className="flex items-start justify-between gap-3"><div><div className="text-xs text-slate-500">Conta financeira</div><div className="mt-1 break-all font-mono text-xs font-semibold">{profile.financialAccountId}</div></div><Badge variant={profile.active ? 'success' : 'neutral'}>{profile.active ? 'Ativo' : 'Inativo'}</Badge></div><div className="mt-4 text-lg font-bold tabular-nums">{currency(profile.creditLimit)}</div><div className="mt-1 text-xs text-slate-500">Limite • fecha dia {profile.closingDay} • vence dia {profile.dueDay}</div></Card>)}
        </div>
      )}

      <Card padding="none">
        {loading ? <div className="space-y-3 p-6"><Skeleton className="h-12 w-full" /><Skeleton className="h-12 w-full" /></div> : visibleStatements.length === 0 ? <div className="p-6 text-center text-sm text-slate-500">Nenhuma fatura encontrada para o filtro atual.</div> : (
          <div className="overflow-x-auto"><table className="w-full text-left text-xs"><thead className="border-b border-slate-200 bg-slate-50 uppercase tracking-wide text-slate-500 dark:border-slate-800 dark:bg-slate-800/60"><tr><th className="p-3">Ciclo / datas</th><th className="p-3">Status</th><th className="p-3 text-right">Original</th><th className="p-3 text-right">Ajustes autoritativos</th><th className="p-3 text-right">Pago</th><th className="p-3 text-right">Saldo</th><th className="p-3 text-right">Detalhe</th></tr></thead><tbody className="divide-y divide-slate-100 dark:divide-slate-800">
            {visibleStatements.map((statement) => {
              const profile = profileById.get(statement.creditCardProfileId);
              return <tr key={statement.id}>
                <td className="p-3"><div className="font-semibold text-slate-900 dark:text-slate-100">{statement.cycleRef}</div><div className="mt-1 text-[11px] text-slate-500">Fecha {statement.closingDate} • vence {statement.dueDate}</div><div className="mt-1 break-all font-mono text-[10px] text-slate-400">{profile?.financialAccountId || statement.creditCardProfileId}</div></td>
                <td className="p-3"><Badge variant={statusVariant(statement.status, statement.isOverdue)}>{statusLabel(statement.status)}</Badge>{statement.isOverdue && <div className="mt-1 text-[11px] font-semibold text-red-600">Vencida há {statement.overdueDays} dia{statement.overdueDays === 1 ? '' : 's'}</div>}</td>
                <td className="p-3 text-right font-mono tabular-nums">{currency(statement.originalAmount)}</td>
                <td className="p-3 text-right font-mono text-[11px] tabular-nums"><div>Ajuste: {currency(statement.adjustmentAmount)}</div><div>Juros: {currency(statement.interestAmount)}</div><div>Multa: {currency(statement.fineAmount)}</div><div>Desconto: {currency(statement.discountAmount)}</div></td>
                <td className="p-3 text-right font-mono tabular-nums">{currency(statement.paidAmount)}</td>
                <td className="p-3 text-right font-mono font-bold tabular-nums">{currency(statement.balanceAmount)}</td>
                <td className="p-3 text-right"><Button size="sm" variant="outline" onClick={() => void loadDetail(statement.id)} icon={<Eye className="h-4 w-4" />}>Ver detalhe</Button></td>
              </tr>;
            })}
          </tbody></table></div>
        )}
      </Card>

      {(detailLoading || detailMessage || detail) && (
        <Card padding="sm">
          <div className="flex items-start justify-between gap-3">
            <div><h3 className="font-bold text-slate-900 dark:text-slate-100">Detalhe autoritativo da fatura</h3><p className="mt-1 text-[11px] text-slate-500">Carregado sob demanda; valores exibidos sem recomposição local.</p></div>
            <Button size="sm" variant="ghost" onClick={() => { setDetail(null); setDetailMessage(null); }} icon={<X className="h-4 w-4" />}>Fechar</Button>
          </div>
          {detailLoading && <div className="mt-4 space-y-2"><Skeleton className="h-10 w-full" /><Skeleton className="h-10 w-full" /></div>}
          {detailMessage && <div role="alert" className="mt-4 rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-700 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-300">{detailMessage}</div>}
          {detail && (
            <div className="mt-4 space-y-5 text-xs">
              <div className="grid grid-cols-2 gap-3 md:grid-cols-4"><div><span className="text-slate-500">Ciclo</span><div className="font-semibold">{detail.statement.cycleRef}</div></div><div><span className="text-slate-500">Status</span><div className="font-semibold">{statusLabel(detail.statement.status)}</div></div><div><span className="text-slate-500">Pago</span><div className="font-mono font-semibold">{currency(detail.statement.paidAmount)}</div></div><div><span className="text-slate-500">Saldo</span><div className="font-mono font-bold">{currency(detail.statement.balanceAmount)}</div></div></div>
              <section><h4 className="mb-2 font-semibold">Itens ({detail.items.length})</h4>{detail.items.length === 0 ? <div className="text-slate-500">Nenhum item.</div> : <div className="space-y-2">{detail.items.map((item) => <div key={item.id} className="rounded-lg border border-slate-200 p-3 dark:border-slate-800"><div className="flex justify-between gap-3"><div><div className="font-semibold">{item.originType}</div><div className="break-all font-mono text-[10px] text-slate-500">{item.originId}</div></div><div className="font-mono font-bold">{currency(item.finalAmount)}</div></div><div className="mt-1 text-[11px] text-slate-500">Original {currency(item.originalAmount)} • ajuste {currency(item.adjustmentAmount)}</div></div>)}</div>}</section>
              <div className="grid gap-4 lg:grid-cols-3">
                <section><h4 className="mb-2 font-semibold">Pagamentos ({detail.payments.length})</h4>{detail.payments.length === 0 ? <div className="text-slate-500">Nenhum pagamento.</div> : detail.payments.map((payment) => <div key={payment.id} className="mb-2 rounded-lg border border-slate-200 p-3 dark:border-slate-800"><div className="font-mono font-bold">{currency(payment.amount)}</div><div className="text-[10px] text-slate-500">{new Date(payment.createdAt).toLocaleString('pt-BR')}</div></div>)}</section>
                <section><h4 className="mb-2 font-semibold">Encargos e descontos ({detail.adjustments.length})</h4>{detail.adjustments.length === 0 ? <div className="text-slate-500">Nenhum ajuste.</div> : detail.adjustments.map((adjustment) => <div key={adjustment.id} className="mb-2 rounded-lg border border-slate-200 p-3 dark:border-slate-800"><div>{adjustment.reason}</div><div className="mt-1 font-mono text-[11px]">Juros {currency(adjustment.interestAmount)} • multa {currency(adjustment.fineAmount)} • desconto {currency(adjustment.discountAmount)}</div></div>)}</section>
                <section><h4 className="mb-2 font-semibold">Créditos ({detail.credits.length})</h4>{detail.credits.length === 0 ? <div className="text-slate-500">Nenhum crédito.</div> : detail.credits.map((credit) => <div key={credit.id} className="mb-2 rounded-lg border border-slate-200 p-3 dark:border-slate-800"><div>{credit.reason}</div><div className="mt-1 font-mono font-bold">{currency(credit.amount)}</div></div>)}</section>
              </div>
            </div>
          )}
        </Card>
      )}

      <p className="text-[11px] text-slate-500">Esta tela não cria, fecha, paga, ajusta nem credita faturas. Qualquer ação financeira permanece fora desta wave e exige autoridade server-side específica.</p>
    </div>
  );
};
