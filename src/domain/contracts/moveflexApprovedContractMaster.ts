export interface MoveFlexApprovedContractMaster {
  templateKey: 'locacao-padrao' | 'termo-multas-infracoes';
  title: string;
  fileName: string;
  sha256: string;
  fileSize: number;
}

export const MOVEFLEX_APPROVED_CONTRACT_MASTERS = [
  {
    templateKey: 'locacao-padrao',
    title: 'Contrato 01 — Contrato Particular de Locação de Veículo',
    fileName: 'CONTRATO_01_MOVEFLEX_ERP_FINAL.docx',
    sha256: '7b85e9e97af67ce15368b81999c4ce73570fe012e8f1f06bc0fd9c150fa2e7c2',
    fileSize: 806470,
  },
  {
    templateKey: 'termo-multas-infracoes',
    title: 'Contrato 02 — Termo de Responsabilidade por Multas e Infrações',
    fileName: 'CONTRATO_02_MOVEFLEX_ERP_FINAL.docx',
    sha256: '792e7df4a5cfc7cd36cd5bd3659dc68be42432f63671279f24025b3039b39e7d',
    fileSize: 808960,
  },
] as const satisfies readonly MoveFlexApprovedContractMaster[];

export const MOVEFLEX_DEFAULT_TEMPLATE_KEY = 'locacao-padrao' as const;

export function getMoveFlexApprovedContractMaster(templateKey: string): MoveFlexApprovedContractMaster | undefined {
  return MOVEFLEX_APPROVED_CONTRACT_MASTERS.find((item) => item.templateKey === templateKey);
}

export function isMoveFlexApprovedContractMasterKey(templateKey: string): boolean {
  return Boolean(getMoveFlexApprovedContractMaster(templateKey));
}
