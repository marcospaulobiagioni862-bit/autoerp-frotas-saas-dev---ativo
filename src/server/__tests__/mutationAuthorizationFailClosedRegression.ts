import express from 'express';
import { createServer } from 'node:http';
import assert from 'node:assert/strict';
import type { AuthenticatedPrincipal } from '../auth';
import { registerDriverFormTokenRoutes } from '../driverFormTokenRoutes';
import { registerBankReconciliationRoutes } from '../bankReconciliationRoutes';
import { registerFinanceMasterDataRoutes } from '../financeMasterDataRoutes';
import { registerFinanceOverdueRoutes } from '../financeOverdueRoutes';

// Mocks e atores de teste para verificação estrita de autorização Fail-Closed
const testCompanyId = 'auth-test-company-1';

const driverActor: AuthenticatedPrincipal = {
  companyId: testCompanyId,
  userId: 'usr-driver-1',
  name: 'Driver Test User',
  role: 'DRIVER',
  permissions: [],
};

const readonlyActor: AuthenticatedPrincipal = {
  companyId: testCompanyId,
  userId: 'usr-readonly-1',
  name: 'Readonly Test User',
  role: 'READONLY',
  permissions: [],
};

const operationalActor: AuthenticatedPrincipal = {
  companyId: testCompanyId,
  userId: 'usr-operational-1',
  name: 'Operational Test User',
  role: 'OPERATIONAL',
  permissions: [],
};

const driverManagerActor: AuthenticatedPrincipal = {
  companyId: testCompanyId,
  userId: 'usr-driver-mgr-1',
  name: 'Driver Delegated User',
  role: 'DRIVER',
  permissions: ['EDIT_DRIVER'],
};

const financialManagerActor: AuthenticatedPrincipal = {
  companyId: testCompanyId,
  userId: 'usr-fin-mgr-1',
  name: 'Finance Manager User',
  role: 'FINANCIAL_MANAGER',
  permissions: [],
};

const adminActor: AuthenticatedPrincipal = {
  companyId: testCompanyId,
  userId: 'usr-admin-1',
  name: 'Admin Test User',
  role: 'ADMIN',
  permissions: ['*'],
};

