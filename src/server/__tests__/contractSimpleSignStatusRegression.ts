import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

const panel = readFileSync('src/components/contracts/ContractExecutionPanel.tsx', 'utf8');
const routes = readFileSync('src/server/contractSimpleSignRoutes.ts', 'utf8');
const client = readFileSync('src/api/contractExecutionClient.ts', 'utf8');

assert(panel.includes("'ASSINADO'"), 'panel must expose simple signed state');
assert(panel.includes("'NÃO ASSINADO'"), 'panel must expose simple unsigned state');
assert(!panel.includes('Método de assinatura'), 'panel must not request a signature method');
assert(!panel.includes('SIGNED_CONTRACT'), 'panel must not require signed PDF upload');
assert(!panel.includes('GOV_BR'), 'panel must not expose GOV.BR');
assert(routes.includes("/api/contracts/:id/sign-status"), 'server must expose simple sign-status endpoint');
assert(routes.includes("signatureMethod: 'MANUAL_CONFIRMATION'"), 'manual confirmation must be explicit in audit artifact');
assert(routes.includes("event: 'MANUAL_SIGN_STATUS'"), 'manual confirmation must create a server-side audit event');
assert(client.includes('setManualSignStatus'), 'client must use the simple sign-status endpoint');

assert(panel.includes('ContractTemplateClient.get(contract.templateId)'), 'execution panel must load the persisted linked template');
assert(panel.includes('contractTemplateGenerationMode(template)'), 'execution panel must use server generation authority');
assert(panel.includes('ContractExecutionClient.generateDocx(contract.id)'), 'file-backed custom templates must generate DOCX');
assert(panel.includes('ContractExecutionClient.generatePdf(contract.id)'), 'markdown and approved masters must generate PDF');
assert(panel.includes('modelo já vinculado ao contrato'), 'panel must describe the canonical linked-model flow');
assert(!panel.includes('modelo padrão já vinculado'), 'panel must not imply only two standard models are allowed');
assert(!panel.includes('Nenhum modelo padrão vinculado'), 'panel must not imply only standard models are valid');

console.log('contract simple sign status regression: ok');

import { createRequire } from 'node:module';
import vm from 'node:vm';
import ts from 'typescript';

const require = createRequire(import.meta.url);

// Execute the real component and its event/effect callbacks with deterministic
// option requests. No copied form logic and no network/database credentials.
function loadModule(path: string, imports: Record<string, unknown>) {
  const exports = {};
  const code = ts.transpileModule(readFileSync(path, 'utf8'), {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.React, esModuleInterop: true },
  }).outputText;
  vm.runInNewContext(code, {
    exports, require: (name: string) => {
      if (name in imports) return imports[name];
      if (!name.startsWith('.')) return require(name);
      const target = resolve(dirname(path), name);
      const file = ['.ts', '.tsx'].map((extension) => target + extension).find(existsSync);
      if (!file) throw new Error(`Missing test dependency: ${target}`);
      return loadModule(file, imports);
    },
    console, Buffer, process, setTimeout, clearTimeout,
  }, { filename: path });
  return exports as any;
}

