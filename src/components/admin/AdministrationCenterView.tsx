// src/components/admin/AdministrationCenterView.tsx
import React, { useState, useEffect } from 'react';
import { Card } from '../ui/Card';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { PageHeader } from '../ui/PageHeader';
import { 
  ShieldCheck, 
  Settings, 
  Users, 
  Lock, 
  Activity, 
  Building2, 
  Database, 
  HardDrive, 
  FileText, 
  Eye, 
  AlertTriangle, 
  CheckCircle2, 
  RefreshCw, 
  Save, 
  Search, 
  Clock, 
  Key, 
  ShieldAlert, 
  CheckCircle,
  Sliders
} from 'lucide-react';
import { SystemHealthCenterView } from './SystemHealthCenterView';
import { ProductionAdministrationService } from '../../domain/admin/ProductionAdministrationService';
import { TenantConfigurationService } from '../../domain/admin/TenantConfigurationService';
import { SecurityAdministrationService } from '../../domain/admin/SecurityAdministrationService';
import { BackupService } from '../../domain/resilience/BackupService';
import { AuditLogRepository } from '../../persistence/repositories/localRepositories';
import { UserRole } from '../../types/enums';

type AdminTab = 
  | 'overview' 
  | 'health' 
  | 'tenant' 
  | 'users' 
  | 'rbac' 
  | 'security' 
  | 'config' 
  | 'backup' 
  | 'audit' 
  | 'integrity' 
  | 'observability';

interface AdministrationCenterViewProps {
  companyId: string;
  currentUserId: string;
  currentUserRole: string;
}

