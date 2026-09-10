import { AttachmentApiError, AttachmentClient } from '../attachmentClient';

const attachment = {
  id: 'att-1',
  companyId: 'company-a',
  entityName: 'Vehicle',
  entityType: 'Vehicle',
  entityId: 'vehicle-1',
  documentType: 'CRLV',
  fileName: 'crlv.pdf',
  fileSize: 4,
  mimeType: 'application/pdf',
  uploadedBy: 'Admin',
  storageProvider: 'SERVER_FS',
  storageKey: 'company-a/att-1',
  checksum: 'abcd',
  createdBy: 'user-a',
  isArchived: false,
  contentState: 'AVAILABLE',
  createdAt: '2026-08-19T00:00:00.000Z',
};

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

export class AttachmentClientTestRunner {
  static async runAllTests(): Promise<void> {
    const originalFetch = globalThis.fetch;
    const tests: Array<() => Promise<void>> = [];

    tests.push(async () => {
      let credentials = '';
      let url = '';
      globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
        url = String(input);
        credentials = String(init?.credentials);
        return new Response(JSON.stringify({ items: [attachment, { ...attachment, id: 'att-r2', storageProvider: 'R2' }] }), { status: 200 });
      }) as typeof fetch;
      const items = await AttachmentClient.list({ entityType: 'Vehicle', entityId: 'vehicle 1' });
      assert(items.length === 2, 'LIST payload');
      assert(items[1].storageProvider === 'R2', 'LIST accepts durable R2 provider');
      assert(credentials === 'include', 'LIST credentials');
      assert(url.includes('entityType=Vehicle') && url.includes('entityId=vehicle+1'), 'LIST filters');
    });

    tests.push(async () => {
      let credentials = '';
      let url = '';
      globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
        url = String(input);
        credentials = String(init?.credentials);
        return new Response(JSON.stringify({ items: [attachment] }), { status: 200 });
      }) as typeof fetch;
      const items = await AttachmentClient.listEntityGallery('Vehicle', 'vehicle 1');
      assert(items.length === 1, 'GALLERY payload');
      assert(credentials === 'include', 'GALLERY credentials');
      assert(url.includes('/api/attachments/gallery?') && url.includes('entityType=Vehicle') && url.includes('entityId=vehicle+1'), 'GALLERY filters');
    });

    tests.push(async () => {
      let credentials = '';
      globalThis.fetch = (async (_input: RequestInfo | URL, init?: RequestInit) => {
        credentials = String(init?.credentials);
        return new Response(JSON.stringify({ item: attachment }), { status: 200 });
      }) as typeof fetch;
      await AttachmentClient.get('att 1');
      assert(credentials === 'include', 'GET credentials');
    });

    tests.push(async () => {
      let method = '';
      let headers = new Headers();
      let body: BodyInit | null | undefined;
      globalThis.fetch = (async (_input: RequestInfo | URL, init?: RequestInit) => {
        method = String(init?.method);
        headers = new Headers(init?.headers);
        body = init?.body;
        return new Response(JSON.stringify({ item: attachment }), { status: 201 });
      }) as typeof fetch;
      const blob = new Blob([new Uint8Array([1, 2, 3, 4])], { type: 'application/pdf' });
      await AttachmentClient.upload({
        entityType: 'Vehicle', entityId: 'vehicle-1', documentType: 'CRLV',
        fileName: 'CRLV 2026.pdf', mimeType: 'application/pdf', content: blob,
      });
      assert(method === 'POST', 'UPLOAD method');
      assert(headers.get('x-autoerp-entity-type') === 'Vehicle', 'UPLOAD entity header');
      assert(decodeURIComponent(headers.get('x-autoerp-file-name') || '') === 'CRLV 2026.pdf', 'UPLOAD filename');
      for (const forbidden of ['companyId','userId','userName','role','storageKey','checksum','fileSize','storageProvider','createdBy']) {
        assert(!Array.from(headers.keys()).some((key) => key.toLowerCase().includes(forbidden.toLowerCase())), `UPLOAD authority leaked ${forbidden}`);
      }
      assert(body instanceof Blob, 'UPLOAD must send binary Blob');
    });

    tests.push(async () => {
      let credentials = '';
      globalThis.fetch = (async (_input: RequestInfo | URL, init?: RequestInit) => {
        credentials = String(init?.credentials);
        return new Response(new Blob([new Uint8Array([1, 2])], { type: 'image/png' }), {
          status: 200,
          headers: { 'content-type': 'image/png' },
        });
      }) as typeof fetch;
      const blob = await AttachmentClient.content('att-1');
      assert(credentials === 'include' && blob.type === 'image/png', 'CONTENT transport');
    });

    tests.push(async () => {
      for (const action of ['archive', 'restore'] as const) {
        let url = '';
        let method = '';
        globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
          url = String(input);
          method = String(init?.method);
          return new Response(JSON.stringify({ item: { ...attachment, isArchived: action === 'archive' } }), { status: 200 });
        }) as typeof fetch;
        if (action === 'archive') await AttachmentClient.archive('att-1');
        else await AttachmentClient.restore('att-1');
        assert(url.endsWith(`/${action}`) && method === 'POST', `${action} transport`);
      }
    });

    tests.push(async () => {
      let url = '';
      let method = '';
      globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
        url = String(input);
        method = String(init?.method);
        return new Response(JSON.stringify({ deleted: true, storageRemoved: true }), { status: 200 });
      }) as typeof fetch;
      const result = await AttachmentClient.deletePermanently('att 1');
      assert(url.endsWith('/api/attachments/att%201') && method === 'DELETE', 'DELETE permanent transport');
      assert(result.deleted === true && result.storageRemoved === true, 'DELETE permanent payload');
    });

    tests.push(async () => {
      globalThis.fetch = (async () => new Response(JSON.stringify({ error: 'Not found' }), { status: 404 })) as typeof fetch;
      const expectations: Array<{ run: () => Promise<unknown>; operation: string }> = [
        { run: () => AttachmentClient.list({ entityType: 'MaintenanceWorkOrder', entityId: 'wo-1' }), operation: 'Falha ao listar anexos' },
        { run: () => AttachmentClient.listEntityGallery('Vehicle', 'vehicle-1'), operation: 'Falha ao carregar arquivos relacionados' },
        { run: () => AttachmentClient.content('att-1'), operation: 'Falha ao visualizar/baixar anexo' },
        { run: () => AttachmentClient.archive('att-1'), operation: 'Falha ao arquivar anexo' },
        { run: () => AttachmentClient.deletePermanently('att-1'), operation: 'Falha ao excluir anexo definitivamente' },
      ];
      for (const expectation of expectations) {
        let error: unknown;
        try { await expectation.run(); } catch (caught) { error = caught; }
        assert(error instanceof AttachmentApiError && error.status === 404, `${expectation.operation} preserves status`);
        assert(error.message === `${expectation.operation}: Not found`, `${expectation.operation} identifies action`);
      }
    });

    tests.push(async () => {
      globalThis.fetch = (async () => new Response(JSON.stringify({ error: 'Forbidden' }), { status: 403 })) as typeof fetch;
      let error: unknown;
      try { await AttachmentClient.archive('att-1'); } catch (caught) { error = caught; }
      assert(error instanceof AttachmentApiError && error.status === 403, '403 fail closed');
      assert(error instanceof Error && error.message === 'Falha ao arquivar anexo: Forbidden', '403 keeps operation context');
    });

    tests.push(async () => {
      globalThis.fetch = (async () => new Response(JSON.stringify({ item: { ...attachment, fileSize: '4' } }), { status: 200 })) as typeof fetch;
      let failed = false;
      try { await AttachmentClient.get('att-1'); } catch { failed = true; }
      assert(failed, 'malformed metadata must fail closed');
    });

    try {
      for (const test of tests) await test();
    } finally {
      globalThis.fetch = originalFetch;
    }
  }
}

if (process.argv[1]?.includes('attachmentClientTestRunner')) {
  AttachmentClientTestRunner.runAllTests()
    .then(() => console.log('AttachmentClient PASS'))
    .catch((error) => {
      console.error(error);
      process.exitCode = 1;
    });
}
