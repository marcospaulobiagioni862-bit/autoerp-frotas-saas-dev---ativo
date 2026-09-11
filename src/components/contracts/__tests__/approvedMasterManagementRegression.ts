import assert from 'node:assert/strict';
import fs from 'node:fs';

const modal = fs.readFileSync('src/components/contracts/ContractTemplateManagementModal.tsx', 'utf8');

assert.match(modal, /ensureMoveFlexDefault\(\)/, 'management modal must ensure canonical MoveFlex master slots');
assert.match(modal, /getMoveFlexApprovedContractMaster\(item\.templateKey\)/, 'management modal must recognize approved masters');
assert.match(modal, /Importar arquivo oficial/, 'pending approved masters must expose official file import');
assert.match(modal, /promoteFileSource\(editing\.id\)/, 'approved master import must promote the canonical template slot');
assert.match(modal, /AttachmentClient\.archive\(uploadedApprovedSource\.id\)/, 'failed approved master validation must archive the rejected upload');
assert.match(modal, /Este modelo oficial não possui edição textual no ERP/, 'approved file-backed masters must not expose text editing as if the source were Markdown');

console.log('approved master management regression: PASS');
