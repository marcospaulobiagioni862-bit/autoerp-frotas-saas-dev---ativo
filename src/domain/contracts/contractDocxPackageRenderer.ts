import { deflateRawSync, inflateRawSync } from 'node:zlib';
import {
  ContractDocxTemplateError,
  renderContractDocxXmlTemplate,
} from './contractDocxTemplateRenderer';

const LOCAL_FILE = 0x04034b50;
const CENTRAL_FILE = 0x02014b50;
const END_OF_CENTRAL = 0x06054b50;
const MAX_PACKAGE_BYTES = 10 * 1024 * 1024;
const MAX_EXPANDED_BYTES = 25 * 1024 * 1024;
const MAX_ENTRIES = 512;

interface ZipEntry {
  name: string;
  content: Buffer;
}

function crc32(bytes: Buffer): number {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function findEndOfCentral(bytes: Buffer): number {
  const minimum = Math.max(0, bytes.length - 65_557);
  for (let offset = bytes.length - 22; offset >= minimum; offset--) {
    if (bytes.readUInt32LE(offset) === END_OF_CENTRAL) return offset;
  }
  throw new ContractDocxTemplateError('Invalid DOCX ZIP directory');
}

function readZip(bytes: Buffer): ZipEntry[] {
  if (!bytes.length || bytes.length > MAX_PACKAGE_BYTES) throw new ContractDocxTemplateError('Invalid DOCX package size');
  const endOffset = findEndOfCentral(bytes);
  const disk = bytes.readUInt16LE(endOffset + 4);
  const centralDisk = bytes.readUInt16LE(endOffset + 6);
  const entriesOnDisk = bytes.readUInt16LE(endOffset + 8);
  const entryCount = bytes.readUInt16LE(endOffset + 10);
  const centralSize = bytes.readUInt32LE(endOffset + 12);
  const centralOffset = bytes.readUInt32LE(endOffset + 16);
  if (disk !== 0 || centralDisk !== 0 || entriesOnDisk !== entryCount || entryCount < 2 || entryCount > MAX_ENTRIES) {
    throw new ContractDocxTemplateError('Unsupported DOCX ZIP layout');
  }
  if (centralOffset + centralSize > endOffset) throw new ContractDocxTemplateError('Invalid DOCX ZIP bounds');

  const entries: ZipEntry[] = [];
  const names = new Set<string>();
  let offset = centralOffset;
  let expanded = 0;
  for (let index = 0; index < entryCount; index++) {
    if (offset + 46 > bytes.length || bytes.readUInt32LE(offset) !== CENTRAL_FILE) {
      throw new ContractDocxTemplateError('Invalid DOCX ZIP entry');
    }
    const flags = bytes.readUInt16LE(offset + 8);
    const method = bytes.readUInt16LE(offset + 10);
    const expectedCrc = bytes.readUInt32LE(offset + 16);
    const compressedSize = bytes.readUInt32LE(offset + 20);
    const uncompressedSize = bytes.readUInt32LE(offset + 24);
    const nameLength = bytes.readUInt16LE(offset + 28);
    const extraLength = bytes.readUInt16LE(offset + 30);
    const commentLength = bytes.readUInt16LE(offset + 32);
    const localOffset = bytes.readUInt32LE(offset + 42);
    const nextOffset = offset + 46 + nameLength + extraLength + commentLength;
    if (nextOffset > bytes.length || nameLength < 1 || nameLength > 512 || (flags & 1) !== 0 || ![0, 8].includes(method)) {
      throw new ContractDocxTemplateError('Unsupported DOCX ZIP entry');
    }
    const name = bytes.subarray(offset + 46, offset + 46 + nameLength).toString((flags & 0x800) !== 0 ? 'utf8' : 'latin1');
    if (names.has(name) || name.includes('\\') || name.startsWith('/') || name.split('/').includes('..')) {
      throw new ContractDocxTemplateError('Invalid DOCX ZIP entry name');
    }
    names.add(name);

    if (localOffset + 30 > bytes.length || bytes.readUInt32LE(localOffset) !== LOCAL_FILE) {
      throw new ContractDocxTemplateError('Invalid DOCX ZIP local entry');
    }
    const localNameLength = bytes.readUInt16LE(localOffset + 26);
    const localExtraLength = bytes.readUInt16LE(localOffset + 28);
    const dataStart = localOffset + 30 + localNameLength + localExtraLength;
    const dataEnd = dataStart + compressedSize;
    if (dataEnd > bytes.length) throw new ContractDocxTemplateError('Invalid DOCX ZIP data bounds');
    const compressed = bytes.subarray(dataStart, dataEnd);
    let content: Buffer;
    try {
      content = method === 0 ? Buffer.from(compressed) : inflateRawSync(compressed);
    } catch {
      throw new ContractDocxTemplateError('Invalid DOCX compressed content');
    }
    if (content.length !== uncompressedSize || crc32(content) !== expectedCrc) {
      throw new ContractDocxTemplateError('DOCX ZIP integrity check failed');
    }
    expanded += content.length;
    if (expanded > MAX_EXPANDED_BYTES) throw new ContractDocxTemplateError('DOCX expanded content exceeds limit');
    entries.push({ name, content });
    offset = nextOffset;
  }
  if (offset !== centralOffset + centralSize) throw new ContractDocxTemplateError('Invalid DOCX ZIP directory size');
  return entries;
}

function writeZip(entries: ZipEntry[]): Buffer {
  const localParts: Buffer[] = [];
  const centralParts: Buffer[] = [];
  let localOffset = 0;

  for (const entry of entries) {
    const name = Buffer.from(entry.name, 'utf8');
    const compressed = entry.content.length ? deflateRawSync(entry.content) : Buffer.alloc(0);
    const method = entry.content.length ? 8 : 0;
    const checksum = crc32(entry.content);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(LOCAL_FILE, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0x800, 6);
    local.writeUInt16LE(method, 8);
    local.writeUInt32LE(checksum, 14);
    local.writeUInt32LE(compressed.length, 18);
    local.writeUInt32LE(entry.content.length, 22);
    local.writeUInt16LE(name.length, 26);
    localParts.push(local, name, compressed);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(CENTRAL_FILE, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0x800, 8);
    central.writeUInt16LE(method, 10);
    central.writeUInt32LE(checksum, 16);
    central.writeUInt32LE(compressed.length, 20);
    central.writeUInt32LE(entry.content.length, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt32LE(localOffset, 42);
    centralParts.push(central, name);
    localOffset += local.length + name.length + compressed.length;
  }

  const centralBytes = Buffer.concat(centralParts);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(END_OF_CENTRAL, 0);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(centralBytes.length, 12);
  end.writeUInt32LE(localOffset, 16);
  const result = Buffer.concat([...localParts, centralBytes, end]);
  if (result.length > MAX_PACKAGE_BYTES) throw new ContractDocxTemplateError('Rendered DOCX exceeds package limit');
  return result;
}

function isRenderableWordPart(name: string): boolean {
  return name === 'word/document.xml' ||
    /^word\/(?:header|footer)\d+\.xml$/.test(name) ||
    name === 'word/footnotes.xml' ||
    name === 'word/endnotes.xml';
}


function decodeWordXmlText(value: string): string {
  return value
    .replace(/&#x([0-9a-f]+);/gi, (_match, code) => String.fromCodePoint(Number.parseInt(code, 16)))
    .replace(/&#([0-9]+);/g, (_match, code) => String.fromCodePoint(Number.parseInt(code, 10)))
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&');
}

export function extractContractDocxPlainText(docx: Buffer): string {
  const entries = readZip(docx);
  const document = entries.find((entry) => entry.name === 'word/document.xml');
  if (!document) throw new ContractDocxTemplateError('DOCX required parts are missing');
  const xml = document.content.toString('utf8');
  const token = /<w:t\b[^>]*>([\s\S]*?)<\/w:t>|<w:tab\b[^>]*\/>|<w:br\b[^>]*\/>|<\/w:p>/g;
  let text = '';
  let match: RegExpExecArray | null;
  while ((match = token.exec(xml))) {
    if (match[1] !== undefined) text += decodeWordXmlText(match[1]);
    else if (match[0].startsWith('</w:p')) text += '\n';
    else if (match[0].startsWith('<w:tab')) text += '\t';
    else text += '\n';
  }
  const normalized = text
    .split(/\r?\n/)
    .map((line) => line.replace(/[ \t]+/g, ' ').trim())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  if (!normalized) throw new ContractDocxTemplateError('Rendered DOCX has no readable text');
  return normalized;
}

export function renderContractDocxPackage(
  docx: Buffer,
  values: Readonly<Record<string, string>>
): { bytes: Buffer; replacedKeys: string[] } {
  const entries = readZip(docx);
  const names = new Set(entries.map((entry) => entry.name));
  if (!names.has('[Content_Types].xml') || !names.has('word/document.xml')) {
    throw new ContractDocxTemplateError('DOCX required parts are missing');
  }

  const replaced = new Set<string>();
  for (const entry of entries) {
    if (!isRenderableWordPart(entry.name)) continue;
    const xml = entry.content.toString('utf8');
    if (!xml.includes('{{') && !xml.includes('}}')) continue;
    const rendered = renderContractDocxXmlTemplate(xml, values);
    entry.content = Buffer.from(rendered.xml, 'utf8');
    for (const key of rendered.replacedKeys) replaced.add(key);
  }
  if (!replaced.size) throw new ContractDocxTemplateError('DOCX template has no canonical placeholders');
  return { bytes: writeZip(entries), replacedKeys: [...replaced].sort() };
}
