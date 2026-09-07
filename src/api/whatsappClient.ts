export type WhatsappConsentStatus = 'GRANTED' | 'REVOKED';
export type WhatsappOutboxStatus = 'HELD_PROVIDER_DISABLED' | 'CANCELLED';

export interface WhatsappConsent {
  driverId: string;
  status: WhatsappConsentStatus;
  consentSource: 'ERP_MANUAL';
  phoneMasked: string;
  grantedAt: string | null;
  revokedAt: string | null;
  updatedAt: string;
}

export interface WhatsappObservabilitySummary {
  generatedAt: string;
  windowDays: 7 | 30 | 90 | 365;
  windowStartAt: string;
  outbox: { total: number; heldProviderDisabled: number; cancelled: number };
  webhookEvents: { total: number; sent: number; delivered: number; read: number; failed: number; repliesReceived: number };
  taskProposals: { total: number; pending: number; approved: number; rejected: number; oldestPendingCreatedAt: string | null };
  providerEnabled: false;
  automaticBusinessMutationApplied: false;
}

export type WhatsappTaskProposalStatus = 'PENDING' | 'APPROVED' | 'REJECTED';
export type WhatsappTaskProposalCategory = 'PAYMENT_QUESTION' | 'DOCUMENT_QUESTION' | 'MAINTENANCE_REPORT' | 'GENERAL';

export interface WhatsappTaskProposal {
  id: string;
  webhookEventId: string;
  outboxId: string;
  driverId: string;
  replyCategory: WhatsappTaskProposalCategory;
  status: WhatsappTaskProposalStatus;
  taskId: string | null;
  reviewedAt: string | null;
  createdAt: string;
  rawReplyPersisted: false;
  businessMutationApplied: false;
}

export type WhatsappOutboxTemplateKey = 'DRIVER_CNH_EXPIRY' | 'TRAFFIC_TICKET_NOTICE' | 'KM_READING_REQUEST';
export type WhatsappOutboxReferenceType = 'DRIVER' | 'TRAFFIC_TICKET' | 'VEHICLE_KM_READING';

export interface WhatsappOutboxTemplateParameters {
  driverName: string;
  cnhExpiration?: string;
  plate?: string;
  vehicleDescription?: string;
  dueDate?: string;
  autoNumber?: string;
  infractionDate?: string;
  infractionLocation?: string;
  organName?: string;
  infractionCode?: string;
  description?: string;
  points?: string;
  amount?: string;
  indicationDeadline?: string;
}

export interface WhatsappOutboxItem {
  id: string;
  driverId: string;
  templateKey: WhatsappOutboxTemplateKey;
  templateVersion?: number;
  templateParameters: WhatsappOutboxTemplateParameters;
  referenceType: WhatsappOutboxReferenceType;
  referenceId: string;
  status: WhatsappOutboxStatus;
  cancellationReason: string | null;
  createdAt: string;
  updatedAt: string;
  cancelledAt: string | null;
  providerCallApplied: false;
}

type JsonRecord = Record<string, unknown>;
const OUTBOX_ID = /^wao_[a-f0-9]{32}$/;
const PROPOSAL_ID = /^wrp_[a-f0-9]{32}$/;
const OBSERVABILITY_WINDOWS = new Set([7, 30, 90, 365]);

function invalid(): never {
  throw new Error('Resposta inválida da autoridade de WhatsApp.');
}

function exactRecord(value: unknown, allowed: readonly string[]): JsonRecord {
  if (!value || typeof value !== 'object' || Array.isArray(value)) invalid();
  const record = value as JsonRecord;
  const allowlist = new Set(allowed);
  if (Object.keys(record).some((key) => !allowlist.has(key))) invalid();
  return record;
}

function nullableIso(value: unknown): string | null {
  if (value === null) return null;
  if (typeof value !== 'string' || !Number.isFinite(Date.parse(value))) invalid();
  return value;
}

