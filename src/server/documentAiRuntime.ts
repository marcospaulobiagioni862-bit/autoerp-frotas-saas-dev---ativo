import { eq } from 'drizzle-orm';
import { db } from '../db/index';
import { companies } from '../db/schema';
import type { AttachmentByteStorage } from './attachmentStorage';
import { createAttachmentStorageFromEnvironment } from './r2AttachmentStorage';
import {
  DocumentAiQueueService,
  type DocumentAiAttachmentReader,
  type DocumentAiQueueResult,
} from './documentAiQueue';
import type { DocumentAiProvider } from './documentAiProcessor';
import { GeminiDocumentAiProvider } from './geminiDocumentAiProvider';

const DOCUMENT_AI_WORKER_INTERVAL_MS = 15_000;

interface DocumentAiRuntimeEnvironment {
  DOC_AI_WORKER_ENABLED?: string;
  DOC_AI_PROVIDER?: string;
  DOC_AI_GEMINI_MODEL?: string;
  DOC_AI_REAL_DOCUMENTS_ENABLED?: string;
  DOC_AI_SYNTHETIC_SHA256_ALLOWLIST?: string;
  GEMINI_API_KEY?: string;
  ATTACHMENT_STORAGE_PROVIDER?: string;
  ATTACHMENT_STORAGE_DIR?: string;
  ATTACHMENT_STORAGE_DURABLE?: string;
  R2_ACCOUNT_ID?: string;
  R2_ACCESS_KEY_ID?: string;
  R2_SECRET_ACCESS_KEY?: string;
  R2_BUCKET?: string;
}

interface ProviderConfiguration {
  apiKey: string;
  model: string;
  allowRealDocuments: boolean;
  allowedSyntheticChecksums: ReadonlySet<string>;
}

export interface DocumentAiRuntime {
  readonly providerName: string;
  readonly storageProvider: string;
  processNextForTenant(companyId: string, workerId: string): Promise<DocumentAiQueueResult>;
  processExtractionForTenant(companyId: string, extractionId: string, workerId: string): Promise<DocumentAiQueueResult>;
}

export interface DocumentAiRuntimeDependencies {
  storage?: AttachmentByteStorage;
  createProvider?: (configuration: ProviderConfiguration) => DocumentAiProvider;
  processNext?: (
    companyId: string,
    workerId: string,
    provider: DocumentAiProvider,
    reader: DocumentAiAttachmentReader,
    expectedExtractionId?: string,
  ) => Promise<DocumentAiQueueResult>;
}

export type DocumentAiDispatchResult =
  | { state: 'DISABLED' }
  | { state: 'IDLE' }
  | { state: 'PROCESSED'; item: Exclude<DocumentAiQueueResult, null> };

export class DocumentAiRuntimeUnavailableError extends Error {
  constructor() {
    super('DOCUMENT_AI_RUNTIME_UNAVAILABLE');
    this.name = 'DocumentAiRuntimeUnavailableError';
  }
}

function enabled(value: string | undefined): boolean {
  return String(value || '').trim().toLowerCase() === 'true';
}

function required(value: string | undefined): string {
  const normalized = String(value || '').trim();
  if (!normalized) throw new DocumentAiRuntimeUnavailableError();
  return normalized;
}

export function parseSyntheticChecksumAllowlist(value: string | undefined): ReadonlySet<string> {
  const checksums = String(value || '').split(',').map((item) => item.trim()).filter(Boolean);
  if (checksums.length === 0 || checksums.some((checksum) => !/^[a-f0-9]{64}$/.test(checksum))) {
    throw new DocumentAiRuntimeUnavailableError();
  }
  return new Set(checksums);
}

function parseOptionalSyntheticChecksumAllowlist(value: string | undefined): ReadonlySet<string> {
  const normalized = String(value || '').trim();
  if (!normalized) return new Set();
  return parseSyntheticChecksumAllowlist(normalized);
}

