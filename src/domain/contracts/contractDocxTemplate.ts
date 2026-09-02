import Docxtemplater from 'docxtemplater';
import PizZip from 'pizzip';
import { CONTRACT_TEMPLATE_PLACEHOLDERS, type ContractTemplateValues } from './contractTemplatePolicy';

export class ContractDocxTemplateError extends Error {}

function strictPlaceholderParser(values: ContractTemplateValues) {
  return (rawTag: string) => {
    const key = rawTag.trim();
    if (!CONTRACT_TEMPLATE_PLACEHOLDERS.has(key)) {
      throw new ContractDocxTemplateError(`Unknown contract placeholder: ${key}`);
    }
    return {
      get: () => {
        if (!Object.prototype.hasOwnProperty.call(values, key)) {
          throw new ContractDocxTemplateError(`Missing contract placeholder value: ${key}`);
        }
        return values[key];
      },
    };
  };
}

export function renderContractDocx(source: Buffer, values: ContractTemplateValues): Buffer {
  if (!Buffer.isBuffer(source) || source.length < 4) {
    throw new ContractDocxTemplateError('Invalid DOCX template');
  }

  try {
    const zip = new PizZip(source);
    const document = new Docxtemplater(zip, {
      delimiters: { start: '{{', end: '}}' },
      paragraphLoop: true,
      linebreaks: true,
      parser: strictPlaceholderParser(values),
    });

    document.render(values);
    const rendered = document.getZip().generate({
      type: 'nodebuffer',
      compression: 'DEFLATE',
    }) as Buffer;

    if (rendered.subarray(0, 2).toString('ascii') !== 'PK') {
      throw new ContractDocxTemplateError('Generated DOCX signature invalid');
    }
    return rendered;
  } catch (error) {
    if (error instanceof ContractDocxTemplateError) throw error;
    throw new ContractDocxTemplateError('Unable to render DOCX contract template');
  }
}
