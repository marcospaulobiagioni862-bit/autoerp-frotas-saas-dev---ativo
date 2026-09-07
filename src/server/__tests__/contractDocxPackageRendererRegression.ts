import { inflateRawSync } from 'node:zlib';
import { ContractDocxTemplateError } from '../../domain/contracts/contractDocxTemplateRenderer';
import {
  renderContractApprovedMasterDocxPackage,
  renderContractDocxPackage,
} from '../../domain/contracts/contractDocxPackageRenderer';

const LOCAL_FILE = 0x04034b50;
const CENTRAL_FILE = 0x02014b50;
const END_OF_CENTRAL = 0x06054b50;

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function crc32(bytes: Buffer): number {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function storedZip(entries: Array<{ name: string; content: Buffer }>): Buffer {
  const localParts: Buffer[] = [];
  const centralParts: Buffer[] = [];
  let offset = 0;
  for (const entry of entries) {
    const name = Buffer.from(entry.name);
    const crc = crc32(entry.content);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(LOCAL_FILE, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(entry.content.length, 18);
    local.writeUInt32LE(entry.content.length, 22);
    local.writeUInt16LE(name.length, 26);
    localParts.push(local, name, entry.content);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(CENTRAL_FILE, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(entry.content.length, 20);
    central.writeUInt32LE(entry.content.length, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt32LE(offset, 42);
    centralParts.push(central, name);
    offset += local.length + name.length + entry.content.length;
  }
  const directory = Buffer.concat(centralParts);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(END_OF_CENTRAL, 0);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(directory.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...localParts, directory, end]);
}

function entryContent(zip: Buffer, wanted: string): Buffer {
  let endOffset = zip.length - 22;
  while (endOffset >= 0 && zip.readUInt32LE(endOffset) !== END_OF_CENTRAL) endOffset--;
  assert(endOffset >= 0, 'rendered ZIP directory not found');
  const count = zip.readUInt16LE(endOffset + 10);
  let offset = zip.readUInt32LE(endOffset + 16);
  for (let index = 0; index < count; index++) {
    assert(zip.readUInt32LE(offset) === CENTRAL_FILE, 'invalid rendered central entry');
    const flags = zip.readUInt16LE(offset + 8);
    const method = zip.readUInt16LE(offset + 10);
    const compressedSize = zip.readUInt32LE(offset + 20);
    const nameLength = zip.readUInt16LE(offset + 28);
    const extraLength = zip.readUInt16LE(offset + 30);
    const commentLength = zip.readUInt16LE(offset + 32);
    const localOffset = zip.readUInt32LE(offset + 42);
    const name = zip.subarray(offset + 46, offset + 46 + nameLength).toString((flags & 0x800) !== 0 ? 'utf8' : 'latin1');
    if (name === wanted) {
      const localName = zip.readUInt16LE(localOffset + 26);
      const localExtra = zip.readUInt16LE(localOffset + 28);
      const start = localOffset + 30 + localName + localExtra;
      const compressed = zip.subarray(start, start + compressedSize);
      return method === 0 ? Buffer.from(compressed) : inflateRawSync(compressed);
    }
    offset += 46 + nameLength + extraLength + commentLength;
  }
  throw new Error(`rendered entry not found: ${wanted}`);
}

function expectRejected(bytes: Buffer, values: Record<string, string>, message: string): void {
  let rejected = false;
  try {
    renderContractDocxPackage(bytes, values);
  } catch (error) {
    rejected = error instanceof ContractDocxTemplateError;
  }
  assert(rejected, message);
}

export async function runContractDocxPackageRendererRegression(): Promise<void> {
  const documentXml = Buffer.from(
    '<w:document xmlns:w="urn:test"><w:body><w:p>' +
    '<w:r><w:t>Motorista {{driver.</w:t></w:r><w:r><w:t>name}}</w:t></w:r>' +
    '<w:r><w:t> / {{vehicle.plate}}</w:t></w:r>' +
    '</w:p></w:body></w:document>'
  );
  const binary = Buffer.from([0, 1, 2, 3, 255]);
  const source = storedZip([
    { name: '[Content_Types].xml', content: Buffer.from('<Types/>') },
    { name: 'word/document.xml', content: documentXml },
    { name: 'word/media/image1.png', content: binary },
  ]);

  const rendered = renderContractDocxPackage(source, {
    'driver.name': 'João & Maria',
    'vehicle.plate': 'ABC1D23',
  });
  assert(rendered.bytes.subarray(0, 2).toString('ascii') === 'PK', 'rendered DOCX is not a ZIP package');
  assert(rendered.replacedKeys.join(',') === 'driver.name,vehicle.plate', 'package keys were not deterministic');
  const xml = entryContent(rendered.bytes, 'word/document.xml').toString('utf8');
  assert(xml.includes('João &amp; Maria') && xml.includes('ABC1D23'), 'DOCX package values were not rendered');
  assert(!xml.includes('{{') && !xml.includes('}}'), 'DOCX package retained unresolved placeholders');
  assert(entryContent(rendered.bytes, 'word/media/image1.png').equals(binary), 'DOCX non-XML bytes changed');


  const approvedDocumentXml = Buffer.from(
    '<w:document xmlns:w="urn:test"><w:body>' +
    '<w:p><w:r><w:t>Campo: ____</w:t></w:r></w:p>' +
    '<w:p><w:r><w:t>Texto jurídico imutável.</w:t></w:r></w:p>' +
    '</w:body></w:document>'
  );
  const approvedHeader = Buffer.from('<w:hdr xmlns:w="urn:test"><w:p><w:r><w:t>CABEÇALHO OFICIAL</w:t></w:r></w:p></w:hdr>');
  const approvedFooter = Buffer.from('<w:ftr xmlns:w="urn:test"><w:p><w:r><w:t>RODAPÉ OFICIAL</w:t></w:r></w:p></w:ftr>');
  const approvedSource = storedZip([
    { name: '[Content_Types].xml', content: Buffer.from('<Types/>') },
    { name: 'word/document.xml', content: approvedDocumentXml },
    { name: 'word/header1.xml', content: approvedHeader },
    { name: 'word/footer1.xml', content: approvedFooter },
    { name: 'word/media/image1.png', content: binary },
  ]);
  const approvedRendered = renderContractApprovedMasterDocxPackage(approvedSource, [{
    paragraphIndex: 0,
    expectedText: 'Campo: ____',
    needle: '____',
    replacement: 'DADO ERP',
    fieldKey: 'driver.name',
  }]);
  const approvedXml = entryContent(approvedRendered.bytes, 'word/document.xml').toString('utf8');
  assert(approvedXml.includes('Campo: DADO ERP'), 'approved master blank was not filled');
  assert(approvedXml.includes('Texto jurídico imutável.'), 'approved master legal text changed');
  assert(entryContent(approvedRendered.bytes, 'word/header1.xml').equals(approvedHeader), 'approved master header changed');
  assert(entryContent(approvedRendered.bytes, 'word/footer1.xml').equals(approvedFooter), 'approved master footer changed');
  assert(entryContent(approvedRendered.bytes, 'word/media/image1.png').equals(binary), 'approved master image changed');

  let approvedMismatchRejected = false;
  try {
    renderContractApprovedMasterDocxPackage(approvedSource, [{
      paragraphIndex: 0,
      expectedText: 'Campo ALTERADO: ____',
      needle: '____',
      replacement: 'DADO ERP',
      fieldKey: 'driver.name',
    }]);
  } catch (error) {
    approvedMismatchRejected = error instanceof ContractDocxTemplateError;
  }
  assert(approvedMismatchRejected, 'approved master paragraph drift did not fail closed');

  expectRejected(
    storedZip([
      { name: '[Content_Types].xml', content: Buffer.from('<Types/>') },
      { name: 'word/document.xml', content: Buffer.from('<w:document><w:t>{{driver.secret}}</w:t></w:document>') },
    ]),
    { 'driver.name': 'Teste' },
    'unknown package placeholder did not fail closed'
  );
  expectRejected(
    storedZip([
      { name: '[Content_Types].xml', content: Buffer.from('<Types/>') },
      { name: 'word/document.xml', content: Buffer.from('<w:document><w:t>{{driver.name}}</w:t></w:document>') },
    ]),
    { 'driver.name': '   ' },
    'empty required package placeholder did not fail closed'
  );
  const optionalEmpty = renderContractDocxPackage(
    storedZip([
      { name: '[Content_Types].xml', content: Buffer.from('<Types/>') },
      { name: 'word/document.xml', content: Buffer.from('<w:document><w:t>{{driver.address.complement}}</w:t></w:document>') },
    ]),
    { 'driver.address.complement': '' }
  );
  assert(
    !entryContent(optionalEmpty.bytes, 'word/document.xml').toString('utf8').includes('{{'),
    'optional empty package placeholder was not rendered'
  );
  expectRejected(
    storedZip([
      { name: '[Content_Types].xml', content: Buffer.from('<Types/>') },
      { name: 'word/media/image1.png', content: binary },
    ]),
    { 'driver.name': 'Teste' },
    'DOCX missing document.xml did not fail closed'
  );
  expectRejected(Buffer.from('not-a-zip'), { 'driver.name': 'Teste' }, 'invalid ZIP did not fail closed');
}

if (process.argv[1]?.includes('contractDocxPackageRendererRegression')) {
  runContractDocxPackageRendererRegression()
    .then(() => console.log('Contract DOCX package renderer regression PASS'))
    .catch((error) => {
      console.error(error);
      process.exitCode = 1;
    });
}
