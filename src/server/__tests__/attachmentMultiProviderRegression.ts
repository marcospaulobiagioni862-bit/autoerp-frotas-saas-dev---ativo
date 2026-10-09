import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import express, { type Request, type Response, type NextFunction } from 'express';
import { createServer } from 'node:http';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import {
  ServerAttachmentStorage,
  MultiProviderAttachmentStorage,
  AttachmentStorageProviderUnconfiguredError,
  AttachmentStorageLegacyContentError,
  AttachmentStorageNotFoundError,
  type AttachmentByteStorage,
} from '../attachmentStorage';
import { R2AttachmentStorage } from '../r2AttachmentStorage';

class FakeSignedFetch {
  readonly objects = new Map<string, Buffer>();
  async fetch(input: RequestInfo | URL, init: RequestInit = {}): Promise<globalThis.Response> {
    const url = input instanceof URL ? input.toString() : typeof input === 'string' ? input : input.url;
    const method = String(init.method || 'GET').toUpperCase();
    if (method === 'PUT') {
      const bytes = Buffer.from(init.body as any);
      this.objects.set(url, bytes);
      return new globalThis.Response(null, { status: 200 });
    }
    if (method === 'GET') {
      const bytes = this.objects.get(url);
      if (!bytes) return new globalThis.Response(null, { status: 404 });
      return new globalThis.Response(new Uint8Array(bytes), {
        status: 200,
        headers: { 'content-length': String(bytes.length) },
      });
    }
    if (method === 'HEAD') {
      const bytes = this.objects.get(url);
      return new globalThis.Response(null, { status: bytes ? 200 : 404 });
    }
    if (method === 'DELETE') {
      this.objects.delete(url);
      return new globalThis.Response(null, { status: 204 });
    }
    return new globalThis.Response(null, { status: 405 });
  }
}