function requiredIso(value: unknown): string {
  const parsed = nullableIso(value);
  if (!parsed) invalid();
  return parsed;
}

export function parseWhatsappConsent(value: unknown): WhatsappConsent {
  const item = exactRecord(value, [
    'driverId', 'status', 'consentSource', 'phoneMasked',
    'grantedAt', 'revokedAt', 'updatedAt',
  ]);
  if (
    typeof item.driverId !== 'string' ||
    (item.status !== 'GRANTED' && item.status !== 'REVOKED') ||
    item.consentSource !== 'ERP_MANUAL' ||
    typeof item.phoneMasked !== 'string' ||
    !/^\+55•{7}\d{4}$/.test(item.phoneMasked)
  ) invalid();
  return {
    driverId: item.driverId,
    status: item.status,
    consentSource: item.consentSource,
    phoneMasked: item.phoneMasked,
    grantedAt: nullableIso(item.grantedAt),
    revokedAt: nullableIso(item.revokedAt),
    updatedAt: requiredIso(item.updatedAt),
  };
}

export function parseWhatsappOutboxItem(value: unknown): WhatsappOutboxItem {
  const item = exactRecord(value, [
    'id', 'driverId', 'templateKey', 'templateVersion', 'templateParameters', 'referenceType',
    'referenceId', 'status', 'cancellationReason', 'createdAt', 'updatedAt',
    'cancelledAt', 'providerCallApplied',
  ]);
  if (
    typeof item.id !== 'string' || !OUTBOX_ID.test(item.id) ||
    typeof item.driverId !== 'string' || !item.driverId ||
    !new Set(['DRIVER_CNH_EXPIRY', 'TRAFFIC_TICKET_NOTICE', 'KM_READING_REQUEST']).has(String(item.templateKey)) ||
    (item.templateVersion !== undefined && (!Number.isInteger(item.templateVersion) || Number(item.templateVersion) < 1)) ||
    !new Set(['DRIVER', 'TRAFFIC_TICKET', 'VEHICLE_KM_READING']).has(String(item.referenceType)) ||
    typeof item.referenceId !== 'string' || !item.referenceId ||
    (item.status !== 'HELD_PROVIDER_DISABLED' && item.status !== 'CANCELLED') ||
    (item.cancellationReason !== null && typeof item.cancellationReason !== 'string') ||
    item.providerCallApplied !== false
  ) invalid();

  const templateKey = item.templateKey as WhatsappOutboxTemplateKey;
  const referenceType = item.referenceType as WhatsappOutboxReferenceType;
  let parameters: WhatsappOutboxTemplateParameters;

  if (templateKey === 'DRIVER_CNH_EXPIRY') {
    const parsed = exactRecord(item.templateParameters, ['driverName', 'cnhExpiration']);
    if (
      typeof parsed.driverName !== 'string' ||
      typeof parsed.cnhExpiration !== 'string' ||
      !/^\d{4}-\d{2}-\d{2}$/.test(parsed.cnhExpiration) ||
      referenceType !== 'DRIVER' ||
      item.referenceId !== item.driverId
    ) invalid();
    parameters = { driverName: parsed.driverName, cnhExpiration: parsed.cnhExpiration };
  } else if (templateKey === 'KM_READING_REQUEST') {
    const parsed = exactRecord(item.templateParameters, ['driverName', 'plate', 'vehicleDescription', 'dueDate']);
    if (
      typeof parsed.driverName !== 'string' ||
      typeof parsed.plate !== 'string' ||
      typeof parsed.vehicleDescription !== 'string' ||
      typeof parsed.dueDate !== 'string' ||
      !/^\d{4}-\d{2}-\d{2}$/.test(parsed.dueDate) ||
      referenceType !== 'VEHICLE_KM_READING' ||
      !item.referenceId.endsWith(`:${parsed.dueDate}`)
    ) invalid();
    parameters = {
      driverName: parsed.driverName,
      plate: parsed.plate,
      vehicleDescription: parsed.vehicleDescription,
      dueDate: parsed.dueDate,
    };
  } else {
    const parsed = exactRecord(item.templateParameters, [
      'driverName', 'autoNumber', 'plate', 'infractionDate', 'infractionLocation', 'organName',
      'infractionCode', 'description', 'points', 'amount', 'dueDate', 'indicationDeadline',
    ]);
    const required = [
      parsed.driverName, parsed.autoNumber, parsed.plate, parsed.infractionDate, parsed.infractionLocation,
      parsed.organName, parsed.infractionCode, parsed.description, parsed.points, parsed.amount,
      parsed.dueDate, parsed.indicationDeadline,
    ];
    if (required.some((field) => typeof field !== 'string') || referenceType !== 'TRAFFIC_TICKET') invalid();
    parameters = {
      driverName: parsed.driverName as string,
      autoNumber: parsed.autoNumber as string,
      plate: parsed.plate as string,
      infractionDate: parsed.infractionDate as string,
      infractionLocation: parsed.infractionLocation as string,
      organName: parsed.organName as string,
      infractionCode: parsed.infractionCode as string,
      description: parsed.description as string,
      points: parsed.points as string,
      amount: parsed.amount as string,
      dueDate: parsed.dueDate as string,
      indicationDeadline: parsed.indicationDeadline as string,
    };
  }

  return {
    id: item.id,
    driverId: item.driverId,
    templateKey,
    templateVersion: item.templateVersion === undefined ? undefined : Number(item.templateVersion),
    templateParameters: parameters,
    referenceType,
    referenceId: item.referenceId,
    status: item.status as WhatsappOutboxStatus,
    cancellationReason: item.cancellationReason as string | null,
    createdAt: requiredIso(item.createdAt),
    updatedAt: requiredIso(item.updatedAt),
    cancelledAt: nullableIso(item.cancelledAt),
    providerCallApplied: false,
  };
}

