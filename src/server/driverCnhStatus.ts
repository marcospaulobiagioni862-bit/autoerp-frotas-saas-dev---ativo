import { DocumentStatus } from '../types/enums';

export function evaluateCnhStatus(expiration: string): DocumentStatus {
  const end = new Date(`${expiration}T00:00:00Z`).getTime();
  const now = new Date();
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const days = Math.ceil((end - today) / 86_400_000);
  if (days < 0) return DocumentStatus.EXPIRED;
  if (days <= 30) return DocumentStatus.EXPIRING_SOON;
  return DocumentStatus.VALID;
}
