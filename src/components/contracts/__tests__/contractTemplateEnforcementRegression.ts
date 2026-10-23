import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';

const contractFormSource = readFileSync(new URL('../ContractFormModal.tsx', import.meta.url), 'utf8');
const executionPanelSource = readFileSync(new URL('../ContractExecutionPanel.tsx', import.meta.url), 'utf8');

// 1. Invariantes de auto-seleção e bloqueio de modelo no formulário de contrato
assert.match(
  contractFormSource,
  /selectableTemplates\.length > 0/,
  'ContractFormModal must check available selectable templates'
);

assert.match(
  contractFormSource,
  /templateId:\s*current\.templateId\s*\|\|\s*selectableTemplates\[0\]\.id/,
  'ContractFormModal must auto-select the first selectable template on new contract'
);

assert.match(
  contractFormSource,
  /templates\.length > 0 && !form\.templateId && !contractFile/,
  'ContractFormModal must validate templateId requirement when templates exist and no file is attached'
);

assert.match(
  contractFormSource,
  /Selecione um modelo de contrato para geração ou envie um PDF de contrato assinado/,
  'ContractFormModal must provide clear error when saving contract without template'
);

// 2. Invariantes de vinculação inline no painel de execução para contratos já salvos sem modelo (CNT-000001)
assert.match(
  executionPanelSource,
  /!contract\.templateId/,
  'ContractExecutionPanel must branch when contract has no templateId'
);

assert.match(
  executionPanelSource,
  /Vincular modelo para liberar geração e assinatura/,
  'ContractExecutionPanel must expose inline recovery card when contract has no templateId'
);

assert.match(
  executionPanelSource,
  /ContractClient\.update\(contract\.id,\s*\{\s*templateId:\s*selectedTemplateId\s*\}\)/,
  'ContractExecutionPanel must persist templateId link via authoritative ContractClient.update'
);

assert.match(
  executionPanelSource,
  /disabled=\{!selectedTemplateId \|\| linkingTemplate\}/,
  'ContractExecutionPanel must disable linking action while in progress or without selection'
);

console.log('Contract template enforcement and inline linking regression: PASS');
