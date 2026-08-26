import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
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

const appSource = readFileSync(new URL('../../../App.tsx', import.meta.url), 'utf8');

for (const modalName of ['ReceiptModal', 'PaymentModal', 'TransferModal', 'RenegotiationModal']) {
  assert.doesNotMatch(
    appSource,
    new RegExp(`import \\{ ${modalName} \\} from`),
    `${modalName} must not remain in the initial static import graph`,
  );
  assert.match(
    appSource,
    new RegExp(`const ${modalName}=lazy\\(\\(\\)=>import\\('\\.\\/components\\/modals\\/${modalName}'\\)`),
    `${modalName} must be loaded through React.lazy`,
  );
}

for (const openingGuard of [
  'selectedReceivableForReceipt&&<ReceiptModal isOpen',
  'selectedPayableForPayment&&<PaymentModal isOpen',
  'isTransferModalOpen&&<TransferModal isOpen',
  'selectedReceivablesForRenegotiation.length>0&&<RenegotiationModal isOpen',
]) {
  assert.equal(
    appSource.includes(openingGuard),
    true,
    `finance modal must render only behind its explicit opening state: ${openingGuard}`,
  );
}

assert.equal(
  appSource.includes(
    '<LazyModuleErrorBoundary resetKey={financeModalResetKey} onRetry={()=>window.location.reload()}><Suspense fallback={null}>',
  ),
  true,
  'deferred finance modals must stay inside a recoverable Suspense boundary',
);

console.log('PASS: lazy module recovery and deferred finance modal policy');
