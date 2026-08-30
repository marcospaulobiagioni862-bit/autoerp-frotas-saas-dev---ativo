import { createHash } from 'node:crypto';
import type { DocumentAiProvider, DocumentAiProviderRequest } from './documentAiProcessor';

const GEMINI_INTERACTIONS_URL = 'https://generativelanguage.googleapis.com/v1beta/interactions';

const DOCUMENT_TYPES = [
  'CNH', 'CRLV', 'IPVA', 'TRAFFIC_TICKET', 'INVOICE', 'RECEIPT', 'CONTRACT', 'INSURANCE', 'MAINTENANCE',
] as const;

const FIELD_NAMES = [
  'name', 'cpf', 'rg', 'registrationNumber', 'category', 'birthDate', 'issueDate', 'expirationDate',
  'plate', 'renavam', 'chassis', 'brand', 'model', 'manufactureYear', 'modelYear', 'fuel', 'ownerName',
  'taxYear', 'amount', 'dueDate', 'installmentNumber', 'noticeNumber', 'infractionCode', 'infractionDate',
  'discountAmount', 'issuerName', 'issuerDocument', 'invoiceNumber', 'paymentMethod', 'contractNumber',
  'startDate', 'endDate', 'driverName', 'driverDocument', 'insurer', 'policyNumber', 'insuredAmount',
  'deductibleAmount', 'supplierName', 'supplierDocument', 'serviceDate', 'odometer', 'description',
] as const;

type InteractionContent = { type?: string; text?: string };
type InteractionStep = { type?: string; content?: InteractionContent[] };
type InteractionResponse = { output_text?: string; steps?: InteractionStep[] };
type InteractionsClient = {
  create(request: Record<string, unknown>, signal: AbortSignal): Promise<InteractionResponse>;
};

export interface GeminiDocumentAiProviderOptions {
  apiKey: string;
  model: string;
  /**
   * Synthetic-only is the safe default. Real documents are accepted only when
   * the server explicitly enables them through the runtime configuration.
   */
  allowRealDocuments?: boolean;
  allowedSyntheticChecksums: ReadonlySet<string>;
  client?: InteractionsClient;
}

export class SyntheticDocumentRequiredError extends Error {
  constructor() {
    super('Gemini document AI accepts only allowlisted synthetic bytes unless real-document mode is explicitly enabled');
    this.name = 'SyntheticDocumentRequiredError';
  }
}

function exactSha256(content: Uint8Array): string {
  return createHash('sha256').update(content).digest('hex');
}

function safeIdentifier(value: string, label: string): string {
  const normalized = value.trim();
  if (!normalized || normalized.length > 120 || !/^[A-Za-z0-9._:-]+$/.test(normalized)) {
    throw new Error(`Invalid Gemini ${label}`);
  }
  return normalized;
}

function scalarSchema(): Record<string, unknown> {
  return { anyOf: [{ type: 'string' }, { type: 'number' }, { type: 'boolean' }, { type: 'null' }] };
}

function fieldObjectSchema(value: Record<string, unknown>): Record<string, unknown> {
  return {
    type: 'object',
    properties: Object.fromEntries(FIELD_NAMES.map((field) => [field, value])),
    additionalProperties: false,
  };
}

const RESPONSE_SCHEMA = {
  type: 'object',
  properties: {
    documentType: { type: 'string', enum: [...DOCUMENT_TYPES] },
    fields: fieldObjectSchema(scalarSchema()),
    confidence: fieldObjectSchema({ type: 'number', minimum: 0, maximum: 1 }),
    raw: {
      type: 'object',
      properties: {
        text: { type: 'string' },
        pages: { type: 'integer', minimum: 1, maximum: 500 },
      },
      additionalProperties: false,
    },
  },
  required: ['documentType', 'fields', 'confidence', 'raw'],
  additionalProperties: false,
} as const;

function providerFailureMetadata(error: unknown): Record<string, unknown> {
  if (!error || typeof error !== 'object') return { errorType: typeof error };
  const record = error as Record<string, unknown>;
  const metadata: Record<string, unknown> = {};
  if (typeof record.name === 'string') metadata.name = record.name.slice(0, 80);
  if (typeof record.status === 'number' || typeof record.status === 'string') metadata.status = record.status;
  if (typeof record.code === 'number' || typeof record.code === 'string') metadata.code = record.code;
  return metadata;
}

function providerStatus(error: unknown): number | null {
  if (!error || typeof error !== 'object') return null;
  const status = (error as Record<string, unknown>).status;
  if (typeof status === 'number' && Number.isInteger(status)) return status;
  if (typeof status === 'string' && /^\d{3}$/.test(status)) return Number(status);
  return null;
}

function isRetryableProviderFailure(error: unknown): boolean {
  const status = providerStatus(error);
  return status === 503 || status === 429;
}

