import {
  AttachmentStorageUnavailableError,
  AttachmentStorageValidationError,
} from '../attachmentStorage';
import { runAttachmentStorageDurabilityProbe } from '../attachmentStorageDurabilityProbe';
import { R2AttachmentStorage, createAttachmentStorageFromEnvironment } from '../r2AttachmentStorage';

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

class InMemorySignedFetch {
  readonly calls: Array<{ method: string; url: string }> = [];
  private readonly objects = new Map<string, Buffer>();

  async fetch(input: RequestInfo | URL, init: RequestInit = {}): Promise<Response> {
    const url = input instanceof URL
      ? input.toString()
      : typeof input === 'string'
        ? input
        : input.url;
    const method = String(init.method || 'GET').toUpperCase();
    this.calls.push({ method, url });

    if (method === 'PUT') {
      const body = init.body;
      if (!body) return new Response(null, { status: 400 });
      const bytes = Buffer.isBuffer(body)
        ? Buffer.from(body)
        : body instanceof ArrayBuffer
          ? Buffer.from(body)
          : ArrayBuffer.isView(body)
            ? Buffer.from(body.buffer, body.byteOffset, body.byteLength)
            : Buffer.from(await new Response(body).arrayBuffer());
      this.objects.set(url, bytes);
      return new Response(null, { status: 200 });
    }
    if (method === 'GET') {
      const bytes = this.objects.get(url);
      if (!bytes) return new Response(null, { status: 404 });
      return new Response(new Uint8Array(bytes), {
        status: 200,
        headers: { 'content-length': String(bytes.length) },
      });
    }
    if (method === 'HEAD') {
      const bytes = this.objects.get(url);
      return new Response(null, {
        status: bytes ? 200 : 404,
        headers: bytes ? { 'content-length': String(bytes.length) } : undefined,
      });
    }
    if (method === 'DELETE') {
      this.objects.delete(url);
      return new Response(null, { status: 204 });
    }
    return new Response(null, { status: 405 });
  }
}

const syntheticEnvironment = {
  ATTACHMENT_STORAGE_PROVIDER: 'R2',
  R2_ACCOUNT_ID: 'synthetic_account_1234567890',
  R2_ACCESS_KEY_ID: 'synthetic_access_key',
  R2_SECRET_ACCESS_KEY: 'synthetic_secret_key',
  R2_BUCKET: 'autoerp-staging-synthetic',
};

async function rejectsWith<T extends Error>(run: () => Promise<unknown>, expected: new (...args: any[]) => T): Promise<void> {
  try {
    await run();
  } catch (error) {
    assert(error instanceof expected, `Expected ${expected.name}`);
    return;
  }
  throw new Error(`Expected ${expected.name}`);
}

export class R2AttachmentStorageTestRunner {
  static async runAllTests(): Promise<void> {
    const fake = new InMemorySignedFetch();
    const storage = new R2AttachmentStorage(syntheticEnvironment, fake);
    const status = storage.getConfiguration();

    assert(status.provider === 'R2', 'R2 provider status missing');
    assert(status.configured && status.durable && !status.ephemeralPath, 'configured R2 must report durable object storage');
    const serializedStatus = JSON.stringify(status);
    assert(!serializedStatus.includes(syntheticEnvironment.R2_ACCESS_KEY_ID), 'status leaked access key');
    assert(!serializedStatus.includes(syntheticEnvironment.R2_SECRET_ACCESS_KEY), 'status leaked secret key');
    assert(!serializedStatus.includes(syntheticEnvironment.R2_ACCOUNT_ID), 'status leaked account id');

    const firstProbe = await runAttachmentStorageDurabilityProbe(storage);
    assert(firstProbe.configured && firstProbe.durable, 'durability probe rejected configured durable storage');
    assert(!firstProbe.previousObjectFound, 'first durability probe unexpectedly found prior bytes');
    assert(firstProbe.writeVerified, 'durability probe failed round-trip verification');
    assert(firstProbe.tenantIsolationVerified, 'durability probe failed tenant isolation verification');

    const secondProbe = await runAttachmentStorageDurabilityProbe(storage);
    assert(secondProbe.previousObjectFound, 'second durability probe did not find persisted bytes');
    assert(secondProbe.previousHashMatched, 'persisted durability probe bytes changed');
    assert(secondProbe.writeVerified, 'second durability probe round-trip failed');

    const content = Buffer.from('%PDF-1.7\nSYNTHETIC-R2-ONLY\n%%EOF', 'utf8');
    const stored = await storage.write('tenant_synthetic', 'attachment_001', content);
    assert(stored.storageKey === 'tenant_synthetic/attachment_001', 'unexpected tenant storage key');
    assert(stored.fileSize === content.length && stored.checksum.length === 64, 'write evidence is incomplete');
    assert(await storage.exists('tenant_synthetic', stored.storageKey), 'written object not found');
    assert((await storage.read('tenant_synthetic', stored.storageKey)).equals(content), 'R2 round trip changed bytes');

    await rejectsWith(
      () => storage.read('another_tenant', stored.storageKey),
      AttachmentStorageValidationError,
    );

    await storage.remove('tenant_synthetic', stored.storageKey);
    assert(!(await storage.exists('tenant_synthetic', stored.storageKey)), 'deleted object still exists');
    assert(fake.calls.every((call) => !call.url.includes(syntheticEnvironment.R2_ACCESS_KEY_ID)), 'object request leaked access key');
    assert(fake.calls.every((call) => call.url.includes('/autoerp-staging-synthetic/')), 'object URL escaped configured bucket');

    const incomplete = new R2AttachmentStorage({ ATTACHMENT_STORAGE_PROVIDER: 'R2' }, fake);
    assert(!incomplete.getConfiguration().configured, 'incomplete R2 configuration was accepted');
    const callsBefore = fake.calls.length;
    await rejectsWith(
      () => incomplete.write('tenant_synthetic', 'attachment_002', content),
      AttachmentStorageUnavailableError,
    );
    assert(fake.calls.length === callsBefore, 'unconfigured R2 attempted an external call');

    assert(createAttachmentStorageFromEnvironment({}).provider === 'SERVER_FS', 'default provider must remain SERVER_FS');
    assert(createAttachmentStorageFromEnvironment(syntheticEnvironment).provider === 'R2', 'explicit R2 selection failed');
  }
}

if (process.argv[1]?.includes('r2AttachmentStorageTestRunner')) {
  R2AttachmentStorageTestRunner.runAllTests()
    .then(() => console.log('R2 attachment storage synthetic tests PASS'))
    .catch((error) => {
      console.error(error);
      process.exitCode = 1;
    });
}
