import {
  ProductionIncident,
  IncidentSeverity,
  IncidentPriority,
  IncidentStatus,
  IncidentSource,
  IncidentCategory,
  CreateIncidentParams,
  IncidentAuditEntry,
  PostMortemRecord,
  PostMortemStatus,
  PostMortemTimelineEvent,
  CorrectiveActionItem
} from './types';
import { UserRole, AuditAction } from '../../types/enums';
import { AuditLogRepository } from '../../persistence/repositories/localRepositories';

export class IncidentManagementService {
  private static STORAGE_KEY_PREFIX = '__autoerp_incidents_v1_';
  private static IDEMPOTENCY_STORAGE_KEY_PREFIX = '__autoerp_incident_idem_v1_';
  private static AUDIT_STORAGE_KEY_PREFIX = '__autoerp_incident_audit_v1_';
  private static POSTMORTEM_STORAGE_KEY_PREFIX = '__autoerp_postmortems_v1_';
  private static LOCKS: Set<string> = new Set();

  private static ALLOWED_TRANSITIONS: Record<IncidentStatus, IncidentStatus[]> = {
    DETECTED: ['TRIAGED', 'ACKNOWLEDGED', 'ESCALATED', 'CANCELLED'],
    TRIAGED: ['ACKNOWLEDGED', 'INVESTIGATING', 'CONTAINING', 'ESCALATED', 'CANCELLED'],
    ACKNOWLEDGED: ['INVESTIGATING', 'CONTAINING', 'MITIGATED', 'ESCALATED', 'CANCELLED'],
    INVESTIGATING: ['CONTAINING', 'MITIGATED', 'RESOLVED', 'ESCALATED', 'CANCELLED'],
    CONTAINING: ['MITIGATED', 'RESOLVED', 'INVESTIGATING', 'CANCELLED'],
    MITIGATED: ['RESOLVED', 'VALIDATING', 'INVESTIGATING'],
    RESOLVED: ['VALIDATING', 'CLOSED', 'REOPENED'],
    VALIDATING: ['CLOSED', 'REOPENED', 'RESOLVED'],
    CLOSED: ['REOPENED'],
    ESCALATED: ['INVESTIGATING', 'CONTAINING', 'MITIGATED', 'RESOLVED', 'CANCELLED'],
    REOPENED: ['INVESTIGATING', 'TRIAGED', 'CONTAINING', 'ACKNOWLEDGED'],
    CANCELLED: []
  };

  /**
   * Acquire concurrency lock for a resource
   */
  private static acquireLock(lockKey: string): boolean {
    if (this.LOCKS.has(lockKey)) {
      return false;
    }
    this.LOCKS.add(lockKey);
    return true;
  }

  private static releaseLock(lockKey: string): void {
    this.LOCKS.delete(lockKey);
  }

  /**
   * Helper to compute default SLA minutes based on severity
   */
  public static getDefaultSLAMinutes(severity: IncidentSeverity): number {
    switch (severity) {
      case 'SEV0': return 15;
      case 'SEV1': return 30;
      case 'SEV2': return 120;
      case 'SEV3': return 480;
      case 'SEV4': return 1440;
      default: return 120;
    }
  }

