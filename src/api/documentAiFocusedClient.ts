import { parseDocumentAiExtraction, type DocumentAiExtraction } from './documentAiClient';

type JsonRecord = Record<string, unknown>;

function asRecord(value: unknown): JsonRecord {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Resposta inválida da análise da CNH.');
  }
  return value as JsonRecord;
}

async function errorFrom(response: Response): Promise<Error> {
  let message = `Falha ao consultar análise da CNH (${response.status}).`;
  try {
    const payload = asRecord(await response.json());
    if (typeof payload.error === 'string') message = payload.error;
  } catch {
    // Preserve status-only message for non-JSON failures.
  }
  return new Error(message);
}

export class DocumentAiFocusedClient {
  static async get(id: string): Promise<DocumentAiExtraction> {
    const normalized = id.trim();
    if (!normalized || normalized.length > 120 || !/^[A-Za-z0-9._:-]+$/.test(normalized)) {
      throw new Error('Identificador da análise da CNH inválido.');
    }
    const response = await fetch(`/api/document-ai/extractions/${encodeURIComponent(normalized)}`, {
      credentials: 'include',
      headers: { Accept: 'application/json' },
    });
    if (!response.ok) throw await errorFrom(response);
    return parseDocumentAiExtraction(asRecord(await response.json()).item);
  }
}
