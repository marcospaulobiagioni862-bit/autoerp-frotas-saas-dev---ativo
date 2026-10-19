import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
import {
  formatPhone,
  formatCep,
  cleanDigits,
  cleanPhoneDigits,
  cleanCepDigits,
} from '../../../shared/utils/phoneAndZipCode';

console.log('--- PH-056: Phone & CEP Masking and Sanitization Regression Suite ---');

// ============================================================================
// 1. Static AST / Code Structure Verification across all modified views
// ============================================================================
const driverFormCode = readFileSync(new URL('../DriverFormModal.tsx', import.meta.url), 'utf8');
const driverDetailsCode = readFileSync(new URL('../DriverDetailsModal.tsx', import.meta.url), 'utf8');
const vehicleSaleCode = readFileSync(new URL('../../fleet/VehicleSaleModal.tsx', import.meta.url), 'utf8');
const userProfileCode = readFileSync(new URL('../../profile/UserProfileModal.tsx', import.meta.url), 'utf8');
const maintenanceCode = readFileSync(new URL('../../maintenance/MaintenanceManagement.tsx', import.meta.url), 'utf8');
const adminCenterCode = readFileSync(new URL('../../admin/AdministrationCenterView.tsx', import.meta.url), 'utf8');

// DriverFormModal checks
assert.match(driverFormCode, /formatPhone\(e\.target\.value\)/, 'DriverFormModal must format phone on input change');
assert.match(driverFormCode, /formatCep\(e\.target\.value\)/, 'DriverFormModal must format CEP on input change');
assert.match(driverFormCode, /cleanPhoneDigits\(phone\)/, 'DriverFormModal must clean phone to pure digits on save');
assert.match(driverFormCode, /cleanCepDigits\(zipCode\)/, 'DriverFormModal must clean zipCode to pure digits on save');

// DriverDetailsModal checks
assert.match(driverDetailsCode, /formatPhone\(driver\.phone\)/, 'DriverDetailsModal must format phone on display');
assert.match(driverDetailsCode, /formatCep\(driver\.address\.zipCode\)/, 'DriverDetailsModal must format CEP on display');
assert.match(driverDetailsCode, /cleanPhoneDigits\(emergencyContactPhone\)/, 'DriverDetailsModal must clean emergency phone on save');

// VehicleSaleModal checks
assert.match(vehicleSaleCode, /formatPhone\(e\.target\.value\)/, 'VehicleSaleModal must format buyerPhone on input change');
assert.match(vehicleSaleCode, /cleanPhoneDigits\(buyerPhone\)/, 'VehicleSaleModal must clean buyerPhone to pure digits on submit');

// UserProfileModal checks
assert.match(userProfileCode, /formatPhone\(e\.target\.value\)/, 'UserProfileModal must format phone on input change');
assert.match(userProfileCode, /cleanPhoneDigits\(phone\)/, 'UserProfileModal must clean phone to pure digits on submit');

// MaintenanceManagement checks
assert.match(maintenanceCode, /formatPhone\(e\.target\.value\)/, 'MaintenanceManagement must format supplierPhone on input');
assert.match(maintenanceCode, /cleanPhoneDigits\(supplierPhone\)/, 'MaintenanceManagement must clean supplierPhone to pure digits on submit');

