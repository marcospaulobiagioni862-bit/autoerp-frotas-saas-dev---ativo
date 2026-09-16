// AutoERP Workflow & Task Management Types (Phase 3.56)

export type TaskStatus =
  | 'OPEN'
  | 'ASSIGNED'
  | 'IN_PROGRESS'
  | 'BLOCKED'
  | 'WAITING_VALIDATION'
  | 'COMPLETED'
  | 'CLOSED'
  | 'CANCELLED'
  | 'REOPENED';

export type TaskPriority = 'P0' | 'P1' | 'P2' | 'P3';

export type TaskSeverity = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';

export type TaskCategory =
  | 'DOCUMENT'
  | 'INSURANCE'
  | 'TRACKER'
  | 'MAINTENANCE'
  | 'FINE'
  | 'CONTRACT'
  | 'RETURN'
  | 'INCIDENT'
  | 'DATA_QUALITY'
  | 'CLOSING_DAILY'
  | 'CLOSING_MONTHLY'
  | 'SLA'
  | 'OPERATIONAL_GENERAL';

export type TaskSourceType =
  | 'VEHICLE_DOCUMENT'
  | 'DRIVER_DOCUMENT'
  | 'INSURANCE'
  | 'TRACKER'
  | 'MAINTENANCE'
  | 'TRAFFIC_TICKET'
  | 'CONTRACT'
  | 'VEHICLE'
  | 'DRIVER'
  | 'INCIDENT'
  | 'DATA_QUALITY_ISSUE'
  | 'ALERT'
  | 'DAILY_CLOSING'
  | 'MONTHLY_CLOSING'
  | 'MANUAL';

export type TaskEntityType =
  | 'VEHICLE'
  | 'DRIVER'
  | 'CONTRACT'
  | 'MAINTENANCE'
  | 'TRAFFIC_TICKET'
  | 'DOCUMENT'
  | 'INSURANCE'
  | 'TRACKER'
  | 'INCIDENT'
  | 'DATA_QUALITY'
  | 'SYSTEM';

export interface TaskEvidence {
  id: string;
  type: 'COMMENT' | 'DOCUMENT' | 'IMAGE' | 'PDF' | 'NOTE';
  content: string;
  url?: string;
  addedBy: string;
  addedAt: string;
}

export interface Task {
  id: string;
  companyId: string;
  title: string;
  description: string;
  category: TaskCategory;
  priority: TaskPriority;
  severity: TaskSeverity;
  status: TaskStatus;
  sourceType: TaskSourceType;
  sourceId: string;
  entityType: TaskEntityType;
  entityId: string;
  assignedUserId?: string;
  assignedTeam?: string;
  createdBy: string;
  createdAt: string;
  startedAt?: string;
  dueAt: string;
  completedAt?: string;
  validatedAt?: string;
  validatorUserId?: string;
  slaId?: string;
  correlationId: string;
  evidences: TaskEvidence[];
  resolution?: string;
  blockedReason?: string;
  updatedAt: string;
  idempotencyKey: string;
}

export type SLAStatus = 'ON_TRACK' | 'WARNING' | 'BREACHED' | 'RESOLVED';

export interface SLAParameter {
  priority: TaskPriority;
  maxHoursToFirstResponse: number;
  maxHoursToResolution: number;
  warningThresholdPercent: number; // e.g. 80 (%)
}

export interface SLARecord {
  id: string;
  companyId: string;
  taskId: string;
  priority: TaskPriority;
  severity: TaskSeverity;
  status: SLAStatus;
  targetHours: number;
  elapsedMinutes: number;
  remainingMinutes: number;
  delayMinutes: number;
  consumedPercent: number;
  dueAt: string;
  warningAt: string;
  breachedAt?: string;
  resolvedAt?: string;
  correlationId: string;
  createdAt: string;
  updatedAt: string;
}

export interface PendingAction {
  id: string;
  companyId: string;
  title: string;
  description: string;
  category: TaskCategory;
  priority: TaskPriority;
  severity: TaskSeverity;
  sourceType: TaskSourceType;
  sourceId: string;
  entityType: TaskEntityType;
  entityId: string;
  dueAt?: string;
  convertedTaskId?: string;
  status: 'OPEN' | 'CONVERTED' | 'DISMISSED';
  createdAt: string;
  correlationId: string;
  idempotencyKey: string;
}

export interface WorkflowRule {
  id: string;
  companyId: string;
  name: string;
  eventTrigger: TaskSourceType;
  autoCreateTask: boolean;
  defaultPriority: TaskPriority;
  defaultSeverity: TaskSeverity;
  defaultAssignee?: string;
  enabled: boolean;
}

export interface WorkflowMetrics {
  totalTasks: number;
  openTasks: number;
  assignedTasks: number;
  inProgressTasks: number;
  blockedTasks: number;
  waitingValidationTasks: number;
  completedTasks: number;
  closedTasks: number;
  cancelledTasks: number;
  reopenedTasks: number;
  unassignedTasks: number;
  completionRate: number;
  onTimeCompletionRate: number;
  slaComplianceRate: number;
  averageResolutionMinutes: number;
  averageAssignmentMinutes: number;
  reopenRate: number;
  blockedRate: number;
  totalPendingActions: number;
  criticalPendencies: number;
  slaBreachedCount: number;
  slaWarningCount: number;
}

export interface CreateTaskParams {
  companyId: string;
  title: string;
  description: string;
  category: TaskCategory;
  priority: TaskPriority;
  severity: TaskSeverity;
  sourceType: TaskSourceType;
  sourceId: string;
  entityType: TaskEntityType;
  entityId: string;
  assignedUserId?: string;
  assignedTeam?: string;
  dueAt?: string;
  correlationId?: string;
}

export interface TaskFilterOptions {
  status?: TaskStatus;
  category?: TaskCategory;
  priority?: TaskPriority;
  assignedUserId?: string;
  search?: string;
  isOverdue?: boolean;
}

export interface UserContext {
  userId: string;
  userName?: string;
  role: string;
  companyId?: string;
}
