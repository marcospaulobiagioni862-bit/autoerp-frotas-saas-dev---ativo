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

  // 3. Garantir itens operacionais presentes no Sidebar.tsx unificado
  const expectedItems = [
    { id: 'dashboard', label: 'Visão Geral' },
    { id: 'fleet', label: 'Veículos' },
    { id: 'drivers', label: 'Motoristas' },
    { id: 'contracts', label: 'Contratos' },
    { id: 'inspections', label: 'Vistorias' },
    { id: 'maintenance', label: 'Manutenção' },
    { id: 'trafficTickets', label: 'Multas' },
    { id: 'documentos', label: 'Documentos' },
    { id: 'finance-overview', label: 'Dashboard Financeiro' },
    { id: 'receivables', label: 'Contas a Receber' },
    { id: 'payables', label: 'Contas a Pagar' },
    { id: 'transactions', label: 'Movimentações' },
    { id: 'cashflow', label: 'Fluxo de Caixa' },
    { id: 'dre', label: 'Relatórios Financeiros' },
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

  console.log('✔ AUTOERP-67: Paridade de navegação entre Dev e Produção validada com sucesso.');
}

checkNavigationParity();
