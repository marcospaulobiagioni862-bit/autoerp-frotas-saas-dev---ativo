import type { Contract } from '../../types/entities';
import type { ITransactionContext } from '../finance/ITransactionContext';

export class ContractSignatureRequiredError extends Error {}

// PostgreSQL timestamp columns may be returned without an explicit offset.
export function contractTimestampUtc(value: string | undefined): number {
  if (!value) return NaN;
  const normalized = value.replace(' ', 'T');
  return Date.parse(/(?:Z|[+-]\d{2}:?\d{2})$/i.test(normalized) ? normalized : `${normalized}Z`);
}

/**
 * V2 operational authority.
 *
 * A assinatura permanece como evidência documental, mas não governa vínculo,
 * vigência operacional nem geração financeira. O contrato salvo usa a data
 * inicial definida pelo operador como fonte de verdade operacional.
 */
export async function requireContractEffectivePeriod(contract: Contract, _tx: ITransactionContext) {
  const effectiveStartDate = contract.startDate;
  const timestamp = contractTimestampUtc(contract.createdAt);
  const operationalTimestamp = Number.isFinite(timestamp)
    ? new Date(timestamp).toISOString()
    : `${effectiveStartDate}T00:00:00.000Z`;

  if (contract.endDate && effectiveStartDate > contract.endDate) {
    throw new ContractSignatureRequiredError('Contract start exceeds contract end');
  }

  return {
    plannedStartDate: contract.startDate,
    signedAt: operationalTimestamp,
    effectiveStartDate,
    // Mantém a interface legada estável sem transformar assinatura em gate.
    signatureArtifactId: `operational:${contract.id}`,
  };
}
