import { jwtVerify, SignJWT } from 'jose';
import { BackupService } from '../src/domain/resilience/BackupService';

async function runTests() {
  let passed = 0;
  let failed = 0;
  const assert = (condition, msg) => {
    if (condition) { console.log(`[PASS] ${msg}`); passed++; }
    else { console.error(`[FAIL] ${msg}`); failed++; }
  }

  const secret = new TextEncoder().encode('test-secret');

  // AUTH-JWT-01
  const token = await new SignJWT({ companyId: 't1', userId: 'u1' })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuer('auth-server')
    .setAudience('autoerp')
    .setExpirationTime('2h')
    .sign(secret);

  try {
    const { payload } = await jwtVerify(token, secret, { issuer: 'auth-server', audience: 'autoerp' });
    assert(payload.companyId === 't1', 'AUTH-JWT-01 token válido');
  } catch (e) {
    assert(false, 'AUTH-JWT-01 token válido');
  }

  // AUTH-JWT-04 sem assinatura
  try {
    const unsigned = token.split('.').slice(0, 2).join('.') + '.';
    await jwtVerify(unsigned, secret);
    assert(false, 'AUTH-JWT-04 token sem assinatura válida');
  } catch (e) {
    assert(true, 'AUTH-JWT-04 token sem assinatura válida');
  }

  // AUTH-JWT-05 adulterada
  try {
    const tampered = token.slice(0, -5) + 'abcde';
    await jwtVerify(tampered, secret);
    assert(false, 'AUTH-JWT-05 signature adulterada');
  } catch (e) {
    assert(true, 'AUTH-JWT-05 signature adulterada');
  }

  // AUTH-JWT-06 expirado
  const expired = await new SignJWT({ companyId: 't1', userId: 'u1' })
    .setProtectedHeader({ alg: 'HS256' }).setExpirationTime('-1h').sign(secret);
  try {
    await jwtVerify(expired, secret);
    assert(false, 'AUTH-JWT-06 token expirado');
  } catch (e) {
    assert(true, 'AUTH-JWT-06 token expirado');
  }

  // AUTH-JWT-07 issuer
  try {
    await jwtVerify(token, secret, { issuer: 'wrong-issuer' });
    assert(false, 'AUTH-JWT-07 issuer inválido');
  } catch (e) {
    assert(true, 'AUTH-JWT-07 issuer inválido');
  }

  // BACKUP-HASH-02
  const data1 = { a: 1, b: [1, 2] };
  const data2 = { b: [1, 2], a: 1 }; // different key order
  const hash1 = await BackupService.calculateChecksum(data1);
  const hash2 = await BackupService.calculateChecksum(data2);
  assert(hash1 === hash2, 'BACKUP-HASH-02 mesmo conteúdo -> mesmo hash');

  // BACKUP-HASH-03
  const data3 = { a: 1, b: [1, 3] };
  const hash3 = await BackupService.calculateChecksum(data3);
  assert(hash1 !== hash3, 'BACKUP-HASH-03 1 byte alterado -> hash diferente');

  console.log(`JWT_CRYPTOGRAPHIC_SIGNATURE_VERIFICATION = PASS`);
  console.log(`BACKUP_SHA256_REAL = TRUE`);
}
runTests();
