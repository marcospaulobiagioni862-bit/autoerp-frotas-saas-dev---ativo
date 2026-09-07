// src/components/admin/SystemHealthCenterView.tsx
import React, { useState, useEffect } from 'react';
import { Card } from '../ui/Card';
import { Button } from '../ui/Button';
import { 
  Activity, 
  ShieldCheck, 
  Database, 
  HardDrive, 
  Lock, 
  Users, 
  CheckCircle2, 
  AlertTriangle, 
  XCircle, 
  RefreshCw, 
  Cpu, 
  Settings, 
  Server, 
  Eye
} from 'lucide-react';
import { SystemHealthService } from '../../domain/admin/SystemHealthService';
import { SystemHealthBreakdown, ComponentHealthStatus } from '../../domain/admin/types';

export const SystemHealthCenterView: React.FC<{ companyId?: string }> = ({ companyId = 'company-default' }) => {
  const [health, setHealth] = useState<SystemHealthBreakdown | null>(null);
  const [loading, setLoading] = useState<boolean>(true);

  const loadData = () => {
    setLoading(true);
    const data = SystemHealthService.calculateSystemHealth(companyId);
    setHealth(data);
    setLoading(false);
  };

  useEffect(() => {
    loadData();
  }, [companyId]);

  if (loading || !health) {
    return (
      <div className="p-8 flex justify-center items-center py-24">
        <RefreshCw className="w-8 h-8 animate-spin text-indigo-600" />
      </div>
    );
  }

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'HEALTHY':
        return <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-800 dark:bg-emerald-950/80 dark:text-emerald-300"><CheckCircle2 className="w-3.5 h-3.5" /> Operacional</span>;
      case 'WARNING':
        return <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-100 text-amber-800 dark:bg-amber-950/80 dark:text-amber-300"><AlertTriangle className="w-3.5 h-3.5" /> Atenção</span>;
      case 'CRITICAL':
        return <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-rose-100 text-rose-800 dark:bg-rose-950/80 dark:text-rose-300"><XCircle className="w-3.5 h-3.5" /> Crítico</span>;
      default:
        return <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-300">Desconhecido</span>;
    }
  };

  const componentsList: ComponentHealthStatus[] = [
    health.persistence,
    health.backup,
    health.restore,
    health.auditLog,
    health.multiTenancy,
    health.rbac,
    health.integrity,
    health.observability,
    health.performance,
    health.configuration,
    health.security,
    health.continuity,
  ];

  return (
    <div className="space-y-6">
      {/* Top Banner & Health Score */}
      <div className="bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 rounded-2xl p-6 text-white shadow-xl flex flex-col md:flex-row md:items-center justify-between gap-6 border border-slate-800">
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <Activity className="w-6 h-6 text-indigo-400" />
            <h2 className="text-2xl font-bold tracking-tight">Centro de Saúde e Diagnóstico Técnico</h2>
          </div>
          <p className="text-sm text-slate-300 max-w-2xl">
            Monitoramento determinístico em tempo real da integridade estrutural, persistência, resiliência, isolamento multi-tenant e segurança do MoveFlex.
          </p>
        </div>

        <div className="flex items-center gap-6 bg-white/10 dark:bg-slate-900/40 backdrop-blur-md px-6 py-4 rounded-xl border border-white/10">
          <div className="text-right">
            <span className="text-xs uppercase tracking-wider font-semibold text-slate-300">Classificação</span>
            <p className="text-lg font-extrabold text-emerald-400">{health.statusClassification}</p>
          </div>
          <div className="h-10 w-px bg-white/20" />
          <div className="text-center">
            <span className="text-xs uppercase tracking-wider font-semibold text-slate-300">Health Score</span>
            <div className="text-3xl font-black text-white flex items-baseline gap-1">
              {health.overallScore} <span className="text-sm text-slate-400 font-normal">/100</span>
            </div>
          </div>
        </div>
      </div>

      {/* 10 KPI Cards Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3">
        <Card className="p-4 border-l-4 border-l-emerald-500">
          <p className="text-xs text-slate-500 font-medium truncate">1. Persistência</p>
          <p className="text-lg font-bold text-slate-900 dark:text-slate-100 mt-1">{health.persistence.score}%</p>
          <span className="text-[10px] text-slate-400">LocalStorage/IDB</span>
        </Card>

        <Card className="p-4 border-l-4 border-l-indigo-500">
          <p className="text-xs text-slate-500 font-medium truncate">2. Backup & DR</p>
          <p className="text-lg font-bold text-slate-900 dark:text-slate-100 mt-1">{health.backup.score}%</p>
          <span className="text-[10px] text-slate-400">SHA-256 Validado</span>
        </Card>

        <Card className="p-4 border-l-4 border-l-purple-500">
          <p className="text-xs text-slate-500 font-medium truncate">3. Restore / Rollback</p>
          <p className="text-lg font-bold text-slate-900 dark:text-slate-100 mt-1">{health.restore.score}%</p>
          <span className="text-[10px] text-slate-400">Snapshots Prontos</span>
        </Card>

        <Card className="p-4 border-l-4 border-l-blue-500">
          <p className="text-xs text-slate-500 font-medium truncate">4. Multi-Tenancy</p>
          <p className="text-lg font-bold text-slate-900 dark:text-slate-100 mt-1">{health.multiTenancy.score}%</p>
          <span className="text-[10px] text-slate-400">Isolamento Ativo</span>
        </Card>

        <Card className="p-4 border-l-4 border-l-teal-500">
          <p className="text-xs text-slate-500 font-medium truncate">5. RBAC & Acessos</p>
          <p className="text-lg font-bold text-slate-900 dark:text-slate-100 mt-1">{health.rbac.score}%</p>
          <span className="text-[10px] text-slate-400">Matriz Validade</span>
        </Card>

        <Card className="p-4 border-l-4 border-l-cyan-500">
          <p className="text-xs text-slate-500 font-medium truncate">6. AuditLog</p>
          <p className="text-lg font-bold text-slate-900 dark:text-slate-100 mt-1">{health.auditLog.score}%</p>
          <span className="text-[10px] text-slate-400">Correlation ID</span>
        </Card>

        <Card className="p-4 border-l-4 border-l-amber-500">
          <p className="text-xs text-slate-500 font-medium truncate">7. Integridade</p>
          <p className="text-lg font-bold text-slate-900 dark:text-slate-100 mt-1">{health.integrity.score}%</p>
          <span className="text-[10px] text-slate-400">Zero Órfãos</span>
        </Card>

        <Card className="p-4 border-l-4 border-l-rose-500">
          <p className="text-xs text-slate-500 font-medium truncate">8. Performance</p>
          <p className="text-lg font-bold text-slate-900 dark:text-slate-100 mt-1">{health.performance.score}%</p>
          <span className="text-[10px] text-slate-400">SLA Resposta</span>
        </Card>

        <Card className="p-4 border-l-4 border-l-violet-500">
          <p className="text-xs text-slate-500 font-medium truncate">9. Segurança</p>
          <p className="text-lg font-bold text-slate-900 dark:text-slate-100 mt-1">{health.security.score}%</p>
          <span className="text-[10px] text-slate-400">Sessões Monitoradas</span>
        </Card>

        <Card className="p-4 border-l-4 border-l-slate-500">
          <p className="text-xs text-slate-500 font-medium truncate">10. Configuração</p>
          <p className="text-lg font-bold text-slate-900 dark:text-slate-100 mt-1">{health.configuration.score}%</p>
          <span className="text-[10px] text-slate-400">Tenant Válido</span>
        </Card>
      </div>

      {/* Component Details Table */}
      <Card className="p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Diagnóstico Detalhado por Subsistema</h3>
          <Button variant="outline" size="sm" onClick={loadData} className="gap-2">
            <RefreshCw className="w-4 h-4" /> Recalcular Diagnóstico
          </Button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left text-slate-600 dark:text-slate-300">
            <thead className="text-xs uppercase bg-slate-100 dark:bg-slate-800/60 text-slate-700 dark:text-slate-300">
              <tr>
                <th className="p-3 font-semibold">Componente / Subsistema</th>
                <th className="p-3 font-semibold">Status</th>
                <th className="p-3 font-semibold">Score</th>
                <th className="p-3 font-semibold">Diagnóstico & Evidência</th>
                <th className="p-3 font-semibold">Última Checagem</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
              {componentsList.map((comp, idx) => (
                <tr key={idx} className="hover:bg-slate-50 dark:hover:bg-slate-900/40 transition-colors">
                  <td className="p-3 font-semibold text-slate-900 dark:text-slate-100">{comp.componentName}</td>
                  <td className="p-3">{getStatusBadge(comp.status)}</td>
                  <td className="p-3 font-bold text-slate-900 dark:text-slate-100">{comp.score}/100</td>
                  <td className="p-3 text-xs text-slate-600 dark:text-slate-400">{comp.details}</td>
                  <td className="p-3 text-xs font-mono text-slate-400">{new Date(comp.lastCheckedAt).toLocaleTimeString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
};
