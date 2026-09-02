import { strict as assert } from 'node:assert';
import { decideDriverCnhRenewal } from '../driverCnhRenewalPolicy';

export async function runDriverCnhRenewalPolicyChecks(): Promise<void> {
  const existing = {
    id: 'driver-1',
    cpf: '52998224725',
    cnhNumber: '12345678900',
    cnhExpiration: '2030-01-01',
  };

  assert.equal(
    decideDriverCnhRenewal({ cpf: existing.cpf, cnhNumber: existing.cnhNumber, cnhExpiration: '2035-01-01' }, existing, existing).kind,
    'RENEW',
    'newer expiration must renew the same Driver',
  );

  assert.equal(
    decideDriverCnhRenewal({ cpf: existing.cpf, cnhNumber: existing.cnhNumber, cnhExpiration: existing.cnhExpiration }, existing, existing).kind,
    'REPLAY',
    'same expiration must be idempotent instead of creating a Driver',
  );

  assert.equal(
    decideDriverCnhRenewal({ cpf: existing.cpf, cnhNumber: existing.cnhNumber, cnhExpiration: '2029-01-01' }, existing, existing).kind,
    'OLDER',
    'older expiration must never downgrade the current CNH',
  );

  assert.equal(
    decideDriverCnhRenewal(
      { cpf: existing.cpf, cnhNumber: existing.cnhNumber, cnhExpiration: '2035-01-01' },
      existing,
      { ...existing, id: 'driver-2' },
    ).kind,
    'IDENTITY_CONFLICT',
    'CPF and CNH resolving to different Drivers must fail closed',
  );

  assert.equal(
    decideDriverCnhRenewal(
      { cpf: existing.cpf, cnhNumber: '98765432109', cnhExpiration: '2035-01-01' },
      existing,
      null,
    ).kind,
    'IDENTITY_CONFLICT',
    'a matching CPF with a divergent CNH number must not be treated as a renewal',
  );

  assert.equal(
    decideDriverCnhRenewal(
      { cpf: '12312312387', cnhNumber: '98765432109', cnhExpiration: '2035-01-01' },
      null,
      null,
    ).kind,
    'NEW',
    'a document without an existing Driver match must continue through normal materialization',
  );
}

if (process.argv[1]?.includes('driverCnhRenewalPolicyTestRunner')) {
  runDriverCnhRenewalPolicyChecks()
    .then(() => console.log('Driver CNH renewal policy regression PASS'))
    .catch((error) => {
      console.error(error);
      process.exitCode = 1;
    });
}
