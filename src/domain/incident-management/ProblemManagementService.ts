import { ProblemRecord, ProblemStatus, IncidentPriority } from './types';
import { AuditAction } from '../../types/enums';
import { AuditLogRepository } from '../../persistence/repositories/localRepositories';

export class ProblemManagementService {
  private static STORAGE_KEY_PREFIX = '__autoerp_problems_v1_';
  private static IDEMPOTENCY_STORAGE_KEY_PREFIX = '__autoerp_problem_idem_v1_';

  public static async createProblem(params: {
    companyId: string;
    title: string;
    description: string;
    priority: IncidentPriority;
    relatedIncidentIds?: string[];
    ownerId: string;
    idempotencyKey?: string;
  }): Promise<{ success: boolean; problem?: ProblemRecord; message?: string }> {
    if (!params.companyId) {
      return { success: false, message: 'companyId is strictly required' };
    }

    if (params.idempotencyKey) {
      const idemKey = `${this.IDEMPOTENCY_STORAGE_KEY_PREFIX}${params.companyId}_${params.idempotencyKey}`;
      const existingId = localStorage.getItem(idemKey);
      if (existingId) {
        const existing = await this.getProblemById(existingId, params.companyId);
        if (existing) return { success: true, problem: existing, message: 'Returned via idempotency key' };
      }
    }

    const problemId = `prob-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
    const correlationId = `corr-prob-${Date.now()}`;
    const nowIso = new Date().toISOString();

    const problem: ProblemRecord = {
      id: problemId,
      companyId: params.companyId,
      correlationId,
      title: params.title,
      description: params.description,
      status: 'OPEN',
      priority: params.priority,
      relatedIncidentIds: params.relatedIncidentIds || [],
      knownError: false,
      createdAt: nowIso,
      updatedAt: nowIso,
      ownerId: params.ownerId,
      idempotencyKey: params.idempotencyKey,
    };

    await this.saveProblem(problem);

    if (params.idempotencyKey) {
      const idemKey = `${this.IDEMPOTENCY_STORAGE_KEY_PREFIX}${params.companyId}_${params.idempotencyKey}`;
      localStorage.setItem(idemKey, problemId);
    }

    try {
      const auditRepo = new AuditLogRepository();
      await auditRepo.create({
        id: `audit-prb-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
        companyId: params.companyId,
        userId: params.ownerId,
        userName: params.ownerId,
        action: AuditAction.CREATE,
        entityName: 'PROBLEM_RECORD',
        entityId: problemId,
        timestamp: nowIso,
        newState: JSON.stringify({ title: params.title, priority: params.priority, correlationId }),
      });
    } catch {
      // Non-blocking
    }

    return { success: true, problem, message: 'Problem record created successfully' };
  }

  public static async updateProblemStatus(params: {
    problemId: string;
    companyId: string;
    status: ProblemStatus;
    userId: string;
    rootCause?: string;
    contributingFactors?: string[];
    workaround?: string;
    permanentSolution?: string;
    knownError?: boolean;
  }): Promise<{ success: boolean; problem?: ProblemRecord; message?: string }> {
    const problem = await this.getProblemById(params.problemId, params.companyId);
    if (!problem) {
      return { success: false, message: 'Problem record not found or cross-tenant violation' };
    }

    // Require root cause when transitioning to ROOT_CAUSE_IDENTIFIED, RESOLVED or CLOSED
    if (
      (params.status === 'ROOT_CAUSE_IDENTIFIED' || params.status === 'RESOLVED' || params.status === 'CLOSED') &&
      (!params.rootCause && !problem.rootCause)
    ) {
      return { success: false, message: 'Root cause analysis is required before transitioning to this status' };
    }

    const oldStatus = problem.status;
    problem.status = params.status;
    if (params.rootCause) problem.rootCause = params.rootCause;
    if (params.contributingFactors) problem.contributingFactors = params.contributingFactors;
    if (params.workaround) problem.workaround = params.workaround;
    if (params.permanentSolution) problem.permanentSolution = params.permanentSolution;
    if (params.knownError !== undefined) problem.knownError = params.knownError;

    const nowIso = new Date().toISOString();
    problem.updatedAt = nowIso;

    if (params.status === 'RESOLVED' && !problem.resolvedAt) {
      problem.resolvedAt = nowIso;
    }
    if (params.status === 'CLOSED' && !problem.closedAt) {
      problem.closedAt = nowIso;
    }

    await this.saveProblem(problem);

    try {
      const auditRepo = new AuditLogRepository();
      await auditRepo.create({
        id: `audit-prb-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
        companyId: params.companyId,
        userId: params.userId,
        userName: params.userId,
        action: AuditAction.UPDATE,
        entityName: 'PROBLEM_RECORD',
        entityId: problem.id,
        timestamp: nowIso,
        newState: JSON.stringify({ fromStatus: oldStatus, toStatus: params.status, correlationId: problem.correlationId }),
      });
    } catch {
      // Non-blocking
    }

    return { success: true, problem, message: `Problem status updated to ${params.status}` };
  }

  public static async linkIncident(
    problemId: string,
    incidentId: string,
    companyId: string,
    userId: string
  ): Promise<{ success: boolean; problem?: ProblemRecord; message?: string }> {
    const problem = await this.getProblemById(problemId, companyId);
    if (!problem) {
      return { success: false, message: 'Problem record not found' };
    }

    if (!problem.relatedIncidentIds.includes(incidentId)) {
      problem.relatedIncidentIds.push(incidentId);
      problem.updatedAt = new Date().toISOString();
      await this.saveProblem(problem);
    }

    return { success: true, problem, message: 'Incident linked to Problem Record successfully' };
  }

  public static async getProblems(
    companyId: string,
    filters?: { status?: ProblemStatus; knownError?: boolean }
  ): Promise<ProblemRecord[]> {
    if (!companyId) return [];
    const key = `${this.STORAGE_KEY_PREFIX}${companyId}`;
    const raw = localStorage.getItem(key);
    let list: ProblemRecord[] = raw ? JSON.parse(raw) : [];

    if (filters) {
      if (filters.status) list = list.filter((p) => p.status === filters.status);
      if (filters.knownError !== undefined) list = list.filter((p) => p.knownError === filters.knownError);
    }

    return list.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }

  public static async getProblemById(problemId: string, companyId: string): Promise<ProblemRecord | null> {
    if (!companyId || !problemId) return null;
    const list = await this.getProblems(companyId);
    return list.find((p) => p.id === problemId && p.companyId === companyId) || null;
  }

  private static async saveProblem(problem: ProblemRecord): Promise<void> {
    const key = `${this.STORAGE_KEY_PREFIX}${problem.companyId}`;
    const raw = localStorage.getItem(key);
    const list: ProblemRecord[] = raw ? JSON.parse(raw) : [];

    const index = list.findIndex((p) => p.id === problem.id);
    if (index >= 0) {
      list[index] = problem;
    } else {
      list.push(problem);
    }

    localStorage.setItem(key, JSON.stringify(list));
  }
}
