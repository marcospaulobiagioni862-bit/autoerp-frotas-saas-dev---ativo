import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import express from 'express';
import { requestCorrelationMiddleware } from '../requestCorrelation';
import { runIdempotentMutation } from '../../api/idempotentMutation';

async function clientGuardRegression(): Promise<void> {
  let calls = 0;
  const tokens: string[] = [];
  const execute = async (token: string) => {
    calls += 1;
    tokens.push(token);
    await new Promise((resolve) => setTimeout(resolve, 10));
    return { ok: true, calls };
  };

  const [first, second] = await Promise.all([
    runIdempotentMutation('contract:create:test-intent', execute),
    runIdempotentMutation('contract:create:test-intent', execute),
  ]);
  assert.equal(calls, 1, 'double-submit must execute one client mutation');
  assert.deepEqual(first, second);

  const replay = await runIdempotentMutation('contract:create:test-intent', execute);
  assert.equal(calls, 1, 'completed intent must be reused inside idempotency window');
  assert.deepEqual(replay, first);
  assert.equal(tokens.length, 1);

  let retryCalls = 0;
  const retryTokens: string[] = [];
  const retry = async (token: string) => {
    retryCalls += 1;
    retryTokens.push(token);
    if (retryCalls === 1) throw new Error('synthetic network failure');
    return 'ok';
  };
  await assert.rejects(runIdempotentMutation('contract:create:retry-intent', retry));
  assert.equal(await runIdempotentMutation('contract:create:retry-intent', retry), 'ok');
  assert.equal(retryCalls, 2);
  assert.equal(retryTokens[0], retryTokens[1], 'retry must reuse the same idempotency token');
}

async function serverReplayRegression(): Promise<void> {
  const app = express();
  app.use(requestCorrelationMiddleware);
  app.use(express.json());
  let contractCreates = 0;
  let signStatusCalls = 0;

  app.post('/api/contracts', async (_req, res) => {
    contractCreates += 1;
    await new Promise((resolve) => setTimeout(resolve, 30));
    res.status(201).json({ item: { id: `contract-${contractCreates}` } });
  });
  app.post('/api/contracts/:id/sign-status', (_req, res) => {
    signStatusCalls += 1;
    res.json({ signed: true, sequence: signStatusCalls });
  });

  const server = createServer(app);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  try {
    const address = server.address();
    assert(address && typeof address === 'object');
    const base = `http://127.0.0.1:${address.port}`;
    const headers = { 'content-type': 'application/json', 'x-idempotency-key': 'idem-contract-create-0001' };

    const [a, b] = await Promise.all([
      fetch(`${base}/api/contracts`, { method: 'POST', headers, body: '{}' }),
      fetch(`${base}/api/contracts`, { method: 'POST', headers, body: '{}' }),
    ]);
    assert.equal(a.status, 201);
    assert.equal(b.status, 201);
    assert.deepEqual(await a.json(), await b.json());
    assert.equal(contractCreates, 1, 'concurrent same-key requests must execute once');

    const replay = await fetch(`${base}/api/contracts`, { method: 'POST', headers, body: '{}' });
    assert.equal(replay.status, 201);
    assert.equal(contractCreates, 1, 'same-key retry must replay without another mutation');

    const another = await fetch(`${base}/api/contracts`, {
      method: 'POST',
      headers: { ...headers, 'x-idempotency-key': 'idem-contract-create-0002' },
      body: '{}',
    });
    assert.equal(another.status, 201);
    assert.equal(contractCreates, 2, 'different intention must still create independently');

    const signHeaders = { 'content-type': 'application/json', 'x-idempotency-key': 'idem-sign-status-000001' };
    await fetch(`${base}/api/contracts/contract-1/sign-status`, { method: 'POST', headers: signHeaders, body: '{"signed":true}' });
    await fetch(`${base}/api/contracts/contract-1/sign-status`, { method: 'POST', headers: signHeaders, body: '{"signed":true}' });
    assert.equal(signStatusCalls, 2, '#1070 sign-status route must remain outside #1066 replay middleware');
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
}

await clientGuardRegression();
await serverReplayRegression();
console.log('contract idempotency regression: ok');
