import { strict as assert } from 'node:assert';
import { PostgresDriverRepository } from '../../db/repositories/postgresDriverRepository';
import { DocumentStatus, DriverStatus } from '../../types/enums';

const companyId = 'company-archived-restore';
const archivedRow = {
  id: 'driver-archived',
  company_id: companyId,
  name: 'Motorista Arquivado',
  cpf: '52998224725',
  cnh: '12345678900',
  active: false,
  rg: '123456789',
  birth_date: '1990-01-01',
  phone: '11999999999',
  whatsapp: '11999999999',
  email: 'preservar@example.test',
  address_street: 'Rua Preservada',
  address_number: '10',
  address_complement: 'Casa principal',
  address_neighborhood: 'Centro',
  address_city: 'São Paulo',
  address_state: 'SP',
  address_zip_code: '01001000',
  address_residence_type: 'HOUSE',
  address_residence_type_other: null,
  address_condominium_name: null,
  address_block_tower: null,
  address_unit: null,
  address_floor: null,
  address_reference: 'Próximo à praça',
  cnh_category: 'B',
  cnh_expiration: '2035-01-01',
  app_platforms: ['Uber'],
  status: DriverStatus.ARCHIVED,
  photo_url: 'attachment://profile-photo',
  notes: 'Dados anteriores preservados',
  is_archived: true,
  created_at: '2026-08-01T12:00:00.000Z',
  updated_at: '2026-08-20T12:00:00.000Z',
};

const restoredRow = {
  ...archivedRow,
  active: false,
  status: DriverStatus.PENDING_DOCS,
  is_archived: false,
  updated_at: '2026-09-01T12:00:00.000Z',
};

let executeCount = 0;
const tx = {
  async execute() {
    executeCount += 1;
    if (executeCount === 1) return { rows: [archivedRow] }; // exact archived CPF+CNH lookup
    if (executeCount === 2) return { rows: [{ id: archivedRow.id }] }; // UPDATE
    if (executeCount === 3) return { rows: [restoredRow] }; // authoritative reload
    return { rows: [] };
  },
};

const repo = new PostgresDriverRepository(tx);
const materialized = await repo.create({
  id: 'new-candidate-id-must-not-survive',
  companyId,
  fullName: 'Motorista Arquivado',
  cpf: archivedRow.cpf,
  rg: archivedRow.rg,
  birthDate: archivedRow.birth_date,
  phone: '',
  whatsapp: '',
  email: undefined,
  address: {
    street: '',
    number: '',
    neighborhood: '',
    city: '',
    state: '',
    zipCode: '',
  },
  cnhNumber: archivedRow.cnh,
  cnhCategory: 'B',
  cnhExpiration: '2035-01-01',
  cnhStatus: DocumentStatus.VALID,
  appPlatforms: [],
  status: DriverStatus.PENDING_DOCS,
  photoUrl: undefined,
  notes: 'Cadastro criado/restaurado pela aprovação da CNH. Dados complementares pendentes.',
  isArchived: false,
  createdAt: '2026-09-01T12:00:00.000Z',
  updatedAt: '2026-09-01T12:00:00.000Z',
});

assert.equal(materialized.id, archivedRow.id, 'same CPF+CNH must restore the original Driver ID');
assert.equal(materialized.isArchived, false, 'restored Driver must be visible again');
assert.equal(materialized.status, DriverStatus.PENDING_DOCS, 'CNH materialization must leave complementary data pending');
assert.equal(materialized.email, archivedRow.email, 'blank CNH materialization must preserve existing email');
assert.equal(materialized.phone, archivedRow.phone, 'blank CNH materialization must preserve existing phone');
assert.equal(materialized.address.street, archivedRow.address_street, 'blank CNH materialization must preserve existing address');
assert.equal(materialized.address.residenceType, 'HOUSE', 'residence type must survive restoration');
assert.deepEqual(materialized.appPlatforms, ['Uber'], 'platform history must survive restoration');
assert.equal(materialized.photoUrl, archivedRow.photo_url, 'profile photo must survive restoration');
assert.equal(executeCount, 3, 'restore path must use one exact lookup, one update and one reload');

console.log('Driver CNH archived restore regression contract PASS');