function requiredNonNegativeInteger(value: unknown): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0) invalid();
  return value;
}

export function parseWhatsappObservabilitySummary(value: unknown): WhatsappObservabilitySummary {
  const item = exactRecord(value, [
    'generatedAt', 'windowDays', 'windowStartAt', 'outbox', 'webhookEvents',
    'taskProposals', 'providerEnabled', 'automaticBusinessMutationApplied',
  ]);
  const outbox = exactRecord(item.outbox, ['total', 'heldProviderDisabled', 'cancelled']);
  const webhookEvents = exactRecord(item.webhookEvents, ['total', 'sent', 'delivered', 'read', 'failed', 'repliesReceived']);
  const taskProposals = exactRecord(item.taskProposals, ['total', 'pending', 'approved', 'rejected', 'oldestPendingCreatedAt']);
  const windowDays = requiredNonNegativeInteger(item.windowDays);
  if (
    !OBSERVABILITY_WINDOWS.has(windowDays) ||
    item.providerEnabled !== false ||
    item.automaticBusinessMutationApplied !== false
  ) invalid();
  const parsed = {
    generatedAt: requiredIso(item.generatedAt),
    windowDays: windowDays as WhatsappObservabilitySummary['windowDays'],
    windowStartAt: requiredIso(item.windowStartAt),
    outbox: {
      total: requiredNonNegativeInteger(outbox.total),
      heldProviderDisabled: requiredNonNegativeInteger(outbox.heldProviderDisabled),
      cancelled: requiredNonNegativeInteger(outbox.cancelled),
    },
    webhookEvents: {
      total: requiredNonNegativeInteger(webhookEvents.total),
      sent: requiredNonNegativeInteger(webhookEvents.sent),
      delivered: requiredNonNegativeInteger(webhookEvents.delivered),
      read: requiredNonNegativeInteger(webhookEvents.read),
      failed: requiredNonNegativeInteger(webhookEvents.failed),
      repliesReceived: requiredNonNegativeInteger(webhookEvents.repliesReceived),
    },
    taskProposals: {
      total: requiredNonNegativeInteger(taskProposals.total),
      pending: requiredNonNegativeInteger(taskProposals.pending),
      approved: requiredNonNegativeInteger(taskProposals.approved),
      rejected: requiredNonNegativeInteger(taskProposals.rejected),
      oldestPendingCreatedAt: nullableIso(taskProposals.oldestPendingCreatedAt),
    },
    providerEnabled: false as const,
    automaticBusinessMutationApplied: false as const,
  };
  if (
    parsed.outbox.heldProviderDisabled + parsed.outbox.cancelled !== parsed.outbox.total ||
    parsed.webhookEvents.sent + parsed.webhookEvents.delivered + parsed.webhookEvents.read + parsed.webhookEvents.failed + parsed.webhookEvents.repliesReceived !== parsed.webhookEvents.total ||
    parsed.taskProposals.pending + parsed.taskProposals.approved + parsed.taskProposals.rejected !== parsed.taskProposals.total
  ) invalid();
  return parsed;
}

