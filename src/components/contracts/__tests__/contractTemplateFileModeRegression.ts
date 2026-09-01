import { readFile } from 'node:fs/promises';

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

export async function runContractTemplateFileModeRegression(): Promise<void> {
  const source = await readFile('src/components/contracts/ContractTemplateManagementModal.tsx', 'utf8');
  assert(source.includes('Anexar PDF/DOCX'), 'contract template UI must expose PDF/DOCX source mode');
  assert(source.includes("entityType: 'ContractTemplate'"), 'contract template UI must upload against ContractTemplate authority');
  assert(source.includes("documentType: 'CONTRACT_TEMPLATE_SOURCE'"), 'contract template UI must identify source attachment');
  assert(source.includes('promoteFileSource(created.id)'), 'file version must promote only after upload');
  assert(source.includes("isActive: sourceMode === 'FILE' ? false : undefined"), 'file-backed templates must remain inactive for automatic generation');
  assert(source.includes('Abrir arquivo') && source.includes('Baixar'), 'file-backed templates must expose source view/download actions');
}

if (process.argv[1]?.includes('contractTemplateFileModeRegression')) {
  runContractTemplateFileModeRegression()
    .then(() => console.log('Contract template file mode regression PASS'))
    .catch((error) => {
      console.error(error);
      process.exitCode = 1;
    });
}
