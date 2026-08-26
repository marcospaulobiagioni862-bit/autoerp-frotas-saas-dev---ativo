import assert from 'node:assert/strict';
import { shouldResetLazyModuleError } from '../LazyModuleErrorBoundary';

assert.equal(
  shouldResetLazyModuleError({
    previousResetKey: 'fleet',
    nextResetKey: 'fleet',
    hasError: true,
  }),
  false,
  'the same module must preserve the error state until explicit recovery',
);

assert.equal(
  shouldResetLazyModuleError({
    previousResetKey: 'fleet',
    nextResetKey: 'drivers',
    hasError: true,
  }),
  true,
  'navigating to a different module must clear the failed module boundary',
);

assert.equal(
  shouldResetLazyModuleError({
    previousResetKey: 'fleet',
    nextResetKey: 'drivers',
    hasError: false,
  }),
  false,
  'navigation without an error must not schedule a redundant state update',
);

console.log('PASS: lazy module recovery reset policy');
