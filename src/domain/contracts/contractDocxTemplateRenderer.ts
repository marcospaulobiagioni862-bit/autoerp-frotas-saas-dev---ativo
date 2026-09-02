export class ContractDocxTemplateError extends Error {}

const OPTIONAL_EMPTY_PLACEHOLDER_KEYS = new Set(['driver.address.complement']);

interface TextNode {
  open: string;
  value: string;
  close: string;
  start: number;
  end: number;
}

function decodeXmlText(value: string): string {
  return value
    .replace(/&#x([0-9a-f]+);/gi, (_match, code) => String.fromCodePoint(Number.parseInt(code, 16)))
    .replace(/&#([0-9]+);/g, (_match, code) => String.fromCodePoint(Number.parseInt(code, 10)))
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&');
}

function encodeXmlText(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/**
 * Replaces canonical {{path.to.field}} placeholders in a WordprocessingML part.
 * Word commonly splits a placeholder across multiple w:t runs; the replacement
 * is written into the first affected run and the remaining affected runs are
 * cleared, preserving the surrounding DOCX formatting and structure.
 */
export function renderContractDocxXmlTemplate(
  xml: string,
  values: Readonly<Record<string, string>>
): { xml: string; replacedKeys: string[] } {
  if (!xml || xml.length > 5_000_000) throw new ContractDocxTemplateError('Invalid DOCX XML part');
  const token = /(<w:t\b[^>]*>)([\s\S]*?)(<\/w:t>)/g;
  const nodes: TextNode[] = [];
  let visible = '';
  let match: RegExpExecArray | null;

  while ((match = token.exec(xml))) {
    const value = decodeXmlText(match[2]);
    const start = visible.length;
    visible += value;
    nodes.push({ open: match[1], value, close: match[3], start, end: visible.length });
  }
  if (!nodes.length) throw new ContractDocxTemplateError('DOCX XML has no text nodes');

  const placeholders: Array<{ raw: string; key: string; start: number; end: number }> = [];
  const placeholderPattern = /\{\{\s*([a-zA-Z][a-zA-Z0-9]*(?:\.[a-zA-Z][a-zA-Z0-9]*)+)\s*\}\}/g;
  while ((match = placeholderPattern.exec(visible))) {
    placeholders.push({ raw: match[0], key: match[1], start: match.index, end: match.index + match[0].length });
  }
  const withoutValid = visible.replace(placeholderPattern, '');
  if (withoutValid.includes('{{') || withoutValid.includes('}}')) {
    throw new ContractDocxTemplateError('Malformed DOCX placeholder');
  }
  if (!placeholders.length) throw new ContractDocxTemplateError('DOCX template has no canonical placeholders');

  const replacedKeys = new Set<string>();
  for (const placeholder of [...placeholders].sort((a, b) => b.start - a.start)) {
    if (!Object.prototype.hasOwnProperty.call(values, placeholder.key)) {
      throw new ContractDocxTemplateError(`Unknown DOCX placeholder: ${placeholder.key}`);
    }
    const replacement = values[placeholder.key];
    if (typeof replacement !== 'string') throw new ContractDocxTemplateError('Invalid DOCX placeholder value');
    if (!replacement.trim() && !OPTIONAL_EMPTY_PLACEHOLDER_KEYS.has(placeholder.key)) {
      throw new ContractDocxTemplateError(`Missing DOCX placeholder value: ${placeholder.key}`);
    }

    const affected = nodes.filter((node) => node.end > placeholder.start && node.start < placeholder.end);
    if (!affected.length) throw new ContractDocxTemplateError('DOCX placeholder mapping failed');
    const first = affected[0];
    const last = affected[affected.length - 1];
    const prefixLength = Math.max(0, placeholder.start - first.start);
    const suffixOffset = Math.max(0, placeholder.end - last.start);
    const prefix = first.value.slice(0, prefixLength);
    const suffix = last.value.slice(suffixOffset);

    first.value = prefix + replacement + (first === last ? suffix : '');
    for (const node of affected.slice(1, -1)) node.value = '';
    if (last !== first) last.value = suffix;
    replacedKeys.add(placeholder.key);
  }

  let index = 0;
  const rendered = xml.replace(token, () => {
    const node = nodes[index++];
    return node.open + encodeXmlText(node.value) + node.close;
  });
  if (rendered.includes('{{') || rendered.includes('}}')) {
    throw new ContractDocxTemplateError('Unresolved DOCX placeholder');
  }
  return { xml: rendered, replacedKeys: [...replacedKeys].sort() };
}
