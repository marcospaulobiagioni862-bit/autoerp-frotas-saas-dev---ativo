import React, { useEffect, useState } from 'react';
import { AlertTriangle, Building2, LockKeyhole, RefreshCw, Shield, ShieldCheck, Users } from 'lucide-react';
import { AdminUserClient, type AdminUserDto } from '../../api/adminUserClient';
import { Badge, Button, Card } from '../ui';
import { ProductionTenantProfileView } from './ProductionTenantProfileView';
import { UserPermissionsModal } from './UserPermissionsModal';

type AdministrationTab = 'users' | 'tenant';

export const ProductionUserAdministrationView: React.FC = () => {
 const [activeTab, setActiveTab] = useState<AdministrationTab>('users');
 const [users, setUsers] = useState<AdminUserDto[]>([]);
 const [loading, setLoading] = useState(true);
 const [mutatingId, setMutatingId] = useState<string | null>(null);
 const [permissionModalUser, setPermissionModalUser] = useState<AdminUserDto | null>(null);
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
 <div className="p-4 sm:p-6 space-y-5 max-w-6xl mx-auto">
 <div className="rounded-2xl border border-graphite-200 bg-white p-5 shadow-sm dark:border-graphite-800 dark:bg-graphite-900">
 <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
 <div>
 <h1 className="text-2xl font-bold text-graphite-900 dark:text-graphite-100">Administração</h1>
 <p className="mt-1 text-sm text-graphite-600 dark:text-graphite-300">
 Os dados da empresa e dos usuários são protegidos e validados pelo sistema.
 </p>
 </div>
 <div className="inline-flex rounded-xl border border-graphite-200 bg-graphite-50 p-1 dark:border-graphite-700 dark:bg-graphite-950/60">
 <button
 type="button"
 aria-pressed={activeTab === 'users'}
 onClick={() => setActiveTab('users')}
 className={`flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold transition ${activeTab === 'users' ? 'bg-action-primary text-on-action-primary shadow-sm' : 'text-graphite-600 hover:bg-white dark:text-graphite-300 dark:hover:bg-graphite-800'}`}
 >
 <Users className="h-4 w-4" /> Usuários
 </button>
 <button
 type="button"
 aria-pressed={activeTab === 'tenant'}
 onClick={() => setActiveTab('tenant')}
 className={`flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold transition ${activeTab === 'tenant' ? 'bg-action-primary text-on-action-primary shadow-sm' : 'text-graphite-600 hover:bg-white dark:text-graphite-300 dark:hover:bg-graphite-800'}`}
 >
 <Building2 className="h-4 w-4" /> Empresa
 </button>
 </div>
 </div>
 </div>

 <div className="flex items-start gap-3 rounded-xl border border-warning-border bg-warning-bg p-4 text-sm text-warning-text ">
 <LockKeyhole className="mt-0.5 h-4 w-4 shrink-0" />
 <div>
 <strong>Disponível:</strong> administração de usuários e dados da empresa. As demais funções administrativas permanecem bloqueadas até estarem prontas e seguras para uso.
 </div>
 </div>

 {activeTab === 'tenant' ? (
 <ProductionTenantProfileView />
 ) : (
 <div className="space-y-5">
 <div className="flex flex-col gap-4 rounded-2xl border border-graphite-200 bg-white p-6 shadow-sm dark:border-graphite-800 dark:bg-graphite-900 md:flex-row md:items-center md:justify-between">
 <div className="flex items-start gap-3">
 <div className="rounded-xl bg-badge-navy-t1-bg p-3 text-badge-navy-t1-text ">
 <Users className="h-6 w-6" />
 </div>
 <div>
 <div className="flex flex-wrap items-center gap-2">
 <h2 className="text-xl font-bold text-graphite-900 dark:text-graphite-100">Usuários</h2>
 <Badge className="border-success-border bg-success-bg text-success-text ">
 Dados protegidos
 </Badge>
 </div>
 <p className="mt-1 text-sm text-graphite-600 dark:text-graphite-300">
 Usuários vinculados à empresa. Disponível somente para administradores.
 </p>
 </div>
 </div>
 <Button variant="outline" onClick={() => void load()} disabled={loading} className="gap-2">
 <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} /> Atualizar
 </Button>
 </div>

 <div className="flex items-start gap-3 rounded-xl border border-graphite-200 bg-graphite-50 p-4 text-sm text-graphite-700 dark:border-graphite-800 dark:bg-graphite-900 dark:text-graphite-300">
 <LockKeyhole className="mt-0.5 h-4 w-4 shrink-0" />
 <div>
 Senhas e dados de acesso nunca são exibidos. A empresa e o responsável são identificados pela sessão ativa.
 </div>
 </div>

 {error && (
 <div className="flex items-center gap-2 rounded-lg border border-error-border bg-error-bg p-3 text-sm text-error-text ">
 <AlertTriangle className="h-4 w-4" /> {error}
 </div>
 )}
 {message && (
 <div className="flex items-center gap-2 rounded-lg border border-success-border bg-success-bg p-3 text-sm text-success-text ">
 <ShieldCheck className="h-4 w-4" /> {message}
 </div>
 )}

 <Card className="overflow-hidden">
 <div className="border-b border-graphite-200 p-4 dark:border-graphite-800">
 <h3 className="font-semibold text-graphite-900 dark:text-graphite-100">Usuários da empresa</h3>
 <p className="text-xs text-graphite-500">As alterações de status são validadas e registradas no histórico.</p>
 </div>

 {loading ? (
 <div className="flex items-center justify-center p-12 text-graphite-500">
 <RefreshCw className="mr-2 h-5 w-5 animate-spin" /> Carregando usuários...
 </div>
 ) : users.length === 0 ? (
 <div className="p-10 text-center text-sm text-graphite-500">Nenhum usuário disponível.</div>
 ) : (
 <div className="divide-y divide-graphite-200 dark:divide-graphite-800">
 {users.map((user) => (
 <div key={user.id} className="flex flex-col gap-3 p-4 md:flex-row md:items-center md:justify-between">
 <div className="min-w-0">
 <div className="flex flex-wrap items-center gap-2">
 <span className="font-semibold text-graphite-900 dark:text-graphite-100">{user.name}</span>
 <Badge variant="outline">{user.role}</Badge>
 <Badge className={user.active
 ? 'border-success-border bg-success-bg text-success-text '
 : 'border-graphite-200 bg-graphite-50 text-graphite-600 dark:border-graphite-700 dark:bg-graphite-800 dark:text-graphite-300'}>
 {user.active ? 'ATIVO' : 'INATIVO'}
 </Badge>
 <span className="text-[11px] text-graphite-500">
 {user.permissions?.includes('*')
 ? 'Acesso irrestrito (*)'
 : `${user.permissions?.length || 0} permissões concedidas`}
 </span>
 </div>
 <div className="mt-1 text-sm text-graphite-600 dark:text-graphite-300">{user.email}</div>
 <div className="mt-1 text-xs text-graphite-400">ID: {user.id}</div>
 </div>
 <div className="flex items-center gap-2">
 <Button
 variant="outline"
 size="sm"
 onClick={() => setPermissionModalUser(user)}
 className="gap-1.5"
 >
 <Shield className="h-3.5 w-3.5 text-badge-navy-t1-text" /> Permissões
 </Button>
 <Button
 variant={user.active ? 'outline' : 'default'}
 size="sm"
 onClick={() => void toggle(user)}
 disabled={mutatingId !== null}
 >
 {mutatingId === user.id ? 'Salvando...' : user.active ? 'Desativar' : 'Ativar'}
 </Button>
 </div>
 </div>
 ))}
 </div>
 )}
 </Card>

 {permissionModalUser && (
 <UserPermissionsModal
 isOpen
 onClose={() => setPermissionModalUser(null)}
 user={permissionModalUser}
 onSuccess={(updated) => {
 setUsers((current) => current.map((item) => (item.id === updated.id ? updated : item)));
 setMessage(`Permissões atualizadas com sucesso para ${updated.name} (${updated.role}).`);
 }}
 />
 )}
 </div>
 )}

 {/* Historical trust-boundary marker: "somente Usuários foi promovido" applied to SECURITY-2Q1; SECURITY-2Q2 now also promotes Empresa / Tenant. */}
 </div>
 );
};
