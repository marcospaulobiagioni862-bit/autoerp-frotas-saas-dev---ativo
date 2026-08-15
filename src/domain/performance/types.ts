// AutoERP Performance & Results Management Types (Phase 3.60)

export type GoalDirection = 'INCREASE' | 'DECREASE' | 'MAINTAIN';
export type GoalStatus = 'DRAFT' | 'ACTIVE' | 'AT_RISK' | 'ACHIEVED' | 'FAILED' | 'CANCELLED' | 'CLOSED';
export type GoalPriority = 'P0' | 'P1' | 'P2' | 'P3';

export type KPICategory =
  | 'FLEET'
  | 'OPERATIONS'
  | 'CONTRACTS'
  | 'DRIVERS'
  | 'MAINTENANCE'
  | 'DOCUMENTS'
  | 'INSURANCE'
  | 'TRACKING'
  | 'TRAFFIC'
  | 'SLA'
  | 'PRODUCTIVITY'
  | 'CUSTOMER_SERVICE'
  | 'INCIDENTS'
  | 'DATA_QUALITY'
  | 'EXECUTION'
  | 'DECISIONS'
  | 'FINANCIAL_READ_ONLY';

export type KPITrend = 'IMPROVING' | 'STABLE' | 'DECLINING' | 'VOLATILE' | 'UNKNOWN';
export type KPIStatus = 'NORMAL' | 'WARNING' | 'CRITICAL' | 'OFF_TRACK';

export type OKRStatus = 'NOT_STARTED' | 'IN_PROGRESS' | 'AT_RISK' | 'COMPLETED' | 'CANCELLED';

export type ActionPlanStatus =
  | 'PLANNED'
  | 'ACTIVE'
  | 'BLOCKED'
  | 'AT_RISK'
  | 'COMPLETED'
  | 'VALIDATING'
  | 'CLOSED'
  | 'CANCELLED';

export type PerformanceClassification = 'EXCELLENT' | 'GOOD' | 'ON_TRACK' | 'AT_RISK' | 'CRITICAL' | 'FAILED';
export type PerformanceForecast = 'EXPECTED_ON_TIME' | 'EXPECTED_LATE' | 'UNLIKELY_TO_ACHIEVE' | 'INSUFFICIENT_DATA';

export type PDCAPhase = 'PLAN' | 'DO' | 'CHECK' | 'ACT';

export interface UserContext360 {
  userId: string;
  userName?: string;
  userRole?: 'ADMIN' | 'OPERATIONAL_MANAGER' | 'FINANCIAL' | 'OPERATIONAL' | 'ATTENDANT' | string;
  companyId: string;
}

export interface Goal {
  id: string;
  companyId: string;
  title: string;
  description: string;
  category: KPICategory;
  ownerId: string;
  ownerName?: string;
  startDate: string;
  dueDate: string;
  targetValue: number;
  currentValue: number;
  baselineValue: number;
  unit: string;
  direction: GoalDirection;
  status: GoalStatus;
  priority: GoalPriority;
  progressPercentage: number;
  linkedObjectiveId?: string;
  linkedKPIId?: string;
  correlationId: string;
  createdAt: string;
  updatedAt: string;
}

export interface KPI {
  id: string;
  companyId: string;
  name: string;
  description: string;
  category: KPICategory;
  unit: string;
  calculationMethod: string;
  target: number;
  warningThreshold: number;
  criticalThreshold: number;
  currentValue: number;
  previousValue: number;
  trend: KPITrend;
  ownerId: string;
  ownerName?: string;
  frequency: 'DAILY' | 'WEEKLY' | 'MONTHLY' | 'QUARTERLY';
  source: string;
  status: KPIStatus;
  isReadOnlyFinancial?: boolean;
  correlationId: string;
  updatedAt: string;
}

export interface Objective {
  id: string;
  companyId: string;
  title: string;
  description: string;
  ownerId: string;
  ownerName?: string;
  period: string; // e.g., '2026-Q1'
  status: OKRStatus;
  progressPercentage: number;
  correlationId: string;
  createdAt: string;
  updatedAt: string;
}

export interface KeyResult {
  id: string;
  companyId: string;
  objectiveId: string;
  title: string;
  metric: string;
  baseline: number;
  target: number;
  currentValue: number;
  progressPercentage: number;
  ownerId: string;
  ownerName?: string;
  status: OKRStatus;
  linkedKPIId?: string;
  linkedGoalId?: string;
  correlationId: string;
  createdAt: string;
  updatedAt: string;
}

