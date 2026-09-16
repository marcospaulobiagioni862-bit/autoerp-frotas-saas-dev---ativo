import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

export function runVehicleCrlvNoHumanReviewRequiredRegression(): void {
  const panelSource = readFileSync(
    new URL('../VehicleCrlvImportPanel.tsx', import.meta.url),
    'utf8',
  );
  const routesSource = readFileSync(
    new URL('../../../server/vehicleCrlvApplyRoutes.ts', import.meta.url),
    'utf8',
  );

  // 1. O painel do CRLV não deve apresentar a segunda revisão humana como etapa obrigatória
  assert.ok(
    !panelSource.includes('Revisão humana'),
    'CRLV panel must not show "Revisão humana" as a mandatory workflow step',
  );
  assert.ok(
    !panelSource.includes('conclua a revisão humana primeiro'),
    'CRLV panel must not block user requiring human review first',
  );
  assert.ok(
    !panelSource.includes('Revisão do CRLV aprovado'),
    'CRLV panel header must not refer to mandatory human review approval',
  );

  // 2. O painel deve aceitar extrações de IA sem exigir filtro estrito por status APPROVED
  assert.ok(
    panelSource.includes('DocumentAiClient.list()'),
    'CRLV panel must fetch extractions without forcing status=APPROVED query filter',
  );
  assert.ok(
    panelSource.includes("VALID_STATUSES = new Set(['APPROVED', 'COMPLETED', 'REVIEW_REQUIRED'])"),
    'CRLV panel must accept completed AI extractions',
  );

  // 3. A rota do servidor (/api/fleet/vehicles/:id/crlv-apply) deve aceitar aplicar dados de extrações válidas concluídas pela IA
  assert.ok(
    routesSource.includes("VALID_APPLY_STATUSES = new Set(['APPROVED', 'COMPLETED', 'REVIEW_REQUIRED'])"),
    'CRLV apply route must accept completed AI extractions without requiring explicit manual approvedAt',
  );
  assert.ok(
    !routesSource.includes('!extraction.approvedAt'),
    'CRLV apply route must not reject extractions lacking manual approvedAt timestamp',
  );
}

if (process.argv[1]?.includes('vehicleCrlvNoHumanReviewRequiredRegression')) {
  runVehicleCrlvNoHumanReviewRequiredRegression();
  console.log('Vehicle CRLV no human review required regression: PASS');
}
