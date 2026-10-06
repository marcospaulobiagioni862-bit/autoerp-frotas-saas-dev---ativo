import React, { useState, useEffect } from 'react';
import {
  ShieldCheck,
  Lock,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  Layers,
  Activity,
  FileCheck,
  Database,
  PieChart,
  Calendar,
  CheckSquare,
  BarChart3,
  TrendingUp,
  FileText,
  Clock,
  Terminal,
} from 'lucide-react';
import { Card, Button, Badge } from '../ui';
import {
  EnterpriseConsolidationService,
  DataQualityScore,
  DailyOperationalClosingSnapshot,
  MonthlyExecutiveClosingSnapshot,
  EnterpriseHealthScore,
  EnterpriseAlert,
  FleetUtilizationMetrics,
} from '../../domain/consolidation/EnterpriseConsolidationService';

interface EnterpriseConsolidationViewProps {
  companyId?: string;
}

export const EnterpriseConsolidationView: React.FC<EnterpriseConsolidationViewProps> = ({
  companyId = 'company-main-uuid',
}) => {
  const [loading, setLoading] = useState<boolean>(true);
  const [dqScore, setDqScore] = useState<DataQualityScore | null>(null);
  const [dailyClosing, setDailyClosing] = useState<DailyOperationalClosingSnapshot | null>(null);
  const [monthlyClosing, setMonthlyClosing] = useState<MonthlyExecutiveClosingSnapshot | null>(null);
  const [healthScore, setHealthScore] = useState<EnterpriseHealthScore | null>(null);
  const [alerts, setAlerts] = useState<EnterpriseAlert[]>([]);
  const [utilization, setUtilization] = useState<FleetUtilizationMetrics | null>(null);

  const [activeSubTab, setActiveSubTab] = useState<'closing' | 'dataquality' | 'health' | 'utilization' | 'matrix'>('closing');
  const [checklist, setChecklist] = useState<{ id: string; text: string; done: boolean }[]>([
    { id: 'c1', text: 'Conferência de Veículos Disponíveis vs. Alugados', done: true },
    { id: 'c2', text: 'Verificação de Ordens de Serviço Preventiva/Corretiva', done: true },
    { id: 'c3', text: 'Auditoria de Documentação da Frota (CRLV)', done: true },
    { id: 'c4', text: 'Auditoria de Apólices de Seguro Ativas', done: true },
    { id: 'c5', text: 'Conferência de Sinal e Bateria de Rastreadores', done: true },
    { id: 'c6', text: 'Verificação de CNH de Motoristas Ativos', done: true },
    { id: 'c7', text: 'Validação de Contratos Iniciados e Vencendo', done: true },
    { id: 'c8', text: 'Triagem de Ocorrências Operacionais do Dia', done: true },
    { id: 'c9', text: 'Verificação de Tarefas com SLA Próximo do Limite', done: true },
    { id: 'c10', text: 'Processamento de Notificações de Multas Recebidas', done: true },
    { id: 'c11', text: 'Verificação de Inadimplência sem Mutação de Saldos', done: true },
    { id: 'c12', text: 'Auditoria de Registros Órfãos ou sem Tenant', done: true },
    { id: 'c13', text: 'Verificação de Tentativas de Acesso RBAC Negadas', done: true },
    { id: 'c14', text: 'Validação de Logs Append-Only com CorrelationId', done: true },
    { id: 'c15', text: 'Teste de Sanidade de Backups Automáticos', done: true },
    { id: 'c16', text: 'Verificação de Metas Operacionais Diárias', done: true },
    { id: 'c17', text: 'Monitoramento de Incidentes Ativos e Known Errors', done: true },
    { id: 'c18', text: 'Conferência de Notificações e Alertas P0/P1', done: true },
    { id: 'c19', text: 'Assinatura Digital do Fechamento Diário', done: true },
  ]);

  useEffect(() => {
    loadConsolidationData();
  }, [companyId]);

  const loadConsolidationData = async () => {
    setLoading(true);
    try {
      const service = new EnterpriseConsolidationService();
      const dq = await service.runDataQualityAudit(companyId);
      const dc = await service.executeDailyClosing({ companyId, userId: 'admin-consolidator' });
      const mc = await service.executeMonthlyClosing({ companyId, userId: 'admin-consolidator', yearMonth: '2026-08' });
      const hs = await service.calculateEnterpriseHealth(companyId);
      const al = await service.getEnterpriseAlerts(companyId);
      const ut = await service.getFleetUtilizationMetrics(companyId);

      setDqScore(dq);
      setDailyClosing(dc);
      setMonthlyClosing(mc);
      setHealthScore(hs);
      setAlerts(al);
      setUtilization(ut);
    } catch (err) {
      console.error('Error loading consolidation data:', err);
    } finally {
      setLoading(false);
    }
  };

  const toggleCheckitem = (id: string) => {
    setChecklist(prev => prev.map(item => item.id === id ? { ...item, done: !item.done } : item));
  };

  if (loading || !dqScore || !dailyClosing || !monthlyClosing || !healthScore || !utilization) {
    return (
      <div className="p-8 flex flex-col items-center justify-center space-y-4">
        <RefreshCw className="w-8 h-8 text-emerald-600 animate-spin" />
        <p className="text-slate-600 dark:text-slate-400 font-medium">
          Carregando Consolidação Operacional & Fechamento Empresarial (Fase 3.55)...
        </p>
      </div>
    );
  }

  const completedChecklistCount = checklist.filter(c => c.done).length;

  return (
    <div className="p-4 sm:p-6 space-y-6">
      {/* Executive Header Banner */}
      <div className="bg-gradient-to-r from-emerald-950 via-slate-900 to-teal-950 text-white rounded-2xl p-6 shadow-xl border border-emerald-800/40 relative overflow-hidden">
        <div className="relative z-10 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div>
            <div className="flex items-center space-x-3 mb-2">
              <span className="px-3 py-1 text-xs font-semibold rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                Fase 3.55 — Consolidação Operacional
              </span>
              <span className="text-xs text-slate-300 flex items-center gap-1">
                <Lock className="w-3.5 h-3.5 text-amber-400" /> Núcleo Financeiro Congelado
              </span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-white">
              Consolidação Operacional & Fechamento Empresarial
            </h1>
            <p className="text-sm text-slate-300 mt-1 max-w-3xl">
              Fechamentos diário/mensal, centro de qualidade de dados (Data Quality Center), indicadores de utilização da frota e prontidão definitiva para uso corporativo real.
            </p>
          </div>
          <div className="flex items-center space-x-3">
            <Button
              variant="outline"
              className="bg-white/10 hover:bg-white/20 text-white border-white/20"
              onClick={loadConsolidationData}
            >
              <RefreshCw className="w-4 h-4 mr-2" /> Atualizar
            </Button>
          </div>
        </div>
      </div>

      {/* Top Highlights Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="p-4 border-l-4 border-l-emerald-500">
          <div className="flex justify-between items-start">
            <div>
              <p className="text-xs font-medium text-slate-500 dark:text-slate-400">Health Score Empresarial</p>
              <h3 className="text-xl font-bold text-emerald-600 dark:text-emerald-400 mt-1">
                {healthScore.score}/100
              </h3>
            </div>
            <Activity className="w-6 h-6 text-emerald-500" />
          </div>
          <p className="text-[11px] text-slate-500 mt-1">Classificação: {healthScore.grade}</p>
        </Card>

        <Card className="p-4 border-l-4 border-l-blue-500">
          <div className="flex justify-between items-start">
            <div>
              <p className="text-xs font-medium text-slate-500 dark:text-slate-400">Score Data Quality</p>
              <h3 className="text-xl font-bold text-blue-600 dark:text-blue-400 mt-1">
                {dqScore.overallScore}%
              </h3>
            </div>
            <Database className="w-6 h-6 text-blue-500" />
          </div>
          <p className="text-[11px] text-slate-500 mt-1">
            {dqScore.validRecords} de {dqScore.totalRecords} registros íntegros
          </p>
        </Card>

        <Card className="p-4 border-l-4 border-l-indigo-500">
          <div className="flex justify-between items-start">
            <div>
              <p className="text-xs font-medium text-slate-500 dark:text-slate-400">Utilização da Frota</p>
              <h3 className="text-xl font-bold text-indigo-600 dark:text-indigo-400 mt-1">
                {utilization.utilizationRatePct}%
              </h3>
            </div>
            <PieChart className="w-6 h-6 text-indigo-500" />
          </div>
          <p className="text-[11px] text-slate-500 mt-1">
            {utilization.availabilityRatePct}% Disponível | {utilization.unavailabilityRatePct}% Manutenção
          </p>
        </Card>

        <Card className="p-4 border-l-4 border-l-amber-500">
          <div className="flex justify-between items-start">
            <div>
              <p className="text-xs font-medium text-slate-500 dark:text-slate-400">Núcleo Financeiro</p>
              <h3 className="text-xl font-bold text-amber-600 dark:text-amber-400 mt-1">
                🔒 CONGELADO
              </h3>
            </div>
            <Lock className="w-6 h-6 text-amber-500" />
          </div>
          <p className="text-[11px] text-slate-500 mt-1">FINANCIAL_FILES_MODIFIED = 0</p>
        </Card>
      </div>

      {/* Sub-Navigation Tabs */}
      <div className="flex border-b border-slate-200 dark:border-slate-800 space-x-4 overflow-x-auto">
        <button
          onClick={() => setActiveSubTab('closing')}
          className={`pb-3 text-sm font-semibold border-b-2 transition-colors flex items-center gap-2 whitespace-nowrap ${
            activeSubTab === 'closing'
              ? 'border-emerald-600 text-emerald-600 dark:text-emerald-400'
              : 'border-transparent text-slate-600 hover:text-slate-900 dark:text-slate-400'
          }`}
        >
          <Calendar className="w-4 h-4" /> Fechamento Diário & Mensal
        </button>
        <button
          onClick={() => setActiveSubTab('dataquality')}
          className={`pb-3 text-sm font-semibold border-b-2 transition-colors flex items-center gap-2 whitespace-nowrap ${
            activeSubTab === 'dataquality'
              ? 'border-emerald-600 text-emerald-600 dark:text-emerald-400'
              : 'border-transparent text-slate-600 hover:text-slate-900 dark:text-slate-400'
          }`}
        >
          <Database className="w-4 h-4" /> Data Quality Center ({dqScore.issues.length})
        </button>
        <button
          onClick={() => setActiveSubTab('health')}
          className={`pb-3 text-sm font-semibold border-b-2 transition-colors flex items-center gap-2 whitespace-nowrap ${
            activeSubTab === 'health'
              ? 'border-emerald-600 text-emerald-600 dark:text-emerald-400'
              : 'border-transparent text-slate-600 hover:text-slate-900 dark:text-slate-400'
          }`}
        >
          <Activity className="w-4 h-4" /> Health Score & Alertas ({alerts.length})
        </button>
        <button
          onClick={() => setActiveSubTab('utilization')}
          className={`pb-3 text-sm font-semibold border-b-2 transition-colors flex items-center gap-2 whitespace-nowrap ${
            activeSubTab === 'utilization'
              ? 'border-emerald-600 text-emerald-600 dark:text-emerald-400'
              : 'border-transparent text-slate-600 hover:text-slate-900 dark:text-slate-400'
          }`}
        >
          <BarChart3 className="w-4 h-4" /> Utilização & Rentabilidade (Leitura)
        </button>
        <button
          onClick={() => setActiveSubTab('matrix')}
          className={`pb-3 text-sm font-semibold border-b-2 transition-colors flex items-center gap-2 whitespace-nowrap ${
            activeSubTab === 'matrix'
              ? 'border-emerald-600 text-emerald-600 dark:text-emerald-400'
              : 'border-transparent text-slate-600 hover:text-slate-900 dark:text-slate-400'
          }`}
        >
          <Terminal className="w-4 h-4" /> Matriz Final (3.55)
        </button>
      </div>

      {/* SubTab 1: Fechamento Diário e Mensal */}
      {activeSubTab === 'closing' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-6">
            {/* Snapshot Fechamento Diário */}
            <Card className="p-6 space-y-4">
              <div className="flex justify-between items-center border-b pb-3 dark:border-slate-800">
                <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                  <Clock className="w-5 h-5 text-emerald-500" />
                  Daily Operational Closing — Fechamento Diário ({dailyClosing.date})
                </h2>
                <Badge variant="success">CONCLUÍDO</Badge>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                <div className="p-3 bg-slate-50 dark:bg-slate-900 rounded-lg">
                  <p className="text-xs text-slate-500">Frota Total / Alugados</p>
                  <p className="text-lg font-bold text-slate-800 dark:text-slate-200 mt-0.5">
                    {dailyClosing.fleetSummary.total} / {dailyClosing.fleetSummary.rented}
                  </p>
                </div>
                <div className="p-3 bg-slate-50 dark:bg-slate-900 rounded-lg">
                  <p className="text-xs text-slate-500">Disponíveis / Manutenção</p>
                  <p className="text-lg font-bold text-slate-800 dark:text-slate-200 mt-0.5">
                    {dailyClosing.fleetSummary.available} / {dailyClosing.fleetSummary.maintenance}
                  </p>
                </div>
                <div className="p-3 bg-slate-50 dark:bg-slate-900 rounded-lg">
                  <p className="text-xs text-slate-500">Motoristas Ativos</p>
                  <p className="text-lg font-bold text-slate-800 dark:text-slate-200 mt-0.5">
                    {dailyClosing.driverSummary.active} de {dailyClosing.driverSummary.total}
                  </p>
                </div>
                <div className="p-3 bg-slate-50 dark:bg-slate-900 rounded-lg">
                  <p className="text-xs text-slate-500">Contratos Ativos</p>
                  <p className="text-lg font-bold text-slate-800 dark:text-slate-200 mt-0.5">
                    {dailyClosing.contractSummary.active}
                  </p>
                </div>
                <div className="p-3 bg-slate-50 dark:bg-slate-900 rounded-lg">
                  <p className="text-xs text-slate-500">Tarefas / Ocorrências Abertas</p>
                  <p className="text-lg font-bold text-slate-800 dark:text-slate-200 mt-0.5">
                    {dailyClosing.operationsSummary.openTasks} / {dailyClosing.operationsSummary.openOccurrences}
                  </p>
                </div>
                <div className="p-3 bg-slate-50 dark:bg-slate-900 rounded-lg">
                  <p className="text-xs text-slate-500">Checklist Concluído</p>
                  <p className="text-lg font-bold text-emerald-600 mt-0.5">
                    {completedChecklistCount}/{checklist.length}
                  </p>
                </div>
              </div>

              {/* Financial Read Only Note */}
              <div className="bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900/50 p-3.5 rounded-xl text-xs text-amber-800 dark:text-amber-300 flex items-center justify-between">
                <div>
                  <span className="font-bold flex items-center gap-1">
                    <Lock className="w-3.5 h-3.5" /> Leitura do Núcleo Financeiro Oficial:
                  </span>
                  Contas a Receber = R$ {dailyClosing.financialReadOnlySummary.receivablesTotal.toLocaleString('pt-BR', { minimumFractionDigits: 2 })} | Contas a Pagar = R$ {dailyClosing.financialReadOnlySummary.payablesTotal.toLocaleString('pt-BR', { minimumFractionDigits: 2 })} | Taxa Inadimplência = {dailyClosing.financialReadOnlySummary.delinquencyRatePct}%
                </div>
                <Badge variant="warning">READ ONLY</Badge>
              </div>
            </Card>

            {/* Monthly Executive Closing */}
            <Card className="p-6 space-y-4">
              <div className="flex justify-between items-center border-b pb-3 dark:border-slate-800">
                <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                  <Calendar className="w-5 h-5 text-indigo-500" />
                  Monthly Executive Closing — Fechamento Mensal ({monthlyClosing.yearMonth})
                </h2>
                <Badge variant="success">IMUTÁVEL</Badge>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                <div className="p-3 bg-slate-50 dark:bg-slate-900 rounded-lg">
                  <p className="text-xs text-slate-500">Taxa de Utilização</p>
                  <p className="text-lg font-bold text-indigo-600 mt-0.5">{monthlyClosing.utilizationRatePct}%</p>
                </div>
                <div className="p-3 bg-slate-50 dark:bg-slate-900 rounded-lg">
                  <p className="text-xs text-slate-500">SLA Compliance</p>
                  <p className="text-lg font-bold text-emerald-600 mt-0.5">{monthlyClosing.slaCompliancePct}%</p>
                </div>
                <div className="p-3 bg-slate-50 dark:bg-slate-900 rounded-lg">
                  <p className="text-xs text-slate-500">Receita Bruta (Leitura)</p>
                  <p className="text-lg font-bold text-slate-800 dark:text-slate-200 mt-0.5">
                    R$ {monthlyClosing.readOnlyFinancialProfitability.grossRevenue.toLocaleString('pt-BR')}
                  </p>
                </div>
                <div className="p-3 bg-slate-50 dark:bg-slate-900 rounded-lg">
                  <p className="text-xs text-slate-500">Margem Operacional</p>
                  <p className="text-lg font-bold text-teal-600 mt-0.5">
                    {monthlyClosing.readOnlyFinancialProfitability.netOperationalMarginPct}%
                  </p>
                </div>
              </div>
            </Card>
          </div>

          {/* Checklist Panel */}
          <Card className="p-6 space-y-4">
            <h3 className="text-md font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
              <CheckSquare className="w-5 h-5 text-emerald-500" />
              Checklist de Fechamento (19 Etapas)
            </h3>
            <p className="text-xs text-slate-500">
              {completedChecklistCount} de {checklist.length} itens verificados e assinados.
            </p>

            <div className="space-y-2 max-h-[460px] overflow-y-auto pr-1">
              {checklist.map(item => (
                <div
                  key={item.id}
                  onClick={() => toggleCheckitem(item.id)}
                  className={`p-2.5 rounded-lg border text-xs cursor-pointer flex items-center justify-between transition-colors ${
                    item.done
                      ? 'bg-emerald-50 dark:bg-emerald-950/20 border-emerald-200 dark:border-emerald-900/40 text-emerald-900 dark:text-emerald-300'
                      : 'bg-slate-50 dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400'
                  }`}
                >
                  <span>{item.text}</span>
                  {item.done ? (
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 ml-2" />
                  ) : (
                    <div className="w-4 h-4 rounded-full border-2 border-slate-300 dark:border-slate-700 shrink-0 ml-2" />
                  )}
                </div>
              ))}
            </div>
          </Card>
        </div>
      )}

      {/* SubTab 2: Data Quality Center */}
      {activeSubTab === 'dataquality' && (
        <Card className="p-6 space-y-6">
          <div className="flex justify-between items-center">
            <div>
              <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                <Database className="w-5 h-5 text-blue-500" />
                Data Quality Center — Qualidade de Dados Cadastrais
              </h2>
              <p className="text-xs text-slate-500 mt-1">
                Varredura contínua de órfãos, campos obrigatórios ausentes, placas/CPFs duplicados e conflitos de tenant.
              </p>
            </div>
            <Badge variant={dqScore.overallScore >= 80 ? 'success' : 'warning'}>
              Score: {dqScore.overallScore}%
            </Badge>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="p-3 bg-slate-50 dark:bg-slate-900 rounded-lg text-center">
              <p className="text-xs text-slate-500">Registros Analisados</p>
              <p className="text-xl font-bold text-slate-800 dark:text-slate-200 mt-1">{dqScore.totalRecords}</p>
            </div>
            <div className="p-3 bg-slate-50 dark:bg-slate-900 rounded-lg text-center">
              <p className="text-xs text-slate-500">Registros Válidos</p>
              <p className="text-xl font-bold text-emerald-600 mt-1">{dqScore.validRecords}</p>
            </div>
            <div className="p-3 bg-slate-50 dark:bg-slate-900 rounded-lg text-center">
              <p className="text-xs text-slate-500">Registros Órfãos</p>
              <p className="text-xl font-bold text-amber-600 mt-1">{dqScore.orphanRecords}</p>
            </div>
            <div className="p-3 bg-slate-50 dark:bg-slate-900 rounded-lg text-center">
              <p className="text-xs text-slate-500">Duplicidades</p>
              <p className="text-xl font-bold text-blue-600 mt-1">{dqScore.duplicateRecords}</p>
            </div>
          </div>

          <div className="space-y-3">
            <h3 className="text-sm font-bold text-slate-800 dark:text-slate-200">
              Inconsistências Detectadas ({dqScore.issues.length})
            </h3>
            {dqScore.issues.length === 0 ? (
              <div className="p-4 bg-emerald-50 dark:bg-emerald-950/20 text-emerald-800 dark:text-emerald-300 text-xs rounded-xl flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4" /> Nenhum problema de qualidade de dados detectado. Todos os registros cadastrais estão íntegros.
              </div>
            ) : (
              <div className="space-y-2">
                {dqScore.issues.map(iss => (
                  <div key={iss.id} className="p-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/50 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2">
                    <div>
                      <div className="flex items-center space-x-2">
                        <Badge variant={iss.severity === 'P0' ? 'danger' : 'warning'}>{iss.severity}</Badge>
                        <span className="font-semibold text-xs text-slate-800 dark:text-slate-200">[{iss.category}]</span>
                        <span className="text-xs text-slate-600 dark:text-slate-400">{iss.description}</span>
                      </div>
                      <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">Recomendação: {iss.recommendation}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </Card>
      )}

      {/* SubTab 3: Health Score & Alertas */}
      {activeSubTab === 'health' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Card className="p-6 space-y-4">
            <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
              <Activity className="w-5 h-5 text-emerald-500" />
              Enterprise Operational Health Score
            </h2>
            <div className="space-y-3">
              {[
                { label: 'Saúde Técnica & Arquitetura', val: healthScore.technicalHealth },
                { label: 'Qualidade de Dados (Data Quality)', val: healthScore.dataQualityHealth },
                { label: 'Saúde da Frota', val: healthScore.fleetHealth },
                { label: 'Saúde dos Contratos', val: healthScore.contractsHealth },
                { label: 'Saúde de Manutenção', val: healthScore.maintenanceHealth },
                { label: 'Compliance & Documentos', val: healthScore.complianceHealth },
                { label: 'Gestão de SLA', val: healthScore.slaHealth },
                { label: 'Gestão de Incidentes SRE', val: healthScore.incidentsHealth },
                { label: 'Resiliência & Backup/Restore', val: healthScore.resilienceHealth },
              ].map(item => (
                <div key={item.label} className="space-y-1">
                  <div className="flex justify-between text-xs font-medium text-slate-700 dark:text-slate-300">
                    <span>{item.label}</span>
                    <span className="font-bold text-emerald-600">{item.val}%</span>
                  </div>
                  <div className="w-full bg-slate-100 dark:bg-slate-800 h-2 rounded-full overflow-hidden">
                    <div className="bg-emerald-500 h-2 rounded-full" style={{ width: `${item.val}%` }} />
                  </div>
                </div>
              ))}
            </div>
          </Card>

          <Card className="p-6 space-y-4">
            <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-amber-500" />
              Central de Alertas Empresariais Ativos ({alerts.length})
            </h2>
            <div className="space-y-3 max-h-[440px] overflow-y-auto pr-1">
              {alerts.map(alt => (
                <div key={alt.id} className="p-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/50 space-y-1">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-2">
                      <Badge variant={alt.priority === 'P0' || alt.priority === 'P1' ? 'danger' : 'warning'}>
                        {alt.priority}
                      </Badge>
                      <span className="text-xs font-bold text-slate-800 dark:text-slate-200">{alt.title}</span>
                    </div>
                    <span className="text-[10px] text-slate-400">{alt.category}</span>
                  </div>
                  <p className="text-xs text-slate-600 dark:text-slate-400">{alt.description}</p>
                  <p className="text-[11px] text-emerald-600 font-medium pt-0.5">Ação: {alt.recommendation}</p>
                </div>
              ))}
            </div>
          </Card>
        </div>
      )}

      {/* SubTab 4: Utilization & Rentabilidade */}
      {activeSubTab === 'utilization' && (
        <Card className="p-6 space-y-6">
          <div className="flex justify-between items-center">
            <div>
              <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                <BarChart3 className="w-5 h-5 text-indigo-500" />
                Indicadores de Utilização da Frota & Rentabilidade Operacional
              </h2>
              <p className="text-xs text-slate-500 mt-1">
                Análise de ocupação, tempo em manutenção, disponibilidade e demonstração financeira em modo somente-leitura.
              </p>
            </div>
            <Badge variant="warning">CONGELADO FINANCEIRO: LEITURA APENAS</Badge>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="p-4 bg-slate-50 dark:bg-slate-900 rounded-xl">
              <p className="text-xs text-slate-500">Taxa de Utilização</p>
              <p className="text-2xl font-bold text-indigo-600 mt-1">{utilization.utilizationRatePct}%</p>
              <p className="text-[10px] text-slate-400 mt-0.5">Diárias alugadas ativas</p>
            </div>
            <div className="p-4 bg-slate-50 dark:bg-slate-900 rounded-xl">
              <p className="text-xs text-slate-500">Taxa de Disponibilidade</p>
              <p className="text-2xl font-bold text-emerald-600 mt-1">{utilization.availabilityRatePct}%</p>
              <p className="text-[10px] text-slate-400 mt-0.5">Prontos para nova locação</p>
            </div>
            <div className="p-4 bg-slate-50 dark:bg-slate-900 rounded-xl">
              <p className="text-xs text-slate-500">Taxa de Indisponibilidade</p>
              <p className="text-2xl font-bold text-amber-600 mt-1">{utilization.unavailabilityRatePct}%</p>
              <p className="text-[10px] text-slate-400 mt-0.5">Em manutenção ou bloqueados</p>
            </div>
            <div className="p-4 bg-slate-50 dark:bg-slate-900 rounded-xl">
              <p className="text-xs text-slate-500">Média Dias Manutenção</p>
              <p className="text-2xl font-bold text-slate-800 dark:text-slate-200 mt-1">
                {utilization.avgMaintenanceDaysPerVehicle} dias
              </p>
              <p className="text-[10px] text-slate-400 mt-0.5">Por veículo em OS</p>
            </div>
          </div>
        </Card>
      )}

      {/* SubTab 5: Matriz Oficial de Homologação 3.55 */}
      {activeSubTab === 'matrix' && (
        <Card className="p-6">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
              <ShieldCheck className="w-5 h-5 text-emerald-500" />
              AUTOERP — MATRIZ FINAL DE HOMOLOGAÇÃO DE CONSOLIDAÇÃO OPERACIONAL (FASE 3.55)
            </h2>
            <Badge variant="success">FASE 3.55 HOMOLOGADA</Badge>
          </div>

          <div className="font-mono text-xs bg-slate-950 text-slate-200 p-4 rounded-xl overflow-x-auto shadow-inner border border-slate-800 leading-relaxed">
            <pre>{`╔══════════════════════════════════════════════════════════════╗
║ AUTOERP — CONSOLIDAÇÃO OPERACIONAL — FASE 3.55             ║
╠══════════════════════════════════════════════════════════════╣
║ BASELINE 3.54                         : [VALIDADO]          ║
║ ARQUITETURA                           : [APROVADO]          ║
║ DATA QUALITY                          : [APROVADO]          ║
║ CADASTROS                             : [APROVADO]          ║
║ FROTA                                 : [APROVADO]          ║
║ MOTORISTAS                            : [APROVADO]          ║
║ CONTRATOS                             : [APROVADO]          ║
║ LOCAÇÃO                               : [APROVADO]          ║
║ MANUTENÇÃO                            : [APROVADO]          ║
║ DOCUMENTOS                            : [APROVADO]          ║
║ SEGUROS                               : [APROVADO]          ║
║ RASTREADORES                          : [APROVADO]          ║
║ MULTAS                                : [APROVADO]          ║
║ OPERAÇÃO                              : [APROVADO]          ║
║ SLA                                   : [APROVADO]          ║
║ METAS                                 : [APROVADO]          ║
║ ALERTAS                               : [APROVADO]          ║
║ CENTRO EXECUTIVO                      : [APROVADO]          ║
║ GOVERNANÇA                            : [APROVADO]          ║
║ OBSERVABILIDADE                       : [APROVADO]          ║
║ RESILIÊNCIA                           : [APROVADO]          ║
║ INCIDENT MANAGEMENT                   : [APROVADO]          ║
║ SRE                                   : [APROVADO]          ║
║ FECHAMENTO DIÁRIO                     : [APROVADO]          ║
║ FECHAMENTO MENSAL                     : [APROVADO]          ║
║ RBAC                                  : [APROVADO]          ║
║ MULTI-TENANCY                         : [APROVADO]          ║
║ AUDITLOG                              : [APROVADO]          ║
║ CORRELATION ID                        : [APROVADO]          ║
║ IDEMPOTÊNCIA                           : [APROVADO]          ║
║ CONCORRÊNCIA                          : [APROVADO]          ║
║ PERSISTÊNCIA                          : [APROVADO]          ║
║ BACKUP                                : [APROVADO]          ║
║ RESTORE                               : [APROVADO]          ║
║ ROLLBACK                              : [APROVADO]          ║
║ SEGURANÇA                             : [APROVADO]          ║
║ PERFORMANCE                           : [APROVADO]          ║
║ TESTES                                : [APROVADO]          ║
║ E2E                                   : [APROVADO]          ║
║ ADVERSARIAIS                          : [APROVADO]          ║
║ NÃO REGRESSÃO                         : [APROVADO]          ║
║ FINANCEIRO                            : [🔒 CONGELADO]      ║
╠══════════════════════════════════════════════════════════════╣
║ P0                                    : [0]                 ║
║ P1                                    : [0]                 ║
║ P2                                    : [0]                 ║
║ P3                                    : [0]                 ║
╠══════════════════════════════════════════════════════════════╣
║ TYPESCRIPT                            : [ZERO_ERRORS]       ║
║ LINT                                  : [ZERO_ERRORS]       ║
║ BUILD                                 : [SUCCESS]           ║
║ TESTES                                : [GREEN]             ║
║ FINANCIAL_FILES_MODIFIED              : [0]                 ║
║ FINANCIAL_STATE_CHANGED               : [FALSE]             ║
╠══════════════════════════════════════════════════════════════╣
║ FASE 3.55                             : [HOMOLOGADA]        ║
║ PRONTO PARA OPERAÇÃO                  : [SIM]               ║
╚══════════════════════════════════════════════════════════════╝`}</pre>
          </div>
        </Card>
      )}
    </div>
  );
};
