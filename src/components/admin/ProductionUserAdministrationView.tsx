import React, { useEffect, useState } from 'react';
import { AlertTriangle, LockKeyhole, RefreshCw, ShieldCheck, Users } from 'lucide-react';
import { AdminUserClient, type AdminUserDto } from '../../api/adminUserClient';
import { Badge, Button, Card } from '../ui';

export const ProductionUserAdministrationView: React.FC = () => {
  const [users, setUsers] = useState<AdminUserDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [mutatingId, setMutatingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      setUsers(await AdminUserClient.listUsers());
    } catch (cause) {
      setUsers([]);
      setError(cause instanceof Error ? cause.message : 'Falha ao carregar usuários.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const toggle = async (user: AdminUserDto) => {
    setMutatingId(user.id);
    setError(null);
    setMessage(null);
    try {
      const updated = await AdminUserClient.setUserActive(user.id, !user.active);
      setUsers((current) => current.map((item) => (item.id === updated.id ? updated : item)));
      setMessage(`${updated.name}: ${updated.active ? 'ativo' : 'inativo'}.`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Falha ao atualizar usuário.');
    } finally {
      setMutatingId(null);
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900 md:flex-row md:items-center md:justify-between">
        <div className="flex items-start gap-3">
          <div className="rounded-xl bg-indigo-50 p-3 text-indigo-700 dark:bg-indigo-950/40 dark:text-indigo-300">
            <Users className="h-6 w-6" />
          </div>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-xl font-bold text-slate-900 dark:text-slate-100">Usuários</h2>
              <Badge className="border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-300">
                PostgreSQL autoritativo
              </Badge>
            </div>
            <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
              Listagem e ativação/inativação de usuários do tenant autenticado. Disponível somente para ADMIN.
            </p>
          </div>
        </div>
        <Button variant="outline" onClick={() => void load()} disabled={loading} className="gap-2">
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} /> Atualizar
        </Button>
      </div>

      <div className="flex items-start gap-3 rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300">
        <LockKeyhole className="mt-0.5 h-4 w-4 shrink-0" />
        <div>
          Credenciais e hashes de senha nunca são retornados por esta API. Tenant e ator são derivados exclusivamente da sessão autenticada do servidor.
        </div>
      </div>

      {error && (
        <div className="flex items-center gap-2 rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800 dark:border-rose-900/60 dark:bg-rose-950/30 dark:text-rose-200">
          <AlertTriangle className="h-4 w-4" /> {error}
        </div>
      )}
      {message && (
        <div className="flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800 dark:border-emerald-900/60 dark:bg-emerald-950/30 dark:text-emerald-200">
          <ShieldCheck className="h-4 w-4" /> {message}
        </div>
      )}

      <Card className="overflow-hidden">
        <div className="border-b border-slate-200 p-4 dark:border-slate-800">
          <h3 className="font-semibold text-slate-900 dark:text-slate-100">Usuários do tenant</h3>
          <p className="text-xs text-slate-500">Ações de status são validadas e auditadas pela autoridade PostgreSQL.</p>
        </div>

        {loading ? (
          <div className="flex items-center justify-center p-12 text-slate-500">
            <RefreshCw className="mr-2 h-5 w-5 animate-spin" /> Carregando usuários...
          </div>
        ) : users.length === 0 ? (
          <div className="p-10 text-center text-sm text-slate-500">Nenhum usuário disponível.</div>
        ) : (
          <div className="divide-y divide-slate-200 dark:divide-slate-800">
            {users.map((user) => (
              <div key={user.id} className="flex flex-col gap-3 p-4 md:flex-row md:items-center md:justify-between">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold text-slate-900 dark:text-slate-100">{user.name}</span>
                    <Badge variant="outline">{user.role}</Badge>
                    <Badge className={user.active
                      ? 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-300'
                      : 'border-slate-200 bg-slate-50 text-slate-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300'}>
                      {user.active ? 'ATIVO' : 'INATIVO'}
                    </Badge>
                  </div>
                  <div className="mt-1 text-sm text-slate-600 dark:text-slate-300">{user.email}</div>
                  <div className="mt-1 text-xs text-slate-400">ID: {user.id}</div>
                </div>
                <Button
                  variant={user.active ? 'outline' : 'default'}
                  onClick={() => void toggle(user)}
                  disabled={mutatingId !== null}
                >
                  {mutatingId === user.id ? 'Salvando...' : user.active ? 'Desativar' : 'Ativar'}
                </Button>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
};
