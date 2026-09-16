export type IncidentSeverity = 'SEV0' | 'SEV1' | 'SEV2' | 'SEV3' | 'SEV4';
export type IncidentPriority = 'P0' | 'P1' | 'P2' | 'P3';

export type IncidentStatus =
  | 'DETECTED'
  | 'TRIAGED'
  | 'ACKNOWLEDGED'
  | 'INVESTIGATING'
  | 'CONTAINING'
  | 'MITIGATED'
  | 'RESOLVED'
  | 'VALIDATING'
  | 'CLOSED'
  | 'ESCALATED'
  | 'REOPENED'
  | 'CANCELLED';

export type IncidentSource =
  | 'OBSERVABILITY'
  | 'MANUAL'
  | 'SYSTEM_HEALTH'
  | 'BACKUP_SERVICE'
  | 'OPERATIONAL_ALERT'
  | 'GOVERNANCE'
  | 'SECURITY';

export type IncidentCategory =
  | 'SYSTEM_OUTAGE'
  | 'DATA_CORRUPTION'
  | 'SECURITY_BREACH'
  | 'PERFORMANCE_DEGRADATION'
  | 'INTEGRATION_FAILURE'
  | 'OPERATIONAL_ERROR'
  | 'INFRASTRUCTURE'
  | 'FINANCIAL_ATTEMPT_BLOCKED';

export interface ProductionIncident {
  id: string;
  companyId: string;
  correlationId: string;

  title: string;
  description: string;

  severity: IncidentSeverity;
  priority: IncidentPriority;

  status: IncidentStatus;

  source: IncidentSource;
  category: IncidentCategory;

  detectedAt: string;
  acknowledgedAt?: string;
  containedAt?: string;
  resolvedAt?: string;
  closedAt?: string;

  reportedBy: string;
  assignedTo?: string;
  commanderId?: string;
  technicalLeadId?: string;
  operationsLeadId?: string;
  communicationsLeadId?: string;

  affectedModule?: string;
  affectedEntityType?: string;
  affectedEntityId?: string;

  impactDescription: string;

  slaDeadline?: string;
  slaStatus: 'ON_TRACK' | 'WARNING' | 'BREACHED';

  rootCause?: string;
  resolutionSummary?: string;

  idempotencyKey?: string;
  incidentFingerprint: string;

  createdAt: string;
  updatedAt: string;
}

export interface IncidentAuditEntry {
  id: string;
  incidentId: string;
  companyId: string;
  userId: string;
  timestamp: string;
  action: string;
  fromStatus?: IncidentStatus;
  toStatus?: IncidentStatus;
  comment?: string;
  correlationId: string;
  metadata?: Record<string, any>;
}

export type ProblemStatus =
  | 'OPEN'
  | 'INVESTIGATING'
  | 'ROOT_CAUSE_IDENTIFIED'
  | 'MITIGATION_DEFINED'
  | 'PERMANENT_FIX_PLANNED'
  | 'RESOLVED'
  | 'CLOSED';

export interface ProblemRecord {
  id: string;
  companyId: string;
  correlationId: string;

  title: string;
  description: string;

  status: ProblemStatus;
  priority: IncidentPriority;

  relatedIncidentIds: string[];

  rootCause?: string;
  contributingFactors?: string[];

  workaround?: string;
  permanentSolution?: string;

  knownError: boolean;

  createdAt: string;
  updatedAt: string;
  resolvedAt?: string;
  closedAt?: string;

  ownerId: string;
  idempotencyKey?: string;
}

export type PostMortemStatus = 'DRAFT' | 'APPROVED' | 'REVISED';

export interface CorrectiveActionItem {
  id: string;
  description: string;
  targetType: 'TASK' | 'CHANGE_REQUEST' | 'PREVENTIVE_ACTION' | 'RELEASE';
  targetId?: string;
  status: 'PENDING' | 'COMPLETED';
}

export interface PostMortemTimelineEvent {
  timestamp: string;
  event: string;
}

export interface PostMortemRecord {
  id: string;
  incidentId: string;
  companyId: string;
  correlationId: string;

  summary: string;
  impact: string;
  timeline: PostMortemTimelineEvent[];

  detection: string;
  response: string;
  containment: string;
  resolution: string;

  rootCause: string;
  contributingFactors: string[];

  whatWentWell: string[];
  whatWentWrong: string[];

  correctiveActions: CorrectiveActionItem[];
  preventiveActions: string[];

  owner: string;
  reviewedBy?: string;

  status: PostMortemStatus;
  createdAt: string;
  completedAt?: string;
  version: number;

  idempotencyKey?: string;
}

export interface SREMetrics {
  mttdMinutes: number | string;
  mttaMinutes: number | string;
  mttrMinutes: number | string;
  mtbfHours: number | string;

  incidentRate: number;
  reopenRate: number;
  escalationRate: number;
  slaComplianceRate: number;

  totalIncidents: number;
  activeIncidents: number;
  resolvedIncidents: number;

  p0Count: number;
  p1Count: number;
  p2Count: number;
  p3Count: number;

  sev0Count: number;
  sev1Count: number;
  sev2Count: number;
  sev3Count: number;
  sev4Count: number;
}

export interface CreateIncidentParams {
  companyId: string;
  title: string;
  description: string;
  severity: IncidentSeverity;
  priority: IncidentPriority;
  source: IncidentSource;
  category: IncidentCategory;
  reportedBy: string;
  assignedTo?: string;
  commanderId?: string;
  affectedModule?: string;
  affectedEntityType?: string;
  affectedEntityId?: string;
  impactDescription?: string;
  slaDeadlineMinutes?: number;
  idempotencyKey?: string;
  correlationId?: string;
}
