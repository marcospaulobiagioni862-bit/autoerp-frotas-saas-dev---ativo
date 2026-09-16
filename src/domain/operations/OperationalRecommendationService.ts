// AutoERP Operational Recommendation Engine Service (Phase 3.58)

import {
  OperationalRecommendation,
  OperationalKPIs,
  OperationalBottleneckItem,
  OperationalRiskItem,
  UserContext358
} from './types';

export class OperationalRecommendationService {
  private static validateTenant(companyId: string): void {
    if (!companyId || typeof companyId !== 'string' || companyId.trim() === '') {
      throw new Error('companyId é obrigatório para isolamento multi-tenant');
    }
  }

  /**
   * Generates deterministic recommendations for operations managers.
   * STRICT GUARANTEE: Recommendations are purely informational and do NOT execute actions automatically.
   */
  public static generateRecommendations(
    companyId: string,
    kpis: OperationalKPIs,
    bottlenecks: OperationalBottleneckItem[],
    risks: OperationalRiskItem[],
    context?: UserContext358
  ): OperationalRecommendation[] {
    this.validateTenant(companyId);
    if (context && context.companyId !== companyId) {
      throw new Error(`Acesso negado: Tentativa de consulta cross-tenant (${context.companyId} !== ${companyId})`);
    }

    const recommendations: OperationalRecommendation[] = [];
    const nowIso = new Date().toISOString();

    // 1. SLA Breach Recommendation
    if (kpis.slaBreachedCount > 0) {
      recommendations.push({
        id: `rec-sla-breach-${companyId}`,
        companyId,
        title: `Intervenção em SLAs Rompidos (${kpis.slaBreachedCount} item/itens)`,
        description: `Existem ${kpis.slaBreachedCount} tarefas/chamados com SLA estourado. Recomenda-se reatribuir ou atuar em força-tarefa imediata.`,
        severity: 'CRITICAL',
        category: 'SLA',
        recommendedAction: 'Acessar Central de Tarefas, filtrar por SLA Rompido e redefinir responsável.',
        impactEstimate: 'Melhoria de +15% no índice de atendimento de SLA.',
        createdAt: nowIso,
      });
    }

    // 2. Overloaded Users Recommendation
    if (kpis.overloadedUsersCount > 0) {
      recommendations.push({
        id: `rec-user-overload-${companyId}`,
        companyId,
        title: `Redistribuição de Carga de Trabalho (${kpis.overloadedUsersCount} colaborador/es sobrecarregado/s)`,
        description: `Há colaboradores com volume de tarefas acima da capacidade nominal de execução.`,
        severity: 'HIGH',
        category: 'PEOPLE',
        recommendedAction: 'Utilizar o Painel de Produtividade para reequilibrar chamados entre a equipe.',
        impactEstimate: 'Redução do tempo médio de conclusão e prevenção de gargalos.',
        createdAt: nowIso,
      });
    }

    // 3. Blocked Tasks Recommendation
    if (kpis.blockedTasks > 0) {
      recommendations.push({
        id: `rec-blocked-tasks-${companyId}`,
        companyId,
        title: `Desbloqueio de Tarefas Pendentes (${kpis.blockedTasks} tarefas bloqueadas)`,
        description: `Existem ${kpis.blockedTasks} tarefas paradas aguardando validação ou dependência de terceiros.`,
        severity: 'HIGH',
        category: 'WORKFLOW',
        recommendedAction: 'Acessar a aba de Gargalos e resolver a pendência bloqueante associada.',
        impactEstimate: 'Aceleração do fluxo de trabalho e liberação do backlog.',
        createdAt: nowIso,
      });
    }

    // 4. Critical Incidents Recommendation
    if (kpis.criticalIncidentsCount > 0) {
      recommendations.push({
        id: `rec-critical-incidents-${companyId}`,
        companyId,
        title: `Tratamento Urgente de Incidentes SEV0/SEV1 (${kpis.criticalIncidentsCount} ativos)`,
        description: `Incidentes críticos ativos causam impacto direto na operação da frota e atendimento ao cliente.`,
        severity: 'CRITICAL',
        category: 'INCIDENTS',
        recommendedAction: 'Acessar Gestão de Incidentes SRE para executar ações de contenção e mitigação.',
        impactEstimate: 'Prevenção de indisponibilidade sistêmica e de frota.',
        createdAt: nowIso,
      });
    }

    // 5. Fleet Utilization Recommendation
    if (kpis.totalVehicles > 0 && kpis.fleetUtilizationPercent < 50) {
      recommendations.push({
        id: `rec-fleet-utilization-${companyId}`,
        companyId,
        title: `Otimização de Taxa de Utilização da Frota (${kpis.fleetUtilizationPercent}% atual)`,
        description: `A taxa de utilização da frota está abaixo da meta recomendada (70%+).`,
        severity: 'MEDIUM',
        category: 'FLEET',
        recommendedAction: 'Revisar veículos disponíveis para locação e ofertas ativas em contratos.',
        impactEstimate: 'Aumento na eficiência e rentabilidade da frota.',
        createdAt: nowIso,
      });
    }

    // Default info recommendation if everything is quiet
    if (recommendations.length === 0) {
      recommendations.push({
        id: `rec-normal-${companyId}`,
        companyId,
        title: 'Operação Estável e Dentro dos Parâmetros',
        description: 'Todos os indicadores operacionais de SLA, tarefas e frota estão dentro do intervalo de conformidade.',
        severity: 'INFO',
        category: 'GENERAL',
        recommendedAction: 'Manter acompanhamento diário dos dashboards de execução e produtividade.',
        impactEstimate: 'Manutenção do nível de excelência operacional.',
        createdAt: nowIso,
      });
    }

    return recommendations;
  }
}
