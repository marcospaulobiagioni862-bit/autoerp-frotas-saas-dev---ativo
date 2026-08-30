import { createHash } from 'node:crypto';
import { GoogleGenAI } from '@google/genai';
import type { DocumentAiProvider, DocumentAiProviderRequest } from './documentAiProcessor';

const DOCUMENT_TYPES = [
  'CNH', 'CRLV', 'IPVA', 'TRAFFIC_TICKET', 'INVOICE', 'RECEIPT', 'CONTRACT', 'INSURANCE', 'MAINTENANCE',
] as const;

const FIELD_NAMES = [
  'name', 'cpf', 'registrationNumber', 'category', 'birthDate', 'issueDate', 'expirationDate',
  'plate', 'renavam', 'chassis', 'brand', 'model', 'manufactureYear', 'modelYear', 'fuel', 'ownerName',
  'taxYear', 'amount', 'dueDate', 'installmentNumber', 'noticeNumber', 'infractionCode', 'infractionDate',
  'discountAmount', 'issuerName', 'issuerDocument', 'invoiceNumber', 'paymentMethod', 'contractNumber',
  'startDate', 'endDate', 'driverName', 'driverDocument', 'insurer', 'policyNumber', 'insuredAmount',
  'deductibleAmount', 'supplierName', 'supplierDocument', 'serviceDate', 'odometer', 'description',
] as const;

type GenerateContentResponse = { text?: string };
type GenerateContentClient = {
  models: {
    generateContent(request: Record<string, unknown>): Promise<GenerateContentResponse>;
  };
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
  client?: GenerateContentClient;
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

export class GeminiDocumentAiProvider implements DocumentAiProvider {
  readonly name = 'GEMINI';
  readonly model: string;
  private readonly allowRealDocuments: boolean;
  private readonly allowedSyntheticChecksums: ReadonlySet<string>;
  private readonly client: GenerateContentClient;

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
    if (options.client) {
      this.client = options.client;
    } else {
      // For the Gemini Developer API, let the SDK use its default beta endpoint.
      // This matches Google's current server-side quickstart for API-key usage.
      const client = new GoogleGenAI({ apiKey });
      this.client = {
        models: {
          generateContent: (request) => client.models.generateContent(request as any),
        },
      };
    }
  }

  async extract(request: DocumentAiProviderRequest, signal: AbortSignal): Promise<unknown> {
    if (!this.allowRealDocuments) {
      const checksum = exactSha256(request.content);
      if (!this.allowedSyntheticChecksums.has(checksum)) throw new SyntheticDocumentRequiredError();
    }

    let response: GenerateContentResponse;
    try {
      response = await this.client.models.generateContent({
        model: this.model,
        contents: [{
          role: 'user',
          parts: [
            { text: 'Extract only values visibly present in this document. Return the configured JSON schema. Do not infer missing values.' },
            { inlineData: { mimeType: request.mimeType, data: Buffer.from(request.content).toString('base64') } },
          ],
        }],
        config: {
          systemInstruction: request.policy,
          responseMimeType: 'application/json',
          responseJsonSchema: RESPONSE_SCHEMA,
          temperature: 0,
          candidateCount: 1,
          abortSignal: signal,
        },
      });
    } catch (error) {
      console.error('[DocumentAI] Gemini generateContent failed', {
        provider: this.name,
        model: this.model,
        ...providerFailureMetadata(error),
      });
      throw error;
    }
    if (typeof response.text !== 'string' || !response.text.trim()) throw new Error('Empty Gemini response');
    return JSON.parse(response.text);
  }
}