async function run(): Promise<void> {
  const app = express();
  app.use(express.json());

  // Injeção de ator controlada via header x-test-actor
  app.use((req, _res, next) => {
    const actorKey = req.header('x-test-actor');
    if (actorKey === 'driver') (req as any).principal = driverActor;
    else if (actorKey === 'readonly') (req as any).principal = readonlyActor;
    else if (actorKey === 'operational') (req as any).principal = operationalActor;
    else if (actorKey === 'driver-manager') (req as any).principal = driverManagerActor;
    else if (actorKey === 'financial-manager') (req as any).principal = financialManagerActor;
    else if (actorKey === 'admin') (req as any).principal = adminActor;
    // se não informado, principal = undefined (simula sem sessão)
    next();
  });

  registerDriverFormTokenRoutes(app);
  registerBankReconciliationRoutes(app);
  registerFinanceMasterDataRoutes(app);
  registerFinanceOverdueRoutes(app);

  const server = createServer(app);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Test server address unavailable');
  const base = `http://127.0.0.1:${address.port}`;

  // Helper para suprimir logs de erro esperados ao avançar além da guarda (queda no DB não semeado)
  const origError = console.error;
  const silent = async <T>(fn: () => Promise<T>): Promise<T> => {
    console.error = () => {};
    try {
      return await fn();
    } finally {
      console.error = origError;
    }
  };

  try {
    console.log('[PH-084] Iniciando bateria de testes de autorização fail-closed...');

    // =========================================================================
    // 1. POST /api/drivers/:id/form-token (driverFormTokenRoutes)
    // =========================================================================
    // 1.1 Sem autenticação -> 401
    let res = await fetch(`${base}/api/drivers/drv-123/form-token`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({}),
    });
    assert.equal(res.status, 401, 'form-token sem autenticação deve retornar 401');

    // 1.2 Como DRIVER -> 403 Forbidden
    res = await fetch(`${base}/api/drivers/drv-123/form-token`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-test-actor': 'driver' },
      body: JSON.stringify({}),
    });
    assert.equal(res.status, 403, 'form-token como DRIVER deve ser barrado com 403 Forbidden');

    // 1.3 Como READONLY -> 403 Forbidden
    res = await fetch(`${base}/api/drivers/drv-123/form-token`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-test-actor': 'readonly' },
      body: JSON.stringify({}),
    });
    assert.equal(res.status, 403, 'form-token como READONLY deve ser barrado com 403 Forbidden');

    // 1.4 Com permissão explícita EDIT_DRIVER -> guarda libera (não deve dar 401 nem 403)
    res = await silent(() =>
      fetch(`${base}/api/drivers/drv-123/form-token`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-test-actor': 'driver-manager' },
        body: JSON.stringify({}),
      })
    );
    assert.notEqual(res.status, 401, 'form-token com EDIT_DRIVER não deve retornar 401');
    assert.notEqual(res.status, 403, 'form-token com EDIT_DRIVER não deve retornar 403');

    // =========================================================================
    // 2. Conciliação Bancária (bankReconciliationRoutes)
    // =========================================================================
    const reconEndpoints = [
      { method: 'POST', path: '/api/finance/bank-reconciliation/import', body: { financialAccountId: 'acc-1', entries: [] } },
      { method: 'POST', path: '/api/finance/bank-reconciliation/entries/entry-1/match', body: { transactionId: 'tx-1' } },
      { method: 'POST', path: '/api/finance/bank-reconciliation/entries/entry-1/unmatch', body: { reason: 'test' } },
      { method: 'POST', path: '/api/finance/bank-reconciliation/entries/entry-1/ignore', body: { reason: 'test' } },
    ];

    for (const ep of reconEndpoints) {
      // 2.1 Sem sessão -> 401
      res = await fetch(`${base}${ep.path}`, {
        method: ep.method,
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(ep.body),
      });
      assert.equal(res.status, 401, `${ep.method} ${ep.path} sem sessão deve ser 401`);

      // 2.2 Como DRIVER -> 403 Forbidden
      res = await fetch(`${base}${ep.path}`, {
        method: ep.method,
        headers: { 'content-type': 'application/json', 'x-test-actor': 'driver' },
        body: JSON.stringify(ep.body),
      });
      assert.equal(res.status, 403, `${ep.method} ${ep.path} como DRIVER deve retornar 403`);

      // 2.3 Como OPERATIONAL (sem permissão de banco) -> 403 Forbidden
      res = await fetch(`${base}${ep.path}`, {
        method: ep.method,
        headers: { 'content-type': 'application/json', 'x-test-actor': 'operational' },
        body: JSON.stringify(ep.body),
      });
      assert.equal(res.status, 403, `${ep.method} ${ep.path} como OPERATIONAL deve retornar 403`);

      // 2.4 Como FINANCIAL_MANAGER -> guarda libera (não 403 nem 401)
      res = await silent(() =>
        fetch(`${base}${ep.path}`, {
          method: ep.method,
          headers: { 'content-type': 'application/json', 'x-test-actor': 'financial-manager' },
          body: JSON.stringify(ep.body),
        })
      );
      assert.notEqual(res.status, 401, `${ep.method} ${ep.path} como FINANCIAL_MANAGER não deve retornar 401`);
      assert.notEqual(res.status, 403, `${ep.method} ${ep.path} como FINANCIAL_MANAGER não deve retornar 403`);

      // 2.5 Como ADMIN -> guarda libera (não 403 nem 401)
      res = await silent(() =>
        fetch(`${base}${ep.path}`, {
          method: ep.method,
          headers: { 'content-type': 'application/json', 'x-test-actor': 'admin' },
          body: JSON.stringify(ep.body),
        })
      );
      assert.notEqual(res.status, 401, `${ep.method} ${ep.path} como ADMIN não deve retornar 401`);
      assert.notEqual(res.status, 403, `${ep.method} ${ep.path} como ADMIN não deve retornar 403`);
    }

    // =========================================================================
    // 3. Dados Mestres Financeiros (financeMasterDataRoutes)
    // =========================================================================
    const masterDataEndpoints = [
      { method: 'POST', path: '/api/finance/master-data/accounts', body: { name: 'Conta', type: 'BANK' } },
      { method: 'PATCH', path: '/api/finance/master-data/accounts/acc-1', body: { name: 'Conta 2' } },
      { method: 'POST', path: '/api/finance/master-data/payment-methods', body: { name: 'PIX', type: 'PIX' } },
      { method: 'PATCH', path: '/api/finance/master-data/payment-methods/pm-1', body: { name: 'PIX 2' } },
      { method: 'POST', path: '/api/finance/master-data/categories', body: { name: 'Cat', type: 'EXPENSE' } },
      { method: 'PATCH', path: '/api/finance/master-data/categories/cat-1', body: { name: 'Cat 2' } },
    ];

    for (const ep of masterDataEndpoints) {
      // 3.1 Sem sessão -> 401
      res = await fetch(`${base}${ep.path}`, {
        method: ep.method,
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(ep.body),
      });
      assert.equal(res.status, 401, `${ep.method} ${ep.path} sem sessão deve ser 401`);

      // 3.2 Como DRIVER -> 403 Forbidden
      res = await fetch(`${base}${ep.path}`, {
        method: ep.method,
        headers: { 'content-type': 'application/json', 'x-test-actor': 'driver' },
        body: JSON.stringify(ep.body),
      });
      assert.equal(res.status, 403, `${ep.method} ${ep.path} como DRIVER deve retornar 403`);

      // 3.3 Como OPERATIONAL -> 403 Forbidden
      res = await fetch(`${base}${ep.path}`, {
        method: ep.method,
        headers: { 'content-type': 'application/json', 'x-test-actor': 'operational' },
        body: JSON.stringify(ep.body),
      });
      assert.equal(res.status, 403, `${ep.method} ${ep.path} como OPERATIONAL deve retornar 403`);

      // 3.4 Como ADMIN -> guarda libera (não 403 nem 401)
      res = await silent(() =>
        fetch(`${base}${ep.path}`, {
          method: ep.method,
          headers: { 'content-type': 'application/json', 'x-test-actor': 'admin' },
          body: JSON.stringify(ep.body),
        })
      );
      assert.notEqual(res.status, 401, `${ep.method} ${ep.path} como ADMIN não deve retornar 401`);
      assert.notEqual(res.status, 403, `${ep.method} ${ep.path} como ADMIN não deve retornar 403`);
    }

    // =========================================================================
    // 4. Regras de Cobrança e Atraso (financeOverdueRoutes)
    // =========================================================================
    const overdueEndpoints = [
      { method: 'PUT', path: '/api/finance/late-charge-rules/RECEIVABLE', body: { gracePeriodDays: 2, finePercent: 2, dailyInterestPercent: 0.033, active: true } },
      { method: 'POST', path: '/api/finance/overdue/process', body: { type: 'RECEIVABLE', processingDate: '2026-01-01' } },
    ];

    for (const ep of overdueEndpoints) {
      // 4.1 Sem sessão -> 401
      res = await fetch(`${base}${ep.path}`, {
        method: ep.method,
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(ep.body),
      });
      assert.equal(res.status, 401, `${ep.method} ${ep.path} sem sessão deve ser 401`);

      // 4.2 Como DRIVER -> 403 Forbidden
      res = await fetch(`${base}${ep.path}`, {
        method: ep.method,
        headers: { 'content-type': 'application/json', 'x-test-actor': 'driver' },
        body: JSON.stringify(ep.body),
      });
      assert.equal(res.status, 403, `${ep.method} ${ep.path} como DRIVER deve retornar 403`);

      // 4.3 Como OPERATIONAL -> 403 Forbidden
      res = await fetch(`${base}${ep.path}`, {
        method: ep.method,
        headers: { 'content-type': 'application/json', 'x-test-actor': 'operational' },
        body: JSON.stringify(ep.body),
      });
      assert.equal(res.status, 403, `${ep.method} ${ep.path} como OPERATIONAL deve retornar 403`);

      // 4.4 Como ADMIN -> guarda libera (não 403 nem 401)
      res = await silent(() =>
        fetch(`${base}${ep.path}`, {
          method: ep.method,
          headers: { 'content-type': 'application/json', 'x-test-actor': 'admin' },
          body: JSON.stringify(ep.body),
        })
      );
      assert.notEqual(res.status, 401, `${ep.method} ${ep.path} como ADMIN não deve retornar 401`);
      assert.notEqual(res.status, 403, `${ep.method} ${ep.path} como ADMIN não deve retornar 403`);
    }

    console.log('[PH-084] Todos os cenários de autorização Fail-Closed PASSARAM com 100% de sucesso.');
  } finally {
    await new Promise<void>((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));
  }
}

run().catch((error) => {
  console.error('[PH-084] Falha na regressão de autorização:', error);
  process.exit(1);
});