export interface ActionPlan {
  id: string;
  companyId: string;
  goalId?: string;
  objectiveId?: string;
  decisionId?: string;
  title: string;
  description: string;
  ownerId: string;
  ownerName?: string;
  priority: GoalPriority;
  startDate: string;
  dueDate: string;
  status: ActionPlanStatus;
  progressPercentage: number;
  risk: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  expectedResult: string;
  actualResult?: string;
  linkedTaskIds: string[];
  correlationId: string;
  createdAt: string;
  updatedAt: string;
}

export interface ResultMeasurement {
  id: string;
  companyId: string;
  metricId?: string;
  goalId?: string;
  objectiveId?: string;
  keyResultId?: string;
  measuredValue: number;
  expectedValue: number;
  variance: number;
  percentageAchieved: number;
  measuredAt: string;
  measuredBy: string;
  source: string;
  correlationId: string;
}

export interface PDCARecord {
  id: string;
  companyId: string;
  goalId?: string;
  actionPlanId?: string;
  title: string;
  currentPhase: PDCAPhase;
  rootCause?: string;
  impactDescription?: string;
  correctiveAction?: string;
  preventiveAction?: string;
  ownerId: string;
  ownerName?: string;
  dueDate: string;
  expectedOutcome?: string;
  actualOutcome?: string;
  evidenceIds: string[];
  linkedDecisionId?: string;
  status: 'OPEN' | 'IN_PROGRESS' | 'VERIFIED' | 'STANDARDIZED' | 'CANCELLED';
  correlationId: string;
  createdAt: string;
  updatedAt: string;
}

export interface PerformanceAnalysisResult {
  overallScore: number; // 0-100
  classification: PerformanceClassification;
  forecast: PerformanceForecast;
  goalAchievementScore: number;
  kpiHealthScore: number;
  executionScore: number;
  slaScore: number;
  productivityScore: number;
  riskScore: number;
  dataQualityScore: number;
  decisionEffectivenessScore: number;
  incidentRecurrenceScore: number;
  continuousImprovementScore: number;
  atRiskGoalsCount: number;
  blockedActionPlansCount: number;
  overdueTasksCount: number;
}

export interface PerformanceSnapshot {
  id: string;
  companyId: string;
  timestamp: string;
  correlationId: string;
  analysis: PerformanceAnalysisResult;
  goalsSummary: Array<{
    id: string;
    title: string;
    status: GoalStatus;
    progressPercentage: number;
    ownerId: string;
  }>;
  kpisSummary: Array<{
    id: string;
    name: string;
    currentValue: number;
    target: number;
    status: KPIStatus;
  }>;
}

export interface CreateGoalParams {
  companyId: string;
  title: string;
  description: string;
  category: KPICategory;
  ownerId: string;
  startDate: string;
  dueDate: string;
  targetValue: number;
  baselineValue: number;
  unit: string;
  direction?: GoalDirection;
  priority?: GoalPriority;
  linkedObjectiveId?: string;
  linkedKPIId?: string;
}

export interface CreateKPIParams {
  companyId: string;
  name: string;
  description: string;
  category: KPICategory;
  unit: string;
  calculationMethod: string;
  target: number;
  warningThreshold: number;
  criticalThreshold: number;
  currentValue?: number;
  ownerId: string;
  frequency?: 'DAILY' | 'WEEKLY' | 'MONTHLY' | 'QUARTERLY';
  source?: string;
  isReadOnlyFinancial?: boolean;
}

export interface CreateObjectiveParams {
  companyId: string;
  title: string;
  description: string;
  ownerId: string;
  period: string;
}

export interface CreateKeyResultParams {
  companyId: string;
  objectiveId: string;
  title: string;
  metric: string;
  baseline: number;
  target: number;
  ownerId: string;
  linkedKPIId?: string;
  linkedGoalId?: string;
}

export interface CreateActionPlanParams {
  companyId: string;
  goalId?: string;
  objectiveId?: string;
  decisionId?: string;
  title: string;
  description: string;
  ownerId: string;
  priority?: GoalPriority;
  startDate: string;
  dueDate: string;
  risk?: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  expectedResult: string;
}

export interface CreatePDCAParams {
  companyId: string;
  goalId?: string;
  actionPlanId?: string;
  title: string;
  rootCause?: string;
  impactDescription?: string;
  correctiveAction?: string;
  preventiveAction?: string;
  ownerId: string;
  dueDate: string;
  expectedOutcome?: string;
  linkedDecisionId?: string;
}
