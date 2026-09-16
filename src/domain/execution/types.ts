// AutoERP Integrated Operational Execution Types (Phase 3.57)

export type ActivityType =
  | 'TASK'
  | 'MEETING'
  | 'INSPECTION'
  | 'MAINTENANCE'
  | 'DELIVERY'
  | 'RETURN'
  | 'DOCUMENT_REVIEW'
  | 'FOLLOW_UP'
  | 'INCIDENT'
  | 'OTHER';

export type ExecutionActivityPriority = 'P0' | 'P1' | 'P2' | 'P3';

export type ExecutionActivityStatus =
  | 'PLANNED'
  | 'IN_PROGRESS'
  | 'COMPLETED'
  | 'BLOCKED'
  | 'CANCELLED';

export interface RecurrenceRule {
  frequency: 'DAILY' | 'WEEKLY' | 'MONTHLY' | 'YEARLY' | 'CUSTOM';
  interval: number;
  daysOfWeek?: number[]; // 0 = Sun, 1 = Mon, ..., 6 = Sat
  until?: string;
}

export interface ExecutionActivity {
  id: string;
  companyId: string;
  title: string;
  description: string;
  type: ActivityType;
  priority: ExecutionActivityPriority;
  status: ExecutionActivityStatus;
  taskId?: string;
  assignedTo: string;
  createdBy: string;
  scheduledStart: string;
  scheduledEnd: string;
  completedAt?: string;
  vehicleId?: string;
  driverId?: string;
  contractId?: string;
  incidentId?: string;
  source: string;
  recurrence?: RecurrenceRule;
  createdAt: string;
  updatedAt: string;
  correlationId: string;
}

export type AgendaViewMode = 'DAY' | 'WEEK' | 'MONTH' | 'LIST';

export interface AgendaEvent {
  id: string;
  companyId: string;
  title: string;
  description: string;
  startAt: string;
  endAt: string;
  allDay: boolean;
  status: 'SCHEDULED' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED';
  priority: ExecutionActivityPriority;
  assignedTo: string;
  participants: string[];
  sourceType: 'TASK' | 'ACTIVITY' | 'MAINTENANCE' | 'INSPECTION' | 'CONTRACT' | 'INCIDENT' | 'OTHER';
  sourceId: string;
  recurrenceRule?: string;
  reminderMinutes: number;
  createdAt: string;
  updatedAt: string;
  correlationId: string;
}

export type WorkloadClassification = 'NORMAL' | 'ELEVADA' | 'SOBRECARGA' | 'CRÍTICA';

export interface UserWorkload {
  userId: string;
  userName: string;
  openTasks: number;
  criticalTasks: number;
  overdueTasks: number;
  blockedTasks: number;
  slaAtRisk: number;
  classification: WorkloadClassification;
}

export interface ProductivitySnapshot {
  companyId: string;
  period: string;
  totalTasks: number;
  completedTasks: number;
  openTasks: number;
  blockedTasks: number;
  overdueTasks: number;
  slaCompliance: number; // 0 - 100 percentage
  averageCompletionTime: number; // in hours
  reopenedTasks: number;
  backlog: number;
  workloadByUser: Record<string, UserWorkload>;
}

export interface CommunicationAttachment {
  id: string;
  name: string;
  url: string;
  type: string;
  sizeBytes?: number;
}

export interface CommunicationEntry {
  id: string;
  companyId: string;
  entityType: 'TASK' | 'ACTIVITY' | 'INCIDENT' | 'CONTRACT' | 'MAINTENANCE' | 'GENERAL';
  entityId: string;
  authorId: string;
  authorName: string;
  message: string;
  mentions: string[];
  attachments: CommunicationAttachment[];
  createdAt: string;
  correlationId: string;
}

export type PlanningPeriod = 'TODAY' | 'TOMORROW' | 'THIS_WEEK' | 'NEXT_WEEK' | 'THIS_MONTH';

export interface OperationalPlanningBucket {
  period: PlanningPeriod;
  title: string;
  startDate: string;
  endDate: string;
  activities: ExecutionActivity[];
  taskIds: string[];
  pendingActionIds: string[];
  incidentIds: string[];
  totalCritical: number;
  totalOverdue: number;
}

export interface UserContext357 {
  userId: string;
  userName: string;
  userRole: 'ADMIN' | 'OPERATIONAL_MANAGER' | 'FINANCIAL' | 'ATTENDANT';
  companyId: string;
}
