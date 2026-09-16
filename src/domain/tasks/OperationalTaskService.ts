import { OperationalIncident } from '../incidents/OperationalIncidentService';
import { OperationalPendingItem } from '../operations/OperationalPendingService';

export type TaskType =
  | 'VEHICLE'
  | 'DRIVER'
  | 'CONTRACT'
  | 'DELIVERY'
  | 'RETURN'
  | 'MAINTENANCE'
  | 'DOCUMENT'
  | 'INSURANCE'
  | 'TRACKER'
  | 'FINE'
  | 'INCIDENT'
  | 'PENDING'
  | 'INSPECTION'
  | 'SERVICE'
  | 'ADMINISTRATIVE'
  | 'OTHER';

export type TaskPriority = 'P0' | 'P1' | 'P2' | 'P3';

export type TaskStatus =
  | 'PENDING'
  | 'IN_PROGRESS'
  | 'BLOCKED'
  | 'COMPLETED'
  | 'CANCELled'
  | 'ON_HOLD';

export type TaskDeadlineStatus = 'NO_PRAZO' | 'VENCENDO' | 'ATRASADA' | 'CONCLUÍDA' | 'CANCELADA';

export interface TaskEvidence {
  id: string;
  taskId: string;
  companyId: string;
  name: string;
  fileUrl?: string;
  fileType: string;
  uploadedBy: string;
  createdAt: string;
}

export interface TaskFollowUp {
  id: string;
  taskId: string;
  companyId: string;
  note: string;
  nextActionDate?: string;
  performedBy: string;
  createdAt: string;
}

export interface OperationalTask {
  id: string;
  companyId: string;
  title: string;
  description: string;
  type: TaskType;
  priority: TaskPriority;
  status: TaskStatus;
  sourceType?: 'INCIDENT' | 'PENDING' | 'MANUAL' | 'CONTROL' | 'LIFECYCLE';
  sourceId?: string;
  entityType?: string;
  entityId?: string;
  vehiclePlate?: string;
  contractNumber?: string;
  assignedTo?: string;
  createdBy: string;
  createdAt: string;
  dueDate: string;
  startedAt?: string;
  completedAt?: string;
  cancelledAt?: string;
  completedBy?: string;
  resolution?: string;
  notes?: string;
  evidences: TaskEvidence[];
  followUps: TaskFollowUp[];
  deadlineStatus: TaskDeadlineStatus;
  correlationId: string;
  updatedAt: string;
}

export interface TaskSummary {
  companyId: string;
  generatedAt: string;
  counts: {
    total: number;
    p0: number;
    p1: number;
    p2: number;
    p3: number;
    pending: number;
    inProgress: number;
    blocked: number;
    completed: number;
    cancelled: number;
    overdue: number;
    dueSoon: number;
  };
  tasks: OperationalTask[];
}

export interface TaskInput {
  companyId?: string;
  tasks?: OperationalTask[];
  incidents?: OperationalIncident[];
  pendings?: OperationalPendingItem[];
}

/**
 * Validates task state machine transitions.
 */
export function validateTaskStateTransition(currentStatus: TaskStatus, targetStatus: TaskStatus): boolean {
  if (currentStatus === targetStatus) return true;
  switch (currentStatus) {
    case 'PENDING':
      return ['IN_PROGRESS', 'BLOCKED', 'CANCELled', 'ON_HOLD'].includes(targetStatus);
    case 'IN_PROGRESS':
      return ['COMPLETED', 'BLOCKED', 'CANCELled', 'ON_HOLD', 'PENDING'].includes(targetStatus);
    case 'BLOCKED':
      return ['IN_PROGRESS', 'PENDING', 'CANCELled'].includes(targetStatus);
    case 'ON_HOLD':
      return ['IN_PROGRESS', 'PENDING', 'CANCELled'].includes(targetStatus);
    case 'COMPLETED':
    case 'CANCELled':
      return ['PENDING'].includes(targetStatus); // Reopen requires special audit flow
    default:
      return false;
  }
}

/**
 * Generates operational tasks summary, auto-syncing from active incidents and pendings.
 */
