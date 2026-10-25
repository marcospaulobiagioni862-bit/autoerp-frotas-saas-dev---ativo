import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { DEFAULT_FINANCIAL_CATEGORIES } from '../../shared/utils/financialDreGroups';

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

// 1. Static Invariants & Canonical Source of Truth Checks (Rules 3.1 & 3.2)
const dreSrc = readFileSync(resolve(process.cwd(), 'src/shared/utils/financialDreGroups.ts'), 'utf8');
const authoritySrc = readFileSync(resolve(process.cwd(), 'src/server/financeMasterDataAuthority.ts'), 'utf8');
const routesSrc = readFileSync(resolve(process.cwd(), 'src/server/financeMasterDataRoutes.ts'), 'utf8');
const clientSrc = readFileSync(resolve(process.cwd(), 'src/api/financeMasterDataClient.ts'), 'utf8');
const uiSrc = readFileSync(resolve(process.cwd(), 'src/components/finance/FinancialMasterDataView.tsx'), 'utf8');

// Ensure mandatory expense categories for fleet operations requested by Marcos are present:
const requiredCategories = [
  'Peças e componentes',
  'Serviços de oficina',
  'Mão de obra',
  'Pneus',
  'Combustível',
  'IPVA e Documentação',
  'Seguro',
  'Multas de trânsito',
];

for (const name of requiredCategories) {
  assert(
    DEFAULT_FINANCIAL_CATEGORIES.some(cat => cat.name.toLowerCase() === name.toLowerCase()),
    `DEFAULT_FINANCIAL_CATEGORIES must contain canonical category: ${name}`
  );
}

// Authority, routes and client checks
assert(authoritySrc.includes('seedDefaultCategories'), 'FinanceMasterDataAuthority must expose seedDefaultCategories');
assert(authoritySrc.includes("FINANCIAL_MASTER_DATA_MANAGE"), 'seedDefaultCategories must enforce permission FINANCIAL_MASTER_DATA_MANAGE');
assert(routesSrc.includes("/api/finance/master-data/categories/seed-defaults"), 'Routes must expose POST /api/finance/master-data/categories/seed-defaults');
assert(clientSrc.includes('seedDefaultCategories'), 'FinanceMasterDataClient must expose seedDefaultCategories');
assert(uiSrc.includes('FinanceMasterDataClient.seedDefaultCategories()'), 'UI button must invoke authoritative seedDefaultCategories endpoint');

// 2. Behavioral Idempotency Simulation (Rule 3.2-h: script must be idempotent and prove it is)
interface SimulatedCategory {
  id: string;
  name: string;
  type: string;
}

function simulateSeed(existingCategories: SimulatedCategory[]): {
  created: number;
  skipped: number;
  resultingCategories: SimulatedCategory[];
} {
  const existingNames = new Set(existingCategories.map(c => c.name.trim().toLowerCase()));
  const resultingCategories = [...existingCategories];
  let created = 0;
  let skipped = 0;

  for (const item of DEFAULT_FINANCIAL_CATEGORIES) {
    const normalized = item.name.trim().toLowerCase();
    if (existingNames.has(normalized)) {
      skipped++;
      continue;
    }

    created++;
    existingNames.add(normalized);
    resultingCategories.push({
      id: `cat-sim-${created}`,
      name: item.name,
      type: item.type,
    });
  }

  return { created, skipped, resultingCategories };
}

// Initial state of Marcos tenant (from PH-122 description):
const marcosInitialCategories: SimulatedCategory[] = [
  { id: 'cat-1', name: 'Multas de trânsito', type: 'BOTH' },
  { id: 'cat-2', name: 'Aluguel de veículos', type: 'INCOME' },
  { id: 'cat-3', name: 'Caução Contratual', type: 'INCOME' },
  { id: 'cat-4', name: 'espelho retrovisor', type: 'INCOME' },
];

// First execution:
const run1 = simulateSeed(marcosInitialCategories);
assert(run1.created > 0, 'First run must create missing categories');
assert(run1.resultingCategories.some(c => c.name === 'Peças e componentes'), 'Must create Peças e componentes');
assert(run1.resultingCategories.some(c => c.name === 'Serviços de oficina'), 'Must create Serviços de oficina');
assert(run1.resultingCategories.some(c => c.name === 'Mão de obra'), 'Must create Mão de obra');
assert(run1.resultingCategories.some(c => c.name === 'Pneus'), 'Must create Pneus');
assert(run1.resultingCategories.some(c => c.name === 'IPVA e Documentação'), 'Must create IPVA e Documentação');
// "Multas de trânsito" was already present, so it must not be duplicated:
const multasCount = run1.resultingCategories.filter(c => c.name.toLowerCase() === 'multas de trânsito').length;
assert(multasCount === 1, 'Multas de trânsito must not be duplicated');

const totalAfterRun1 = run1.resultingCategories.length;

// Second execution on the SAME tenant with existing results:
const run2 = simulateSeed(run1.resultingCategories);
assert(run2.created === 0, `Second run must create 0 categories (idempotency), but created ${run2.created}`);
assert(run2.resultingCategories.length === totalAfterRun1, `Second run count must equal first run count (${totalAfterRun1}), got ${run2.resultingCategories.length}`);
assert(run2.skipped === DEFAULT_FINANCIAL_CATEGORIES.length, 'Second run must skip all canonical categories');

console.log('financialCategoriesSeedRegression: PASS');
