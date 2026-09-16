// AutoERP Executive Operations Types (Phase 3.58)

export type OperationalPriorityLevel = 'P0' | 'P1' | 'P2' | 'P3';

export type BottleneckCategory =
  | 'TASK'
  | 'PENDING_ACTION'
  | 'USER_WORKLOAD'
  | 'SLA'
  | 'VEHICLE'
  | 'MAINTENANCE'
  | 'DOCUMENT'
  | 'CONTRACT'
  | 'INCIDENT'
  | 'PROCESS';

export type BottleneckSeverity = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';

export interface OperationalBottleneckItem {
  id: string;
  companyId: string;
  category: BottleneckCategory;
  severity: BottleneckSeverity;
  entityType: string;
  entityId: string;
  title: string;
  description: string;
  detectedAt: string;
  impactScore: number; // 0..100
  durationHours: number;
  responsibleUserId?: string;
  responsibleUserName?: string;
  recommendedAction: string;
  status: 'ACTIVE' | 'RESOLVED' | 'IGNORED';
}

export type OperationalRiskCategory =
  | 'SLA_RISK'
  | 'UNAVAILABILITY_RISK'
  | 'BACKLOG_RISK'
  | 'OVERLOAD_RISK'
  | 'CONTRACT_RISK'
  | 'DOCUMENT_RISK'
  | 'MAINTENANCE_RISK'
  | 'INCIDENT_RISK';

export type OperationalRiskSeverity = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';

export interface OperationalRiskItem {
  id: string;
  companyId: string;
  category: OperationalRiskCategory;
  severity: OperationalRiskSeverity;
  title: string;
  cause: string;
  entityType: string;
  entityId: string;
  responsibleUserId?: string;
  responsibleUserName?: string;
  recommendedAction: string;
  riskScore: number; // 0..100
}

export interface OperationalRiskScore {
  score: number; // 0..100
  level: 'EXCELENTE' | 'BOM' | 'ATENÇÃO' | 'ALTO RISCO' | 'CRÍTICO';
  factors: {
    backlogScore: number;
    slaScore: number;
    incidentScore: number;
    unavailabilityScore: number;
    maintenanceScore: number;
    documentScore: number;
    contractScore: number;
    overloadScore: number;
    dataQualityScore: number;
    recurrenceScore: number;
  };
}

export interface PriorityActionItem {
  id: string;
  title: string;
  reason: string;
  priority: OperationalPriorityLevel;
  responsibleUserId?: string;
  responsibleUserName?: string;
  dueDate?: string;
  slaStatus?: 'OK' | 'WARNING' | 'BREACHED';
  entityType: string;
  entityId: string;
  impact: string;
  recommendation: string;
  quickActionType: string;
}

export interface OperationalKPIs {
  // Operations
  openTasks: number;
  completedTasks: number;
  blockedTasks: number;
  backlogCount: number;
  overdueActivitiesCount: number;
  todayActivitiesCount: number;

  // SLA
  slaCompliancePercent: number;
  slaAtRiskCount: number;
  slaBreachedCount: number;
  avgCompletionTimeHours: number;

  // People
  activeUsersCount: number;
  availableUsersCount: number;
  overloadedUsersCount: number;
  avgProductivityPercent: number;

  // Fleet
  totalVehicles: number;
  availableVehiclesCount: number;
  rentedVehiclesCount: number;
  maintenanceVehiclesCount: number;
  unavailableVehiclesCount: number;
  fleetUtilizationPercent: number;
  vehiclesWithIssuesCount: number;

  // Contracts
  activeContractsCount: number;
  expiringContractsCount: number;
  contractsWithIssuesCount: number;
  contractsWithIncidentsCount: number;

  // Incidents
  activeIncidentsCount: number;
  criticalIncidentsCount: number;
  recurringIncidentsCount: number;
  mttrMinutes: number;
  mttdMinutes: number;
}

export interface OperationalRecommendation {
  id: string;
  companyId: string;
  title: string;
  description: string;
  severity: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'INFO';
  category: string;
  entityType?: string;
  entityId?: string;
  recommendedAction: string;
  impactEstimate: string;
  createdAt: string;
}

export interface ExecutiveOperationsSnapshot {
  id: string;
  companyId: string;
  generatedAt: string;
  correlationId: string;
  snapshotType: 'DAILY' | 'WEEKLY' | 'MONTHLY' | 'ON_DEMAND';
  healthScore: number;
  operationalRiskScore: OperationalRiskScore;
  kpis: OperationalKPIs;

  // Direct counts
  activeTasks: number;
  blockedTasks: number;
  overdueTasks: number;
  slaWarnings: number;
  slaBreaches: number;
  openIncidents: number;
  criticalIncidents: number;
  pendingActions: number;
  todayActivities: number;
  overdueActivities: number;
  availableVehicles: number;
  rentedVehicles: number;
  maintenanceVehicles: number;
  unavailableVehicles: number;
  activeContracts: number;
  contractsWithIssues: number;
  usersAvailable: number;
  usersOverloaded: number;
  backlog: number;

  topPriorityActions: PriorityActionItem[];
  topBottlenecks: OperationalBottleneckItem[];
  topRisks: OperationalRiskItem[];
  recommendations: OperationalRecommendation[];
}

export interface SnapshotComparison {
  current: ExecutiveOperationsSnapshot;
  previous: ExecutiveOperationsSnapshot;
  diff: {
    healthScoreDelta: number;
    riskScoreDelta: number;
    backlogDelta: number;
    slaComplianceDelta: number;
    overdueTasksDelta: number;
    activeIncidentsDelta: number;
    fleetUtilizationDelta: number;
  };
}

export interface UserContext358 {
  userId: string;
  userName?: string;
  userRole?: string; // 'ADMIN' | 'OPERATIONAL_MANAGER' | 'FINANCIAL' | 'ATTENDANT'
  companyId: string;
}
