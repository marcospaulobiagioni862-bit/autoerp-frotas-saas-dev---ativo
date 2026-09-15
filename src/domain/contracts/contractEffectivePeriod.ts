import type { Contract } from '../../types/entities';
import type { ITransactionContext } from '../finance/ITransactionContext';

export class ContractSignatureRequiredError extends Error {}

// PostgreSQL timestamp columns may be returned without an explicit offset.
// The signature writers persist UTC instants; do not reinterpret them in host time.
export function contractTimestampUtc(value: string | undefined): number {
  if (!value) return NaN;
  const normalized = value.replace(' ', 'T');
  return Date.parse(/(?:Z|[+-]\d{2}:?\d{2})$/i.test(normalized) ? normalized : `${normalized}Z`);
}

/** Operational authority only. Never changes the planned date or signed document. */
export async function requireContractEffectivePeriod(contract: Contract, tx: ITransactionContext) {
  const repo = tx.getContractArtifactRepo();
  const pdf = await repo.findCurrentForContract(contract.companyId, contract.id, 'GENERATED_PDF', true);
  const docx = await repo.findCurrentForContract(contract.companyId, contract.id, 'GENERATED_DOCX', true);
  const reviewed = await repo.findCurrentForContract(contract.companyId, contract.id, 'REVIEWED_FINAL_PDF', true);
  const signed = await repo.findCurrentForContract(contract.companyId, contract.id, 'SIGNED_EVIDENCE', true);
  const generated = docx || pdf;
  const source = reviewed || generated;
  const timestamp = contractTimestampUtc(signed?.signedAt);
  if (!generated || !source || !signed || signed.sourceArtifactId !== source.id ||
      signed.isArchived || !signed.isCurrent || !Number.isFinite(timestamp) ||
      timestamp > Date.now() || timestamp < contractTimestampUtc(source.createdAt)) {
    throw new ContractSignatureRequiredError('Valid signed contract evidence required');
  }
  // Match the application's existing UTC calendar-day convention.
  const effectiveStartDate = new Date(timestamp).toISOString().slice(0, 10);
  if (contract.endDate && effectiveStartDate > contract.endDate) {
    throw new ContractSignatureRequiredError('Signature exceeds contract end');
  }
  return {
    plannedStartDate: contract.startDate,
    signedAt: new Date(timestamp).toISOString(),
    effectiveStartDate,
    signatureArtifactId: signed.id,
  };
}
