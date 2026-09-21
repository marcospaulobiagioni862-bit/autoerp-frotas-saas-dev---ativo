export type ApiJsonRecord = Record<string, unknown>;

export function asApiRecord(value: unknown, context: string): ApiJsonRecord {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`Invalid ${context} payload`);
  }
  return value as ApiJsonRecord;
}

function numericValue(value: unknown, field: string): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  throw new Error(`Invalid API numeric field: ${field}`);
}

/** Converts explicit PostgreSQL numeric strings while preserving fail-closed payload validation. */
export function normalizeNumericFields(record: ApiJsonRecord, fields: readonly string[]): ApiJsonRecord {
  const normalized: ApiJsonRecord = { ...record };
  for (const field of fields) normalized[field] = numericValue(record[field], field);
  return normalized;
}
