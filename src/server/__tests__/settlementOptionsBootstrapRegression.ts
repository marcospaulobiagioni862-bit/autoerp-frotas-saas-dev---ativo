import assert from 'node:assert/strict';
import express from 'express';
import { createServer } from 'node:http';
import { UnitOfWork } from '../../db/uow';
import { registerFinanceRoutes } from '../financeRoutes';
import { AuditAction } from '../../types/enums';

async function testSettlementOptionsRegression(): Promise<void> {
  const app = express();
  app.use(express.json());

  let currentPrincipal = {
    userId: 'user-admin',
    companyId: 'company-settlement-test',
    name: 'Admin Tester',
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
  const mockAuditLogs: any[] = [];

  const mockUsers = [
    {
      id: 'user-no-finance',
      companyId: 'company-settlement-test',
      name: 'No Finance',
      role: 'OPERATIONAL',
      active: true,
      permissions: ['VEHICLE_VIEW'],
    },
    {
      id: 'user-readonly',
      companyId: 'company-settlement-test',
      name: 'Readonly User',
      role: 'READONLY',
      active: true,
      permissions: ['VIEW_FINANCE'],
    },
    {
      id: 'user-operator',
      companyId: 'company-settlement-test',
      name: 'Operator User',
      role: 'OPERATIONAL',
      active: true,
      permissions: ['VIEW_FINANCE', 'PAYMENT_REGISTER'],
    },
    {
      id: 'user-inactive',
      companyId: 'company-settlement-test',
      name: 'Inactive Manager',
      role: 'FINANCIAL_MANAGER',
      active: false,
      permissions: ['VIEW_FINANCE', 'FINANCIAL_MASTER_DATA_MANAGE'],
    },
    {
      id: 'user-manager',
      companyId: 'company-settlement-test',
      name: 'Financial Manager',
      role: 'FINANCIAL_MANAGER',
      active: true,
      permissions: ['VIEW_FINANCE', 'FINANCIAL_MASTER_DATA_MANAGE'],
    },
    {
      id: 'user-admin',
      companyId: 'company-settlement-test',
      name: 'Admin User',
      role: 'ADMIN',
      active: true,
      permissions: ['*'],
    },
  ];

  const mockTxContext = {
    getUserRepo: () => ({
      findById: async (id: string) => mockUsers.find((u) => u.id === id) || null,
    }),
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
    getAuditLogRepo: () => ({
      create: async (entry: any) => {
        mockAuditLogs.push(entry);
        return entry;
      },
    }),
    getRawTransaction: () => ({
      execute: async () => ({ rows: [] }),
      select: () => ({
        from: () => ({
          where: async () => {
            // Em assertUniqueName: retorna linhas com id de contas que já tenham o nome
            // (a lógica de assertUniqueName verifica se alguma conta existente colide)
            return mockAccounts.map((a) => ({ id: a.id, name: a.name }));
          },
        }),
      }),
      insert: () => ({
        values: (data: any) => ({
          returning: async () => {
            const row = { ...data };
            mockAccounts.push(row);
            return [row];
          },
        }),
      }),
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

    // 3. POST /api/finance/settlement-options/quick-account com perfil READONLY (só VIEW_FINANCE) -> 403 Forbidden
    const readonlyPostRes = await fetch(`${baseUrl}/api/finance/settlement-options/quick-account`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Caixa Rápido', type: 'CASH' }),
    });
    assert.equal(readonlyPostRes.status, 403, 'POST quick-account sem FINANCIAL_MASTER_DATA_MANAGE deve retornar 403');

    // 4. POST /api/finance/settlement-options/quick-account com OPERADOR (PAYMENT_REGISTER sem FINANCIAL_MASTER_DATA_MANAGE) -> 403 Forbidden
    currentPrincipal = {
      userId: 'user-operator',
      companyId: 'company-settlement-test',
      name: 'Operator User',
      role: 'OPERATIONAL',
      permissions: ['VIEW_FINANCE', 'PAYMENT_REGISTER'],
    };
    const operatorPostRes = await fetch(`${baseUrl}/api/finance/settlement-options/quick-account`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Caixa do Operador', type: 'CASH' }),
    });
    assert.equal(operatorPostRes.status, 403, 'Operador de baixa sem permissão mestre não pode criar conta financeira (403)');

    // 5. POST /api/finance/settlement-options/quick-account com usuário suspenso/inativo no banco -> 403 Forbidden
    currentPrincipal = {
      userId: 'user-inactive',
      companyId: 'company-settlement-test',
      name: 'Inactive Manager',
      role: 'FINANCIAL_MANAGER',
      permissions: ['VIEW_FINANCE', 'FINANCIAL_MASTER_DATA_MANAGE'],
    };
    const inactivePostRes = await fetch(`${baseUrl}/api/finance/settlement-options/quick-account`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Caixa Inativo', type: 'CASH' }),
    });
    assert.equal(inactivePostRes.status, 403, 'Usuário inativo no banco deve ser barrado por authorize() com 403');

    // 6. Usuário autorizado (user-manager com FINANCIAL_MASTER_DATA_MANAGE)
    currentPrincipal = {
      userId: 'user-manager',
      companyId: 'company-settlement-test',
      name: 'Financial Manager',
      role: 'FINANCIAL_MANAGER',
      permissions: ['VIEW_FINANCE', 'FINANCIAL_MASTER_DATA_MANAGE'],
    };

    // 6a. Rejeitar nome vazio (400)
    const emptyNameRes = await fetch(`${baseUrl}/api/finance/settlement-options/quick-account`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: '   ', type: 'CASH' }),
    });
    assert.equal(emptyNameRes.status, 400, 'Nome vazio deve retornar 400');

    // 6b. Criar conta com sucesso via autoridade canônica (201)
    const createRes = await fetch(`${baseUrl}/api/finance/settlement-options/quick-account`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Banco Itaú - Operacional', type: 'BANK' }),
    });
    assert.equal(createRes.status, 201, 'Criação canônica deve retornar 201');
    const createdData = await createRes.json();
    assert.equal(createdData.account.name, 'Banco Itaú - Operacional');
    assert.equal(createdData.account.type, 'BANK');
    assert.equal(createdData.account.status, 'ACTIVE');
    assert.equal(createdData.account.initialBalance, 0, 'initialBalance deve ser estritamente travado em 0 no atalho');
    assert.equal(createdData.account.currentBalance, 0, 'currentBalance deve ser estritamente travado em 0 no atalho');
    assert.equal(mockAccounts.length, 1);

    // 6c. Verificar que a criação foi auditada canonicamente com openingBalancePolicy
    const accountAudit = mockAuditLogs.find(
      (entry) => entry.entityName === 'FinancialAccount' && entry.entityId === createdData.account.id
    );
    assert.ok(accountAudit, 'Criação de conta pelo atalho DEVE gerar registro de auditoria');
    assert.equal(accountAudit.action, AuditAction.CREATE);
    assert.equal(accountAudit.userId, 'user-manager');
    const auditPayload = JSON.parse(accountAudit.newState);
    assert.equal(auditPayload.openingBalancePolicy, 'INITIAL_EQUALS_CURRENT_AT_CREATION');

    // 6d. Rejeitar duplicidade de nome ativo (409)
    const duplicateRes = await fetch(`${baseUrl}/api/finance/settlement-options/quick-account`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'banco itaú - operacional', type: 'BANK' }),
    });
    assert.equal(duplicateRes.status, 409, 'Nome duplicado deve retornar 409 Conflict');

    // 7. GET settlement-options retorna agora a conta recém-criada
    const getPopulatedRes = await fetch(`${baseUrl}/api/finance/settlement-options`);
    assert.equal(getPopulatedRes.status, 200);
    const populatedOptions = await getPopulatedRes.json();
    assert.equal(populatedOptions.accounts.length, 1);
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