async function dateRegression() {
  let cursor = 0;
  const state: any[] = [];
  const effects: Array<() => void> = [];
  const dependencies: any[][] = [];
  let resolveOptions!: (value: any[]) => void;
  const options = new Promise<any[]>((resolve) => { resolveOptions = resolve; });
  const created: any[] = [];
  const react = {
    createElement: (type: any, props: any, ...children: any[]) => ({ type, props: { ...props, children } }),
    useState: (initial: any) => {
      const index = cursor++;
      if (!(index in state)) state[index] = initial;
      return [state[index], (value: any) => { state[index] = typeof value === 'function' ? value(state[index]) : value; }];
    },
    useEffect: (effect: () => void, deps: any[]) => {
      const index = cursor++;
      if (!dependencies[index] || deps.some((value, i) => value !== dependencies[index][i])) {
        dependencies[index] = deps;
        effects.push(effect);
      }
    },
  };
  const { ContractFormModal } = loadModule('src/components/contracts/ContractFormModal.tsx', {
    react,
    'lucide-react': {},
    '../ui': { Input: 'Input', Button: 'Button', ModalContainer: 'ModalContainer' },
    '../../api/contractClient': { ContractClient: { list: () => options, create: async (input: any) => { created.push(input); return { ...input, id: 'new-contract' }; } } },
    '../../api/vehicleClient': { VehicleClient: { list: () => options } },
    '../../api/driverClient': { DriverClient: { list: () => options } },
    '../../api/contractTemplateClient': { ContractTemplateClient: { list: () => options } },
    '../../api/attachmentClient': {},
    '../../api/contractExecutionClient': { ContractExecutionClient: { generatePdf: async () => ({ contract: { id: 'new-contract' } }) } },
    '../../types/enums': { DriverStatus: { ACTIVE: 'ACTIVE' }, VehicleStatus: { AVAILABLE: 'AVAILABLE' }, RecurringFrequency: { WEEKLY: 'WEEKLY', MONTHLY: 'MONTHLY' } },
    '../../hooks/useLocalFormDraft': { useLocalFormDraft: () => ({ clear() {}, close(onClose: () => void) { onClose(); }, notice: '', dirty: false }) },
    '../../domain/operations/fleetOperationalState': { isContractBlocking: () => false },
  });
  const props = { isOpen: true, companyId: 'test', onClose() {}, onSuccess() {} };
  const render = () => {
    cursor = 0;
    const tree = ContractFormModal(props);
    effects.splice(0).forEach((effect) => effect());
    return tree;
  };
  const nodes = (node: any): any[] => !node || typeof node !== 'object' ? [] :
    [node, ...(node.props?.children || []).flat(Infinity).flatMap(nodes)];
  const field = (tree: any, name: string) => nodes(tree).find((node) => node.props?.label === name).props.children[0];
  let tree = render();
  field(tree, 'Data inicial *').props.onChange({ target: { value: '2026-09-13' } });
  tree = render();
  assert.equal(field(tree, 'Data inicial *').props.value, '2026-09-13');
  resolveOptions([]);
  await new Promise((resolve) => setTimeout(resolve, 0));
  tree = render();
  assert.equal(field(tree, 'Data inicial *').props.value, '2026-09-13', 'option loading must not erase a date entered while requests are pending');
  for (const [label, value] of [['Veículo *', 'vehicle'], ['Motorista *', 'driver'], ['Aluguel *', '750'], ['Periodicidade *', 'WEEKLY']]) {
    field(tree, label).props.onChange({ target: { value } });
    tree = render();
  }
  field(tree, 'Dia semanal *').props.onChange({ target: { value: '7' } });
  tree = render();
  await nodes(tree).find((node) => node.type === 'form').props.onSubmit({ preventDefault() {} });
  assert.equal(created.length, 1);
  assert.equal(created[0].startDate, '2026-09-13', 'submit must preserve the date after other fields and rerenders');
}

await dateRegression();
console.log('contract cycle 1 date regression: PASS');

