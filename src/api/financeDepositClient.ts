import { SecurityDeposit, SecurityDepositMovement } from '../types/entities';

export class FinanceDepositApiError extends Error {
  constructor(public readonly status: number, message: string) {
    super(message);
    this.name = 'FinanceDepositApiError';
  }
}

type JsonRecord = Record<string, unknown>;

function asRecord(value: unknown): JsonRecord {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Invalid security deposit response');
  }
  return value as JsonRecord;
}

function validateDeposit(value: unknown): SecurityDeposit {
  const item = asRecord(value);
  if (
    typeof item.id !== 'string' ||
    typeof item.contractId !== 'string' ||
    typeof item.status !== 'string' ||
    !Number.isFinite(Number(item.originalAmount)) ||
    !Number.isFinite(Number(item.receivedAmount)) ||
    !Number.isFinite(Number(item.usedAmount)) ||
    !Number.isFinite(Number(item.returnedAmount))
  ) throw new Error('Invalid security deposit payload');
  return item as unknown as SecurityDeposit;
}

function validateMovement(value: unknown): SecurityDepositMovement {
  const item = asRecord(value);
  if (
    typeof item.id !== 'string' ||
    typeof item.securityDepositId !== 'string' ||
    typeof item.type !== 'string' ||
    !Number.isFinite(Number(item.amount))
  ) throw new Error('Invalid security deposit movement payload');
  return item as unknown as SecurityDepositMovement;
}

async function apiError(response: Response): Promise<FinanceDepositApiError> {
  let message = `Security deposit request failed (${response.status})`;
  try {
    const payload = asRecord(await response.json());
    if (typeof payload.error === 'string' && payload.error) message = payload.error;
  } catch {
    // Fail closed: never fall back to IndexedDB/localStorage.
  }
  return new FinanceDepositApiError(response.status, message);
}

export interface ReceiveSecurityDepositInput {
  contractId: string;
  amount: number;
  financialAccountId: string;
  paymentMethodId: string;
}

export class FinanceDepositClient {
  static async getByContract(contractId: string): Promise<SecurityDeposit | null> {
    const response = await fetch(`/api/finance/security-deposits/by-contract/${encodeURIComponent(contractId)}`, {
      method: 'GET',
      credentials: 'include',
    });
    if (!response.ok) throw await apiError(response);
    const payload = asRecord(await response.json());
    return payload.deposit == null ? null : validateDeposit(payload.deposit);
  }

  static async receive(input: ReceiveSecurityDepositInput): Promise<{ deposit: SecurityDeposit; movement: SecurityDepositMovement }> {
    const response = await fetch('/api/finance/security-deposits/receive', {
      method: 'POST',
      credentials: 'include',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(input),
    });
    if (!response.ok) throw await apiError(response);
    const payload = asRecord(await response.json());
    return {
      deposit: validateDeposit(payload.deposit),
      movement: validateMovement(payload.movement),
    };
  }
}
