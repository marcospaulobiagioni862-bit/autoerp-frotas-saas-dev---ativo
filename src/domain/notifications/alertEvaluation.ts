import type {
  AccountPayable,
  AccountReceivable,
  Contract,
  DocumentAlertStage,
  DocumentRecord,
  Driver,
  NotificationSeverity,
} from '../../types/entities';
import { ContractStatus, ObligationStatus } from '../../types/enums';
import { alertStageForDays, daysUntilExpiration } from '../documents/documentPolicy';

export type AlertSourceType = 'DOCUMENT' | 'DRIVER_CNH' | 'CONTRACT' | 'RECEIVABLE' | 'PAYABLE';

export interface AlertCandidate {
  sourceType: AlertSourceType;
  sourceId: string;
  sourceVersion?: string;
  alertStage: Exclude<DocumentAlertStage, 'NONE'>;
  title: string;
  message: string;
  severity: NotificationSeverity;
  dueDate: string;
  destinationTab: string;
  idempotencyKey: string;
}

const IMMEDIATE_STAGES = new Set<DocumentAlertStage>(['POST_DUE', 'DUE_TODAY', 'D7']);
const LIVE_OBLIGATION_STATUSES = new Set<ObligationStatus>([
  ObligationStatus.PENDING,
  ObligationStatus.PARTIALLY_PAID,
  ObligationStatus.OVERDUE,
]);

function dateOnly(value?: string): string | undefined {
  if (!value) return undefined;
  const candidate = value.slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(candidate) ? candidate : undefined;
}

export function stageForDueDate(value: string | undefined, now = new Date()): DocumentAlertStage {
  const dueDate = dateOnly(value);
  if (!dueDate) return 'NONE';
  try {
    return alertStageForDays(daysUntilExpiration(dueDate, now));
  } catch {
    return 'NONE';
  }
}

export function severityForStage(stage: Exclude<DocumentAlertStage, 'NONE'>): NotificationSeverity {
  if (stage === 'POST_DUE' || stage === 'DUE_TODAY') return 'DANGER';
  if (stage === 'D7' || stage === 'D15' || stage === 'D30') return 'WARNING';
  return 'INFO';
}

function stageText(stage: Exclude<DocumentAlertStage, 'NONE'>): string {
  if (stage === 'POST_DUE') return 'vencido';
  if (stage === 'DUE_TODAY') return 'vence hoje';
  if (stage === 'D7') return 'vence em até 7 dias';
  if (stage === 'D15') return 'vence em até 15 dias';
  if (stage === 'D30') return 'vence em até 30 dias';
  if (stage === 'D60') return 'vence em até 60 dias';
  return 'vence em até 90 dias';
}

export function evaluateDocumentAlert(document: DocumentRecord, now = new Date()): AlertCandidate | null {
  if (document.isArchived || !document.isCurrent) return null;
  const dueDate = dateOnly(document.expirationDate);
  if (!dueDate) return null;
  const stage = stageForDueDate(dueDate, now);
  if (stage === 'NONE') return null;
  const sourceVersion = `v${document.versionNumber}`;
  return {
    sourceType: 'DOCUMENT',
    sourceId: document.id,
    sourceVersion,
    alertStage: stage,
    title: `${document.documentType}: ${stageText(stage)}`,
    message: `${document.documentType} (${document.subjectType}) ${stageText(stage)}. Vencimento: ${dueDate}.`,
    severity: severityForStage(stage),
    dueDate,
    destinationTab: document.subjectType === 'DRIVER' ? 'drivers' : 'compliance',
    idempotencyKey: `DOCUMENT:${document.id}:${sourceVersion}:${stage}`,
  };
}

export function evaluateDriverCnhAlert(driver: Driver, now = new Date()): AlertCandidate | null {
  if (driver.isArchived) return null;
  const dueDate = dateOnly(driver.cnhExpiration);
  if (!dueDate) return null;
  const stage = stageForDueDate(dueDate, now);
  if (stage === 'NONE') return null;
  return {
    sourceType: 'DRIVER_CNH',
    sourceId: driver.id,
    sourceVersion: dueDate,
    alertStage: stage,
    title: `CNH de ${driver.fullName}: ${stageText(stage)}`,
    message: `A CNH de ${driver.fullName} ${stageText(stage)}. Vencimento: ${dueDate}.`,
    severity: severityForStage(stage),
    dueDate,
    destinationTab: 'drivers',
    idempotencyKey: `DRIVER_CNH:${driver.id}:${dueDate}:${stage}`,
  };
}

export function evaluateContractAlert(contract: Contract, now = new Date()): AlertCandidate | null {
  if (contract.isArchived || contract.status !== ContractStatus.ACTIVE) return null;
  const dueDate = dateOnly(contract.endDate);
  if (!dueDate) return null;
  const stage = stageForDueDate(dueDate, now);
  if (stage === 'NONE' || !IMMEDIATE_STAGES.has(stage)) return null;
  return {
    sourceType: 'CONTRACT',
    sourceId: contract.id,
    sourceVersion: dueDate,
    alertStage: stage,
    title: `Contrato ${contract.contractNumber}: ${stageText(stage)}`,
    message: `O contrato ${contract.contractNumber} ${stageText(stage)}. Término: ${dueDate}.`,
    severity: severityForStage(stage),
    dueDate,
    destinationTab: 'contracts',
    idempotencyKey: `CONTRACT:${contract.id}:${dueDate}:${stage}`,
  };
}

function evaluateObligationAlert(
  obligation: AccountReceivable | AccountPayable,
  sourceType: 'RECEIVABLE' | 'PAYABLE',
  destinationTab: 'receivables' | 'payables',
  now: Date
): AlertCandidate | null {
  if (obligation.balanceAmount <= 0 || !LIVE_OBLIGATION_STATUSES.has(obligation.status)) return null;
  const dueDate = dateOnly(obligation.dueDate);
  if (!dueDate) return null;
  const stage = stageForDueDate(dueDate, now);
  if (stage === 'NONE' || !IMMEDIATE_STAGES.has(stage)) return null;
  const label = sourceType === 'RECEIVABLE' ? 'Conta a receber' : 'Conta a pagar';
  return {
    sourceType,
    sourceId: obligation.id,
    sourceVersion: dueDate,
    alertStage: stage,
    title: `${label}: ${stageText(stage)}`,
    message: `${obligation.description} — ${stageText(stage)}. Vencimento: ${dueDate}. Saldo: ${obligation.balanceAmount.toFixed(2)}.`,
    severity: severityForStage(stage),
    dueDate,
    destinationTab,
    idempotencyKey: `${sourceType}:${obligation.id}:${dueDate}:${stage}`,
  };
}

export function evaluateReceivableAlert(item: AccountReceivable, now = new Date()): AlertCandidate | null {
  return evaluateObligationAlert(item, 'RECEIVABLE', 'receivables', now);
}

export function evaluatePayableAlert(item: AccountPayable, now = new Date()): AlertCandidate | null {
  return evaluateObligationAlert(item, 'PAYABLE', 'payables', now);
}
