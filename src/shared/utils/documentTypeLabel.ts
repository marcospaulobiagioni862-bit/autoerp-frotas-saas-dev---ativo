const labels: Record<string, string> = {
  CRLV: 'Certificado de registro e licenciamento (CRLV)',
  CNH: 'Carteira de habilitação (CNH)',
  RG: 'Documento de identidade (RG)',
  CPF: 'CPF',
  IPVA: 'IPVA',
  LICENCIAMENTO: 'Licenciamento',
  CONTRACT: 'Contrato',
  CONTRACT_SIGNED: 'Contrato assinado',
  SIGNED_CONTRACT: 'Contrato assinado',
  INVOICE: 'Nota fiscal',
  RECEIPT: 'Comprovante',
  INSURANCE_POLICY: 'Apólice de seguro',
  TRAFFIC_TICKET: 'Auto de infração',
  INTERMEDIATION_NOTE: 'Nota de intermediação',
  OTHER: 'Outro documento',
};

export function documentTypeLabel(value?: string): string {
  if (!value) return 'Documento';
  return labels[value.toUpperCase()] || value.replaceAll('_', ' ');
}
