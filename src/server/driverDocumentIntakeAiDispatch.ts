import {
  createDocumentAiRuntimeFromEnvironment,
  DocumentAiRuntimeUnavailableError,
  type DocumentAiRuntime,
} from './documentAiRuntime';
import type { DocumentAiQueueResult } from './documentAiQueue';

type RuntimeEnvironment = Record<string, string | undefined>;

export type DriverDocumentIntakeAiDispatchResult =
  | { state: 'DISABLED' }
  | { state: 'IDLE' }
  | { state: 'PROCESSED'; item: Exclude<DocumentAiQueueResult, null> }
  | { state: 'MISMATCH'; item: Exclude<DocumentAiQueueResult, null> };

export interface DriverDocumentIntakeAiDispatchDependencies {
  createRuntime?: (environment: RuntimeEnvironment) => DocumentAiRuntime;
  schedule?: (task: () => void) => void;
}

export async function runDriverDocumentIntakeAiDispatch(
  companyId: string,
  expectedExtractionId: string,
  environment: RuntimeEnvironment = process.env,
  dependencies: DriverDocumentIntakeAiDispatchDependencies = {},
): Promise<DriverDocumentIntakeAiDispatchResult> {
  let runtime: DocumentAiRuntime;
  try {
    runtime = dependencies.createRuntime
      ? dependencies.createRuntime(environment)
      : createDocumentAiRuntimeFromEnvironment(environment);
  } catch (error) {
    if (error instanceof DocumentAiRuntimeUnavailableError) return { state: 'DISABLED' };
    throw error;
  }

  const item = await runtime.processNextForTenant(
    companyId,
    `driver-intake-${expectedExtractionId}`,
  );
  if (!item) return { state: 'IDLE' };
  if (item.id !== expectedExtractionId) return { state: 'MISMATCH', item };
  return { state: 'PROCESSED', item };
}

export function scheduleDriverDocumentIntakeAiDispatch(
  companyId: string,
  expectedExtractionId: string,
  environment: RuntimeEnvironment = process.env,
  dependencies: DriverDocumentIntakeAiDispatchDependencies = {},
): void {
  const schedule = dependencies.schedule ?? ((task: () => void) => setImmediate(task));
  schedule(() => {
    void runDriverDocumentIntakeAiDispatch(
      companyId,
      expectedExtractionId,
      environment,
      dependencies,
    ).catch(() => {
      console.error('AUTOERP_DOCUMENT_AI_DISPATCH_FAILURE');
    });
  });
}
