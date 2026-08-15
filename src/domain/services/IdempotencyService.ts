// AutoERP Idempotency Service

import { AccountReceivableRepository, AccountPayableRepository } from '../../persistence/repositories/localRepositories';
import { OriginType } from '../../types/enums';

export class IdempotencyService {
  private static receivableRepo = new AccountReceivableRepository();
  private static payableRepo = new AccountPayableRepository();
  private static locks = new Set<string>();

  public static async executeWithLock<T>(key: string, fn: () => Promise<T>): Promise<T> {
    while (this.locks.has(key)) {
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    this.locks.add(key);
    try {
      return await fn();
    } finally {
      this.locks.delete(key);
    }
  }

  public static buildKey(
    originType: OriginType,
    originId: string,
    installmentNumber: number = 1,
    periodRef?: string,
    companyId?: string
  ): string {
    const periodPart = periodRef ? `_ref_${periodRef}` : '';
    if (companyId) {
      return `${companyId}_${originType}_${originId}${periodPart}_inst_${installmentNumber}`;
    }
    return `${originType}_${originId}${periodPart}_inst_${installmentNumber}`;
  }

  public static buildLegacyKey(
    originType: OriginType,
    originId: string,
    installmentNumber: number = 1,
    periodRef?: string
  ): string {
    const periodPart = periodRef ? `_ref_${periodRef}` : '';
    return `${originType}_${originId}${periodPart}_inst_${installmentNumber}`;
  }

  public static async isReceivableDuplicate(key: string): Promise<boolean> {
    const existing = await this.receivableRepo.findByIdempotencyKey(key);
    return existing !== null;
  }

  public static async isPayableDuplicate(key: string): Promise<boolean> {
    const existing = await this.payableRepo.findByIdempotencyKey(key);
    return existing !== null;
  }
}
