import assert from 'node:assert/strict';
import express from 'express';
import { createServer } from 'node:http';
import { UnitOfWork } from '../../db/uow';
import { registerFinanceRoutes } from '../financeRoutes';

async function testSettlementOptionsRegression(): Promise<void> {
  const app = express();
  app.use(express.json());

  let currentPrincipal = {
    userId: 'user-settlement-test',
    companyId: 'company-settlement-test',
    name: 'Tester',
    role: 'ADMIN',
    permissions: ['*'],
  };

  // Injetar principal simulado dinamicamente
  app.use((req, _res, next) => {
    (req as any).principal = { ...currentPrincipal };
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
    // 1. GET /api/finance/settlement-options com usuário não autorizado -> 403 Forbidden
    currentPrincipal = {
      userId: 'user-no-finance',
      companyId: 'company-settlement-test',
      name: 'No Finance',
      role: 'OPERATIONAL',
      permissions: ['VEHICLE_VIEW'],
    };
    const forbiddenGetRes = await fetch(`${baseUrl}/api/finance/settlement-options`);
    assert.equal(forbiddenGetRes.status, 403, 'GET settlement-options sem VIEW_FINANCE deve retornar 403');

    // 2. GET /api/finance/settlement-options deve ser LEITURA PURA (zero bootstrap, estado vazio honesto)
    currentPrincipal = {
      userId: 'user-readonly',
      companyId: 'company-settlement-test',
      name: 'Readonly User',
      role: 'READONLY',
      permissions: ['VIEW_FINANCE'],
    };
    assert.equal(mockAccounts.length, 0);
    assert.equal(mockPaymentMethods.length, 0);

    const getRes = await fetch(`${baseUrl}/api/finance/settlement-options`);
    assert.equal(getRes.status, 200);
    const options = await getRes.json();

    assert.equal(options.accounts.length, 0, 'Não deve fazer bootstrap de contas no GET');
    assert.equal(options.paymentMethods.length, 0, 'Não deve fazer bootstrap de métodos no GET');
    assert.equal(mockAccounts.length, 0, 'Banco deve permanecer inalterado após GET');
    assert.equal(mockPaymentMethods.length, 0, 'Banco deve permanecer inalterado após GET');

    // 3. POST /api/finance/settlement-options/quick-account com perfil READONLY -> 403 Forbidden
    const forbiddenPostRes = await fetch(`${baseUrl}/api/finance/settlement-options/quick-account`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Caixa Rápido', type: 'CASH' }),
    });
    assert.equal(forbiddenPostRes.status, 403, 'POST quick-account sem permissão de mutação deve retornar 403');

    // 4. Usuário com permissão PAYMENT_REGISTER e VIEW_FINANCE agora executa mutações
    currentPrincipal = {
      userId: 'user-operator',
      companyId: 'company-settlement-test',
      name: 'Operator',
      role: 'OPERATIONAL',
      permissions: ['VIEW_FINANCE', 'PAYMENT_REGISTER'],
    };

    // 4a. Rejeitar nome vazio (400)
    const emptyNameRes = await fetch(`${baseUrl}/api/finance/settlement-options/quick-account`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: '   ', type: 'CASH' }),
    });
    assert.equal(emptyNameRes.status, 400);

    // 4b. Rejeitar initialBalance inválido (400) - nunca silenciar para 0
    const invalidBalanceText = await fetch(`${baseUrl}/api/finance/settlement-options/quick-account`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Conta Inválida 1', initialBalance: 'abc' }),
    });
    assert.equal(invalidBalanceText.status, 400, 'Saldo não-numérico deve retornar 400');

    const invalidBalance3Decimals = await fetch(`${baseUrl}/api/finance/settlement-options/quick-account`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Conta Inválida 2', initialBalance: '1,234' }),
    });
    assert.equal(invalidBalance3Decimals.status, 400, 'Saldo com 3 casas decimais deve retornar 400');

    const invalidBalanceNegative = await fetch(`${baseUrl}/api/finance/settlement-options/quick-account`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Conta Inválida 3', initialBalance: -100 }),
    });
    assert.equal(invalidBalanceNegative.status, 400, 'Saldo negativo deve retornar 400');

    // 4c. Criar conta com sucesso usando máscara brasileira R$ '2.500,00' -> 2500 (201)
    const createBrlRes = await fetch(`${baseUrl}/api/finance/settlement-options/quick-account`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Banco Itaú - Operacional', type: 'CHECKING', initialBalance: '2.500,00' }),
    });
    assert.equal(createBrlRes.status, 201);
    const createdBrlData = await createBrlRes.json();
    assert.equal(createdBrlData.account.name, 'Banco Itaú - Operacional');
    assert.equal(createdBrlData.account.type, 'CHECKING');
    assert.equal(createdBrlData.account.status, 'ACTIVE');
    assert.equal(createdBrlData.account.initialBalance, '2500');
    assert.equal(createdBrlData.account.currentBalance, '2500');
    assert.equal(mockAccounts.length, 1);

    // 4d. Criar conta com saldo numérico float (201)
    const createNumRes = await fetch(`${baseUrl}/api/finance/settlement-options/quick-account`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Caixa Físico Balcão', type: 'CASH', initialBalance: 150.75 }),
    });
    assert.equal(createNumRes.status, 201);
    const createdNumData = await createNumRes.json();
    assert.equal(createdNumData.account.initialBalance, '150.75');
    assert.equal(mockAccounts.length, 2);

    // 4e. Criar conta sem informar saldo (default 0) (201)
    const createZeroRes = await fetch(`${baseUrl}/api/finance/settlement-options/quick-account`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Caixa Reserva', type: 'CASH' }),
    });
    assert.equal(createZeroRes.status, 201);
    const createdZeroData = await createZeroRes.json();
    assert.equal(createdZeroData.account.initialBalance, '0');
    assert.equal(mockAccounts.length, 3);

    // 4f. Rejeitar duplicidade de nome ativo (case-insensitive e com espaços) (409)
    const duplicateRes = await fetch(`${baseUrl}/api/finance/settlement-options/quick-account`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: '  banco itaú - operacional  ', type: 'CHECKING' }),
    });
    assert.equal(duplicateRes.status, 409);
    const dupBody = await duplicateRes.json();
    assert.equal(dupBody.error, 'Já existe uma conta ativa com este nome.');

    // 5. GET settlement-options retorna agora as contas cadastradas
    const getPopulatedRes = await fetch(`${baseUrl}/api/finance/settlement-options`);
    assert.equal(getPopulatedRes.status, 200);
    const populatedOptions = await getPopulatedRes.json();
    assert.equal(populatedOptions.accounts.length, 3);
    assert.equal(populatedOptions.accounts[0].name, 'Banco Itaú - Operacional');

    console.log('settlementOptionsBootstrapRegression: PASS');
  } finally {
    (UnitOfWork as any).run = originalRun;
    if (typeof (server as any).closeAllConnections === 'function') {
      (server as any).closeAllConnections();
    }
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
}

testSettlementOptionsRegression()
  .then(() => {
    process.exit(0);
  })
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