  /**
   * Creates or returns an existing deduplicated ProductionIncident.
   */
  public static async createIncident(
    params: CreateIncidentParams,
    userId: string,
    userRole: string = 'ADMIN'
  ): Promise<{ success: boolean; incident?: ProductionIncident; message?: string; isDuplicate?: boolean }> {
    if (!params.companyId) {
      return { success: false, message: 'companyId is strictly required for multi-tenant isolation' };
    }

    // Check financial core protection rule
    const isFinancialAttempt =
      params.affectedModule === 'FINANCE' ||
      params.category === 'FINANCIAL_ATTEMPT_BLOCKED' ||
      (params.title && params.title.toLowerCase().includes('finance_core_mutation'));

    if (isFinancialAttempt) {
      params.severity = 'SEV0';
      params.priority = 'P0';
      params.category = 'FINANCIAL_ATTEMPT_BLOCKED';
    }

    // Idempotency check
    if (params.idempotencyKey) {
      const idemKey = `${this.IDEMPOTENCY_STORAGE_KEY_PREFIX}${params.companyId}_${params.idempotencyKey}`;
      const existingId = localStorage.getItem(idemKey);
      if (existingId) {
        const existingIncident = await this.getIncidentById(existingId, params.companyId);
        if (existingIncident) {
          return { success: true, incident: existingIncident, message: 'Returned via idempotency key', isDuplicate: true };
        }
      }
    }

    // Fingerprint calculation for deduplication
    const fingerprint = `${params.source}:${params.affectedEntityType || 'global'}:${params.affectedEntityId || 'global'}:${params.category}`;

    const lockKey = `${params.companyId}:create_incident:${fingerprint}`;
    if (!this.acquireLock(lockKey)) {
      return { success: false, message: 'Concurrent creation lock active for this incident scope' };
    }

    try {
      const existingIncidents = await this.getIncidents(params.companyId);
      const duplicateOpen = existingIncidents.find(
        (inc) =>
          inc.incidentFingerprint === fingerprint &&
          inc.status !== 'CLOSED' &&
          inc.status !== 'CANCELLED'
      );

      if (duplicateOpen) {
        return {
          success: true,
          incident: duplicateOpen,
          message: 'Deduplicated: Existing active incident found with matching fingerprint',
          isDuplicate: true,
        };
      }

      const now = new Date();
      const nowIso = now.toISOString();

      const slaMinutes = params.slaDeadlineMinutes ?? this.getDefaultSLAMinutes(params.severity);
      const slaDeadline = new Date(now.getTime() + slaMinutes * 60 * 1000).toISOString();

      const incidentId = `inc-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
      const correlationId = params.correlationId || `corr-inc-${Date.now()}`;

      const newIncident: ProductionIncident = {
        id: incidentId,
        companyId: params.companyId,
        correlationId,
        title: params.title || 'Untitled Production Incident',
        description: params.description || '',
        severity: params.severity,
        priority: params.priority,
        status: 'DETECTED',
        source: params.source,
        category: params.category,
        detectedAt: nowIso,
        reportedBy: params.reportedBy || userId,
        assignedTo: params.assignedTo,
        commanderId: params.commanderId,
        affectedModule: params.affectedModule,
        affectedEntityType: params.affectedEntityType,
        affectedEntityId: params.affectedEntityId,
        impactDescription: params.impactDescription || 'Under evaluation',
        slaDeadline,
        slaStatus: 'ON_TRACK',
        idempotencyKey: params.idempotencyKey,
        incidentFingerprint: fingerprint,
        createdAt: nowIso,
        updatedAt: nowIso,
      };

      // Persist
      await this.saveIncident(newIncident);

      if (params.idempotencyKey) {
        const idemKey = `${this.IDEMPOTENCY_STORAGE_KEY_PREFIX}${params.companyId}_${params.idempotencyKey}`;
        localStorage.setItem(idemKey, incidentId);
      }

      // Audit Log
      await this.registerAuditLog(
        params.companyId,
        userId,
        AuditAction.CREATE,
        'INCIDENT_CREATED',
        incidentId,
        correlationId,
        {
          severity: params.severity,
          priority: params.priority,
          category: params.category,
          financialAttemptBlocked: isFinancialAttempt,
        }
      );

      return { success: true, incident: newIncident, message: 'Incident registered successfully' };
    } finally {
      this.releaseLock(lockKey);
    }
  }

  /**
   * Transition Incident Status following state machine constraints.
   */
  public static async transitionStatus(params: {
    incidentId: string;
    companyId: string;
    targetStatus: IncidentStatus;
    userId: string;
    comment?: string;
    idempotencyKey?: string;
  }): Promise<{ success: boolean; incident?: ProductionIncident; message?: string }> {
    if (!params.companyId || !params.incidentId) {
      return { success: false, message: 'companyId and incidentId are required' };
    }

    const lockKey = `${params.companyId}:transition:${params.incidentId}`;
    if (!this.acquireLock(lockKey)) {
      return { success: false, message: 'Concurrent status transition lock active' };
    }

    try {
      const incident = await this.getIncidentById(params.incidentId, params.companyId);
      if (!incident) {
        return { success: false, message: 'Incident not found or cross-tenant access denied' };
      }

      if (incident.companyId !== params.companyId) {
        // Cross tenant violation alert
        await this.registerAuditLog(
          params.companyId,
          params.userId,
          AuditAction.UPDATE,
          'CROSS_TENANT_VIOLATION_ATTEMPT',
          params.incidentId,
          incident.correlationId,
          { attemptedCompany: params.companyId, actualCompany: incident.companyId }
        );
        return { success: false, message: 'CROSS_TENANT_VIOLATION: Access denied' };
      }

      if (incident.status === params.targetStatus) {
        return { success: true, incident, message: 'Incident already in target status' };
      }

      // Prohibited state transitions checks
      const allowed = this.ALLOWED_TRANSITIONS[incident.status] || [];
      if (!allowed.includes(params.targetStatus)) {
        return {
          success: false,
          message: `Invalid state transition from ${incident.status} to ${params.targetStatus}`,
        };
      }

      // Specific explicit prohibitions
      if (incident.status === 'CLOSED' && params.targetStatus === 'INVESTIGATING') {
        return { success: false, message: 'Invalid transition: CLOSED incident must be REOPENED before investigating' };
      }
      if (incident.status === 'RESOLVED' && params.targetStatus === 'CONTAINING') {
        return { success: false, message: 'Invalid transition: RESOLVED incident cannot transition back to CONTAINING' };
      }
      if (incident.status === 'CANCELLED' && params.targetStatus === 'RESOLVED') {
        return { success: false, message: 'Invalid transition: CANCELLED incident cannot be RESOLVED' };
      }

      const nowIso = new Date().toISOString();
      const oldStatus = incident.status;
      incident.status = params.targetStatus;
      incident.updatedAt = nowIso;

      if (params.targetStatus === 'ACKNOWLEDGED' && !incident.acknowledgedAt) {
        incident.acknowledgedAt = nowIso;
      }
      if (params.targetStatus === 'CONTAINING' && !incident.containedAt) {
        incident.containedAt = nowIso;
      }
      if (params.targetStatus === 'RESOLVED' && !incident.resolvedAt) {
        incident.resolvedAt = nowIso;
      }
      if (params.targetStatus === 'CLOSED' && !incident.closedAt) {
        incident.closedAt = nowIso;
      }

      await this.saveIncident(incident);

      await this.registerAuditLog(
        params.companyId,
        params.userId,
        AuditAction.UPDATE,
        `INCIDENT_${params.targetStatus}`,
        incident.id,
        incident.correlationId,
        { fromStatus: oldStatus, toStatus: params.targetStatus, comment: params.comment }
      );

      return { success: true, incident, message: `Transitioned from ${oldStatus} to ${params.targetStatus}` };
    } finally {
      this.releaseLock(lockKey);
    }
  }

  /**
   * Assigns Incident Commander & Operational Roles
   */
  public static async assignCommander(params: {
    incidentId: string;
    companyId: string;
    commanderId: string;
    userId: string;
    technicalLeadId?: string;
    operationsLeadId?: string;
    communicationsLeadId?: string;
  }): Promise<{ success: boolean; incident?: ProductionIncident; message?: string }> {
    const incident = await this.getIncidentById(params.incidentId, params.companyId);
    if (!incident) {
      return { success: false, message: 'Incident not found or cross-tenant access denied' };
    }

    if (incident.companyId !== params.companyId) {
      return { success: false, message: 'Cross-tenant violation' };
    }

    incident.commanderId = params.commanderId;
    if (params.technicalLeadId) incident.technicalLeadId = params.technicalLeadId;
    if (params.operationsLeadId) incident.operationsLeadId = params.operationsLeadId;
    if (params.communicationsLeadId) incident.communicationsLeadId = params.communicationsLeadId;
    incident.updatedAt = new Date().toISOString();

    await this.saveIncident(incident);

    await this.registerAuditLog(
      params.companyId,
      params.userId,
      AuditAction.UPDATE,
      'COMMANDER_ASSIGNED',
      incident.id,
      incident.correlationId,
      { commanderId: params.commanderId }
    );

    return { success: true, incident, message: 'Incident Commander assigned successfully' };
  }

  /**
   * Escalates an incident according to severity / SLA breach.
   */
  public static async escalateIncident(params: {
    incidentId: string;
    companyId: string;
    userId: string;
    reason: string;
    idempotencyKey?: string;
  }): Promise<{ success: boolean; incident?: ProductionIncident; message?: string }> {
    return this.transitionStatus({
      incidentId: params.incidentId,
      companyId: params.companyId,
      targetStatus: 'ESCALATED',
      userId: params.userId,
      comment: `ESCALATION: ${params.reason}`,
      idempotencyKey: params.idempotencyKey,
    });
  }

  /**
   * Resolves an incident with mandatory Root Cause Analysis
   */
  public static async resolveIncident(params: {
    incidentId: string;
    companyId: string;
    userId: string;
    rootCause: string;
    resolutionSummary: string;
    idempotencyKey?: string;
  }): Promise<{ success: boolean; incident?: ProductionIncident; message?: string }> {
    if (!params.rootCause || params.rootCause.trim() === '') {
      return { success: false, message: 'Root cause is mandatory for resolving an incident' };
    }

    const incident = await this.getIncidentById(params.incidentId, params.companyId);
    if (!incident) {
      return { success: false, message: 'Incident not found' };
    }

    incident.rootCause = params.rootCause;
    incident.resolutionSummary = params.resolutionSummary;
    await this.saveIncident(incident);

    return this.transitionStatus({
      incidentId: params.incidentId,
      companyId: params.companyId,
      targetStatus: 'RESOLVED',
      userId: params.userId,
      comment: `RESOLVED: ${params.resolutionSummary}`,
      idempotencyKey: params.idempotencyKey,
    });
  }

  /**
   * Closes an incident
   */
  public static async closeIncident(params: {
    incidentId: string;
    companyId: string;
    userId: string;
    idempotencyKey?: string;
  }): Promise<{ success: boolean; incident?: ProductionIncident; message?: string }> {
    return this.transitionStatus({
      incidentId: params.incidentId,
      companyId: params.companyId,
      targetStatus: 'CLOSED',
      userId: params.userId,
      comment: 'Closed incident after validation',
      idempotencyKey: params.idempotencyKey,
    });
  }

  /**
   * Reopens a closed or resolved incident
   */
  public static async reopenIncident(params: {
    incidentId: string;
    companyId: string;
    userId: string;
    reason: string;
    idempotencyKey?: string;
  }): Promise<{ success: boolean; incident?: ProductionIncident; message?: string }> {
    return this.transitionStatus({
      incidentId: params.incidentId,
      companyId: params.companyId,
      targetStatus: 'REOPENED',
      userId: params.userId,
      comment: `REOPENED: ${params.reason}`,
      idempotencyKey: params.idempotencyKey,
    });
  }

  /**
   * Post-Mortem Creation
   */
  public static async createPostMortem(params: {
    incidentId: string;
    companyId: string;
    userId: string;
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
    idempotencyKey?: string;
  }): Promise<{ success: boolean; postMortem?: PostMortemRecord; message?: string }> {
    if (!params.companyId || !params.incidentId) {
      return { success: false, message: 'companyId and incidentId are required' };
    }

    const incident = await this.getIncidentById(params.incidentId, params.companyId);
    if (!incident) {
      return { success: false, message: 'Associated incident not found' };
    }

    const pmKey = `${this.POSTMORTEM_STORAGE_KEY_PREFIX}${params.companyId}`;
    const raw = localStorage.getItem(pmKey);
    const pms: PostMortemRecord[] = raw ? JSON.parse(raw) : [];

    const existingIndex = pms.findIndex((p) => p.incidentId === params.incidentId);
    let version = 1;

    if (existingIndex >= 0 && pms[existingIndex].status === 'APPROVED') {
      version = pms[existingIndex].version + 1;
    }

    const postMortem: PostMortemRecord = {
      id: `pm-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      incidentId: params.incidentId,
      companyId: params.companyId,
      correlationId: incident.correlationId,
      summary: params.summary,
      impact: params.impact,
      timeline: params.timeline || [],
      detection: params.detection,
      response: params.response,
      containment: params.containment,
      resolution: params.resolution,
      rootCause: params.rootCause,
      contributingFactors: params.contributingFactors || [],
      whatWentWell: params.whatWentWell || [],
      whatWentWrong: params.whatWentWrong || [],
      correctiveActions: params.correctiveActions || [],
      preventiveActions: params.preventiveActions || [],
      owner: params.userId,
      status: 'DRAFT',
      createdAt: new Date().toISOString(),
      version,
      idempotencyKey: params.idempotencyKey,
    };

    if (existingIndex >= 0) {
      pms[existingIndex] = postMortem;
    } else {
      pms.push(postMortem);
    }

    localStorage.setItem(pmKey, JSON.stringify(pms));

    await this.registerAuditLog(
      params.companyId,
      params.userId,
      AuditAction.CREATE,
      'POSTMORTEM_CREATED',
      postMortem.id,
      incident.correlationId,
      { incidentId: params.incidentId, version }
    );

    return { success: true, postMortem, message: 'Post-Mortem created successfully in DRAFT' };
  }

