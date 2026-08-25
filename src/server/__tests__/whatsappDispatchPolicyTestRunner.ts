import assert from 'node:assert/strict';
import {
  planWhatsappDispatch,
  resolveWhatsappDispatchPolicy,
  type WhatsappDispatchCandidate,
  type WhatsappDispatchPolicy,
} from '../whatsappDispatchPolicy';

const id = (digit: string) => `wao_${digit.repeat(32)}`;
const now = new Date('2026-08-25T07:00:00.000Z');

function candidate(
  digit: string,
  overrides: Partial<WhatsappDispatchCandidate> = {},
): WhatsappDispatchCandidate {
  return {
    id: id(digit),
    status: 'HELD_PROVIDER_DISABLED',
    consentStatus: 'GRANTED',
    attemptCount: 0,
    lastAttemptAt: null,
    createdAt: `2026-08-25T06:00:0${digit}.000Z`,
    ...overrides,
  };
}

const defaults = resolveWhatsappDispatchPolicy({});
assert.deepEqual(defaults, {
  providerEnabled: false,
  batchSize: 25,
  rateLimitPerMinute: 60,
  maxAttempts: 3,
  retryScheduleSeconds: [60, 300, 1800],
});

const bounded = resolveWhatsappDispatchPolicy({
  WHATSAPP_PROVIDER_ENABLED: 'TRUE',
  WHATSAPP_DISPATCH_BATCH_SIZE: '0',
  WHATSAPP_DISPATCH_RATE_LIMIT_PER_MINUTE: '601',
  WHATSAPP_DISPATCH_MAX_ATTEMPTS: '99',
  WHATSAPP_DISPATCH_RETRY_SECONDS: '300,60',
});
assert.deepEqual(bounded, defaults, 'unsafe configuration must fail closed to bounded defaults');

const disabled = planWhatsappDispatch([candidate('1'), candidate('2')], defaults, now, 0);
assert.equal(disabled.readyCount, 0);
assert.deepEqual(disabled.items.map((item) => item.decision), ['PROVIDER_DISABLED', 'PROVIDER_DISABLED']);

const activePolicy: WhatsappDispatchPolicy = {
  providerEnabled: true,
  batchSize: 2,
  rateLimitPerMinute: 2,
  maxAttempts: 3,
  retryScheduleSeconds: [60, 300, 1800],
};
const guarded = planWhatsappDispatch([
  candidate('5', { createdAt: '2026-08-25T06:00:05.000Z' }),
  candidate('1', { status: 'CANCELLED' }),
  candidate('2', { consentStatus: 'REVOKED' }),
  candidate('3', { attemptCount: 3, lastAttemptAt: '2026-08-25T06:00:00.000Z' }),
  candidate('4', { attemptCount: 1, lastAttemptAt: '2026-08-25T06:59:30.000Z' }),
], activePolicy, now, 0);
assert.deepEqual(guarded.items.map((item) => item.decision), [
  'CANCELLED',
  'CONSENT_REQUIRED',
  'ATTEMPTS_EXHAUSTED',
  'RETRY_WAIT',
  'READY',
]);
assert.equal(guarded.items[3].nextAttemptAt, '2026-08-25T07:00:30.000Z');

const rateLimited = planWhatsappDispatch([
  candidate('3'),
  candidate('1'),
  candidate('2'),
], activePolicy, now, 1);
assert.deepEqual(rateLimited.items.map((item) => item.itemId), [id('1'), id('2'), id('3')]);
assert.deepEqual(rateLimited.items.map((item) => item.decision), ['READY', 'RATE_LIMITED', 'RATE_LIMITED']);
assert.equal(rateLimited.readyCount, 1);

const batchLimited = planWhatsappDispatch(
  [candidate('1'), candidate('2'), candidate('3')],
  { ...activePolicy, batchSize: 1, rateLimitPerMinute: 10 },
  now,
  0,
);
assert.deepEqual(batchLimited.items.map((item) => item.decision), ['READY', 'RATE_LIMITED', 'RATE_LIMITED']);

const serialized = JSON.stringify(rateLimited);
for (const protectedField of ['phone_e164', 'phoneMasked', 'companyId', 'templateParameters', 'credential']) {
  assert.equal(serialized.includes(protectedField), false, `${protectedField} must not be exposed`);
}

assert.throws(
  () => planWhatsappDispatch([candidate('1', { attemptCount: 1 })], activePolicy, now, 0),
  /Missing WhatsApp dispatch lastAttemptAt/,
);
assert.throws(
  () => planWhatsappDispatch([candidate('1')], activePolicy, now, -1),
  /Invalid WhatsApp dispatch rate usage/,
);

console.log('PASS: WhatsApp dispatcher policy is bounded, deterministic, sanitized, and provider-disabled by default');
