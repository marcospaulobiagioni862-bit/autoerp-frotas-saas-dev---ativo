export const DRIVER_DOCUMENT_TYPES = [
  'CNH',
  'RG',
  'CPF',
  'Comprovante de Residência',
  'Certidão de Antecedentes Criminais',
  'Contrato Assinado',
  'Outro Documento',
] as const;

export type DriverDocumentType = typeof DRIVER_DOCUMENT_TYPES[number];

export function isDriverDocumentType(value: string): value is DriverDocumentType {
  return (DRIVER_DOCUMENT_TYPES as readonly string[]).includes(value);
}