async function signatureMigrationRegression() {
  const { PGlite } = require('@electric-sql/pglite');
  const database = new PGlite();
  try {
    await database.exec(`CREATE TABLE contract_artifacts (
      id text PRIMARY KEY, artifact_type text NOT NULL, source_artifact_id text,
      signature_method text, signed_by_name text, signed_at timestamptz,
      is_current boolean NOT NULL DEFAULT true, is_archived boolean NOT NULL DEFAULT false,
      payload jsonb NOT NULL DEFAULT '{}'
    )`);
    await database.exec(readFileSync('drizzle/0068_contract_notary_signature_method.sql', 'utf8'));
    const evidenceSql = `INSERT INTO contract_artifacts
      (id, artifact_type, source_artifact_id, signature_method, signed_by_name, signed_at)
      VALUES ($1, 'SIGNED_EVIDENCE', $2, $3, $4, $5)`;
    await assert.rejects(database.query(evidenceSql, ['old', 'source', 'MANUAL_CONFIRMATION', 'Tester', '2026-09-13T12:00:00Z']));
    await database.exec(readFileSync('drizzle/0073_contract_manual_confirmation.sql', 'utf8'));
    for (const method of ['SIGNED_PDF_UPLOAD', 'GOV_BR', 'NOTARY', 'MANUAL_CONFIRMATION']) {
      await database.query(evidenceSql, [method, 'source', method, 'Tester', '2026-09-13T12:00:00Z']);
    }
    for (const index of [1, 3, 4]) {
      const input: any[] = ['invalid', 'source', 'MANUAL_CONFIRMATION', 'Tester', '2026-09-13T12:00:00Z'];
      input[index] = null;
      await assert.rejects(database.query(evidenceSql, input), 'required evidence shape must remain enforced');
    }
    await database.exec('DELETE FROM contract_artifacts');
    const source = { id: 'generated', attachmentId: 'attachment', templateId: 'template', snapshotJson: '{}', snapshotHash: 'hash' };
    const audit: any[] = [];
    const contract = { id: 'contract', status: 'DRAFT', isArchived: false };
    const repository = {
      findCurrentForContract: async (_company: string, _contract: string, kind: string) => {
        if (kind === 'GENERATED_PDF') return source;
        if (kind !== 'SIGNED_EVIDENCE') return null;
        const result = await database.query('SELECT payload FROM contract_artifacts WHERE is_current AND NOT is_archived');
        return result.rows[0]?.payload ?? null;
      },
      create: async (item: any) => {
        await database.query(`INSERT INTO contract_artifacts
          (id, artifact_type, source_artifact_id, signature_method, signed_by_name, signed_at, payload)
          VALUES ($1,$2,$3,$4,$5,$6,$7)`,
        [item.id, item.artifactType, item.sourceArtifactId, item.signatureMethod, item.signedByName, item.signedAt, JSON.stringify(item)]);
        return item;
      },
      updateForCompany: async (_company: string, id: string, changes: any) => {
        await database.query('UPDATE contract_artifacts SET is_current=$1, is_archived=$2 WHERE id=$3', [changes.isCurrent, changes.isArchived, id]);
        return { id, ...changes };
      },
    };
    const tx = {
      getContractRepo: () => ({ findByIdForCompanyWithLock: async () => contract, updateForCompany: async () => contract }),
      getContractArtifactRepo: () => repository,
      getAuditLogRepo: () => ({ create: async (entry: any) => { audit.push(entry); } }),
    };
    let handler: any;
    const { registerContractSimpleSignRoutes } = loadModule('src/server/contractSimpleSignRoutes.ts', {
      '../db/uow': { UnitOfWork: { run: async (_company: string, work: any) => work(tx) } },
    });
    registerContractSimpleSignRoutes({ post: (_path: string, callback: any) => { handler = callback; } });
    const sign = async (signed: boolean) => {
      const response = { code: 200, body: null as any, status(code: number) { this.code = code; return this; }, json(body: any) { this.body = body; return this; } };
      await handler({ principal: { userId: 'tester', companyId: 'test', role: 'ADMIN', name: 'Tester' }, body: { signed }, params: { id: contract.id } }, response);
      assert([200, 201].includes(response.code), `sign status must not fail: ${response.code}`);
      return response;
    };
    assert.equal(await repository.findCurrentForContract('test', contract.id, 'SIGNED_EVIDENCE'), null);
    const signed = await sign(true);
    assert.equal(signed.code, 201);
    // Reload from SQL, rather than using the mutation response.
    assert.equal((await repository.findCurrentForContract('test', contract.id, 'SIGNED_EVIDENCE')).id, signed.body.artifact.id);
    assert.equal((await sign(true)).body.replayed, true);
    assert.equal((await database.query('SELECT count(*)::int AS total FROM contract_artifacts')).rows[0].total, 1);
    await sign(false);
    assert.equal(await repository.findCurrentForContract('test', contract.id, 'SIGNED_EVIDENCE'), null);
    assert.equal((await sign(false)).body.replayed, true);
    assert.equal(audit.length, 2);
    assert.equal(JSON.parse(audit[0].newState).sourceArtifactId, source.id);
    assert.equal((await database.query('SELECT count(*)::int AS total FROM contract_artifacts WHERE is_archived')).rows[0].total, 1);
  } finally { await database.close(); }
}

await signatureMigrationRegression();
console.log('contract manual signature migration, replay, reload and unmark: PASS');