export function parseWhatsappTaskProposal(value: unknown): WhatsappTaskProposal {
  const item = exactRecord(value, [
    'id', 'webhookEventId', 'outboxId', 'driverId', 'replyCategory', 'status',
    'taskId', 'reviewedAt', 'createdAt', 'rawReplyPersisted', 'businessMutationApplied',
  ]);
  if (
    typeof item.id !== 'string' || !PROPOSAL_ID.test(item.id) ||
    typeof item.webhookEventId !== 'string' || !item.webhookEventId ||
    typeof item.outboxId !== 'string' || !OUTBOX_ID.test(item.outboxId) ||
    typeof item.driverId !== 'string' || !item.driverId ||
    !new Set(['PAYMENT_QUESTION', 'DOCUMENT_QUESTION', 'MAINTENANCE_REPORT', 'GENERAL']).has(String(item.replyCategory)) ||
    !new Set(['PENDING', 'APPROVED', 'REJECTED']).has(String(item.status)) ||
    (item.taskId !== null && (typeof item.taskId !== 'string' || !item.taskId)) ||
    item.rawReplyPersisted !== false ||
    item.businessMutationApplied !== false
  ) invalid();
  const status = item.status as WhatsappTaskProposalStatus;
  const taskId = item.taskId as string | null;
  if ((status === 'PENDING' || status === 'REJECTED') && taskId !== null) invalid();
  if (status === 'APPROVED' && taskId === null) invalid();
  return {
    id: item.id,
    webhookEventId: item.webhookEventId,
    outboxId: item.outboxId,
    driverId: item.driverId,
    replyCategory: item.replyCategory as WhatsappTaskProposalCategory,
    status,
    taskId,
    reviewedAt: nullableIso(item.reviewedAt),
    createdAt: requiredIso(item.createdAt),
    rawReplyPersisted: false,
    businessMutationApplied: false,
  };
}

async function responseError(response: Response): Promise<Error> {
  let message = `Falha na autoridade de WhatsApp (${response.status}).`;
  try {
    const payload = exactRecord(await response.json(), ['error']);
    if (typeof payload.error === 'string') message = payload.error;
  } catch {
    // Preserve the status-only message for malformed failures.
  }
  return new Error(message);
}

export class WhatsappClient {
  static async getObservability(windowDays: WhatsappObservabilitySummary['windowDays'] = 30): Promise<WhatsappObservabilitySummary> {
    if (!OBSERVABILITY_WINDOWS.has(windowDays)) invalid();
    const response = await fetch(`/api/whatsapp/observability?windowDays=${windowDays}`, {
      credentials: 'include',
      headers: { Accept: 'application/json' },
    });
    if (!response.ok) throw await responseError(response);
    const payload = exactRecord(await response.json(), ['item']);
    return parseWhatsappObservabilitySummary(payload.item);
  }

