export interface DriverCnhRenewalCandidate {
  id: string;
  cpf: string;
  cnhNumber: string;
  cnhExpiration: string;
  cnhCategory?: string;
  cnhEar?: boolean;
  rg?: string;
  cnhStatus?: string;
}

export interface DriverCnhRenewalDraft {
  cpf?: string;
  cnhNumber?: string;
  cnhExpiration?: string;
}

export type DriverCnhRenewalDecision =
  | { kind: 'NEW' }
  | { kind: 'RENEW'; driver: DriverCnhRenewalCandidate }
  | { kind: 'REPLAY'; driver: DriverCnhRenewalCandidate }
  | { kind: 'OLDER'; driver: DriverCnhRenewalCandidate }
  | { kind: 'DUPLICATE_WITHOUT_VALIDITY'; driver: DriverCnhRenewalCandidate }
  | { kind: 'IDENTITY_CONFLICT'; driver: DriverCnhRenewalCandidate };

export function decideDriverCnhRenewal(
  draft: DriverCnhRenewalDraft,
  byCpf: DriverCnhRenewalCandidate | null,
  byCnh: DriverCnhRenewalCandidate | null,
): DriverCnhRenewalDecision {
  if (byCpf && byCnh && byCpf.id !== byCnh.id) {
    return { kind: 'IDENTITY_CONFLICT', driver: byCpf };
  }

  const existing = byCpf || byCnh;
  if (!existing) return { kind: 'NEW' };

  if (!draft.cpf || !draft.cnhNumber || existing.cpf !== draft.cpf || existing.cnhNumber !== draft.cnhNumber) {
    return { kind: 'IDENTITY_CONFLICT', driver: existing };
  }

  if (!draft.cnhExpiration) {
    return { kind: 'DUPLICATE_WITHOUT_VALIDITY', driver: existing };
  }

  if (draft.cnhExpiration > existing.cnhExpiration) {
    return { kind: 'RENEW', driver: existing };
  }
  if (draft.cnhExpiration < existing.cnhExpiration) {
    return { kind: 'OLDER', driver: existing };
  }
  return { kind: 'REPLAY', driver: existing };
}
