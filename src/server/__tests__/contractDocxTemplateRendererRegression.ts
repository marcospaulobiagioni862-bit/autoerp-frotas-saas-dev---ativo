import {
  ContractDocxTemplateError,
  renderContractDocxXmlTemplate,
} from '../../domain/contracts/contractDocxTemplateRenderer';

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function expectRejected(xml: string, values: Record<string, string>, message: string): void {
  let rejected = false;
  try {
    renderContractDocxXmlTemplate(xml, values);
  } catch (error) {
    rejected = error instanceof ContractDocxTemplateError;
  }
  assert(rejected, message);
}

export async function runContractDocxTemplateRendererRegression(): Promise<void> {
  const xml = [
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>',
    '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p>',
    '<w:r><w:rPr><w:b/></w:rPr><w:t>Contrato </w:t></w:r>',
    '<w:r><w:t>{{driver.</w:t></w:r>',
    '<w:r><w:rPr><w:i/></w:rPr><w:t>name}}</w:t></w:r>',
    '<w:r><w:t> - placa {{vehicle.plate}} - empresa {{company.name}}</w:t></w:r>',
    '</w:p></w:body></w:document>',
  ].join('');

  const rendered = renderContractDocxXmlTemplate(xml, {
    'driver.name': 'João & Filhos <Teste>',
    'vehicle.plate': 'ABC1D23',
    'company.name': 'Locações "Sul"',
  });

  assert(rendered.replacedKeys.join(',') === 'company.name,driver.name,vehicle.plate', 'DOCX keys were not reported deterministically');
  assert(rendered.xml.includes('João &amp; Filhos &lt;Teste&gt;'), 'DOCX replacement was not XML escaped');
  assert(rendered.xml.includes('ABC1D23'), 'DOCX same-run placeholder was not replaced');
  assert(rendered.xml.includes('Locações &quot;Sul&quot;'), 'DOCX quoted value was not XML escaped');
  assert(!rendered.xml.includes('{{') && !rendered.xml.includes('}}'), 'DOCX placeholders remained unresolved');
  assert(rendered.xml.includes('<w:rPr><w:b/></w:rPr>'), 'DOCX surrounding run formatting changed');
  assert(rendered.xml.includes('<w:rPr><w:i/></w:rPr>'), 'DOCX split-run formatting changed');

  expectRejected(
    '<w:document><w:t>{{driver.unknown}}</w:t></w:document>',
    { 'driver.name': 'Teste' },
    'unknown DOCX placeholder did not fail closed'
  );
  expectRejected(
    '<w:document><w:t>{{driver.name}</w:t></w:document>',
    { 'driver.name': 'Teste' },
    'malformed DOCX placeholder did not fail closed'
  );
  expectRejected(
    '<w:document><w:t>Contrato sem campos</w:t></w:document>',
    { 'driver.name': 'Teste' },
    'DOCX without canonical placeholders did not fail closed'
  );
}

if (process.argv[1]?.includes('contractDocxTemplateRendererRegression')) {
  runContractDocxTemplateRendererRegression()
    .then(() => console.log('Contract DOCX template renderer regression PASS'))
    .catch((error) => {
      console.error(error);
      process.exitCode = 1;
    });
}