  static async getConsent(driverId: string): Promise<WhatsappConsent | null> {
    const response = await fetch(`/api/whatsapp/consents/${encodeURIComponent(driverId)}`, {
      credentials: 'include',
      headers: { Accept: 'application/json' },
    });
    if (!response.ok) throw await responseError(response);
    const payload = exactRecord(await response.json(), ['item']);
    return payload.item === null ? null : parseWhatsappConsent(payload.item);
  }

  static async decideConsent(
    driverId: string,
    decision: 'GRANT' | 'REVOKE',
  ): Promise<{ item: WhatsappConsent; changed: boolean; cancelledHeldItems: number }> {
    const response = await fetch(`/api/whatsapp/consents/${encodeURIComponent(driverId)}`, {
      method: 'PUT',
      credentials: 'include',
      headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
      body: JSON.stringify({ decision }),
    });
    if (!response.ok) throw await responseError(response);
    const payload = exactRecord(await response.json(), ['item', 'changed', 'cancelledHeldItems']);
    if (typeof payload.changed !== 'boolean' || typeof payload.cancelledHeldItems !== 'number' || !Number.isInteger(payload.cancelledHeldItems) || payload.cancelledHeldItems < 0) invalid();
    return {
      item: parseWhatsappConsent(payload.item),
      changed: payload.changed,
      cancelledHeldItems: Number(payload.cancelledHeldItems),
    };
  }

  static async createCnhReminder(driverId: string): Promise<{ item: WhatsappOutboxItem; created: boolean }> {
    const response = await fetch('/api/whatsapp/outbox', {
      method: 'POST',
      credentials: 'include',
      headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
      body: JSON.stringify({ driverId, templateKey: 'DRIVER_CNH_EXPIRY' }),
    });
    if (!response.ok) throw await responseError(response);
    const payload = exactRecord(await response.json(), ['item', 'created']);
    if (typeof payload.created !== 'boolean') invalid();
    return { item: parseWhatsappOutboxItem(payload.item), created: payload.created };
  }

  static async listTaskProposalsForDriver(driverId: string): Promise<WhatsappTaskProposal[]> {
    const response = await fetch('/api/whatsapp/task-proposals', {
      credentials: 'include',
      headers: { Accept: 'application/json' },
    });
    if (!response.ok) throw await responseError(response);
    const payload = exactRecord(await response.json(), ['items']);
    if (!Array.isArray(payload.items)) invalid();
    return payload.items.map(parseWhatsappTaskProposal).filter((item) => item.driverId === driverId);
  }

  static async reviewTaskProposal(
    proposalId: string,
    decision: 'APPROVE' | 'REJECT',
    reason: string,
  ): Promise<{ item: WhatsappTaskProposal; replay: boolean }> {
    const cleanReason = typeof reason === 'string' ? reason.trim().replace(/\s+/g, ' ') : '';
    if (!PROPOSAL_ID.test(proposalId) || !new Set(['APPROVE', 'REJECT']).has(decision) || cleanReason.length < 3 || cleanReason.length > 500) invalid();
    const response = await fetch(`/api/whatsapp/task-proposals/${encodeURIComponent(proposalId)}/review`, {
      method: 'POST',
      credentials: 'include',
      headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
      body: JSON.stringify({ decision, reason: cleanReason }),
    });
    if (!response.ok) throw await responseError(response);
    const payload = exactRecord(await response.json(), ['item', 'replay']);
    if (typeof payload.replay !== 'boolean') invalid();
    return { item: parseWhatsappTaskProposal(payload.item), replay: payload.replay };
  }

  static async listForDriver(driverId: string): Promise<WhatsappOutboxItem[]> {
    const response = await fetch('/api/whatsapp/outbox', {
      credentials: 'include',
      headers: { Accept: 'application/json' },
    });
    if (!response.ok) throw await responseError(response);
    const payload = exactRecord(await response.json(), ['items']);
    if (!Array.isArray(payload.items)) invalid();
    return payload.items.map(parseWhatsappOutboxItem).filter((item) => item.driverId === driverId);
  }
}
