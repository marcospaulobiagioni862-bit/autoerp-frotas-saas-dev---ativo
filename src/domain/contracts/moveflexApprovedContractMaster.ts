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
    fileName: 'CONTRATO_01_MOVEFLEX_VISUAL_FIXO.docx',
    sha256: '76bf2d51fef2679b7d47294c35800bbd9c807ab7e40cfd01c171a53a6d0a9b6c',
    fileSize: 4331240,
  },
  {
    templateKey: 'termo-multas-infracoes',
    title: 'Contrato 02 — Termo de Responsabilidade por Multas e Infrações',
    fileName: 'CONTRATO_02_MOVEFLEX_VISUAL_FIXO.docx',
    sha256: '910636f745f16c8d3c8e08dec9dca112d3c3250bb282f1536e800ebc03258193',
    fileSize: 6621021,
  },
] as const satisfies readonly MoveFlexApprovedContractMaster[];

export const MOVEFLEX_DEFAULT_TEMPLATE_KEY = 'locacao-padrao' as const;

export function getMoveFlexApprovedContractMaster(templateKey: string): MoveFlexApprovedContractMaster | undefined {
  return MOVEFLEX_APPROVED_CONTRACT_MASTERS.find((item) => item.templateKey === templateKey);
}

export function isMoveFlexApprovedContractMasterKey(templateKey: string): boolean {
  return Boolean(getMoveFlexApprovedContractMaster(templateKey));
}
