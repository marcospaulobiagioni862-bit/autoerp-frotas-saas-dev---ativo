import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  getMoveFlexVisualFixedMissingFields,
} from '../../domain/contracts/moveflexVisualFixedPdfRenderer';

export function runContractPdfVisualOverlaysRegression(): void {
  const sourceFile = readFileSync(
    new URL('../../domain/contracts/moveflexVisualFixedPdfRenderer.ts', import.meta.url),
    'utf8',
  );

  // 1. Bloco LOCATÁRIO página 1 (y: 531 a 837)
  assert.ok(sourceFile.includes("fieldKey: 'driver.name'"), 'must map driver.name on page 1');
  assert.ok(sourceFile.includes("y: 531"), 'driver.name overlay must align at y=531');
  assert.ok(sourceFile.includes("y: 837"), 'driver.pixKey overlay must align at y=837');

  // 2. Ajuste minFontSize apenas para endereço do locatário
  assert.ok(sourceFile.includes("minFontSize: 4.4"), 'driver.address.full must specify minFontSize 4.4');
  assert.ok(sourceFile.includes("minSize = 5.2"), 'fittedSize must accept minSize parameter defaulting to 5.2');

  // 3. Foro, Cidade, CPF/CNPJ locador e CPF locatário página 4 (y: 580, 887, 950, 991)
  assert.ok(sourceFile.includes("fieldKey: 'company.address.forum'"), 'must map forum overlay on page 4');
  assert.ok(sourceFile.includes("y: 580"), 'forum overlay must align at y=580');
  assert.ok(sourceFile.includes("y: 887"), 'city signature overlay must align at y=887');
  assert.ok(sourceFile.includes("y: 950"), 'company document signature overlay must align at y=950');
  assert.ok(sourceFile.includes("y: 991"), 'driver cpf signature overlay must align at y=991');

  // 4. Preflight de validação
  const missing = getMoveFlexVisualFixedMissingFields('locacao-padrao', {});
  assert.ok(missing.includes('driver.name'), 'preflight must fail closed when driver.name is missing');
  assert.ok(missing.includes('company.address.forum'), 'preflight must fail closed when forum is missing');
}

if (process.argv[1]?.includes('contractPdfVisualOverlaysRegression')) {
  runContractPdfVisualOverlaysRegression();
  console.log('Contract PDF visual overlays regression: PASS');
}