export function generateOperationalTaskSummary(input: TaskInput = {}): TaskSummary {
  const targetCompanyId = input.companyId || 'company-main-uuid';
  const now = new Date();
  const todayStr = now.toISOString().split('T')[0];
  const todayTime = now.getTime();

  const existingTasks = Array.isArray(input.tasks) ? input.tasks.filter(t => t && t.companyId === targetCompanyId) : [];
  const incidents = Array.isArray(input.incidents) ? input.incidents.filter(i => i && i.companyId === targetCompanyId && i.status !== 'RESOLVED' && i.status !== 'CLOSED') : [];
  const pendings = Array.isArray(input.pendings) ? input.pendings.filter(p => p && p.companyId === targetCompanyId) : [];

  const taskMap = new Map<string, OperationalTask>();
  existingTasks.forEach(t => {
    taskMap.set(t.id, { ...t });
  });

  // Auto-seed tasks from P0/P1 incidents if no explicit task exists for them
  incidents.forEach((inc, index) => {
    const sourceKey = `task-inc-${inc.id}`;
    const found = Array.from(taskMap.values()).find(t => t.sourceType === 'INCIDENT' && t.sourceId === inc.id);

    if (!found && (inc.priority === 'P0' || inc.priority === 'P1')) {
      const priority: TaskPriority = inc.priority;
      const newTask: OperationalTask = {
        id: `task-auto-inc-${targetCompanyId}-${inc.id}`,
        companyId: targetCompanyId,
        title: `Tratar Ocorrência: ${inc.title}`,
        description: inc.description,
        type: 'INCIDENT',
        priority,
        status: 'PENDING',
        sourceType: 'INCIDENT',
        sourceId: inc.id,
        entityType: 'VEHICLE',
        entityId: inc.vehicleId,
        vehiclePlate: inc.vehiclePlate,
        contractNumber: inc.contractNumber,
        assignedTo: inc.assignedTo || 'Equipe Operacional',
        createdBy: 'Sistema AutoERP',
        createdAt: todayStr,
        dueDate: new Date(now.getTime() + 24 * 3600 * 1000).toISOString().split('T')[0],
        evidences: [],
        followUps: [],
        deadlineStatus: 'NO_PRAZO',
        correlationId: `corr-inc-${inc.id}-${Date.now()}`,
        updatedAt: todayStr,
      };
      taskMap.set(newTask.id, newTask);
    }
  });

  const tasks = Array.from(taskMap.values()).map(task => {
    let deadlineStatus: TaskDeadlineStatus = task.deadlineStatus;
    if (task.status === 'COMPLETED') {
      deadlineStatus = 'CONCLUÍDA';
    } else if (task.status === 'CANCELled') {
      deadlineStatus = 'CANCELADA';
    } else if (task.dueDate) {
      const dueTime = new Date(task.dueDate).getTime();
      if (todayTime > dueTime) {
        deadlineStatus = 'ATRASADA';
      } else if (dueTime - todayTime < 24 * 3600 * 1000) {
        deadlineStatus = 'VENCENDO';
      } else {
        deadlineStatus = 'NO_PRAZO';
      }
    }
    return { ...task, deadlineStatus };
  });

  let p0 = 0, p1 = 0, p2 = 0, p3 = 0;
  let pending = 0, inProgress = 0, blocked = 0, completed = 0, cancelled = 0;
  let overdue = 0, dueSoon = 0;

  tasks.forEach(t => {
    if (t.priority === 'P0') p0++;
    else if (t.priority === 'P1') p1++;
    else if (t.priority === 'P2') p2++;
    else if (t.priority === 'P3') p3++;

    if (t.status === 'PENDING') pending++;
    else if (t.status === 'IN_PROGRESS') inProgress++;
    else if (t.status === 'BLOCKED') blocked++;
    else if (t.status === 'COMPLETED') completed++;
    else if (t.status === 'CANCELled') cancelled++;

    if (t.deadlineStatus === 'ATRASADA') overdue++;
    if (t.deadlineStatus === 'VENCENDO') dueSoon++;
  });

  return {
    companyId: targetCompanyId,
    generatedAt: now.toISOString(),
    counts: {
      total: tasks.length,
      p0,
      p1,
      p2,
      p3,
      pending,
      inProgress,
      blocked,
      completed,
      cancelled,
      overdue,
      dueSoon,
    },
    tasks,
  };
}
