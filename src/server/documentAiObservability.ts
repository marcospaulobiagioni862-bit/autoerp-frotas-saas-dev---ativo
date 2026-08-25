export type DocumentAiRuntimeMode = 'DISABLED' | 'MISCONFIGURED' | 'READY_SYNTHETIC_ONLY';

export const DOCUMENT_AI_OBSERVABLE_STATUSES = [
  'PENDING',
  'PROCESSING',
  'REVIEW_REQUIRED',
  'APPROVED',
  'REJECTED',
  'FAILED',
] as const;

export type DocumentAiObservableStatus = typeof DOCUMENT_AI_OBSERVABLE_STATUSES[number];

interface DocumentAiObservabilityEnvironment {
  DOC_AI_WORKER_ENABLED?: string;
  DOC_AI_PROVIDER?: string;
  DOC_AI_GEMINI_MODEL?: string;
  DOC_AI_SYNTHETIC_SHA256_ALLOWLIST?: string;
  GEMINI_API_KEY?: string;
  ATTACHMENT_STORAGE_PROVIDER?: string;
  ATTACHMENT_STORAGE_DIR?: string;
  R2_ACCOUNT_ID?: string;
  R2_ACCESS_KEY_ID?: string;
  R2_SECRET_ACCESS_KEY?: string;
  R2_BUCKET?: string;
}

export interface DocumentAiObservabilitySnapshot {
  runtime: {
    mode: DocumentAiRuntimeMode;
    provider: 'GEMINI' | null;
    syntheticOnly: true;
    automaticExecution: false;
  };
  counts: Record<DocumentAiObservableStatus, number> & { total: number };
}

function present(value: string | undefined): boolean {
  return Boolean(String(value || '').trim());
}

function validChecksumAllowlist(value: string | undefined): boolean {
  const checksums = String(value || '').split(',').map((item) => item.trim()).filter(Boolean);
  return checksums.length > 0 && checksums.every((checksum) => /^[a-f0-9]{64}$/.test(checksum));
}

function storageConfigured(environment: DocumentAiObservabilityEnvironment): boolean {
  const provider = String(environment.ATTACHMENT_STORAGE_PROVIDER || 'SERVER_FS').trim().toUpperCase();
  if (provider === 'SERVER_FS') return present(environment.ATTACHMENT_STORAGE_DIR);
  if (provider !== 'R2') return false;
  return (
    /^[A-Za-z0-9_-]{8,64}$/.test(String(environment.R2_ACCOUNT_ID || '').trim()) &&
    /^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/.test(String(environment.R2_BUCKET || '').trim()) &&
    present(environment.R2_ACCESS_KEY_ID) &&
    present(environment.R2_SECRET_ACCESS_KEY)
  );
}

export function inspectDocumentAiRuntimeMode(
  environment: DocumentAiObservabilityEnvironment = process.env,
): DocumentAiRuntimeMode {
  if (String(environment.DOC_AI_WORKER_ENABLED || '').trim().toLowerCase() !== 'true') return 'DISABLED';
  if (
    String(environment.DOC_AI_PROVIDER || '').trim().toUpperCase() !== 'GEMINI' ||
    !present(environment.DOC_AI_GEMINI_MODEL) ||
    !present(environment.GEMINI_API_KEY) ||
    !validChecksumAllowlist(environment.DOC_AI_SYNTHETIC_SHA256_ALLOWLIST) ||
    !storageConfigured(environment)
  ) return 'MISCONFIGURED';
  return 'READY_SYNTHETIC_ONLY';
}

export function createDocumentAiObservabilitySnapshot(
  rows: ReadonlyArray<{ status: string; count: number | string | bigint }>,
  environment: DocumentAiObservabilityEnvironment = process.env,
): DocumentAiObservabilitySnapshot {
  const counts = Object.fromEntries(
    DOCUMENT_AI_OBSERVABLE_STATUSES.map((status) => [status, 0]),
  ) as Record<DocumentAiObservableStatus, number>;
  for (const row of rows) {
    if (!DOCUMENT_AI_OBSERVABLE_STATUSES.includes(row.status as DocumentAiObservableStatus)) continue;
    const value = Number(row.count);
    if (!Number.isSafeInteger(value) || value < 0) continue;
    counts[row.status as DocumentAiObservableStatus] = value;
  }
  const mode = inspectDocumentAiRuntimeMode(environment);
  return {
    runtime: {
      mode,
      provider: mode === 'READY_SYNTHETIC_ONLY' ? 'GEMINI' : null,
      syntheticOnly: true,
      automaticExecution: false,
    },
    counts: {
      ...counts,
      total: Object.values(counts).reduce((total, value) => total + value, 0),
    },
  };
}
