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
   * Hard safety boundary: Gemini is called only when the exact byte checksum was
   * approved as synthetic by the caller. An empty allowlist is rejected.
   */
  allowedSyntheticChecksums: ReadonlySet<string>;
  client?: GenerateContentClient;
}

export class SyntheticDocumentRequiredError extends Error {
  constructor() {
    super('Gemini document AI accepts only allowlisted synthetic bytes');
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

export class GeminiDocumentAiProvider implements DocumentAiProvider {
  readonly name = 'GEMINI';
  readonly model: string;
  private readonly allowedSyntheticChecksums: ReadonlySet<string>;
  private readonly client: GenerateContentClient;

  constructor(options: GeminiDocumentAiProviderOptions) {
    const apiKey = options.apiKey.trim();
    if (!apiKey) throw new Error('Missing Gemini API key');
    this.model = safeIdentifier(options.model, 'model');
    if (options.allowedSyntheticChecksums.size === 0) throw new SyntheticDocumentRequiredError();
    for (const checksum of options.allowedSyntheticChecksums) {
      if (!/^[a-f0-9]{64}$/.test(checksum)) throw new Error('Invalid synthetic document checksum');
    }
    this.allowedSyntheticChecksums = new Set(options.allowedSyntheticChecksums);
    if (options.client) {
      this.client = options.client;
    } else {
      const client = new GoogleGenAI({ apiKey, apiVersion: 'v1' });
      this.client = {
        models: {
          generateContent: (request) => client.models.generateContent(request as any),
        },
      };
    }
  }

  async extract(request: DocumentAiProviderRequest, signal: AbortSignal): Promise<unknown> {
    const checksum = exactSha256(request.content);
    if (!this.allowedSyntheticChecksums.has(checksum)) throw new SyntheticDocumentRequiredError();

    const response = await this.client.models.generateContent({
      model: this.model,
      contents: [{
        role: 'user',
        parts: [
          { text: 'Extract only values visibly present in this synthetic document. Return the configured JSON schema.' },
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
    if (typeof response.text !== 'string' || !response.text.trim()) throw new Error('Empty Gemini response');
    return JSON.parse(response.text);
  }
}
