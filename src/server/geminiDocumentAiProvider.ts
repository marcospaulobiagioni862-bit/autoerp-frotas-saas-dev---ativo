import { createHash } from 'node:crypto';
import {
  DocumentAiProviderRateLimitError,
  type DocumentAiProvider,
  type DocumentAiProviderRequest,
} from './documentAiProcessor';

const GEMINI_INTERACTIONS_URL = 'https://generativelanguage.googleapis.com/v1beta/interactions';

const DOCUMENT_FIELD_NAMES = {
  CNH: ['name', 'cpf', 'rg', 'registrationNumber', 'category', 'birthDate', 'issueDate', 'expirationDate', 'ear'],
  CRLV: ['plate', 'renavam', 'chassis', 'brand', 'model', 'manufactureYear', 'modelYear', 'fuel', 'ownerName'],
  CRV: ['plate', 'renavam', 'chassis', 'brand', 'model', 'manufactureYear', 'modelYear', 'fuel', 'ownerName'],
  ATPV_E: ['plate', 'renavam', 'chassis', 'brand', 'model', 'manufactureYear', 'modelYear', 'fuel', 'ownerName'],
  IPVA: ['plate', 'renavam', 'taxYear', 'amount', 'dueDate', 'installmentNumber'],
  TRAFFIC_TICKET: ['plate', 'noticeNumber', 'organName', 'infractionCode', 'description', 'infractionDate', 'infractionTime', 'infractionLocation', 'dueDate', 'discountDueDate', 'amount', 'discountAmount', 'points'],
  INVOICE: ['issuerName', 'issuerDocument', 'invoiceNumber', 'issueDate', 'amount'],
  RECEIPT: ['issuerName', 'issuerDocument', 'issueDate', 'amount', 'paymentMethod'],
  CONTRACT: ['contractNumber', 'startDate', 'endDate', 'driverName', 'driverDocument', 'plate', 'amount'],
  INSURANCE: ['insurer', 'policyNumber', 'startDate', 'endDate', 'insuredAmount', 'deductibleAmount', 'premiumAmount', 'installmentCount', 'coverageDetails', 'brokerName', 'brokerContact', 'plate'],
  MAINTENANCE: ['supplierName', 'supplierDocument', 'serviceDate', 'plate', 'odometer', 'description', 'amount'],
  TRACKER: ['providerName', 'equipmentModel', 'imei', 'serialNumber', 'chipCarrier', 'chipNumber', 'installationDate', 'monthlyCost', 'supplierName', 'plate'],
} as const;

const DOCUMENT_TYPES = Object.keys(DOCUMENT_FIELD_NAMES) as Array<keyof typeof DOCUMENT_FIELD_NAMES>;

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

function fieldObjectSchema(fields: readonly string[], value: Record<string, unknown>): Record<string, unknown> {
  return {
    type: 'object',
    properties: Object.fromEntries(fields.map((field) => [field, value])),
    additionalProperties: false,
  };
}

function documentResponseSchema(documentType: keyof typeof DOCUMENT_FIELD_NAMES): Record<string, unknown> {
  const fields = DOCUMENT_FIELD_NAMES[documentType];
  return {
    type: 'object',
    properties: {
      documentType: { type: 'string', enum: [documentType] },
      fields: fieldObjectSchema(fields, scalarSchema()),
      confidence: fieldObjectSchema(fields, { type: 'number', minimum: 0, maximum: 1 }),
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
  };
}

const RESPONSE_SCHEMA = {
  anyOf: DOCUMENT_TYPES.map((documentType) => documentResponseSchema(documentType)),
} as const;

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype;
}

function isSafeProviderScalar(value: unknown): value is string | number | boolean {
  if (typeof value === 'number') return Number.isFinite(value);
  if (typeof value === 'string') return value.length <= 4_000;
  return typeof value === 'boolean';
}

/**
 * Gemini structured output is strict at the object boundary, but in practice a
 * single optional field can still arrive with a value/confidence pair that our
 * generic processor correctly rejects. Salvage only well-formed fields here so
 * one bad optional field does not discard an otherwise readable document.
 *
 * Structural/top-level deviations are deliberately preserved and remain
 * fail-closed in documentAiProcessor.
 */
function normalizeGeminiProviderOutput(value: unknown): unknown {
  if (!isPlainRecord(value) || typeof value.documentType !== 'string') return value;
  if (!(value.documentType in DOCUMENT_FIELD_NAMES)) return value;
  if (!isPlainRecord(value.fields) || !isPlainRecord(value.confidence)) return value;

  const documentType = value.documentType as keyof typeof DOCUMENT_FIELD_NAMES;
  const allowedFields = new Set<string>(DOCUMENT_FIELD_NAMES[documentType]);
  const fields: Record<string, unknown> = {};
  const confidence: Record<string, number> = {};

  for (const key of allowedFields) {
    const fieldValue = value.fields[key];
    if (fieldValue === undefined || fieldValue === null) continue;

    // EAR is intentionally asymmetric: only a visible positive finding may be
    // promoted by AI. false/text/uncertain values are discarded for review.
    if (documentType === 'CNH' && key === 'ear' && fieldValue !== true) continue;
    if (!isSafeProviderScalar(fieldValue)) continue;

    const score = value.confidence[key];
    if (typeof score !== 'number' || !Number.isFinite(score) || score < 0 || score > 1) continue;

    fields[key] = fieldValue;
    confidence[key] = score;
  }

  return {
    ...value,
    fields,
    confidence,
  };
}

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
  return status !== null && status >= 500 && status <= 599;
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
            {
              type: 'text',
              text: 'Extract only values visibly present in this document. Return the configured JSON schema. Do not infer missing values. Omit any field that is absent or uncertain. For CNH field "ear", return true only when the document visibly states exercício de atividade remunerada, atividade remunerada, or EAR; otherwise omit the field. Never infer false from absence.',
            },
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
        const status = providerStatus(error);
        if (status === 429) {
          console.warn('[DocumentAI] Gemini rate limited', {
            provider: this.name,
            model: this.model,
            status,
            attempt,
          });
          throw new DocumentAiProviderRateLimitError();
        }
        const retryable = isRetryableProviderFailure(error);
        if (retryable && attempt < maxAttempts && !signal.aborted) {
          const delayMs = attempt === 1 ? 1_000 : 2_000;
          console.warn('[DocumentAI] Gemini transient failure; retry scheduled', {
            provider: this.name,
            model: this.model,
            status,
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
    return normalizeGeminiProviderOutput(JSON.parse(text));
  }
}
