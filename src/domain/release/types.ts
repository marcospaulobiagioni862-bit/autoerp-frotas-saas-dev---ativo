// src/domain/release/types.ts

export type ReleaseStatus = 
  | 'DRAFT' 
  | 'PLANNED' 
  | 'APPROVED' 
  | 'SCHEDULED' 
  | 'IN_PROGRESS' 
  | 'DEPLOYED' 
  | 'VALIDATED' 
  | 'ROLLED_BACK' 
  | 'CANCELLED' 
  | 'FAILED';

export type ReleaseType = 'MAJOR' | 'MINOR' | 'PATCH' | 'HOTFIX' | 'EMERGENCY';

export type ReleaseRiskLevel = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

export type ReleaseCompatibilityStatus = 'COMPATIBLE' | 'DEGRADED' | 'INCOMPATIBLE';

export interface ReleaseChecklist {
  BUILD_OK: boolean;
  TYPESCRIPT_OK: boolean;
  LINT_OK: boolean;
  TESTS_OK: boolean;
  E2E_OK: boolean;
  SECURITY_OK: boolean;
  RBAC_OK: boolean;
  MULTI_TENANCY_OK: boolean;
  BACKUP_OK: boolean;
  RESTORE_OK: boolean;
  ROLLBACK_OK: boolean;
  AUDITLOG_OK: boolean;
  FINANCIAL_CORE_INTACT: boolean;
  CONFIGURATION_VALIDATED: boolean;
  PERFORMANCE_VALIDATED: boolean;
  SMOKE_TEST_OK: boolean;
}

export interface Release {
  id: string;
  companyId: string;
  version: string;
  name: string;
  description: string;
  status: ReleaseStatus;
  releaseType: ReleaseType;
  baselineId: string;
  previousVersion: string;
  createdAt: string;
  scheduledAt?: string;
  startedAt?: string;
  completedAt?: string;
  createdBy: string;
  approvedBy?: string;
  correlationId: string;
  changeIds: string[];
  riskLevel: ReleaseRiskLevel;
  rollbackAvailable: boolean;
  rollbackVersion?: string;
  checklistStatus: ReleaseChecklist;
  compatibilityStatus: ReleaseCompatibilityStatus;
  notes?: string;
  idempotencyKey?: string;
}

export type ChangeStatus = 
  | 'DRAFT' 
  | 'SUBMITTED' 
  | 'UNDER_REVIEW' 
  | 'APPROVED' 
  | 'SCHEDULED' 
  | 'EXECUTING' 
  | 'VALIDATING' 
  | 'COMPLETED' 
  | 'REJECTED' 
  | 'CANCELLED' 
  | 'ROLLED_BACK' 
  | 'FAILED';

export type ChangeCategory = 
  | 'CONFIGURATION' 
  | 'BUGFIX' 
  | 'FEATURE' 
  | 'SECURITY' 
  | 'PERFORMANCE' 
  | 'DATA_MIGRATION' 
  | 'INFRASTRUCTURE' 
  | 'MAINTENANCE' 
  | 'EMERGENCY';

export type ChangeRisk = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
export type ChangePriority = 'P0' | 'P1' | 'P2' | 'P3';

export interface ImpactAssessment {
  affectedModules: string[];
  affectedEntities: string[];
  touchesFinancialCore: boolean;
  requiresBackup: boolean;
  requiresRollbackPlan: boolean;
  estimatedDowntimeMinutes: number;
}

export interface ChangeRequest {
  id: string;
  companyId: string;
  title: string;
  description: string;
  category: ChangeCategory;
  risk: ChangeRisk;
  priority: ChangePriority;
  status: ChangeStatus;
  requestedBy: string;
  approvedBy?: string;
  createdAt: string;
  approvedAt?: string;
  scheduledAt?: string;
  executedAt?: string;
  completedAt?: string;
  rollbackPlan: string;
  validationPlan: string;
  impactAssessment: ImpactAssessment;
  releaseId?: string;
  correlationId: string;
  auditLogIds: string[];
  incidentId?: string;
  taskId?: string;
  idempotencyKey?: string;
}

export interface ConfigurationChangeRecord {
  id: string;
  companyId: string;
  configurationKey: string;
  oldValue: any;
  newValue: any;
  changedBy: string;
  changedAt: string;
  reason: string;
  changeId?: string;
  releaseId?: string;
  correlationId: string;
}

export interface ConfigurationSnapshot {
  snapshotId: string;
  companyId: string;
  createdAt: string;
  createdBy: string;
  configurationVersion: string;
  values: Record<string, any>;
  checksum: string;
  correlationId: string;
}

export type FeatureFlagEnvironment = 'DEVELOPMENT' | 'TEST' | 'STAGING' | 'PRODUCTION';

export interface FeatureFlag {
  id: string;
  companyId: string;
  key: string;
  enabled: boolean;
  description: string;
  environment: FeatureFlagEnvironment;
  createdAt: string;
  updatedAt: string;
  updatedBy: string;
  changeId?: string;
}

export interface BaselineRecord {
  baselineId: string;
  companyId: string;
  version: string;
  createdAt: string;
  checksum: string;
  modules: string[];
  configurationVersion: string;
  testStatus: string;
  financialCoreHash: string;
}

export interface MaintenanceWindow {
  id: string;
  companyId: string;
  startAt: string;
  endAt: string;
  reason: string;
  affectedModules: string[];
  approvedBy: string;
  status: 'SCHEDULED' | 'ACTIVE' | 'COMPLETED' | 'CANCELLED';
  correlationId: string;
}

export interface PostReleaseValidationResult {
  releaseId: string;
  version: string;
  companyId: string;
  validatedAt: string;
  passed: boolean;
  checks: {
    smokeTest: boolean;
    healthCheck: boolean;
    integrityCheck: boolean;
    persistenceCheck: boolean;
    rbacCheck: boolean;
    multiTenantCheck: boolean;
    auditCheck: boolean;
    financialCoreCheck: boolean;
  };
  p0Count: number;
  p1Count: number;
  p2Count: number;
  p3Count: number;
  details: string;
}

export interface ReleaseGovernanceSummary {
  companyId: string;
  systemVersion: string;
  baseline: BaselineRecord;
  totalReleases: number;
  plannedReleases: number;
  approvedReleases: number;
  deployedReleases: number;
  rolledBackReleases: number;
  totalChanges: number;
  criticalChanges: number;
  totalConfigFiles: number;
  activeFeatureFlags: number;
  activeMaintenanceWindows: number;
  financialCoreIntact: boolean;
  healthScore: number;
  p0Count: number;
  p1Count: number;
  p2Count: number;
  p3Count: number;
}
