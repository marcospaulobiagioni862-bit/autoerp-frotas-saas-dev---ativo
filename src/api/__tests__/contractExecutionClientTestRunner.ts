import { ContractExecutionClient } from '../contractExecutionClient';

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const originalFetch = globalThis.fetch;
let responder: () => Promise<Response>;

globalThis.fetch = (async () => responder()) as typeof fetch;

const artifact = {
  id: 'artifact-1',
  companyId: 'tenant-a',
  contractId: 'contract-1',
  artifactType: 'GENERATED_PDF',
  attachmentId: 'attachment-1',
  snapshotHash: 'a'.repeat(64),
  isCurrent: true,
  isArchived: false,
  createdBy: 'admin-a',
  createdAt: '2026-09-25T00:00:00.000Z',
  updatedAt: '2026-09-25T00:00:00.000Z',
};

const attachment = {
  id: 'attachment-1',
  companyId: 'tenant-a',
  entityType: 'Contract',
  entityId: 'contract-1',
  fileName: 'contrato.pdf',
  fileSize: '1234',
  mimeType: 'application/pdf',
  storageProvider: 'SERVER_FS',
  contentState: 'AVAILABLE',
  isArchived: false,
  createdAt: '2026-09-25T00:00:00.000Z',
};

const contract = {
  id: 'contract-1',
  companyId: 'tenant-a',
  contractNumber: 'CNT-000006',
  driverId: 'driver-1',
  vehicleId: 'vehicle-1',
  startDate: '2026-09-25',
  status: 'DRAFT',
  rentalAmount: '1000.00',
  billingPeriodicity: 'WEEKLY',
  securityDepositAmount: '300.00',
  franchiseKm: '0',
  excessKmRate: '0',
  signatureRequired: true,
  isArchived: false,
  createdAt: '2026-09-25T00:00:00.000Z',
  updatedAt: '2026-09-25T00:00:00.000Z',
};

try {
  responder = async () => new Response(JSON.stringify({ items: [artifact] }), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
  const artifacts = await ContractExecutionClient.listArtifacts('contract-1');
  assert(artifacts.length === 1 && artifacts[0].id === 'artifact-1', 'artifact list must not require contract numeric fields');

  responder = async () => new Response(JSON.stringify({ artifact, attachment, contract }), {
    status: 201,
    headers: { 'content-type': 'application/json' },
  });
  const generated = await ContractExecutionClient.generatePdf('contract-1');
  assert(generated.attachment.fileSize === 1234, 'attachment fileSize must normalize from PostgreSQL numeric string');
  assert(generated.contract.rentalAmount === 1000, 'contract rentalAmount must normalize from PostgreSQL numeric string');
  assert(generated.contract.securityDepositAmount === 300, 'contract securityDepositAmount must normalize');

  console.log('contractExecutionClient payload-shape regression: PASS');
} finally {
  globalThis.fetch = originalFetch;
}