async function runRegression(): Promise<void> {
  const tempDir = await mkdtemp(path.join(tmpdir(), 'autoerp-multiprov-'));
  const originalDir = process.env.ATTACHMENT_STORAGE_DIR;
  process.env.ATTACHMENT_STORAGE_DIR = tempDir;

  try {
    const fsDriver = new ServerAttachmentStorage();
    const fakeFetch = new FakeSignedFetch();
    const r2Configured = new R2AttachmentStorage({
      ATTACHMENT_STORAGE_PROVIDER: 'R2',
      R2_ACCOUNT_ID: 'acc123456789',
      R2_ACCESS_KEY_ID: 'key123',
      R2_SECRET_ACCESS_KEY: 'secret123',
      R2_BUCKET: 'bucket-test',
    }, fakeFetch);

    const r2Unconfigured = new R2AttachmentStorage({
      ATTACHMENT_STORAGE_PROVIDER: 'R2',
    }, fakeFetch);

    // 1. MultiProvider com FS primário e R2 configurado
    const multi = new MultiProviderAttachmentStorage(fsDriver);
    multi.registerDriver(fsDriver);
    multi.registerDriver(r2Configured);

    assert.equal(multi.provider, 'SERVER_FS');
    assert.equal(multi.isProviderConfigured('SERVER_FS'), true);
    assert.equal(multi.isProviderConfigured('R2'), true);

    const testBytesFs = Buffer.from('PDF_FS_PAYLOAD', 'utf8');
    const testBytesR2 = Buffer.from('PDF_R2_PAYLOAD', 'utf8');

    // Escrita vai no primário (FS)
    const storedFs = await multi.write('comp1', 'att_fs', testBytesFs);
    assert.equal(storedFs.storageKey, 'comp1/att_fs');

    // Escrita direta no R2 para simular arquivo salvo antes no R2
    const storedR2 = await r2Configured.write('comp1', 'att_r2', testBytesR2);
    assert.equal(storedR2.storageKey, 'comp1/att_r2');

    // 2. Leitura com preferredProvider gravado
    const readFsExplicit = await multi.read('comp1', storedFs.storageKey, 'SERVER_FS');
    assert.deepEqual(readFsExplicit, testBytesFs, 'Leitura FS explícita falhou');

    const readR2Explicit = await multi.read('comp1', storedR2.storageKey, 'R2');
    assert.deepEqual(readR2Explicit, testBytesR2, 'Leitura R2 explícita falhou');

    // 3. Leitura sem provider explícito (fallback inteligente)
    const readFsFallback = await multi.read('comp1', storedFs.storageKey);
    assert.deepEqual(readFsFallback, testBytesFs);

    const readR2Fallback = await multi.read('comp1', storedR2.storageKey);
    assert.deepEqual(readR2Fallback, testBytesR2);

    // 4. Verificação de existência
    assert.equal(await multi.exists('comp1', storedFs.storageKey, 'SERVER_FS'), true);
    assert.equal(await multi.exists('comp1', storedR2.storageKey, 'R2'), true);
    assert.equal(await multi.exists('comp1', 'comp1/inexistente', 'SERVER_FS'), false);
    assert.equal(await multi.exists('comp1', 'comp1/inexistente', 'R2'), false);

    // 5. Teste com R2 desconfigurado
    const multiUnconfigured = new MultiProviderAttachmentStorage(fsDriver);
    multiUnconfigured.registerDriver(fsDriver);
    multiUnconfigured.registerDriver(r2Unconfigured);

    assert.equal(multiUnconfigured.isProviderConfigured('R2'), false);

    // Deve lançar AttachmentStorageProviderUnconfiguredError, jamais 404
    await assert.rejects(
      async () => await multiUnconfigured.read('comp1', storedR2.storageKey, 'R2'),
      (err: any) => {
        assert(err instanceof AttachmentStorageProviderUnconfiguredError);
        assert.equal(err.provider, 'R2');
        return true;
      },
      'Deveria lançar AttachmentStorageProviderUnconfiguredError para R2 desconfigurado'
    );

    // 6. Teste de registro legado (LEGACY_BROWSER)
    await assert.rejects(
      async () => await multi.read('comp1', 'comp1/legacy', 'LEGACY_BROWSER' as any),
      (err: any) => {
        assert(err instanceof AttachmentStorageLegacyContentError);
        return true;
      },
      'Deveria lançar AttachmentStorageLegacyContentError para LEGACY_BROWSER'
    );

    // 7. Remoção no driver correto
    await multi.remove('comp1', storedR2.storageKey, 'R2');
    assert.equal(await r2Configured.exists('comp1', storedR2.storageKey), false, 'Arquivo R2 deveria ter sido removido do driver R2');

    // 8. Teste de rotas Express e respostas de status honestas (503, 410, 404)
    const app = express();
    app.get('/test/attachments/:id/content', async (req, res) => {
      try {
        const id = req.params.id;
        if (id === 'r2-unconfigured') {
          await multiUnconfigured.read('comp1', 'comp1/r2-file', 'R2');
        } else if (id === 'legacy') {
          await multi.read('comp1', 'comp1/legacy', 'LEGACY_BROWSER' as any);
        } else if (id === 'missing') {
          await multi.read('comp1', 'comp1/nonexistent', 'SERVER_FS');
        }
        res.send('ok');
      } catch (error: any) {
        if (error instanceof AttachmentStorageProviderUnconfiguredError) {
          res.status(503).json({
            error: `Este arquivo está armazenado no provedor ${error.provider}, que não está configurado neste ambiente. O registro permanece íntegro no banco de dados.`,
            code: 'STORAGE_PROVIDER_UNCONFIGURED',
            provider: error.provider,
          });
          return;
        }
        if (error instanceof AttachmentStorageLegacyContentError) {
          res.status(410).json({
            error: 'Este anexo é um registro legado anterior à migração e não possui arquivo persistido no servidor.',
            code: 'LEGACY_BROWSER_ATTACHMENT',
          });
          return;
        }
        if (error instanceof AttachmentStorageNotFoundError) {
          res.status(404).json({ error: 'Not found' });
          return;
        }
        res.status(500).json({ error: 'Internal error' });
      }
    });

    const server = createServer(app);
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const port = (server.address() as any).port;

    try {
      // 8.1 R2 desconfigurado -> HTTP 503 com código STORAGE_PROVIDER_UNCONFIGURED (jamais 404!)
      const res503 = await fetch(`http://127.0.0.1:${port}/test/attachments/r2-unconfigured/content`);
      assert.equal(res503.status, 503, 'R2 desconfigurado deve retornar HTTP 503');
      const body503: any = await res503.json();
      assert.equal(body503.code, 'STORAGE_PROVIDER_UNCONFIGURED');
      assert.equal(body503.provider, 'R2');

      // 8.2 Anexo legado -> HTTP 410 com código LEGACY_BROWSER_ATTACHMENT
      const res410 = await fetch(`http://127.0.0.1:${port}/test/attachments/legacy/content`);
      assert.equal(res410.status, 410, 'Anexo legado deve retornar HTTP 410');
      const body410: any = await res410.json();
      assert.equal(body410.code, 'LEGACY_BROWSER_ATTACHMENT');

      // 8.3 Inexistente real -> HTTP 404
      const res404 = await fetch(`http://127.0.0.1:${port}/test/attachments/missing/content`);
      assert.equal(res404.status, 404, 'Arquivo ausente deve retornar HTTP 404');
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }

    console.log('✔ AUTOERP-07: Todos os cenários da regressão de armazenamento multiprovedor (incluindo rotas HTTP 503/410/404) PASSARAM com sucesso.');
  } finally {
    if (originalDir !== undefined) process.env.ATTACHMENT_STORAGE_DIR = originalDir;
    else delete process.env.ATTACHMENT_STORAGE_DIR;
    await rm(tempDir, { recursive: true, force: true }).catch(() => undefined);
  }
}

runRegression().catch((err) => {
  console.error(err);
  process.exit(1);
});
