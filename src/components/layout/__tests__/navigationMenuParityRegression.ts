import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const projectRoot = join(__dirname, '../../../../');

function checkNavigationParity(): void {
  const sidebarContent = readFileSync(join(projectRoot, 'src/components/layout/Sidebar.tsx'), 'utf8');
  const productionSidebarContent = readFileSync(join(projectRoot, 'src/components/layout/ProductionSidebar.tsx'), 'utf8');
  const viteContent = readFileSync(join(projectRoot, 'vite.config.ts'), 'utf8');
  const appContent = readFileSync(join(projectRoot, 'src/App.tsx'), 'utf8');

  // 1. Paridade Dev vs Prod: vite.config.ts não deve desviar Sidebar para outro arquivo em command === 'build'
  assert.doesNotMatch(
    viteContent,
    /find:\s*\/.*Sidebar.*\/,\s*replacement:\s*productionSidebar/,
    'vite.config.ts não pode ter alias substituindo Sidebar por outro componente em build'
  );

  // 2. ProductionSidebar deve re-exportar Sidebar canônico
  assert.match(
    productionSidebarContent,
    /export\s*\{\s*Sidebar/,
    'ProductionSidebar deve re-exportar o Sidebar canônico'
  );

  // 3. Garantir itens operacionais presentes no Sidebar.tsx unificado (AUTOERP-48: 9 itens canônicos simplificados)
  const expectedItems = [
    { id: 'dashboard', label: 'Início' },
    { id: 'fleet', label: 'Veículos' },
    { id: 'drivers', label: 'Motoristas' },
    { id: 'contracts', label: 'Contratos' },
    { id: 'inspections', label: 'Vistorias' },
    { id: 'maintenance', label: 'Manutenção' },
    { id: 'trafficTickets', label: 'Multas' },
    { id: 'documentos', label: 'Documentos' },
    { id: 'finance-overview', label: 'Financeiro' },
  ];

  for (const item of expectedItems) {
    assert.ok(
      sidebarContent.includes(`id: '${item.id}'`),
      `Sidebar unificado deve conter o item ${item.id} (${item.label})`
    );
    assert.ok(
      sidebarContent.includes(`label: '${item.label}'`),
      `Sidebar unificado deve conter o rótulo ${item.label}`
    );

    // Garantir que App.tsx trata a aba correspondente
    assert.ok(
      appContent.includes(`activeTab==='${item.id}'`) || appContent.includes(`activeTab === '${item.id}'`),
      `App.tsx deve renderizar view para a tab ${item.id}`
    );
  }

  // 4. Garantir que branding dinâmico (TenantProfile) e scroll invisível estão preservados
  assert.match(sidebarContent, /TenantProfileClient\.getBranding/, 'Sidebar deve carregar branding dinâmico');
  assert.match(sidebarContent, /\[scrollbar-width:none\]/, 'Sidebar deve ter classe de scrollbar invisível');

  // 5. Garantir acabamento de UX (sem cabeçalho textual redundante 'INÍCIO' e com badges de pendências no FinanceHub)
  assert.doesNotMatch(sidebarContent, /title:\s*'INÍCIO'/, 'Sidebar não deve exibir cabeçalho textual redundante INÍCIO');
  const financeHubContent = readFileSync(join(projectRoot, 'src/components/finance/FinanceHubView.tsx'), 'utf8');
  assert.match(financeHubContent, /pendingReceivablesCount/, 'FinanceHubView deve suportar pendingReceivablesCount');
  assert.match(financeHubContent, /pendingPayablesCount/, 'FinanceHubView deve suportar pendingPayablesCount');

  console.log('✔ AUTOERP-67 / AUTOERP-48: Paridade e acabamento de navegação validados com sucesso.');
}

checkNavigationParity();
