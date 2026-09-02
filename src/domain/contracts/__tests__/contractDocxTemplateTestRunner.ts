import PizZip from 'pizzip';
import { ContractDocxTemplateError, renderContractDocx } from '../contractDocxTemplate';

function makeDocx(bodyText: string): Buffer {
  const zip = new PizZip();
  zip.file('[Content_Types].xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
</Types>`);
  zip.folder('_rels')?.file('.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`);
  zip.folder('word')?.file('document.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body><w:p><w:r><w:t>${bodyText}</w:t></w:r></w:p><w:sectPr/></w:body>
</w:document>`);
  return zip.generate({ type: 'nodebuffer' }) as Buffer;
}

function documentXml(docx: Buffer): string {
  const xml = new PizZip(docx).file('word/document.xml')?.asText();
  if (!xml) throw new Error('Generated DOCX is missing word/document.xml');
  return xml;
}

const rendered = renderContractDocx(
  makeDocx('Motorista: {{driver.name}} | Placa: {{vehicle.plate}}'),
  {
    'driver.name': 'Maria da Silva',
    'vehicle.plate': 'ABC1D23',
  },
);

if (rendered.subarray(0, 2).toString('ascii') !== 'PK') {
  throw new Error('Rendered contract is not a DOCX/ZIP');
}

const xml = documentXml(rendered);
if (!xml.includes('Maria da Silva')) throw new Error('driver.name placeholder was not rendered');
if (!xml.includes('ABC1D23')) throw new Error('vehicle.plate placeholder was not rendered');
if (xml.includes('{{driver.name}}') || xml.includes('{{vehicle.plate}}')) {
  throw new Error('Rendered DOCX still contains known placeholders');
}

let rejectedUnknown = false;
try {
  renderContractDocx(makeDocx('Campo: {{driver.unknown}}'), {});
} catch (error) {
  rejectedUnknown = error instanceof ContractDocxTemplateError;
}
if (!rejectedUnknown) throw new Error('Unknown DOCX placeholder was not rejected');

console.log('contract DOCX template regression: PASS');
