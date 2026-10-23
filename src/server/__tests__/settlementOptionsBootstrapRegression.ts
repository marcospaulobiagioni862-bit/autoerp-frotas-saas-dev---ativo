import assert from 'node:assert/strict';
import express from 'express';
import { createServer } from 'node:http';
import { UnitOfWork } from '../../db/uow';
import { registerFinanceRoutes } from '../financeRoutes';

async function testSettlementOptionsBootstrap(): Promise<void> {
  const app = express();
  app.use(express.json());

  // Injetar principal simulado
  app.use((req, _res, next) => {
    (req as any).principal = {
      userId: 'user-settlement-test',
      companyId: 'company-settlement-test',
      name: 'Tester',
      role: 'ADMIN',
      permissions: ['*'],
    };
    next();
  });

  registerFinanceRoutes(app);

  const server = createServer(app);
  await new Promise<void>((resolve) => server.listen(0, resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Server address unavailable');
  const baseUrl = `http://127.0.0.1:${address.port}`;

  const originalRun = UnitOfWork.run;

  const mockAccounts: any[] = [];
  const mockPaymentMethods: any[] = [];

  const mockTxContext = {
    getAccountRepo: () => ({
      findAll: async () => mockAccounts,
      create: async (item: any) => {
        mockAccounts.push(item);
        return item;
      },
    }),
    getPaymentMethodRepo: () => ({
      findAll: async () => mockPaymentMethods,
      create: async (item: any) => {
        mockPaymentMethods.push(item);
        return item;
      },
    }),
  };

  (UnitOfWork as any).run = async (_companyId: string, callback: (ctx: any) => Promise<any>) => {
    return await callback(mockTxContext);
  };

  try {
    // 1. GET /api/finance/settlement-options deve fazer auto-bootstrap quando não houver contas/métodos ativos
    assert.equal(mockAccounts.length, 0);
    assert.equal(mockPaymentMethods.length, 0);

    const getRes = await fetch(`${baseUrl}/api/finance/settlement-options`);
    assert.equal(getRes.status, 200);
    const options = await getRes.json();

    assert.equal(options.accounts.length, 1);
    assert.equal(options.accounts[0].name, 'Caixa Geral');
    assert.equal(options.accounts[0].type, 'CASH');
    assert.equal(options.accounts[0].status, 'ACTIVE');

    assert.equal(options.paymentMethods.length, 5);
    const methodTypes = options.paymentMethods.map((m: any) => m.type);
    assert.ok(methodTypes.includes('PIX'));
    assert.ok(methodTypes.includes('TRANSFER'));
    assert.ok(methodTypes.includes('BOLETO'));
    assert.ok(methodTypes.includes('CREDIT_CARD'));
    assert.ok(methodTypes.includes('CASH'));

    // 2. POST /api/finance/settlement-options/quick-account - rejeitar nome vazio (400)
    const emptyNameRes = await fetch(`${baseUrl}/api/finance/settlement-options/quick-account`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: '   ', type: 'CASH' }),
    });
    assert.equal(emptyNameRes.status, 400);

    // 3. POST /api/finance/settlement-options/quick-account - criar conta com sucesso (201)
    const createRes = await fetch(`${baseUrl}/api/finance/settlement-options/quick-account`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Banco Itaú - Operacional', type: 'CHECKING', initialBalance: 1500 }),
    });
    assert.equal(createRes.status, 201);
    const createdData = await createRes.json();
    assert.equal(createdData.account.name, 'Banco Itaú - Operacional');
    assert.equal(createdData.account.type, 'CHECKING');
    assert.equal(createdData.account.status, 'ACTIVE');
    assert.equal(mockAccounts.length, 2);

    // 4. POST /api/finance/settlement-options/quick-account - rejeitar duplicidade de nome ativo (409)
    const duplicateRes = await fetch(`${baseUrl}/api/finance/settlement-options/quick-account`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'banco itaú - operacional', type: 'CHECKING' }),
    });
    assert.equal(duplicateRes.status, 409);

    console.log('settlementOptionsBootstrapRegression: PASS');
  } finally {
    (UnitOfWork as any).run = originalRun;
    server.close();
  }
}

testSettlementOptionsBootstrap().catch((err) => {
  console.error(err);
  process.exit(1);
});