export function createDocumentAiRuntimeFromEnvironment(
  environment: DocumentAiRuntimeEnvironment = process.env,
  dependencies: DocumentAiRuntimeDependencies = {},
): DocumentAiRuntime {
  if (!enabled(environment.DOC_AI_WORKER_ENABLED)) throw new DocumentAiRuntimeUnavailableError();
  if (required(environment.DOC_AI_PROVIDER).toUpperCase() !== 'GEMINI') {
    throw new DocumentAiRuntimeUnavailableError();
  }

  const allowRealDocuments = enabled(environment.DOC_AI_REAL_DOCUMENTS_ENABLED);
  const configuration: ProviderConfiguration = {
    apiKey: required(environment.GEMINI_API_KEY),
    model: required(environment.DOC_AI_GEMINI_MODEL),
    allowRealDocuments,
    allowedSyntheticChecksums: allowRealDocuments
      ? parseOptionalSyntheticChecksumAllowlist(environment.DOC_AI_SYNTHETIC_SHA256_ALLOWLIST)
      : parseSyntheticChecksumAllowlist(environment.DOC_AI_SYNTHETIC_SHA256_ALLOWLIST),
  };
  const storage = dependencies.storage ?? createAttachmentStorageFromEnvironment(environment);
  if (!storage.getConfiguration().configured) throw new DocumentAiRuntimeUnavailableError();

  const provider = dependencies.createProvider
    ? dependencies.createProvider(configuration)
    : new GeminiDocumentAiProvider(configuration);
  const reader: DocumentAiAttachmentReader = {
    async read(companyId, storageKey) {
      return new Uint8Array(await storage.read(companyId, storageKey));
    },
  };
  const processNext = dependencies.processNext
    ?? ((companyId, workerId, selectedProvider, selectedReader, expectedExtractionId) => (
      DocumentAiQueueService.processNextForTenant(
        companyId,
        workerId,
        selectedProvider,
        selectedReader,
        expectedExtractionId,
      )
    ));

  return {
    providerName: provider.name,
    storageProvider: storage.provider,
    processNextForTenant(companyId, workerId) {
      return processNext(companyId, workerId, provider, reader);
    },
    processExtractionForTenant(companyId, extractionId, workerId) {
      return processNext(companyId, workerId, provider, reader, extractionId);
    },
  };
}

export function isDocumentAiRuntimeAvailableFromEnvironment(
  environment: DocumentAiRuntimeEnvironment = process.env,
  dependencies: DocumentAiRuntimeDependencies = {},
): boolean {
  try {
    createDocumentAiRuntimeFromEnvironment(environment, dependencies);
    return true;
  } catch (error) {
    if (error instanceof DocumentAiRuntimeUnavailableError) return false;
    throw error;
  }
}

export async function dispatchDocumentAiExtractionFromEnvironment(
  companyId: string,
  extractionId: string,
  workerId: string,
  environment: DocumentAiRuntimeEnvironment = process.env,
  dependencies: DocumentAiRuntimeDependencies = {},
): Promise<DocumentAiDispatchResult> {
  let runtime: DocumentAiRuntime;
  try {
    runtime = createDocumentAiRuntimeFromEnvironment(environment, dependencies);
  } catch (error) {
    if (error instanceof DocumentAiRuntimeUnavailableError) return { state: 'DISABLED' };
    throw error;
  }

  const item = await runtime.processExtractionForTenant(companyId, extractionId, workerId);
  if (!item) return { state: 'IDLE' };
  return { state: 'PROCESSED', item };
}

let recurringWorkerStarted = false;
let recurringWorkerRunning = false;
let recurringWorkerTimer: ReturnType<typeof setTimeout> | undefined;

export function startDocumentAiRecurringWorkerFromEnvironment(
  environment: DocumentAiRuntimeEnvironment = process.env,
): boolean {
  if (recurringWorkerStarted) return true;
  if (!enabled(environment.DOC_AI_WORKER_ENABLED)) return false;

  let runtime: DocumentAiRuntime;
  try {
    runtime = createDocumentAiRuntimeFromEnvironment(environment);
  } catch (error) {
    if (error instanceof DocumentAiRuntimeUnavailableError) return false;
    console.error('AUTOERP_DOCUMENT_AI_WORKER_START_FAILURE');
    return false;
  }

  recurringWorkerStarted = true;
  const recurringWorkerId = `doc-ai-recurring-${process.pid}`;

  const scheduleNext = () => {
    recurringWorkerTimer = setTimeout(() => {
      void runOnce();
    }, DOCUMENT_AI_WORKER_INTERVAL_MS);
    recurringWorkerTimer.unref?.();
  };

  const runOnce = async () => {
    if (recurringWorkerRunning) {
      scheduleNext();
      return;
    }
    recurringWorkerRunning = true;
    try {
      const activeCompanies = await db
        .select({ id: companies.id })
        .from(companies)
        .where(eq(companies.status, 'ACTIVE'));
      for (const company of activeCompanies) {
        await runtime.processNextForTenant(String(company.id), recurringWorkerId);
      }
    } catch {
      console.error('AUTOERP_DOCUMENT_AI_WORKER_FAILURE');
    } finally {
      recurringWorkerRunning = false;
      scheduleNext();
    }
  };

  void runOnce();
  return true;
}

export function stopDocumentAiRecurringWorkerForTests(): void {
  recurringWorkerStarted = false;
  recurringWorkerRunning = false;
  if (recurringWorkerTimer) clearTimeout(recurringWorkerTimer);
  recurringWorkerTimer = undefined;
}

if (process.env.NODE_ENV !== 'test') {
  startDocumentAiRecurringWorkerFromEnvironment();
}
