import { normalizeRequestId } from '../requestCorrelation';

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const accepted = [
  'req-12345678',
  '7f9a8b7c-6d5e-4f3a-9b2c-1d0e9f8a7b6c',
  'client.trace_ABC:1234',
];
for (const value of accepted) {
  assert(normalizeRequestId(value) === value, `accepted request id rejected: ${value}`);
}

for (const value of ['', 'short', 'contains space', 'x'.repeat(129), '<script>alert(1)</script>']) {
  assert(normalizeRequestId(value) === null, `invalid request id accepted: ${value}`);
}

assert(normalizeRequestId(undefined) === null, 'undefined request id must be rejected');
console.log('Request correlation ID policy PASS');