  /**
   * Approves Post-Mortem (makes version immutable)
   */
  public static async approvePostMortem(params: {
    postMortemId: string;
    companyId: string;
    userId: string;
  }): Promise<{ success: boolean; postMortem?: PostMortemRecord; message?: string }> {
    const pmKey = `${this.POSTMORTEM_STORAGE_KEY_PREFIX}${params.companyId}`;
    const raw = localStorage.getItem(pmKey);
    const pms: PostMortemRecord[] = raw ? JSON.parse(raw) : [];

    const pm = pms.find((p) => p.id === params.postMortemId && p.companyId === params.companyId);
    if (!pm) {
      return { success: false, message: 'Post-Mortem record not found' };
    }

    pm.status = 'APPROVED';
    pm.reviewedBy = params.userId;
    pm.completedAt = new Date().toISOString();

    localStorage.setItem(pmKey, JSON.stringify(pms));

    await this.registerAuditLog(
      params.companyId,
      params.userId,
      AuditAction.UPDATE,
      'POSTMORTEM_APPROVED',
      pm.id,
      pm.correlationId,
      { incidentId: pm.incidentId }
    );

    return { success: true, postMortem: pm, message: 'Post-Mortem approved successfully' };
  }

  /**
   * Retrieves Post-Mortem by incident
   */
  public static async getPostMortemByIncident(
    incidentId: string,
    companyId: string
  ): Promise<PostMortemRecord | null> {
    const pmKey = `${this.POSTMORTEM_STORAGE_KEY_PREFIX}${companyId}`;
    const raw = localStorage.getItem(pmKey);
    if (!raw) return null;
    const pms: PostMortemRecord[] = JSON.parse(raw);
    return pms.find((p) => p.incidentId === incidentId && p.companyId === companyId) || null;
  }

