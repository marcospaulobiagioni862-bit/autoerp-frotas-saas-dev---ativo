export type DriverDocumentIntakeStatus =
  | 'DRAFT'
  | 'DOCUMENT_UPLOADED'
  | 'EXTRACTING'
  | 'REVIEW_REQUIRED'
  | 'APPROVED'
  | 'CONSUMED'
  | 'FAILED'
  | 'ARCHIVED';

export interface DriverDocumentIntakeState {
  id: string;
  companyId: string;
  createdBy: string;
  status: DriverDocumentIntakeStatus;
  idempotencyKey: string;
  attachmentId?: string;
  approvedExtractionId?: string;
  driverId?: string;
  expiresAt: string;
  consumedAt?: string;
  archivedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export class DriverDocumentIntakeTransitionError extends Error {
  constructor(message = 'DRIVER_DOCUMENT_INTAKE_INVALID_TRANSITION') {
    super(message);
    this.name = 'DriverDocumentIntakeTransitionError';
  }
}

function validIsoTimestamp(value: string): boolean {
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) && new Date(timestamp).toISOString() === value;
}

function assertBase(item: DriverDocumentIntakeState): void {
  if (
    !item.id ||
    !item.companyId ||
    !item.createdBy ||
    !item.idempotencyKey ||
    !validIsoTimestamp(item.expiresAt) ||
    !validIsoTimestamp(item.createdAt) ||
    !validIsoTimestamp(item.updatedAt)
  ) {
    throw new DriverDocumentIntakeTransitionError();
  }
}

function assertNotExpired(item: DriverDocumentIntakeState, now: string): void {
  if (!validIsoTimestamp(now) || Date.parse(item.expiresAt) <= Date.parse(now)) {
    throw new DriverDocumentIntakeTransitionError('DRIVER_DOCUMENT_INTAKE_EXPIRED');
  }
}

export function attachDriverDocument(
  item: DriverDocumentIntakeState,
  attachmentId: string,
  now: string,
): DriverDocumentIntakeState {
  assertBase(item);
  assertNotExpired(item, now);
  if (item.status !== 'DRAFT' || !attachmentId.trim() || item.attachmentId) {
    throw new DriverDocumentIntakeTransitionError();
  }
  return { ...item, status: 'DOCUMENT_UPLOADED', attachmentId: attachmentId.trim(), updatedAt: now };
}

export function startDriverDocumentExtraction(
  item: DriverDocumentIntakeState,
  now: string,
): DriverDocumentIntakeState {
  assertBase(item);
  assertNotExpired(item, now);
  if (item.status !== 'DOCUMENT_UPLOADED' || !item.attachmentId) {
    throw new DriverDocumentIntakeTransitionError();
  }
  return { ...item, status: 'EXTRACTING', updatedAt: now };
}

export function requireDriverDocumentReview(
  item: DriverDocumentIntakeState,
  now: string,
): DriverDocumentIntakeState {
  assertBase(item);
  assertNotExpired(item, now);
  if (item.status !== 'EXTRACTING' || !item.attachmentId) {
    throw new DriverDocumentIntakeTransitionError();
  }
  return { ...item, status: 'REVIEW_REQUIRED', updatedAt: now };
}

export function approveDriverDocumentIntake(
  item: DriverDocumentIntakeState,
  approvedExtractionId: string,
  now: string,
): DriverDocumentIntakeState {
  assertBase(item);
  assertNotExpired(item, now);
  if (
    item.status !== 'REVIEW_REQUIRED' ||
    !item.attachmentId ||
    !approvedExtractionId.trim() ||
    item.approvedExtractionId
  ) {
    throw new DriverDocumentIntakeTransitionError();
  }
  return {
    ...item,
    status: 'APPROVED',
    approvedExtractionId: approvedExtractionId.trim(),
    updatedAt: now,
  };
}

export function consumeDriverDocumentIntake(
  item: DriverDocumentIntakeState,
  driverId: string,
  now: string,
): DriverDocumentIntakeState {
  assertBase(item);
  assertNotExpired(item, now);
  if (
    item.status !== 'APPROVED' ||
    !item.attachmentId ||
    !item.approvedExtractionId ||
    !driverId.trim() ||
    item.driverId ||
    item.consumedAt
  ) {
    throw new DriverDocumentIntakeTransitionError();
  }
  return {
    ...item,
    status: 'CONSUMED',
    driverId: driverId.trim(),
    consumedAt: now,
    updatedAt: now,
  };
}

export function failDriverDocumentIntake(
  item: DriverDocumentIntakeState,
  now: string,
): DriverDocumentIntakeState {
  assertBase(item);
  if (item.status === 'CONSUMED' || item.status === 'ARCHIVED') {
    throw new DriverDocumentIntakeTransitionError();
  }
  return { ...item, status: 'FAILED', updatedAt: now };
}

export function archiveDriverDocumentIntake(
  item: DriverDocumentIntakeState,
  now: string,
): DriverDocumentIntakeState {
  assertBase(item);
  if (item.status === 'CONSUMED' || item.status === 'ARCHIVED') {
    throw new DriverDocumentIntakeTransitionError();
  }
  return { ...item, status: 'ARCHIVED', archivedAt: now, updatedAt: now };
}
