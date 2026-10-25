import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  createEmptyWorkOrderFinanceDraft,
  type WorkOrderFinanceDraft,
} from '../WorkOrderFinanceFields';
import { propagateWorkOrderMainSupplier } from '../MaintenanceManagement';

// 1. Cenário real do relato do Marcos:
// Abrir Nova OS, escolher a oficina A, descer e trocar o fornecedor de mão de obra para B,
// voltar e trocar a oficina para C — mão de obra tem de continuar em B.
function testMarcosWorkOrderSupplierScenario(): void {
  let finance: WorkOrderFinanceDraft = createEmptyWorkOrderFinanceDraft();
  let prevSupplier = '';

  // Passo 1: Usuário escolhe a oficina A no select superior
  finance = propagateWorkOrderMainSupplier(finance, 'oficina-A', prevSupplier);
  prevSupplier = 'oficina-A';

  assert.equal(finance.parts.supplierId, 'oficina-A', 'Peças deve herdar fornecedor inicial da OS');
  assert.equal(finance.services.supplierId, 'oficina-A', 'Serviços deve herdar fornecedor inicial da OS');
  assert.equal(finance.labor.supplierId, 'oficina-A', 'Mão de obra deve herdar fornecedor inicial da OS');

  // Passo 2: Usuário desce e escolhe fornecedor B especificamente para Mão de Obra
  finance = {
    ...finance,
    labor: { ...finance.labor, supplierId: 'oficina-B' },
  };
  assert.equal(finance.parts.supplierId, 'oficina-A');
  assert.equal(finance.services.supplierId, 'oficina-A');
  assert.equal(finance.labor.supplierId, 'oficina-B');

  // Passo 3: Usuário volta e troca a oficina principal de A para C
  finance = propagateWorkOrderMainSupplier(finance, 'oficina-C', prevSupplier);
  prevSupplier = 'oficina-C';

  // Invariante de negócio PH-119: Peças e Serviços que acompanhavam A devem propagar para C,
  // mas Mão de Obra que foi definida manualmente para B NÃO pode ser sobrescrita.
  assert.equal(finance.parts.supplierId, 'oficina-C', 'Peças deve propagar para nova oficina');
  assert.equal(finance.services.supplierId, 'oficina-C', 'Serviços deve propagar para nova oficina');
  assert.equal(finance.labor.supplierId, 'oficina-B', 'Mão de obra DEVE permanecer em B (não ser sobrescrita)');

  // Passo 4: Usuário define Peças manualmente como D e troca oficina principal para E
  finance = {
    ...finance,
    parts: { ...finance.parts, supplierId: 'oficina-D' },
  };
  finance = propagateWorkOrderMainSupplier(finance, 'oficina-E', prevSupplier);
  prevSupplier = 'oficina-E';

  assert.equal(finance.parts.supplierId, 'oficina-D', 'Peças manual deve permanecer em D');
  assert.equal(finance.services.supplierId, 'oficina-E', 'Serviços deve propagar para E');
  assert.equal(finance.labor.supplierId, 'oficina-B', 'Mão de obra manual deve permanecer em B');

  // Passo 5: Usuário limpa a oficina principal (seleciona '')
  finance = propagateWorkOrderMainSupplier(finance, '', prevSupplier);
  prevSupplier = '';

  assert.equal(finance.services.supplierId, '', 'Serviços que acompanhava oficina deve limpar');
  assert.equal(finance.parts.supplierId, 'oficina-D', 'Peças manual deve ser mantido');
  assert.equal(finance.labor.supplierId, 'oficina-B', 'Mão de obra manual deve ser mantido');
}

// 2. Invariante estática no código-fonte
function testSourceCodeInvariants(): void {
  const source = readFileSync(new URL('../MaintenanceManagement.tsx', import.meta.url), 'utf8');

  // Não pode haver atribuição incondicional de supplierId em services ou labor
  assert.doesNotMatch(
    source,
    /services:\s*\{\s*\.\.\.current\.services,\s*supplierId:\s*next\s*\}/,
    'Não pode haver sobrescrita incondicional de supplierId em serviços'
  );
  assert.doesNotMatch(
    source,
    /labor:\s*\{\s*\.\.\.current\.labor,\s*supplierId:\s*next\s*\}/,
    'Não pode haver sobrescrita incondicional de supplierId em mão de obra'
  );

  // Deve utilizar propagateWorkOrderMainSupplier com ref de fornecedor anterior
  assert.match(
    source,
    /propagateWorkOrderMainSupplier\(\s*current\s*,\s*next\s*,\s*prev\s*\)/,
    'select principal de oficina deve invocar propagateWorkOrderMainSupplier com current, next e prev'
  );
}

try {
  testMarcosWorkOrderSupplierScenario();
  testSourceCodeInvariants();
  console.log('workOrderSupplierPropagationRegression: PASS');
  process.exit(0);
} catch (err) {
  console.error(err);
  process.exit(1);
}
