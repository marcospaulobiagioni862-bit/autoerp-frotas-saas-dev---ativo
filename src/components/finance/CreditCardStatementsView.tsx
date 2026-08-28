import React, { useEffect, useMemo, useState } from 'react';
import { CreditCard, RefreshCw } from 'lucide-react';
import { CreditCardStatementClient, type CreditCardProfileSummary, type CreditCardStatementStatus, type CreditCardStatementSummary } from '../../api/creditCardStatementClient';
import { Badge, Button, Card, Skeleton } from '../ui';

const currency = (value: number) => value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

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
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<string | null>(null);

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

  const visibleStatements = useMemo(
    () => profileId ? statements.filter((statement) => statement.creditCardProfileId === profileId) : statements,
    [profileId, statements],
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
        <label className="block max-w-md text-xs font-semibold text-slate-600 dark:text-slate-400">
          Perfil de cartão
          <select value={profileId} onChange={(event) => setProfileId(event.target.value)} className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs dark:border-slate-700 dark:bg-slate-900">
            <option value="">Todos os perfis</option>
            {profiles.map((profile) => <option key={profile.id} value={profile.id}>Conta {profile.financialAccountId} • fecha dia {profile.closingDay} • vence dia {profile.dueDay}</option>)}
          </select>
        </label>
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
          <div className="overflow-x-auto"><table className="w-full text-left text-xs"><thead className="border-b border-slate-200 bg-slate-50 uppercase tracking-wide text-slate-500 dark:border-slate-800 dark:bg-slate-800/60"><tr><th className="p-3">Ciclo / datas</th><th className="p-3">Status</th><th className="p-3 text-right">Original</th><th className="p-3 text-right">Ajustes autoritativos</th><th className="p-3 text-right">Pago</th><th className="p-3 text-right">Saldo</th></tr></thead><tbody className="divide-y divide-slate-100 dark:divide-slate-800">
            {visibleStatements.map((statement) => {
              const profile = profileById.get(statement.creditCardProfileId);
              return <tr key={statement.id}>
                <td className="p-3"><div className="font-semibold text-slate-900 dark:text-slate-100">{statement.cycleRef}</div><div className="mt-1 text-[11px] text-slate-500">Fecha {statement.closingDate} • vence {statement.dueDate}</div><div className="mt-1 break-all font-mono text-[10px] text-slate-400">{profile?.financialAccountId || statement.creditCardProfileId}</div></td>
                <td className="p-3"><Badge variant={statusVariant(statement.status, statement.isOverdue)}>{statusLabel(statement.status)}</Badge>{statement.isOverdue && <div className="mt-1 text-[11px] font-semibold text-red-600">Vencida há {statement.overdueDays} dia{statement.overdueDays === 1 ? '' : 's'}</div>}</td>
                <td className="p-3 text-right font-mono tabular-nums">{currency(statement.originalAmount)}</td>
                <td className="p-3 text-right font-mono text-[11px] tabular-nums"><div>Ajuste: {currency(statement.adjustmentAmount)}</div><div>Juros: {currency(statement.interestAmount)}</div><div>Multa: {currency(statement.fineAmount)}</div><div>Desconto: {currency(statement.discountAmount)}</div></td>
                <td className="p-3 text-right font-mono tabular-nums">{currency(statement.paidAmount)}</td>
                <td className="p-3 text-right font-mono font-bold tabular-nums">{currency(statement.balanceAmount)}</td>
              </tr>;
            })}
          </tbody></table></div>
        )}
      </Card>

      <p className="text-[11px] text-slate-500">Esta tela não cria, fecha, paga, ajusta nem credita faturas. Qualquer ação financeira permanece fora desta wave e exige autoridade server-side específica.</p>
    </div>
  );
};