  /**
   * Retrieve list of incidents for a company filtered by params
   */
  public static async getIncidents(
    companyId: string,
    filters?: {
      status?: IncidentStatus;
      priority?: IncidentPriority;
      severity?: IncidentSeverity;
      commanderId?: string;
      assignedTo?: string;
      search?: string;
    }
  ): Promise<ProductionIncident[]> {
    if (!companyId) return [];

    const key = `${this.STORAGE_KEY_PREFIX}${companyId}`;
    const raw = localStorage.getItem(key);
    let list: ProductionIncident[] = raw ? JSON.parse(raw) : [];

    // Recalculate SLA statuses dynamically
    const now = new Date().getTime();
    list = list.map((inc) => {
      if (inc.status !== 'RESOLVED' && inc.status !== 'CLOSED' && inc.status !== 'CANCELLED' && inc.slaDeadline) {
        const deadline = new Date(inc.slaDeadline).getTime();
        const created = new Date(inc.createdAt).getTime();
        const total = deadline - created;
        const remaining = deadline - now;

        if (remaining <= 0) {
          inc.slaStatus = 'BREACHED';
        } else if (remaining / (total || 1) <= 0.2) {
          inc.slaStatus = 'WARNING';
        } else {
          inc.slaStatus = 'ON_TRACK';
        }
      }
      return inc;
    });

    if (filters) {
      if (filters.status) list = list.filter((i) => i.status === filters.status);
      if (filters.priority) list = list.filter((i) => i.priority === filters.priority);
      if (filters.severity) list = list.filter((i) => i.severity === filters.severity);
      if (filters.commanderId) list = list.filter((i) => i.commanderId === filters.commanderId);
      if (filters.assignedTo) list = list.filter((i) => i.assignedTo === filters.assignedTo);
      if (filters.search) {
        const query = filters.search.toLowerCase();
        list = list.filter(
          (i) =>
            i.title.toLowerCase().includes(query) ||
            i.description.toLowerCase().includes(query) ||
            i.correlationId.toLowerCase().includes(query) ||
            i.id.toLowerCase().includes(query)
        );
      }
    }

    return list.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }

  /**
   * Get incident by ID with tenant security
   */
  public static async getIncidentById(incidentId: string, companyId: string): Promise<ProductionIncident | null> {
    if (!companyId || !incidentId) return null;
    const incidents = await this.getIncidents(companyId);
    return incidents.find((i) => i.id === incidentId && i.companyId === companyId) || null;
  }

  private static async saveIncident(incident: ProductionIncident): Promise<void> {
    const key = `${this.STORAGE_KEY_PREFIX}${incident.companyId}`;
    const raw = localStorage.getItem(key);
    const list: ProductionIncident[] = raw ? JSON.parse(raw) : [];

    const index = list.findIndex((i) => i.id === incident.id);
    if (index >= 0) {
      list[index] = incident;
    } else {
      list.push(incident);
    }

    localStorage.setItem(key, JSON.stringify(list));
  }

  private static async registerAuditLog(
    companyId: string,
    userId: string,
    action: AuditAction,
    eventCode: string,
    entityId: string,
    correlationId: string,
    metadata?: Record<string, any>
  ): Promise<void> {
    try {
      const auditRepo = new AuditLogRepository();
      await auditRepo.create({
        id: `audit-inc-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
        companyId,
        userId,
        userName: userId,
        action,
        entityName: 'PRODUCTION_INCIDENT',
        entityId,
        timestamp: new Date().toISOString(),
        newState: JSON.stringify({ eventCode, correlationId, metadata }),
      });
    } catch {
      // Non-blocking
    }
  }
}