async function templateAuthorityRegression() {
  const { createHash } = require('node:crypto');
  const policy = loadModule('src/domain/contracts/contractTemplatePolicy.ts', {});
  const { MOVEFLEX_APPROVED_CONTRACT_MASTERS: masters } = loadModule('src/domain/contracts/moveflexApprovedContractMaster.ts', {});
  const base = { id: 'template', companyId: 'test', templateKey: 'modelo-contrato-04', title: 'Modelo', contentMarkdown: '', isCurrent: true, isActive: true, isArchived: false };
  const source = { id: 'source', companyId: 'test', entityType: 'ContractTemplate', entityId: base.id, documentType: 'CONTRACT_TEMPLATE_SOURCE', mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', contentState: 'AVAILABLE', storageProvider: 'SERVER_FS', storageKey: 'source.docx', checksum: masters[1].sha256, fileSize: masters[1].fileSize, isArchived: false };
  for (const templateKey of ['termo-multas-infracoes', 'contrato-02', 'modelo-contrato-04']) {
    const result = policy.classifyContractTemplateSource({ ...base, templateKey }, [source]);
    assert.equal(result.mode, 'PDF', 'approved master routing must not depend on its imported key');
    assert.equal(result.master.templateKey, 'termo-multas-infracoes');
  }
  assert.equal(policy.classifyContractTemplateSource({ ...base, templateKey: 'contrato-01' }, [source]), null);
  assert.equal(policy.classifyContractTemplateSource(base, []), null);
  assert.equal(policy.classifyContractTemplateSource(base, [source, source]), null);
  assert.equal(policy.classifyContractTemplateSource(base, [{ ...source, mimeType: 'application/pdf' }]), null);
  assert.equal(policy.classifyContractTemplateSource(base, [{ ...source, companyId: 'other' }]), null);
  assert.equal(policy.classifyContractTemplateSource({ ...base, contentMarkdown: 'Contrato {{contract.number}}' }, []).mode, 'PDF');
  assert.equal(policy.classifyContractTemplateSource({ ...base, contentMarkdown: 'Contrato {{unknown.key}}' }, []), null);

  // Reuse only the existing ZIP fixture builder, not its test execution.
  const fixture = readFileSync('src/server/__tests__/contractDocxPackageRendererRegression.ts', 'utf8');
  const fixtureCode = fixture.slice(fixture.indexOf('const LOCAL_FILE'), fixture.indexOf('function entryContent'));
  const fixtureExports: any = {};
  vm.runInNewContext(ts.transpileModule(fixtureCode + '\nexports.storedZip = storedZip;', { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText, { Buffer, exports: fixtureExports });
  const docx = (text: string) => fixtureExports.storedZip([
    { name: '[Content_Types].xml', content: Buffer.from('<Types/>') },
    { name: 'word/document.xml', content: Buffer.from(`<w:document><w:body><w:p><w:r><w:t>${text}</w:t></w:r></w:p></w:body></w:document>`) },
  ]);
  const files = new Map<string, Buffer>([
    ['editable', docx('Contrato {{contract.number}}')],
    ['fixed', docx('Documento sem placeholders')],
    ['broken', Buffer.from('invalid zip')],
  ]);
  const templates = [...files.keys()].map((id) => ({ ...base, id, templateKey: id }));
  templates.push({ ...base, id: 'markdown', templateKey: 'custom-markdown', contentMarkdown: 'Contrato {{contract.number}}' });
  const tx = {
    getContractTemplateRepo: () => ({ findAllByCompany: async () => templates, findByIdForCompany: async (_company: string, id: string) => templates.find((item) => item.id === id) }),
    getAttachmentRepo: () => ({ findByEntity: async (_company: string, _entity: string, id: string) => {
      const bytes = files.get(id);
      return bytes ? [{ ...source, entityId: id, storageKey: id, checksum: createHash('sha256').update(bytes).digest('hex'), fileSize: bytes.length }] : [];
    } }),
  };
  const handlers = new Map<string, any>();
  const { registerContractTemplateRoutes } = loadModule('src/server/contractTemplateRoutes.ts', {
    '../db/uow': { UnitOfWork: { run: async (_company: string, work: any) => work(tx) } },
    './r2AttachmentStorage': { createAttachmentStorageFromEnvironment: () => ({ provider: 'SERVER_FS', read: async (_company: string, key: string) => files.get(key) }) },
  });
  registerContractTemplateRoutes({ post() {}, get: (path: string, callback: any) => handlers.set(path, callback) });
  const get = async (path: string, query = {}, params = {}) => {
    const response = { code: 200, body: null as any, status(code: number) { this.code = code; return this; }, json(body: any) { this.body = body; return this; } };
    await handlers.get(path)({ principal: { userId: 'tester', companyId: 'test', role: 'ADMIN' }, query, params }, response);
    assert.equal(response.code, 200);
    return response.body;
  };
  const operational = (await get('/api/contract-templates')).items;
  const management = (await get('/api/contract-templates', { activeOnly: 'false' })).items;
  assert.deepEqual(Array.from(operational, (item: any) => item.id), ['editable', 'markdown']);
  assert.deepEqual(Array.from(management.filter((item: any) => policy.contractTemplateGenerationMode(item)), (item: any) => item.id), ['editable', 'markdown']);
  assert.equal((await get('/api/contract-templates/:id', {}, { id: 'editable' })).item.generationMode, 'DOCX');
  assert.equal((await get('/api/contract-templates/:id', {}, { id: 'fixed' })).item.generationMode, null);
  files.set('editable', Buffer.from('unreadable source'));
  assert.equal((await get('/api/contract-templates/:id', {}, { id: 'editable' })).item.generationMode, null);
  for (const path of ['ContractFormModal', 'ContractTemplateManagementModal', 'ContractExecutionPanel']) {
    assert(readFileSync(`src/components/contracts/${path}.tsx`, 'utf8').includes('contractTemplateGenerationMode'), `${path} must use the common operational authority`);
  }
  const execution = readFileSync('src/server/contractExecutionRoutes.ts', 'utf8');
  assert(execution.includes('classifyContractTemplateSource(template, attachments)'), 'backend must share the source classifier');
  assert(execution.includes('renderMoveFlexVisualFixedPdf(sourceBytes, prepared.approvedMaster.templateKey'), 'imported masters must render through their canonical master key');
}

await templateAuthorityRegression();
console.log('contract template catalog, editable DOCX, invalid sources and master routing: PASS');
