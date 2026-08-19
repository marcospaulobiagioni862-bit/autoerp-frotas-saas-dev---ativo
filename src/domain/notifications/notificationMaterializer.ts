import { randomUUID } from 'node:crypto';
import { UnitOfWork } from '../../db/uow';
import type { PersistentNotification } from '../../types/entities';
import type { AlertCandidate } from './alertEvaluation';
import {
  evaluateContractAlert,
  evaluateDocumentAlert,
  evaluateDriverCnhAlert,
  evaluatePayableAlert,
  evaluateReceivableAlert,
} from './alertEvaluation';

export interface AlertMaterializationResult {
  companyId: string;
  evaluated: number;
  created: number;
  existing: number;
  bySource: Record<string, { evaluated: number; created: number }>;
}

function toNotification(companyId: string, candidate: AlertCandidate, now: string): PersistentNotification {
  return {
    id: randomUUID(),
    companyId,
    sourceType: candidate.sourceType,
    sourceId: candidate.sourceId,
    sourceVersion: candidate.sourceVersion,
    alertStage: candidate.alertStage,
    title: candidate.title,
    message: candidate.message,
    severity: candidate.severity,
    dueDate: candidate.dueDate,
    destinationTab: candidate.destinationTab,
    idempotencyKey: candidate.idempotencyKey,
    status: 'UNREAD',
    createdAt: now,
    updatedAt: now,
  };
}

export async function materializeCompanyAlerts(
  companyId: string,
  now = new Date()
): Promise<AlertMaterializationResult> {
  return await UnitOfWork.run(companyId, async (tx) => {
    const [documents, drivers, contracts, receivables, payables] = await Promise.all([
      tx.getDocumentRepo().findAllByCompany(companyId, { currentOnly: true, includeArchived: false }),
      tx.getDriverRepo().findAllByCompany(companyId),
      tx.getContractRepo().findAllByCompany(companyId),
      tx.getReceivableRepo().findAll({ companyId }),
      tx.getPayableRepo().findAll({ companyId }),
    ]);

    const candidates: AlertCandidate[] = [
      ...documents.map((item) => evaluateDocumentAlert(item, now)),
      ...drivers.map((item) => evaluateDriverCnhAlert(item, now)),
      ...contracts.map((item) => evaluateContractAlert(item, now)),
      ...receivables.map((item) => evaluateReceivableAlert(item, now)),
      ...payables.map((item) => evaluatePayableAlert(item, now)),
    ].filter((item): item is AlertCandidate => item !== null);

    const result: AlertMaterializationResult = {
      companyId,
      evaluated: candidates.length,
      created: 0,
      existing: 0,
      bySource: {},
    };
    const isoNow = now.toISOString();

    for (const candidate of candidates) {
      const bucket = result.bySource[candidate.sourceType] || { evaluated: 0, created: 0 };
      bucket.evaluated += 1;
      result.bySource[candidate.sourceType] = bucket;

      const persisted = await tx.getNotificationRepo().createIfAbsent(
        toNotification(companyId, candidate, isoNow)
      );
      if (persisted.created) {
        result.created += 1;
        bucket.created += 1;
      } else {
        result.existing += 1;
      }
    }

    return result;
  });
}
