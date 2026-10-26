import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// Setup local in-memory storage environment for domain tests
if (typeof globalThis.window === 'undefined') {
  (globalThis as any).window = globalThis;
}
if (typeof globalThis.localStorage === 'undefined') {
  const store: Record<string, string> = {};
  (globalThis as any).localStorage = {
    getItem: (key: string) => store[key] || null,
    setItem: (key: string, val: string) => { store[key] = val; },
    removeItem: (key: string) => { delete store[key]; },
    clear: () => { Object.keys(store).forEach(k => delete store[k]); },
  };
}

import { seedAutoERPTestData } from '../../../persistence/seed/seedData';
import { ReceivableService } from '../ReceivableService';
import { PayableService } from '../PayableService';
import { FinanceEngine } from '../FinanceEngine';
import { OriginType, ObligationStatus } from '../../../types/enums';

async function run(): Promise<void> {
  await seedAutoERPTestData(true);

  const companyId = 'company-main-uuid';
  const userId = 'user-admin-1';
  const userName = 'Admin Auditor';
  const defaultCategory = 'cat-fine-inc';
  const expenseCategory = 'cat-fine-exp';

  console.log('--- TESTANDO GUARDAS DE CANCELAMENTO FINANCEIRO DE MULTAS (PH-123) ---');

  // 1. Criar recebível com origem TRAFFIC_TICKET_DRIVER
  const ticketReceivable = await FinanceEngine.createReceivable({
    companyId,
    originType: OriginType.TRAFFIC_TICKET_DRIVER,
    originId: 'ticket-guard-rec-01',
    driverId: 'drv-1',
    vehicleId: 'veh-1',
    categoryId: defaultCategory,
    description: 'Cobrança de multa do motorista drv-1',
    totalAmount: 293.47,
    dueDate: '2026-09-15',
    userId,
    userName,
  });
  const recId = ticketReceivable[0].id;
  assert.equal(ticketReceivable[0].originType, OriginType.TRAFFIC_TICKET_DRIVER);

  // 2. TENTATIVA DIRETA DE CANCELAMENTO PELO FINANCEIRO DEVE SER RECUSADA
  let recBlocked = false;
  try {
    await ReceivableService.cancelReceivable(
      companyId,
      recId,
      'Cancelamento manual via interface',
      userId,
      userName
    );
  } catch (err: any) {
    recBlocked = err.message.includes('Não é possível cancelar título vinculado a multa de trânsito diretamente pelo financeiro');
  }
  assert.equal(
    recBlocked,
    true,
    'TT-GUARD-01: Cancelamento direto de recebível de multa pelo financeiro deve ser barrado com orientação clara'
  );

  // 3. CANCELAMENTO ORIGINADO PELA AUTORIDADE DE MULTAS DEVE SER PERMITIDO
  const cancelledRec = await ReceivableService.cancelReceivable(
    companyId,
    recId,
    'Alteração/cancelamento da multa',
    userId,
    userName,
    undefined,
    { allowTrafficTicketCancellation: true }
  );
  assert.equal(
    cancelledRec.status,
    ObligationStatus.CANCELLED,
    'TT-GUARD-02: Cancelamento via autoridade de multas (allowTrafficTicketCancellation=true) deve ser aceito'
  );

  // 4. Criar a pagar com origem TRAFFIC_TICKET_COMPANY
  const companyPayable = await FinanceEngine.createPayable({
    companyId,
    originType: OriginType.TRAFFIC_TICKET_COMPANY,
    originId: 'ticket-guard-pay-01',
    vehicleId: 'veh-1',
    categoryId: expenseCategory,
    description: 'Multa órgão de trânsito (MoveFlex)',
    totalAmount: 195.23,
    dueDate: '2026-09-20',
    userId,
    userName,
  });
  const payId = companyPayable[0].id;
  assert.equal(companyPayable[0].originType, OriginType.TRAFFIC_TICKET_COMPANY);

  // 5. TENTATIVA DIRETA DE CANCELAMENTO PELO FINANCEIRO DEVE SER RECUSADA
  let payBlocked = false;
  try {
    await PayableService.cancelPayable(
      companyId,
      payId,
      'Cancelamento manual via interface',
      userId,
      userName
    );
  } catch (err: any) {
    payBlocked = err.message.includes('Não é possível cancelar título vinculado a multa de trânsito diretamente pelo financeiro');
  }
  assert.equal(
    payBlocked,
    true,
    'TT-GUARD-03: Cancelamento direto de pagar de multa da empresa deve ser barrado com orientação clara'
  );

  // 6. CANCELAMENTO ORIGINADO PELA AUTORIDADE DE MULTAS DEVE SER PERMITIDO
  const cancelledPay = await PayableService.cancelPayable(
    companyId,
    payId,
    'Alteração/cancelamento da multa',
    userId,
    userName,
    undefined,
    { allowTrafficTicketCancellation: true }
  );
  assert.equal(
    cancelledPay.status,
    ObligationStatus.CANCELLED,
    'TT-GUARD-04: Cancelamento de pagar via autoridade de multas deve ser aceito'
  );

  // 7. Criar a pagar NIC (TRAFFIC_TICKET_NIC)
  const nicPayable = await FinanceEngine.createPayable({
    companyId,
    originType: OriginType.TRAFFIC_TICKET_NIC,
    originId: 'ticket-guard-nic-01',
    vehicleId: 'veh-1',
    categoryId: expenseCategory,
    description: 'Multa NIC por falta de indicação',
    totalAmount: 390.46,
    dueDate: '2026-09-25',
    userId,
    userName,
  });
  const nicId = nicPayable[0].id;

  // 8. TENTATIVA DIRETA DE CANCELAMENTO DE NIC DEVE SER RECUSADA
  let nicBlocked = false;
  try {
    await PayableService.cancelPayable(
      companyId,
      nicId,
      'Cancelamento manual via interface',
      userId,
      userName
    );
  } catch (err: any) {
    nicBlocked = err.message.includes('Não é possível cancelar título vinculado a multa de trânsito diretamente pelo financeiro');
  }
  assert.equal(
    nicBlocked,
    true,
    'TT-GUARD-05: Cancelamento direto de pagar NIC deve ser barrado com orientação clara'
  );

  // 9. CANCELAMENTO DE TÍTULO NORMAL (ADMINISTRATIVE) PELO FINANCEIRO DEVE CONTINUAR FUNCIONANDO
  const normalReceivable = await FinanceEngine.createReceivable({
    companyId,
    originType: OriginType.ADMINISTRATIVE,
    originId: 'normal-admin-rec-01',
    categoryId: defaultCategory,
    description: 'Receita administrativa avulsa',
    totalAmount: 100,
    dueDate: '2026-09-30',
    userId,
    userName,
  });
  const normalCancelled = await FinanceEngine.cancelReceivable(
    companyId,
    normalReceivable[0].id,
    'Cancelamento normal',
    userId,
    userName
  );
  assert.equal(
    normalCancelled.status,
    ObligationStatus.CANCELLED,
    'TT-GUARD-06: Títulos não vinculados a multas continuam normalmente canceláveis pelo financeiro'
  );

  // 10. Validação de Invariantes Estáticas do Servidor e da Autoridade
  const trafficAuthorityCode = readFileSync(
    new URL('../../../server/trafficTicketAuthority.ts', import.meta.url),
    'utf8'
  );
  assert.match(
    trafficAuthorityCode,
    /cancelReceivableIfOpen[\s\S]*?allowTrafficTicketCancellation:\s*true/,
    'TT-GUARD-07: cancelReceivableIfOpen na autoridade de trânsito deve declarar allowTrafficTicketCancellation: true'
  );
  assert.match(
    trafficAuthorityCode,
    /cancelPayableIfOpen[\s\S]*?allowTrafficTicketCancellation:\s*true/,
    'TT-GUARD-08: cancelPayableIfOpen na autoridade de trânsito deve declarar allowTrafficTicketCancellation: true'
  );

  const financeRoutesCode = readFileSync(
    new URL('../../../server/financeRoutes.ts', import.meta.url),
    'utf8'
  );
  assert.match(
    financeRoutesCode,
    /TRAFFIC_TICKET_OBLIGATION_CANCELLATION_BLOCKED/,
    'TT-GUARD-09: financeRoutes deve mapear o bloqueio para TRAFFIC_TICKET_OBLIGATION_CANCELLATION_BLOCKED'
  );

  const receivablesViewCode = readFileSync(
    new URL('../../../components/finance/ReceivablesView.tsx', import.meta.url),
    'utf8'
  );
  assert.match(
    receivablesViewCode,
    /item\.originType === OriginType\.TRAFFIC_TICKET_DRIVER/,
    'TT-GUARD-10: ReceivablesView deve validar preventivamente a origem TRAFFIC_TICKET_DRIVER'
  );

  const payablesViewCode = readFileSync(
    new URL('../../../components/finance/PayablesView.tsx', import.meta.url),
    'utf8'
  );
  assert.match(
    payablesViewCode,
    /item\.originType === OriginType\.TRAFFIC_TICKET_COMPANY/,
    'TT-GUARD-11: PayablesView deve validar preventivamente a origem TRAFFIC_TICKET_COMPANY'
  );

  console.log('Traffic ticket financial cancellation guard integration and static invariants: PASS (11/11)');
}

run().catch((err) => {
  console.error('Falha nos testes de guarda de cancelamento de multa:', err);
  process.exit(1);
});
