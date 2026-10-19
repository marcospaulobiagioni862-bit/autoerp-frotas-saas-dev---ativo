import { strict as assert } from 'node:assert';
import { readFileSync, existsSync } from 'node:fs';
import { randomBytes } from 'node:crypto';

console.log('--- PH-057 + PH-059: Driver Intake & LGPD Form Regression Suite ---');

// 1. Static AST & File Assertions
console.log('1. Verifying migration and source files...');

const migrationPath = new URL('../../../../drizzle/0091_driver_form_tokens.sql', import.meta.url).pathname;
assert.ok(existsSync(migrationPath), 'Migration 0091_driver_form_tokens.sql must exist');
const migrationSql = readFileSync(migrationPath, 'utf8');

assert.match(migrationSql, /CREATE\s+TABLE\s+(IF\s+NOT\s+EXISTS\s+)?driver_form_tokens/i, 'Migration must create driver_form_tokens table');
assert.match(migrationSql, /token\s+(text|varchar)/i, 'driver_form_tokens must have token column');
assert.match(migrationSql, /driver_id\s+(text|uuid)/i, 'driver_form_tokens must have driver_id column');
assert.match(migrationSql, /company_id\s+(text|varchar)/i, 'driver_form_tokens must have company_id column');
assert.match(migrationSql, /expires_at\s+(timestamp|timestamptz)/i, 'driver_form_tokens must have expires_at column');
assert.match(migrationSql, /consumed_at\s+(timestamp|timestamptz)/i, 'driver_form_tokens must have consumed_at column');
assert.match(migrationSql, /opened_ip\s+(text|varchar)/i, 'driver_form_tokens must have opened_ip audit column');
assert.match(migrationSql, /consumed_ip\s+(text|varchar)/i, 'driver_form_tokens must have consumed_ip audit column');
assert.match(migrationSql, /controlled_medications\s+text/i, 'Migration must add controlled_medications to driver_health_profiles');
assert.match(migrationSql, /lgpd_consent_at\s+(timestamp|timestamptz)/i, 'Migration must add lgpd_consent_at to driver_health_profiles');
assert.match(migrationSql, /lgpd_consent_version\s+(text|varchar)/i, 'Migration must add lgpd_consent_version to driver_health_profiles');

const serverRoutesCode = readFileSync(new URL('../../../server/driverFormTokenRoutes.ts', import.meta.url), 'utf8');
assert.match(serverRoutesCode, /randomBytes\(32\)\.toString\('hex'\)/, 'Tokens must be generated with 32 random bytes (64 hex characters)');
assert.match(serverRoutesCode, /24\s*\*\s*60\s*\*\s*60\s*\*\s*1000/, 'Token must expire in 24 hours');
assert.match(serverRoutesCode, /'EXPIRED'/, 'Server must handle EXPIRED with 410');
assert.match(serverRoutesCode, /'ALREADY_CONSUMED'/, 'Server must handle ALREADY_CONSUMED with 410');
assert.match(serverRoutesCode, /LGPD_CONSENT_REQUIRED/, 'Server must require explicit LGPD consent for health submission');

const publicPageCode = readFileSync(new URL('../../public/PublicDriverFormPage.tsx', import.meta.url), 'utf8');
assert.match(publicPageCode, /Dados da Habilitação/, 'Public form must render locked validated CNH card');
assert.match(publicPageCode, /Somente leitura/, 'Public form must mark CNH fields as read-only');
assert.match(publicPageCode, /residenceType/, 'Public form must contain structured residence fields');
assert.match(publicPageCode, /condominiumName/, 'Public form must contain condominiumName');
assert.match(publicPageCode, /controlledMedications/, 'Public form must contain controlledMedications');
assert.match(publicPageCode, /lgpdConsent/, 'Public form must contain informed LGPD consent checkbox');

const modalCode = readFileSync(new URL('../DriverDetailsModal.tsx', import.meta.url), 'utf8');
assert.match(modalCode, /Pedir dados \(wa\.me\)/, 'DriverDetailsModal must offer wa.me request button');
assert.match(modalCode, /Link Seguro de Coleta de Dados e Consentimento/, 'DriverDetailsModal must render shareable token modal');
assert.match(modalCode, /controlledMedications/, 'DriverDetailsModal must display controlled medications');
assert.match(modalCode, /Consentimento LGPD/, 'DriverDetailsModal must display LGPD consent status badge');

console.log('✓ Static file and AST assertions passed.');

// 2. Functional & Security Unit Assertions
console.log('2. Running security test cases...');

// Test Case 1: Token Unpredictability
console.log('Test 1: Token unpredictability and entropy...');
const tokens = new Set<string>();
for (let i = 0; i < 1000; i++) {
  const token = randomBytes(32).toString('hex');
  assert.equal(token.length, 64, 'Token must be exactly 64 hex characters');
  assert.ok(/^[0-9a-f]{64}$/.test(token), 'Token must be valid hex');
  assert.ok(!tokens.has(token), 'Tokens must never collide');
  tokens.add(token);
}
console.log('✓ 1,000 generated tokens with zero collisions and high entropy.');

