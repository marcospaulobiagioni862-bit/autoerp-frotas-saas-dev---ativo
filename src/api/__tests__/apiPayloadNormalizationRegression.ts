import { normalizeNumericFields } from '../apiPayloadNormalization';

const normalized = normalizeNumericFields({
  rentalAmount: '750.50',
  securityDepositAmount: '1200.00',
  originalAmount: '750.50',
  paidAmount: '0',
}, ['rentalAmount', 'securityDepositAmount', 'originalAmount', 'paidAmount']);

if (normalized.rentalAmount !== 750.5 || normalized.securityDepositAmount !== 1200 || normalized.paidAmount !== 0) {
  throw new Error('PostgreSQL numeric string normalization regression');
}
let rejected = false;
try { normalizeNumericFields({ rentalAmount: 'invalid' }, ['rentalAmount']); } catch { rejected = true; }
if (!rejected) throw new Error('Invalid numeric payload must fail closed');
console.log('apiPayloadNormalizationRegression: PASS');
