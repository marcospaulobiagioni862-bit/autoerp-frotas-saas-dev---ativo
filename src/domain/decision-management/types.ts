// AutoERP Decision Management Types (Phase 3.59)

export type DecisionStatus =
  | 'PROPOSED'
  | 'UNDER_ANALYSIS'
  | 'APPROVED'
  | 'IN_EXECUTION'
  | 'WAITING_RESULT'
  | 'VALIDATING'
  | 'COMPLETED'
  | 'CLOSED'
  | 'REJECTED'
  | 'CANCELLED'
  | 'ESCALATED'
  | 'REOPENED';

export type DecisionSourceType =
  | 'RECOMMENDATION'
  | 'INCIDENT'
  | 'PROBLEM'
  | 'KNOWN_ERROR'
  | 'POST_MORTEM'
  | 'BOTTLENECK'
  | 'RISK'
  | 'PENDING_ACTION'
  | 'DATA_QUALITY'
  | 'SLA_BREACH'
  | 'MANUAL';

export type DecisionCategory =
  | 'OPERATIONAL'
  | 'FLEET'
  | 'DRIVER'
  | 'CONTRACT'
  | 'MAINTENANCE'
  | 'DOCUMENT'
  | 'INSURANCE'
  | 'TRACKER'
  | 'TRAFFIC_TICKET'
  | 'SLA'
  | 'INCIDENT'
  | 'DATA_QUALITY'
  | 'WORKFLOW'
  | 'PRODUCTIVITY'
  | 'SECURITY'
  | 'COMPLIANCE'
  | 'EXECUTIVE'
  | 'FINANCIAL_READ_ONLY';

export type DecisionPriority = 'P0' | 'P1' | 'P2' | 'P3';

export type DecisionSeverity = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';

export type DecisionEscalationLevel = 'LEVEL_0' | 'LEVEL_1' | 'LEVEL_2' | 'LEVEL_3';

export type DecisionEffectivenessRating =
  | 'EXCELLENT'
  | 'EFFECTIVE'
  | 'PARTIALLY_EFFECTIVE'
  | 'INEFFECTIVE'
  | 'FAILED';

export interface DecisionEscalationRecord {
  id: string;
  decisionId: string;
  companyId: string;
  level: DecisionEscalationLevel;
  previousResponsibleId?: string;
  newResponsibleId: string;
  reason: string;
  escalatedAt: string;
  correlationId: string;
}

export interface ExecutiveDecision {
  id: string;
  companyId: string;
  correlationId: string;
  decisionNumber: string;
  title: string;
  description: string;
  sourceType: DecisionSourceType;
  sourceId?: string;
  sourceCategory?: string;
  category: DecisionCategory;
  priority: DecisionPriority;
  severity: DecisionSeverity;
  status: DecisionStatus;
  decisionMakerId: string;
  responsibleUserId?: string;
  createdAt: string;
  decidedAt?: string;
  dueAt?: string;
  completedAt?: string;
  validatedAt?: string;
  closedAt?: string;
  reopenedAt?: string;
  reopenReason?: string;
  expectedResult: string;
  actualResult?: string;
  successCriteria: string;
  effectivenessScore?: number; // 0–100
  effectivenessClassification?: DecisionEffectivenessRating;
  evidenceIds: string[];
  linkedTaskIds: string[];
  linkedIncidentIds: string[];
  linkedPendingActionIds: string[];
  escalationLevel: DecisionEscalationLevel;
  escalationHistory: DecisionEscalationRecord[];
  auditMetadata?: Record<string, any>;
}

export interface UserContext359 {
  userId: string;
  userName?: string;
  userRole: 'ADMIN' | 'OPERATIONAL_MANAGER' | 'FINANCIAL' | 'ATTENDANT';
  companyId: string;
}

export type DecisionActionType = 'TASK' | 'ACTIVITY' | 'WORKFLOW' | 'PENDING_ACTION';

export interface DecisionActionConvertParams {
  companyId: string;
  decisionId: string;
  actionType: DecisionActionType;
  title: string;
  description: string;
  assignedUserId?: string;
  priority?: DecisionPriority;
  dueAt?: string;
}

export interface DecisionMetrics {
  companyId: string;
  totalDecisions: number;
  openDecisions: number;
  criticalP0P1Count: number;
  overdueCount: number;
  escalatedCount: number;
  inExecutionCount: number;
  completedCount: number;
  reopenedCount: number;
  avgLeadTimeHours: number;
  avgExecutionTimeHours: number;
  avgClosureTimeHours: number;
  successRate: number; // 0-100%
  reopenRate: number; // 0-100%
  escalationRate: number; // 0-100%
  overdueRate: number; // 0-100%
  effectivenessScore: number; // 0-100
  p0P1ResolutionRate: number; // 0-100%
  actionConversionRate: number; // 0-100%
  decisionsByCategory: Record<string, number>;
  decisionsByResponsible: Record<string, number>;
}

export interface DecisionSnapshot {
  id: string;
  companyId: string;
  timestamp: string;
  correlationId: string;
  metrics: DecisionMetrics;
  decisionsSummary: Array<{
    id: string;
    title: string;
    status: DecisionStatus;
    priority: DecisionPriority;
    responsibleUserId?: string;
  }>;
}

export type DecisionManagementSnapshot = DecisionSnapshot;
export type DecisionKPIs = DecisionMetrics;

export interface CreateDecisionParams {
  companyId: string;
  title: string;
  description: string;
  sourceType: DecisionSourceType;
  sourceId?: string;
  category?: DecisionCategory;
  priority?: DecisionPriority;
  severity?: DecisionSeverity;
  responsibleUserId?: string;
  dueAt?: string;
  expectedResult: string;
  successCriteria: string;
  linkedIncidentIds?: string[];
  linkedPendingActionIds?: string[];
  evidenceIds?: string[];
}