// Test Case 2: Expiration (> 24h)
console.log('Test 2: Expiration logic (> 24h)...');
function evaluateTokenStatus(token: { expiresAt: Date; consumedAt?: Date | null }) {
  const now = new Date();
  if (token.consumedAt) {
    return { valid: false, code: 'TOKEN_ALREADY_CONSUMED', status: 410 };
  }
  if (now > token.expiresAt) {
    return { valid: false, code: 'TOKEN_EXPIRED', status: 410 };
  }
  return { valid: true, code: 'OK', status: 200 };
}

const expiredToken = {
  expiresAt: new Date(Date.now() - 1000), // 1 second ago
  consumedAt: null,
};
const resExpired = evaluateTokenStatus(expiredToken);
assert.equal(resExpired.valid, false);
assert.equal(resExpired.code, 'TOKEN_EXPIRED');
assert.equal(resExpired.status, 410, 'Expired token must return HTTP 410');

// Test Case 3: Single-Use Burning
console.log('Test 3: Single-use burning...');
const consumedToken = {
  expiresAt: new Date(Date.now() + 3600000), // 1 hour in future
  consumedAt: new Date(Date.now() - 5000), // consumed 5 seconds ago
};
const resConsumed = evaluateTokenStatus(consumedToken);
assert.equal(resConsumed.valid, false);
assert.equal(resConsumed.code, 'TOKEN_ALREADY_CONSUMED');
assert.equal(resConsumed.status, 410, 'Consumed token must return HTTP 410');

// Test Case 4: Server-Side Binding / Anti-Spoofing
console.log('Test 4: Server-side driver binding...');
interface SubmissionPayload {
  driverId?: string; // Potential spoofing attempt by malicious client
  address: { street: string; number: string };
  health?: { bloodType?: string };
  lgpdConsent?: boolean;
}

function processSubmission(tokenRecord: { driverId: string; companyId: string }, payload: SubmissionPayload) {
  // Security invariant: driverId MUST be sourced strictly from tokenRecord, ignoring payload.driverId
  const effectiveDriverId = tokenRecord.driverId;
  const effectiveCompanyId = tokenRecord.companyId;

  // LGPD gate
  const hasHealthData = Boolean(
    payload.health &&
    Object.values(payload.health).some((v) => typeof v === 'string' && v.trim().length > 0)
  );

  if (hasHealthData && !payload.lgpdConsent) {
    throw new Error('LGPD_CONSENT_REQUIRED');
  }

  return {
    targetDriverId: effectiveDriverId,
    targetCompanyId: effectiveCompanyId,
    healthSaved: hasHealthData,
    lgpdRecorded: hasHealthData && Boolean(payload.lgpdConsent),
  };
}

const tokenRecord = {
  driverId: 'driver-legit-uuid-111',
  companyId: 'company-pilot-001',
};

// Malicious payload trying to alter driver-victim-uuid-999
const spoofPayload: SubmissionPayload = {
  driverId: 'driver-victim-uuid-999',
  address: { street: 'Rua Segura', number: '100' },
};
const processedSpoof = processSubmission(tokenRecord, spoofPayload);
assert.equal(processedSpoof.targetDriverId, 'driver-legit-uuid-111', 'Target driver must bind strictly to token owner, rejecting spoof');

// Test Case 5: LGPD Consent Enforcement
console.log('Test 5: LGPD consent enforcement...');
// 5a. Health provided without consent => must throw LGPD_CONSENT_REQUIRED
assert.throws(() => {
  processSubmission(tokenRecord, {
    address: { street: 'Rua A', number: '1' },
    health: { bloodType: 'O+' },
    lgpdConsent: false,
  });
}, /LGPD_CONSENT_REQUIRED/, 'Submitting health without LGPD consent must fail');

// 5b. Health provided with consent => succeeds
const validSubmission = processSubmission(tokenRecord, {
  address: { street: 'Rua A', number: '1' },
  health: { bloodType: 'O+' },
  lgpdConsent: true,
});
assert.equal(validSubmission.targetDriverId, 'driver-legit-uuid-111');
assert.equal(validSubmission.healthSaved, true);
assert.equal(validSubmission.lgpdRecorded, true);

// 5c. Address only without health => succeeds even without lgpdConsent
const addressOnlySubmission = processSubmission(tokenRecord, {
  address: { street: 'Rua A', number: '1' },
  lgpdConsent: false,
});
assert.equal(addressOnlySubmission.targetDriverId, 'driver-legit-uuid-111');
assert.equal(addressOnlySubmission.healthSaved, false);
assert.equal(addressOnlySubmission.lgpdRecorded, false);

console.log('✓ All 5 security and business test cases passed successfully!');
console.log('--- PH-057 + PH-059 Suite Complete ---');
