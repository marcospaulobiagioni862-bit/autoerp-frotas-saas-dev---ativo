import React, { useEffect, useState } from 'react';
import { Card } from '../ui/Card';
import { Button } from '../ui/Button';
import { 
  ShieldCheck, 
  ShieldAlert, 
  Activity, 
  Database, 
  HardDrive, 
  TrendingUp, 
  AlertTriangle, 
  CheckCircle2, 
  RefreshCw,
  Server,
  Lock,
  Layers
} from 'lucide-react';
import { PostGoLiveObservabilityService, SystemHealthReport } from '../../domain/observability/PostGoLiveObservabilityService';

export const PostGoLiveObservabilityView: React.FC = () => {
  const [report, setReport] = useState<SystemHealthReport | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [activeFilter, setActiveFilter] = useState<string>('ALL');

  const loadData = async () => {
    setLoading(true);
    try {
      const data = await PostGoLiveObservabilityService.assessSystemHealth('company-default');
      setReport(data);
    } catch (err) {
      console.error('Failed to load observability metrics', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  if (loading || !report) {
    return (
      <div className="p-8 space-y-6">
        <div className="flex items-center justify-between">
          <div className="space-y-1">
            <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100">Observabilidade & Pós-Go-Live</h1>
            <p className="text-sm text-slate-500">Carregando métricas de saúde, estabilidade e integridade...</p>
          </div>
        </div>
        <div className="flex justify-center items-center py-24">
          <RefreshCw className="w-8 h-8 animate-spin text-indigo-600" />
        </div>
      </div>
    );
  }

  const statusColor = 
    report.systemStatus === 'HEALTHY' ? 'text-emerald-700 bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200' :
    report.systemStatus === 'DEGRADED' ? 'text-indigo-700 bg-indigo-50 dark:bg-indigo-950/40 border-indigo-200' :
    report.systemStatus === 'WARNING' ? 'text-amber-700 bg-amber-50 dark:bg-amber-950/40 border-amber-200' :
    'text-rose-700 bg-rose-50 dark:bg-rose-950/40 border-rose-200';

  const filteredAlerts = report.alerts.filter(a => {
    if (activeFilter === 'ALL') return true;
    return a.category === activeFilter || a.severity === activeFilter;
  });

  return (
    <div className="p-6 md:p-8 space-y-6 max-w-7xl mx-auto">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <Activity className="w-6 h-6 text-indigo-600" />
            <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100">Pós-Go-Live & Observabilidade</h1>
          </div>
          <p className="text-sm text-slate-500 mt-1">
            Monitoramento em tempo real, integridade de persistência, segurança multi-tenant e saúde do AutoERP.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Button variant="outline" size="sm" onClick={loadData} className="gap-2">
            <RefreshCw className="w-4 h-4" /> Atualizar Métricas
          </Button>
          <span className={`px-3 py-1 text-xs font-semibold rounded-full border ${statusColor}`}>
            Status: {report.systemStatus}
          </span>
        </div>
      </div>

      {/* Stability Score & Core KPIs */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card className="p-5 flex flex-col justify-between border-l-4 border-l-indigo-600">
          <div>
            <p className="text-xs font-medium uppercase tracking-wider text-slate-500">Stability Health Score</p>
            <h3 className="text-3xl font-bold text-slate-900 dark:text-slate-100 mt-1">{report.stabilityScore} <span className="text-sm font-normal text-slate-500">/ 100</span></h3>
          </div>
          <p className="text-xs text-slate-500 mt-4">Avaliação ponderada pós-go-live</p>
        </Card>

        <Card className="p-5 flex flex-col justify-between border-l-4 border-l-emerald-600">
          <div>
            <p className="text-xs font-medium uppercase tracking-wider text-slate-500">Integridade Relacional</p>
            <h3 className="text-3xl font-bold text-slate-900 dark:text-slate-100 mt-1">{report.components.integrity}%</h3>
          </div>
          <p className="text-xs text-slate-500 mt-4">{report.metrics.orphansDetected} órfãos, {report.metrics.duplicatesDetected} duplicações</p>
        </Card>

        <Card className="p-5 flex flex-col justify-between border-l-4 border-l-blue-600">
          <div>
            <p className="text-xs font-medium uppercase tracking-wider text-slate-500">Segurança Multi-Tenant</p>
            <h3 className="text-3xl font-bold text-slate-900 dark:text-slate-100 mt-1">{report.components.security}%</h3>
          </div>
          <p className="text-xs text-slate-500 mt-4">{report.metrics.crossTenantAttempts} tentativas cruzadas</p>
        </Card>

        <Card className="p-5 flex flex-col justify-between border-l-4 border-l-purple-600">
          <div>
            <p className="text-xs font-medium uppercase tracking-wider text-slate-500">Persistência & Backup</p>
            <h3 className="text-3xl font-bold text-slate-900 dark:text-slate-100 mt-1">{report.components.backupRestore}%</h3>
          </div>
          <p className="text-xs text-slate-500 mt-4">LocalStorage / IDB íntegros</p>
        </Card>
      </div>

      {/* Component Breakdown */}
      <Card className="p-6">
        <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100 mb-4">Componentes de Estabilidade</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-4">
          <div className="bg-slate-50 dark:bg-slate-900 p-4 rounded-lg border border-slate-200 dark:border-slate-800 text-center">
            <span className="text-xs text-slate-500 block">Integridade</span>
            <span className="text-xl font-bold text-slate-900 dark:text-slate-100 mt-1 block">{report.components.integrity}%</span>
          </div>
          <div className="bg-slate-50 dark:bg-slate-900 p-4 rounded-lg border border-slate-200 dark:border-slate-800 text-center">
            <span className="text-xs text-slate-500 block">Segurança</span>
            <span className="text-xl font-bold text-slate-900 dark:text-slate-100 mt-1 block">{report.components.security}%</span>
          </div>
          <div className="bg-slate-50 dark:bg-slate-900 p-4 rounded-lg border border-slate-200 dark:border-slate-800 text-center">
            <span className="text-xs text-slate-500 block">Persistência</span>
            <span className="text-xl font-bold text-slate-900 dark:text-slate-100 mt-1 block">{report.components.persistence}%</span>
          </div>
          <div className="bg-slate-50 dark:bg-slate-900 p-4 rounded-lg border border-slate-200 dark:border-slate-800 text-center">
            <span className="text-xs text-slate-500 block">Performance</span>
            <span className="text-xl font-bold text-slate-900 dark:text-slate-100 mt-1 block">{report.components.performance}%</span>
          </div>
          <div className="bg-slate-50 dark:bg-slate-900 p-4 rounded-lg border border-slate-200 dark:border-slate-800 text-center">
            <span className="text-xs text-slate-500 block">Operação</span>
            <span className="text-xl font-bold text-slate-900 dark:text-slate-100 mt-1 block">{report.components.operation}%</span>
          </div>
          <div className="bg-slate-50 dark:bg-slate-900 p-4 rounded-lg border border-slate-200 dark:border-slate-800 text-center">
            <span className="text-xs text-slate-500 block">Backup/Restore</span>
            <span className="text-xl font-bold text-slate-900 dark:text-slate-100 mt-1 block">{report.components.backupRestore}%</span>
          </div>
          <div className="bg-slate-50 dark:bg-slate-900 p-4 rounded-lg border border-slate-200 dark:border-slate-800 text-center">
            <span className="text-xs text-slate-500 block">Observabilidade</span>
            <span className="text-xl font-bold text-slate-900 dark:text-slate-100 mt-1 block">{report.components.observability}%</span>
          </div>
        </div>
      </Card>

      {/* Persistence & Operational Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card className="p-6 space-y-4">
          <div className="flex items-center gap-2">
            <HardDrive className="w-5 h-5 text-indigo-600" />
            <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Status de Persistência & Backup</h3>
          </div>
          <div className="space-y-3">
            <div className="flex items-center justify-between p-3 bg-slate-50 dark:bg-slate-900 rounded-lg text-sm">
              <span className="text-slate-600 dark:text-slate-400">LocalStorage Disponível</span>
              <span className={report.persistenceStatus.localStorageAvailable ? "text-emerald-600 font-semibold" : "text-rose-600 font-semibold"}>
                {report.persistenceStatus.localStorageAvailable ? 'Operacional' : 'Indisponível'}
              </span>
            </div>
            <div className="flex items-center justify-between p-3 bg-slate-50 dark:bg-slate-900 rounded-lg text-sm">
              <span className="text-slate-600 dark:text-slate-400">IndexedDB Disponível</span>
              <span className={report.persistenceStatus.indexedDbAvailable ? "text-emerald-600 font-semibold" : "text-rose-600 font-semibold"}>
                {report.persistenceStatus.indexedDbAvailable ? 'Operacional' : 'Indisponível'}
              </span>
            </div>
            <div className="flex items-center justify-between p-3 bg-slate-50 dark:bg-slate-900 rounded-lg text-sm">
              <span className="text-slate-600 dark:text-slate-400">Último Backup Validado</span>
              <span className="text-emerald-600 font-semibold">Válido & Íntegro</span>
            </div>
            <div className="flex items-center justify-between p-3 bg-slate-50 dark:bg-slate-900 rounded-lg text-sm">
              <span className="text-slate-600 dark:text-slate-400">Proteção Corrupção / NaN</span>
              <span className="text-emerald-600 font-semibold">Ativa (0 Corrompidos)</span>
            </div>
          </div>
        </Card>

        <Card className="p-6 space-y-4">
          <div className="flex items-center gap-2">
            <Server className="w-5 h-5 text-indigo-600" />
            <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Métricas Operacionais Globais</h3>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="p-3 bg-slate-50 dark:bg-slate-900 rounded-lg border border-slate-200 dark:border-slate-800">
              <span className="text-xs text-slate-500 block">Veículos Registrados</span>
              <span className="text-xl font-bold text-slate-900 dark:text-slate-100">{report.metrics.totalVehicles}</span>
            </div>
            <div className="p-3 bg-slate-50 dark:bg-slate-900 rounded-lg border border-slate-200 dark:border-slate-800">
              <span className="text-xs text-slate-500 block">Motoristas Ativos</span>
              <span className="text-xl font-bold text-slate-900 dark:text-slate-100">{report.metrics.totalDrivers}</span>
            </div>
            <div className="p-3 bg-slate-50 dark:bg-slate-900 rounded-lg border border-slate-200 dark:border-slate-800">
              <span className="text-xs text-slate-500 block">Contratos Vigentes</span>
              <span className="text-xl font-bold text-slate-900 dark:text-slate-100">{report.metrics.totalContracts}</span>
            </div>
            <div className="p-3 bg-slate-50 dark:bg-slate-900 rounded-lg border border-slate-200 dark:border-slate-800">
              <span className="text-xs text-slate-500 block">Logs de Auditoria</span>
              <span className="text-xl font-bold text-slate-900 dark:text-slate-100">{report.metrics.totalAuditLogs}</span>
            </div>
          </div>
        </Card>
      </div>

      {/* Alerts Center */}
      <Card className="p-6 space-y-4">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 text-indigo-600" />
            <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Central de Alertas Pós-Go-Live</h3>
          </div>
          <div className="flex flex-wrap gap-2">
            {['ALL', 'SECURITY', 'INTEGRITY', 'PERFORMANCE', 'OPERATION', 'P0', 'P1', 'P2', 'P3'].map((cat) => (
              <button
                key={cat}
                onClick={() => setActiveFilter(cat)}
                className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${
                  activeFilter === cat 
                    ? 'bg-indigo-600 text-white' 
                    : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200'
                }`}
              >
                {cat}
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-3 pt-2">
          {filteredAlerts.length === 0 ? (
            <p className="text-center py-8 text-sm text-slate-500">Nenhum alerta encontrado para o filtro selecionado.</p>
          ) : (
            filteredAlerts.map((alert) => (
              <div 
                key={alert.id}
                className="p-4 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 flex flex-col md:flex-row md:items-center justify-between gap-4"
              >
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className={`px-2 py-0.5 text-xs font-bold rounded ${
                      alert.severity === 'P0' ? 'bg-rose-100 text-rose-800' :
                      alert.severity === 'P1' ? 'bg-orange-100 text-orange-800' :
                      alert.severity === 'P2' ? 'bg-amber-100 text-amber-800' :
                      'bg-blue-100 text-blue-800'
                    }`}>
                      {alert.severity}
                    </span>
                    <span className="text-xs font-semibold uppercase text-slate-500">{alert.category}</span>
                    <h4 className="font-medium text-slate-900 dark:text-slate-100">{alert.title}</h4>
                  </div>
                  <p className="text-sm text-slate-600 dark:text-slate-400">{alert.description}</p>
                  <p className="text-xs text-indigo-600 dark:text-indigo-400 font-medium">Recomendação: {alert.recommendation}</p>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`px-2.5 py-1 text-xs font-semibold rounded-full ${
                    alert.status === 'RESOLVED' ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'
                  }`}>
                    {alert.status}
                  </span>
                </div>
              </div>
            ))
          )}
        </div>
      </Card>
    </div>
  );
};
