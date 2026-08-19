import { DocumentApiError, DocumentClient } from '../documentClient';
import { DocumentStatus } from '../../types/enums';

const documentItem = {
  id: 'doc-1',
  companyId: 'company-a',
  subjectType: 'VEHICLE',
  subjectId: 'vehicle-1',
  documentType: 'CRLV',
  documentNumber: 'CRLV-2026',
  referenceYear: 2026,
  issueDate: '2026-01-01',
  expirationDate: '2026-12-31',
  attachmentId: 'att-1',
  versionNumber: 1,
  isCurrent: true,
  isArchived: false,
  cost: 100,
  createdBy: 'user-a',
  createdAt: '2026-08-19T00:00:00.000Z',
  updatedAt: '2026-08-19T00:00:00.000Z',
  complianceStatus: 'VALID',
  daysToExpiration: 134,
  alertStage: 'NONE',
};

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

export class DocumentClientTestRunner {
  static async runAllTests(): Promise<void> {
    const originalFetch = globalThis.fetch;
    try {
      let lastUrl = '';
      let lastInit: RequestInit | undefined;
      globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
        lastUrl = String(input);
        lastInit = init;
        return new Response(JSON.stringify({ items: [documentItem] }), { status: 200 });
      }) as typeof fetch;

      const listed = await DocumentClient.list({
        subjectType: 'VEHICLE', subjectId: 'vehicle 1', documentType: 'CRLV',
        status: DocumentStatus.VALID, referenceYear: 2026, currentOnly: true,
      });
      assert(listed.length === 1, 'LIST payload');
      assert(lastUrl.includes('subjectType=VEHICLE') && lastUrl.includes('subjectId=vehicle+1'), 'LIST filters');
      assert(lastInit?.credentials === 'include', 'LIST credentials');

      globalThis.fetch = (async (_input: RequestInfo | URL, init?: RequestInit) => {
        lastInit = init;
        return new Response(JSON.stringify({ item: documentItem }), { status: 201 });
      }) as typeof fetch;
      await DocumentClient.create({
        subjectType: 'VEHICLE', subjectId: 'vehicle-1', documentType: 'CRLV', referenceYear: 2026,
        attachmentId: 'att-1', expirationDate: '2026-12-31', cost: 100, generatePayable: true,
      });
      assert(lastInit?.method === 'POST' && lastInit.credentials === 'include', 'CREATE transport');
      const createBody = JSON.parse(String(lastInit?.body || '{}'));
      for (const forbidden of ['companyId','userId','userName','role','versionNumber','supersedesDocumentId','isCurrent','isArchived','payableId','complianceStatus','daysToExpiration','alertStage']) {
        assert(!(forbidden in createBody), `CREATE leaked authoritative field ${forbidden}`);
      }

      globalThis.fetch = (async () => new Response(JSON.stringify({ items: [documentItem] }), { status: 200 })) as typeof fetch;
      assert((await DocumentClient.versions('doc 1')).length === 1, 'VERSIONS payload');
      assert((await DocumentClient.alerts()).length === 1, 'ALERTS payload');

      globalThis.fetch = (async () => new Response(JSON.stringify({ error: 'Forbidden' }), { status: 403 })) as typeof fetch;
      let error: unknown;
      try { await DocumentClient.archive('doc-1'); } catch (caught) { error = caught; }
      assert(error instanceof DocumentApiError && error.status === 403, '403 fail closed');

      globalThis.fetch = (async () => new Response(JSON.stringify({ item: { ...documentItem, versionNumber: '1' } }), { status: 200 })) as typeof fetch;
      let malformedFailed = false;
      try { await DocumentClient.get('doc-1'); } catch { malformedFailed = true; }
      assert(malformedFailed, 'Malformed response must fail closed');
    } finally {
      globalThis.fetch = originalFetch;
    }
  }
}

if (process.argv[1]?.includes('documentClientTestRunner')) {
  DocumentClientTestRunner.runAllTests()
    .then(() => console.log('DocumentClient PASS'))
    .catch((error) => {
      console.error(error);
      process.exitCode = 1;
    });
}