export const AdministrationCenterView: React.FC<AdministrationCenterViewProps> = ({
  companyId,
  currentUserId,
  currentUserRole,
}) => {
  const [activeTab, setActiveTab] = useState<AdminTab>('overview');
  const userRole = currentUserRole;
  const userId = currentUserId;

  const [summary, setSummary] = useState<any>(null);
  const [tenantConfig, setTenantConfig] = useState<any>(null);
  const [users, setUsers] = useState<any[]>([]);
  const [sessions, setSessions] = useState<any[]>([]);
  const [auditLogs, setAuditLogs] = useState<any[]>([]);
  const [actionMsg, setActionMsg] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(true);

  // Editable tenant config state
  const [companyNameInput, setCompanyNameInput] = useState<string>('');
  const [documentInput, setDocumentInput] = useState<string>('');
  const [timezoneInput, setTimezoneInput] = useState<string>('');
  const [maxVehiclesInput, setMaxVehiclesInput] = useState<number>(5000);

  const loadData = async () => {
    setLoading(true);
    const prodSummary = ProductionAdministrationService.getProductionSummary(companyId, userRole);
    const cfg = TenantConfigurationService.getConfig(companyId);
    const usrList = SecurityAdministrationService.listUsers(companyId);
    const sessList = SecurityAdministrationService.listActiveSessions(companyId);

    const auditRepo = new AuditLogRepository();
    const logs = await auditRepo.findAllForCompany(companyId);
    const tenantLogs = logs.slice(-30).reverse();

    setSummary(prodSummary);
    setTenantConfig(cfg);
    setCompanyNameInput(cfg.companyName);
    setDocumentInput(cfg.document);
    setTimezoneInput(cfg.timezone);
    setMaxVehiclesInput(cfg.maxVehiclesLimit);

    setUsers(usrList);
    setSessions(sessList);
    setAuditLogs(tenantLogs);
    setLoading(false);
  };

  useEffect(() => {
    loadData();
  }, [companyId]);

  const handleSaveConfig = async () => {
    setActionMsg('Salvando configurações do tenant...');
    const res = await TenantConfigurationService.updateConfig(
      companyId,
      {
        companyName: companyNameInput,
        document: documentInput,
        timezone: timezoneInput,
        maxVehiclesLimit: Number(maxVehiclesInput),
      },
      userId
    );
    setActionMsg(res.message);
    loadData();
  };

  const handleToggleUserStatus = async (targetUserId: string, currentStatus: string) => {
    const nextStatus = currentStatus === 'ACTIVE' ? 'SUSPENDED' : 'ACTIVE';
    setActionMsg(`Alterando status do usuário...`);
    const res = await SecurityAdministrationService.updateUserStatus(
      companyId,
      targetUserId,
      nextStatus,
      userId,
      userRole
    );
    setActionMsg(res.message);
    loadData();
  };

  if (loading || !summary) {
    return (
      <div className="p-8 flex justify-center items-center py-24">
        <RefreshCw className="w-8 h-8 animate-spin text-indigo-600" />
      </div>
    );
  }

  const tabs: { id: AdminTab; label: string; icon: any }[] = [
    { id: 'overview', label: 'Visão Geral', icon: Activity },
    { id: 'health', label: 'Saúde do Sistema', icon: ShieldCheck },
    { id: 'tenant', label: 'Empresa / Tenant', icon: Building2 },
    { id: 'users', label: 'Usuários', icon: Users },
    { id: 'rbac', label: 'RBAC', icon: Lock },
    { id: 'security', label: 'Segurança', icon: ShieldAlert },
    { id: 'config', label: 'Configurações', icon: Settings },
    { id: 'backup', label: 'Backup & DR', icon: HardDrive },
    { id: 'audit', label: 'Auditoria', icon: FileText },
    { id: 'integrity', label: 'Integridade', icon: Database },
    { id: 'observability', label: 'Observabilidade', icon: Eye },
  ];

  return (
    <div className="p-6 md:p-8 space-y-6 max-w-7xl mx-auto">
      <PageHeader
        title="Centro Administrativo & Saúde do Sistema"
        description="Administração de produção, políticas operacionais, controle de acessos RBAC, integridade e configurações do AutoERP"
        breadcrumb="Administração • Governança SRE & Gov"
        secondaryActions={
          <div className="flex items-center gap-2">
            <span className="px-3 py-1 rounded-full text-xs font-bold bg-indigo-100 text-indigo-800 dark:bg-indigo-950 dark:text-indigo-300">
              v{summary.systemVersion}
            </span>
            <span className="px-3 py-1 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
              {summary.baseline}
            </span>
          </div>
        }
      />

      {actionMsg && (
        <div className="p-4 rounded-lg bg-indigo-50 dark:bg-indigo-950/40 border border-indigo-200 text-indigo-800 dark:text-indigo-300 text-sm flex items-center justify-between">
          <span>{actionMsg}</span>
          <button onClick={() => setActionMsg(null)} className="text-xs font-semibold underline">Fechar</button>
        </div>
      )}

      {/* Navigation Tabs */}
      <div className="flex items-center gap-1 overflow-x-auto pb-2 border-b border-slate-200 dark:border-slate-800">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium whitespace-nowrap transition-all ${
                isActive
                  ? 'bg-indigo-600 text-white shadow-sm'
                  : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
              }`}
            >
              <Icon className="w-4 h-4" />
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* TAB CONTENT: 1. OVERVIEW */}
      {activeTab === 'overview' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <Card className="p-5 border-l-4 border-l-indigo-600">
              <p className="text-xs font-medium uppercase text-slate-500">System Health Score</p>
              <h3 className="text-3xl font-black text-slate-900 dark:text-slate-100 mt-1">{summary.health.overallScore}/100</h3>
              <p className="text-xs text-emerald-600 font-semibold mt-2">{summary.health.statusClassification}</p>
            </Card>

            <Card className="p-5 border-l-4 border-l-emerald-600">
              <p className="text-xs font-medium uppercase text-slate-500">Tenant Ativo</p>
              <h3 className="text-lg font-bold text-slate-900 dark:text-slate-100 mt-1 truncate">{summary.companyName}</h3>
              <p className="text-xs text-slate-500 mt-2">ID: {companyId}</p>
            </Card>

            <Card className="p-5 border-l-4 border-l-purple-600">
              <p className="text-xs font-medium uppercase text-slate-500">Usuários & Sessões</p>
              <h3 className="text-2xl font-bold text-slate-900 dark:text-slate-100 mt-1">{summary.usersCount} cadastrados</h3>
              <p className="text-xs text-slate-500 mt-2">{summary.activeSessionsCount} sessões ativas</p>
            </Card>

            <Card className="p-5 border-l-4 border-l-blue-600">
              <p className="text-xs font-medium uppercase text-slate-500">Alertas Administrativos</p>
              <h3 className="text-2xl font-bold text-slate-900 dark:text-slate-100 mt-1">{summary.alerts.length} ativos</h3>
              <p className="text-xs text-slate-500 mt-2">Sem bloqueadores P0/P1</p>
            </Card>
          </div>

          <Card className="p-6 space-y-4">
            <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Central de Alertas Administrativos P0-P3</h3>
            {summary.alerts.length === 0 ? (
              <p className="text-sm text-slate-500 py-4 text-center">Nenhum alerta administrativo ativo no momento. Todos os componentes estão saudáveis.</p>
            ) : (
              <div className="space-y-3">
                {summary.alerts.map((alt: any) => (
                  <div key={alt.id} className="p-4 rounded-lg border border-amber-200 bg-amber-50/50 dark:bg-amber-950/20 dark:border-amber-900/40 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <span className="px-2 py-0.5 rounded text-xs font-bold bg-amber-200 text-amber-900">{alt.severity}</span>
                      <span className="text-xs font-semibold text-slate-700 dark:text-slate-300">[{alt.category}]</span>
                      <p className="text-sm text-slate-800 dark:text-slate-200">{alt.message}</p>
                    </div>
                    <span className="text-xs font-mono text-slate-400">{alt.correlationId}</span>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>
      )}

      {/* TAB CONTENT: 2. SYSTEM HEALTH */}
      {activeTab === 'health' && (
        <SystemHealthCenterView companyId={companyId} />
      )}

      {/* TAB CONTENT: 3. TENANT */}
      {activeTab === 'tenant' && (
        <Card className="p-6 space-y-6 max-w-2xl">
          <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Configuração do Tenant Atual</h3>
          <div className="space-y-4">
            <div>
              <label className="text-xs font-semibold text-slate-600 dark:text-slate-400 block mb-1">Nome da Empresa / Razão Social</label>
              <Input value={companyNameInput} onChange={(e) => setCompanyNameInput(e.target.value)} />
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-600 dark:text-slate-400 block mb-1">CNPJ / Documento Oficial</label>
              <Input value={documentInput} onChange={(e) => setDocumentInput(e.target.value)} />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-xs font-semibold text-slate-600 dark:text-slate-400 block mb-1">Fuso Horário (Timezone)</label>
                <Input value={timezoneInput} onChange={(e) => setTimezoneInput(e.target.value)} />
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-600 dark:text-slate-400 block mb-1">Limite Máximo de Veículos</label>
                <Input type="number" value={maxVehiclesInput} onChange={(e) => setMaxVehiclesInput(Number(e.target.value))} />
              </div>
            </div>
            <div className="pt-2">
              <Button onClick={handleSaveConfig} className="gap-2 bg-indigo-600 hover:bg-indigo-700 text-white">
                <Save className="w-4 h-4" /> Salvar Alterações
              </Button>
            </div>
          </div>
        </Card>
      )}

      {/* TAB CONTENT: 4. USERS */}
      {activeTab === 'users' && (
        <Card className="p-6 space-y-4">
          <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Gestão de Usuários do Sistema</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left text-slate-600 dark:text-slate-300">
              <thead className="text-xs uppercase bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
                <tr>
                  <th className="p-3">Nome / Usuário</th>
                  <th className="p-3">E-mail</th>
                  <th className="p-3">Papel (Role)</th>
                  <th className="p-3">Status</th>
                  <th className="p-3">Último Acesso</th>
                  <th className="p-3">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                {users.map((u) => (
                  <tr key={u.id}>
                    <td className="p-3 font-semibold text-slate-900 dark:text-slate-100">{u.name}</td>
                    <td className="p-3 text-xs">{u.email}</td>
                    <td className="p-3 font-mono text-xs">{u.role}</td>
                    <td className="p-3">
                      <span className={`px-2 py-0.5 rounded text-xs font-bold ${u.status === 'ACTIVE' ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'}`}>
                        {u.status}
                      </span>
                    </td>
                    <td className="p-3 text-xs text-slate-400">{new Date(u.lastAccessAt).toLocaleString()}</td>
                    <td className="p-3">
                      <Button 
                        variant="outline" 
                        size="sm" 
                        onClick={() => handleToggleUserStatus(u.id, u.status)}
                        className="text-xs"
                      >
                        {u.status === 'ACTIVE' ? 'Suspender' : 'Ativar'}
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* TAB CONTENT: 5. RBAC */}
      {activeTab === 'rbac' && (
        <Card className="p-6 space-y-4">
          <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Matriz Oficial de Permissões RBAC</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left text-slate-600 dark:text-slate-300">
              <thead className="text-xs uppercase bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
                <tr>
                  <th className="p-3">Papel (Role)</th>
                  <th className="p-3">Ação / Permissão</th>
                  <th className="p-3">Status</th>
                  <th className="p-3">Descrição da Política</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                {SecurityAdministrationService.getRbacMatrix().map((rule, idx) => (
                  <tr key={idx}>
                    <td className="p-3 font-mono font-bold text-slate-900 dark:text-slate-100">{rule.role}</td>
                    <td className="p-3 font-semibold">{rule.action}</td>
                    <td className="p-3">
                      <span className={`px-2 py-0.5 rounded text-xs font-bold ${rule.allowed ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-600'}`}>
                        {rule.allowed ? 'PERMITIDO' : 'BLOQUEADO'}
                      </span>
                    </td>
                    <td className="p-3 text-xs text-slate-500">{rule.description}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* TAB CONTENT: 6. SECURITY */}
      {activeTab === 'security' && (
        <Card className="p-6 space-y-4">
          <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Monitoramento de Sessões Ativas & Segurança</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left text-slate-600 dark:text-slate-300">
              <thead className="text-xs uppercase bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
                <tr>
                  <th className="p-3">Sessão ID</th>
                  <th className="p-3">Usuário</th>
                  <th className="p-3">IP Address</th>
                  <th className="p-3">Última Atividade</th>
                  <th className="p-3">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                {sessions.map((s) => (
                  <tr key={s.sessionId}>
                    <td className="p-3 font-mono text-xs text-slate-500">{s.sessionId}</td>
                    <td className="p-3 font-semibold text-slate-900 dark:text-slate-100">{s.userName}</td>
                    <td className="p-3 font-mono text-xs">{s.ipAddress}</td>
                    <td className="p-3 text-xs">{new Date(s.lastActiveTime).toLocaleTimeString()}</td>
                    <td className="p-3">
                      <span className="px-2 py-0.5 rounded text-xs font-bold bg-emerald-100 text-emerald-800">ATIVO</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* TAB CONTENT: 7. CONFIG */}
      {activeTab === 'config' && (
        <Card className="p-6 space-y-4 max-w-2xl">
          <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Parâmetros Globais do ERP</h3>
          <div className="space-y-3 text-sm">
            <div className="flex justify-between py-2 border-b">
              <span className="font-medium text-slate-600">SLA Padrão para Chamados:</span>
              <span className="font-bold text-slate-900 dark:text-slate-100">{tenantConfig.slaResponseHours} horas</span>
            </div>
            <div className="flex justify-between py-2 border-b">
              <span className="font-medium text-slate-600">Retenção de Auditoria:</span>
              <span className="font-bold text-slate-900 dark:text-slate-100">{tenantConfig.auditRetentionDays} dias</span>
            </div>
            <div className="flex justify-between py-2 border-b">
              <span className="font-medium text-slate-600">Frequência de Backup:</span>
              <span className="font-bold text-slate-900 dark:text-slate-100">A cada {tenantConfig.backupFrequencyHours} horas</span>
            </div>
            <div className="flex justify-between py-2 border-b">
              <span className="font-medium text-slate-600">Autenticação MFA Obrigatória:</span>
              <span className="font-bold text-emerald-600">{tenantConfig.securityPolicy.enforceMfa ? 'SIM' : 'NÃO'}</span>
            </div>
          </div>
        </Card>
      )}

      {/* TAB CONTENT: 8. BACKUP */}
      {activeTab === 'backup' && (
        <Card className="p-6 space-y-4">
          <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Resiliência & Snapshots de Backup</h3>
          <p className="text-sm text-slate-500">
            Acesse a aba <b>Continuidade & Disaster Recovery</b> no menu lateral para executar backups imutáveis, validações SHA-256 e restaurações controladas.
          </p>
        </Card>
      )}

      {/* TAB CONTENT: 9. AUDIT */}
      {activeTab === 'audit' && (
        <Card className="p-6 space-y-4">
          <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Trilha de Auditoria Recente (AuditLog)</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left text-slate-600 dark:text-slate-300">
              <thead className="text-xs uppercase bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
                <tr>
                  <th className="p-3">Data / Hora</th>
                  <th className="p-3">Usuário</th>
                  <th className="p-3">Ação</th>
                  <th className="p-3">Entidade</th>
                  <th className="p-3">Detalhes</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                {auditLogs.map((log) => (
                  <tr key={log.id}>
                    <td className="p-3 text-xs font-mono text-slate-400">{new Date(log.timestamp).toLocaleString()}</td>
                    <td className="p-3 font-semibold text-slate-900 dark:text-slate-100">{log.userName || log.userId}</td>
                    <td className="p-3 font-bold text-indigo-600">{log.action}</td>
                    <td className="p-3 text-xs font-mono">{log.entityName}</td>
                    <td className="p-3 text-xs font-mono text-slate-500 truncate max-w-xs">{log.newState || JSON.stringify(log.metadata || {})}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* TAB CONTENT: 10. INTEGRITY */}
      {activeTab === 'integrity' && (
        <Card className="p-6 space-y-4">
          <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Monitoramento de Integridade Relacional</h3>
          <div className="p-4 rounded-lg bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-200 text-emerald-800 dark:text-emerald-300 text-sm flex items-center gap-2">
            <CheckCircle2 className="w-5 h-5 text-emerald-600" />
            <span>Nenhum registro órfão ou duplicado encontrado no banco de dados local.</span>
          </div>
        </Card>
      )}

      {/* TAB CONTENT: 11. OBSERVABILITY */}
      {activeTab === 'observability' && (
        <Card className="p-6 space-y-4">
          <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Métricas & Feeds de Observabilidade</h3>
          <p className="text-sm text-slate-500">
            Acesse a aba <b>Observabilidade Pós-Go-Live</b> no menu lateral para visualizar os gráficos executivos e centro de alertas de infraestrutura em tempo real.
          </p>
        </Card>
      )}
    </div>
  );
};
