const DEFAULT_RETRY_SECONDS = [60, 300, 1800] as const;

export interface WhatsappDispatchPolicy {
  providerEnabled: boolean;
  batchSize: number;
  rateLimitPerMinute: number;
  maxAttempts: number;
  retryScheduleSeconds: number[];
}

export type WhatsappDispatchDecision =
  | 'PROVIDER_DISABLED'
  | 'CANCELLED'
  | 'ATTEMPTS_EXHAUSTED'
  | 'RETRY_WAIT'
  | 'RATE_LIMITED'
  | 'READY';

export interface WhatsappDispatchCandidate {
  id: string;
  status: 'HELD_PROVIDER_DISABLED' | 'CANCELLED';
  attemptCount: number;
  lastAttemptAt: string | null;
  createdAt: string;
}

export interface WhatsappDispatchPlanItem {
  itemId: string;
  decision: WhatsappDispatchDecision;
  nextAttemptAt: string | null;
}

export interface WhatsappDispatchPlan {
  generatedAt: string;
  policy: WhatsappDispatchPolicy;
  items: WhatsappDispatchPlanItem[];
  readyCount: number;
  heldCount: number;
}

function boundedInteger(raw: string | undefined, fallback: number, minimum: number, maximum: number): number {
  if (raw === undefined || !/^[0-9]+$/.test(raw)) return fallback;
  const parsed = Number(raw);
  return Number.isSafeInteger(parsed) && parsed >= minimum && parsed <= maximum ? parsed : fallback;
}

function retrySchedule(raw: string | undefined): number[] {
  if (raw === undefined || raw.trim() === '') return [...DEFAULT_RETRY_SECONDS];
  const parts = raw.split(',').map((part) => part.trim());
  if (parts.length < 1 || parts.length > 10 || parts.some((part) => !/^[0-9]+$/.test(part))) {
    return [...DEFAULT_RETRY_SECONDS];
  }
  const parsed = parts.map(Number);
  if (
    parsed.some((value) => !Number.isSafeInteger(value) || value < 1 || value > 86_400)
    || parsed.some((value, index) => index > 0 && value <= parsed[index - 1])
  ) {
    return [...DEFAULT_RETRY_SECONDS];
  }
  return parsed;
}

export function resolveWhatsappDispatchPolicy(
  env: Readonly<Record<string, string | undefined>> = process.env,
): WhatsappDispatchPolicy {
  const schedule = retrySchedule(env.WHATSAPP_DISPATCH_RETRY_SECONDS);
  const defaultAttempts = Math.min(3, schedule.length);
  return {
    providerEnabled: env.WHATSAPP_PROVIDER_ENABLED === 'true',
    batchSize: boundedInteger(env.WHATSAPP_DISPATCH_BATCH_SIZE, 25, 1, 100),
    rateLimitPerMinute: boundedInteger(env.WHATSAPP_DISPATCH_RATE_LIMIT_PER_MINUTE, 60, 1, 600),
    maxAttempts: boundedInteger(env.WHATSAPP_DISPATCH_MAX_ATTEMPTS, defaultAttempts, 1, schedule.length),
    retryScheduleSeconds: schedule,
  };
}

function requiredDate(raw: string, field: string): Date {
  const date = new Date(raw);
  if (!raw || !Number.isFinite(date.getTime())) throw new Error(`Invalid WhatsApp dispatch ${field}`);
  return date;
}

function validateCandidate(candidate: WhatsappDispatchCandidate): void {
  if (!/^wao_[a-f0-9]{32}$/.test(candidate.id)) throw new Error('Invalid WhatsApp dispatch item');
  if (!Number.isSafeInteger(candidate.attemptCount) || candidate.attemptCount < 0) {
    throw new Error('Invalid WhatsApp dispatch attempt count');
  }
  requiredDate(candidate.createdAt, 'createdAt');
  if (candidate.attemptCount > 0 && candidate.lastAttemptAt === null) {
    throw new Error('Missing WhatsApp dispatch lastAttemptAt');
  }
  if (candidate.lastAttemptAt !== null) requiredDate(candidate.lastAttemptAt, 'lastAttemptAt');
}