function waitForRetry(delayMs: number, signal: AbortSignal): Promise<void> {
  if (signal.aborted) return Promise.reject(new Error('Gemini request aborted'));
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      signal.removeEventListener('abort', onAbort);
      resolve();
    }, delayMs);
    const onAbort = () => {
      clearTimeout(timer);
      reject(new Error('Gemini request aborted'));
    };
    signal.addEventListener('abort', onAbort, { once: true });
  });
}

function outputText(response: InteractionResponse): string | undefined {
  if (typeof response.output_text === 'string' && response.output_text.trim()) return response.output_text;
  const chunks: string[] = [];
  for (const step of response.steps ?? []) {
    if (step.type !== 'model_output') continue;
    for (const content of step.content ?? []) {
      if (content.type === 'text' && typeof content.text === 'string') chunks.push(content.text);
    }
  }
  const joined = chunks.join('').trim();
  return joined || undefined;
}

function mediaType(mimeType: string): 'document' | 'image' {
  return mimeType === 'application/pdf' ? 'document' : 'image';
}

function createHttpClient(apiKey: string): InteractionsClient {
  return {
    async create(request, signal) {
      const response = await fetch(GEMINI_INTERACTIONS_URL, {
        method: 'POST',
        headers: {
          'x-goog-api-key': apiKey,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(request),
        signal,
      });
      if (!response.ok) {
        const error = new Error('Gemini Interactions API request failed') as Error & { status?: number; code?: string };
        error.status = response.status;
        error.code = response.statusText || 'GEMINI_INTERACTIONS_ERROR';
        throw error;
      }
      return await response.json() as InteractionResponse;
    },
  };
}

export class GeminiDocumentAiProvider implements DocumentAiProvider {
  readonly name = 'GEMINI';
  readonly model: string;
  private readonly allowRealDocuments: boolean;
  private readonly allowedSyntheticChecksums: ReadonlySet<string>;
  private readonly client: InteractionsClient;

  constructor(options: GeminiDocumentAiProviderOptions) {
    const apiKey = options.apiKey.trim();
    if (!apiKey) throw new Error('Missing Gemini API key');
    this.model = safeIdentifier(options.model, 'model');
    this.allowRealDocuments = options.allowRealDocuments === true;
    if (!this.allowRealDocuments && options.allowedSyntheticChecksums.size === 0) {
      throw new SyntheticDocumentRequiredError();
    }
    for (const checksum of options.allowedSyntheticChecksums) {
      if (!/^[a-f0-9]{64}$/.test(checksum)) throw new Error('Invalid synthetic document checksum');
    }
    this.allowedSyntheticChecksums = new Set(options.allowedSyntheticChecksums);
    this.client = options.client ?? createHttpClient(apiKey);
  }

  async extract(request: DocumentAiProviderRequest, signal: AbortSignal): Promise<unknown> {
    if (!this.allowRealDocuments) {
      const checksum = exactSha256(request.content);
      if (!this.allowedSyntheticChecksums.has(checksum)) throw new SyntheticDocumentRequiredError();
    }

    const maxAttempts = 3;
    let response: InteractionResponse | undefined;
    let lastError: unknown;
    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      if (signal.aborted) throw new Error('Gemini request aborted');
      try {
        response = await this.client.create({
          model: this.model,
          input: [
            { type: 'text', text: 'Extract only values visibly present in this document. Return the configured JSON schema. Do not infer missing values.' },
            {
              type: mediaType(request.mimeType),
              data: Buffer.from(request.content).toString('base64'),
              mime_type: request.mimeType,
            },
          ],
          system_instruction: request.policy,
          response_format: {
            type: 'text',
            mime_type: 'application/json',
            schema: RESPONSE_SCHEMA,
          },
          store: false,
        }, signal);
        break;
      } catch (error) {
        lastError = error;
        const retryable = isRetryableProviderFailure(error);
        if (retryable && attempt < maxAttempts && !signal.aborted) {
          const delayMs = attempt === 1 ? 1_000 : 2_000;
          console.warn('[DocumentAI] Gemini transient failure; retry scheduled', {
            provider: this.name,
            model: this.model,
            status: providerStatus(error),
            attempt,
            nextAttempt: attempt + 1,
            delayMs,
          });
          await waitForRetry(delayMs, signal);
          continue;
        }
        console.error('[DocumentAI] Gemini interaction failed', {
          provider: this.name,
          model: this.model,
          attempt,
          ...providerFailureMetadata(error),
        });
        throw error;
      }
    }

    if (!response) throw lastError ?? new Error('Gemini response missing');
    const text = outputText(response);
    if (!text) throw new Error('Empty Gemini response');
    return JSON.parse(text);
  }
}