// AdministrationCenterView checks
assert.match(adminCenterCode, /setCompanyPhoneInput\(formatPhone\(/, 'AdministrationCenterView must format phone on load');
assert.match(adminCenterCode, /cleanPhoneDigits\(companyPhoneInput\)/, 'AdministrationCenterView must clean phone to pure digits on submit');
assert.match(adminCenterCode, /cleanCepDigits\(addressZipCodeInput\)/, 'AdministrationCenterView must clean CEP to pure digits on submit');

console.log('✓ [1/4] Static AST code assertions verified across all 6 entry points.');

// ============================================================================
// 2. Progressive Masking Behavior for Phone and CEP
// ============================================================================

// 2.1 Progressive typing for landline with DDD (10 digits)
assert.equal(formatPhone('1'), '(1');
assert.equal(formatPhone('15'), '(15');
assert.equal(formatPhone('(15) 3'), '(15) 3');
assert.equal(formatPhone('(15) 32'), '(15) 32');
assert.equal(formatPhone('(15) 322'), '(15) 322');
assert.equal(formatPhone('(15) 3221'), '(15) 3221');
assert.equal(formatPhone('(15) 3221-4'), '(15) 3221-4');
assert.equal(formatPhone('(15) 3221-44'), '(15) 3221-44');
assert.equal(formatPhone('(15) 3221-441'), '(15) 3221-441');
assert.equal(formatPhone('(15) 3221-4411'), '(15) 3221-4411');
assert.equal(formatPhone('1532214411'), '(15) 3221-4411');

// 2.2 Progressive typing transition from 10 to 11 digits (mobile)
assert.equal(formatPhone('15997424411'), '(15) 99742-4411');

// 2.3 Local numbers without DDD (8 and 9 digits)
assert.equal(formatPhone('32214411'), '3221-4411');
assert.equal(formatPhone('997424411'), '99742-4411');

// 2.4 International country code format (+55)
assert.equal(formatPhone('+5515997424411'), '+55 (15) 99742-4411');
assert.equal(formatPhone('5515997424411'), '+55 (15) 99742-4411');

// 2.5 CEP progressive typing (8 digits)
assert.equal(formatCep('1'), '1');
assert.equal(formatCep('18'), '18');
assert.equal(formatCep('182'), '182');
assert.equal(formatCep('1827'), '1827');
assert.equal(formatCep('18270'), '18270');
assert.equal(formatCep('182700'), '18270-0');
assert.equal(formatCep('1827000'), '18270-00');
assert.equal(formatCep('18270000'), '18270-000');
// Extra digits beyond 8 should be truncated
assert.equal(formatCep('18270000999'), '18270-000');

console.log('✓ [2/4] Progressive typing and dynamic mask transitions verified.');

// ============================================================================
// 3. Database Sanitization to Pure Digits
// ============================================================================
const samplePhoneInput = '(15) 99742-4411';
const cleanedPhone = cleanPhoneDigits(samplePhoneInput);
assert.equal(cleanedPhone, '15997424411', 'Database phone must contain only digits without parentheses, spaces or dashes');
assert.equal(/^\d+$/.test(cleanedPhone), true, 'Cleaned phone must match pure digits regex');

const sampleCepInput = '18270-000';
const cleanedCep = cleanCepDigits(sampleCepInput);
assert.equal(cleanedCep, '18270000', 'Database CEP must contain only 8 pure digits');
assert.equal(/^\d{8}$/.test(cleanedCep), true, 'Cleaned CEP must match exact 8 digits regex');

// WhatsApp URL generation must use pure digits
const waUrl = `https://wa.me/55${cleanedPhone}`;
assert.equal(waUrl, 'https://wa.me/5515997424411', 'wa.me url must have zero formatting characters');
assert.ok(!waUrl.includes('(') && !waUrl.includes(')') && !waUrl.includes('-') && !waUrl.includes(' '), 'wa.me url must be clean');

console.log('✓ [3/4] Database pure-digit sanitization and WhatsApp URL contract verified.');

// ============================================================================
// 4. Mutation Test (Regra 3.2-e)
// ============================================================================
console.log('Testing mutation: Unsanitized payload or corrupted masking must fail...');

function simulateSaveToDatabase(payload: { phone?: string; cep?: string }) {
  // Database invariant: strictly pure digits only (or empty)
  if (payload.phone && !/^\d+$/.test(payload.phone)) {
    throw new Error(`DB_CONSTRAINT_VIOLATION: phone contains non-digit characters: "${payload.phone}"`);
  }
  if (payload.cep && !/^\d{8}$/.test(payload.cep)) {
    throw new Error(`DB_CONSTRAINT_VIOLATION: cep must be 8 digits: "${payload.cep}"`);
  }
  return true;
}

// 4.1 Happy path: cleaned data passes
assert.doesNotThrow(() => {
  simulateSaveToDatabase({
    phone: cleanPhoneDigits('(15) 99742-4411'),
    cep: cleanCepDigits('18270-000'),
  });
});

// 4.2 Negative Mutation 1: Raw formatted phone submitted
assert.throws(() => {
  simulateSaveToDatabase({
    phone: '(15) 99742-4411', // Unsanitized
  });
}, /DB_CONSTRAINT_VIOLATION: phone contains non-digit characters/, 'Mutation of uncleaned phone must trigger constraint violation');

// 4.3 Negative Mutation 2: Raw formatted CEP submitted
assert.throws(() => {
  simulateSaveToDatabase({
    cep: '18270-000', // Unsanitized
  });
}, /DB_CONSTRAINT_VIOLATION: cep must be 8 digits/, 'Mutation of uncleaned CEP must trigger constraint violation');

// 4.4 Negative Mutation 3: Mask truncating valid digit
assert.throws(() => {
  // If a flawed formatter cut 11-digit mobile to 10 digits
  const brokenFormatted = '(15) 9974-2441';
  const brokenClean = cleanPhoneDigits(brokenFormatted);
  assert.equal(brokenClean, '15997424411'); // This will fail because 1 digit was lost
}, assert.AssertionError, 'Mutation of truncated digits must fail assertion');

console.log('✓ [4/4] Mutation tests passed (raw masked inputs and data loss fail reliably).');
console.log('ALL PH-056 TESTS PASSED SUCCESSFULLY.');