function retryAt(candidate: WhatsappDispatchCandidate, policy: WhatsappDispatchPolicy): Date | null {
  if (candidate.attemptCount === 0 || candidate.lastAttemptAt === null) return null;
  const index = Math.min(candidate.attemptCount - 1, policy.retryScheduleSeconds.length - 1);
  const lastAttempt = requiredDate(candidate.lastAttemptAt, 'lastAttemptAt');
  return new Date(lastAttempt.getTime() + policy.retryScheduleSeconds[index] * 1000);
}

export function planWhatsappDispatch(
  candidates: readonly WhatsappDispatchCandidate[],
  policy: WhatsappDispatchPolicy,
  referenceNow: Date,
  sentInCurrentMinute: number,
): WhatsappDispatchPlan {
  if (!Number.isFinite(referenceNow.getTime())) throw new Error('Invalid WhatsApp dispatch reference time');
  if (!Number.isSafeInteger(sentInCurrentMinute) || sentInCurrentMinute < 0) {
    throw new Error('Invalid WhatsApp dispatch rate usage');
  }
  if (
    !Number.isSafeInteger(policy.batchSize) || policy.batchSize < 1
    || !Number.isSafeInteger(policy.rateLimitPerMinute) || policy.rateLimitPerMinute < 1
    || !Number.isSafeInteger(policy.maxAttempts) || policy.maxAttempts < 1
    || policy.maxAttempts > policy.retryScheduleSeconds.length
  ) {
    throw new Error('Invalid WhatsApp dispatch policy');
  }

  const sorted = [...candidates].sort((left, right) => {
    const byCreatedAt = requiredDate(left.createdAt, 'createdAt').getTime() - requiredDate(right.createdAt, 'createdAt').getTime();
    return byCreatedAt || left.id.localeCompare(right.id);
  });
  const rateBudget = Math.max(0, policy.rateLimitPerMinute - sentInCurrentMinute);
  const readyBudget = Math.min(policy.batchSize, rateBudget);
  let readyCount = 0;

  const items = sorted.map((candidate): WhatsappDispatchPlanItem => {
    validateCandidate(candidate);
    if (candidate.status === 'CANCELLED') {
      return { itemId: candidate.id, decision: 'CANCELLED', nextAttemptAt: null };
    }
    if (candidate.attemptCount >= policy.maxAttempts) {
      return { itemId: candidate.id, decision: 'ATTEMPTS_EXHAUSTED', nextAttemptAt: null };
    }
    if (!policy.providerEnabled) {
      return { itemId: candidate.id, decision: 'PROVIDER_DISABLED', nextAttemptAt: null };
    }

    const nextAttempt = retryAt(candidate, policy);
    if (nextAttempt && nextAttempt.getTime() > referenceNow.getTime()) {
      return { itemId: candidate.id, decision: 'RETRY_WAIT', nextAttemptAt: nextAttempt.toISOString() };
    }
    if (readyCount >= readyBudget) {
      return { itemId: candidate.id, decision: 'RATE_LIMITED', nextAttemptAt: null };
    }
    readyCount += 1;
    return { itemId: candidate.id, decision: 'READY', nextAttemptAt: null };
  });

  return {
    generatedAt: referenceNow.toISOString(),
    policy: {
      providerEnabled: policy.providerEnabled,
      batchSize: policy.batchSize,
      rateLimitPerMinute: policy.rateLimitPerMinute,
      maxAttempts: policy.maxAttempts,
      retryScheduleSeconds: [...policy.retryScheduleSeconds],
    },
    items,
    readyCount,
    heldCount: items.length - readyCount,
  };
}
