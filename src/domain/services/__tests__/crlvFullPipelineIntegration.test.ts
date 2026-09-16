import assert from 'node:assert/strict';
import { FleetComplianceService } from '../FleetComplianceService';
import { DocumentStatus } from '../../../types/enums';
import { seedAutoERPTestData } from '../../../persistence/seed/seedData';
import {
  parseVehicleCrlvSelectedFields,
  assertReviewedCrlvMatchesVehicle,
  buildVehicleChangesFromReviewedCrlv,
} from '../../../server/vehicleCrlvApplyAuthority';

if (typeof globalThis.localStorage === 'undefined') {
  const store = new Map<string, string>();
  (globalThis as any).localStorage = {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => store.set(key, String(value)),
    removeItem: (key: string) => store.delete(key),
    clear: () => store.clear(),
    key: (index: number) => Array.from(store.keys())[index] ?? null,
    get length() { return store.size; },
  };
}

export async function runCrlvFullPipelineIntegrationTest(): Promise<void> {
  await seedAutoERPTestData(true);

  const companyId = 'company-main-uuid';
  const vehicleId = 'veh-corolla-1';
  const userId = 'usr-admin';
  const userName = 'Admin Tester';

  const futureDate = new Date();
  futureDate.setDate(futureDate.getDate() + 180);
  const validExpirationDate = futureDate.toISOString().split('T')[0];

  const pastDate = new Date();
  pastDate.setDate(pastDate.getDate() - 30);
  const expiredDate = pastDate.toISOString().split('T')[0];

  // 1. Upload -> Processamento IA com sucesso -> Validação de campos -> Documento Válido -> Compliance OK -> Contrato Liberado
  const docValido = await FleetComplianceService.createDocument({
    companyId,
    vehicleId,
    documentType: 'CRLV',
    documentNumber: 'CRLV-FULL-2026',
    expirationDate: validExpirationDate,
    cost: 0,
    userId,
    userName,
    notes: 'Documento lido e aprovado automaticamente por IA',
  });
  assert.equal(docValido.status, DocumentStatus.VALID, 'CRLV completo e valido deve receber status VALID sem 2ª revisão');

  const isComplianceValid = FleetComplianceService.isCrlvSituationValid('Em dia', validExpirationDate);
  assert.equal(isComplianceValid, true, 'Compliance deve reconhecer CRLV válido e Em dia');

  const isComplianceRegularValid = FleetComplianceService.isCrlvSituationValid('Regular', validExpirationDate);
  assert.equal(isComplianceRegularValid, true, 'Compliance deve reconhecer CRLV válido e Regular');

  // 2. CRLV Vencido -> Bloqueio de contrato
  const docExpiradoStatus = FleetComplianceService.calculateDocumentStatus(expiredDate);
  assert.equal(docExpiradoStatus, DocumentStatus.EXPIRED, 'CRLV com data no passado deve ser considerado EXPIRED');

  const isExpiredComplianceValid = FleetComplianceService.isCrlvSituationValid('Vencido', expiredDate);
  assert.equal(isExpiredComplianceValid, false, 'Compliance deve bloquear CRLV vencido');

  // 3. IA Incompleta / Campo Obrigatório Ausente -> Rejeição
  await assert.rejects(
    async () => {
      await FleetComplianceService.createDocument({
        companyId,
        vehicleId: '',
        documentType: 'CRLV',
        expirationDate: '',
        userId,
        userName,
      });
    },
    /obrigatório/i,
    'Falta de campos obrigatórios deve falhar a validação descritivamente',
  );

  // 4. Server-side CRLV Apply Authority Validation
  const vehicle = { plate: 'ABC1D23', renavam: '12345678901', chassis: '9BWZZZ377VT004251' };
  const extractionFields = { plate: 'ABC-1D23', renavam: '12345678901', chassis: '9BWZZZ377VT004251', brand: 'Toyota', model: 'Corolla' };

  assert.doesNotThrow(
    () => assertReviewedCrlvMatchesVehicle(vehicle, extractionFields, {}),
    'CRLV extraído compatível com o veículo não deve lançar erro',
  );

  const selectedFields = parseVehicleCrlvSelectedFields(['brand', 'model']);
  const changes = buildVehicleChangesFromReviewedCrlv(extractionFields, {}, selectedFields);
  assert.equal(changes.brand, 'Toyota', 'deve extrair e aplicar a marca corretamente');
  assert.equal(changes.model, 'Corolla', 'deve extrair e aplicar o modelo corretamente');

  // 5. CRLV incompatível com o veículo -> Rejeição por segurança
  assert.throws(
    () => assertReviewedCrlvMatchesVehicle(vehicle, { plate: 'XYZ9K99' }, {}),
    /CRLV incompatível com o veículo aberto/,
    'CRLV de veículo diferente deve falhar por segurança',
  );

  console.log('CRLV full pipeline integration test: PASS');
}

if (process.argv[1]?.includes('crlvFullPipelineIntegration.test.ts')) {
  runCrlvFullPipelineIntegrationTest()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}
