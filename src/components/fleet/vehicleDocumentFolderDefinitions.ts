import type { FileAttachment } from '../../types/entities';

export interface VehicleDocumentFolderDef {
  key: string;
  name: string;
  shortLabel: string;
  description: string;
  canonicalDocType: string;
  acceptsVideo?: boolean;
  maxSizeMB?: number;
  matches: (item: FileAttachment) => boolean;
}

/**
 * 11 Pastas Canônicas de Documentos do Veículo solicitadas pelo Marcos (PH-055).
 * Mais uma pasta de salvaguarda (OUTROS) para arquivos legados ou não classificados.
 */
export const VEHICLE_DOCUMENT_FOLDERS: VehicleDocumentFolderDef[] = [
  {
    key: 'crlv',
    name: 'CRLV',
    shortLabel: 'CRLV',
    description: 'Documento de rodagem e licenciamento do carro',
    canonicalDocType: 'CRLV',
    matches: (item) => {
      const type = String(item.documentType || '').trim().toUpperCase();
      const name = item.fileName.toLowerCase();
      return (
        type === 'CRLV' ||
        type === 'CRV' ||
        type === 'IPVA' ||
        type === 'DPVAT_SPVAT' ||
        type === 'LICENCIAMENTO' ||
        name.includes('crlv')
      );
    },
  },
  {
    key: 'vistoria',
    name: 'Vistoria',
    shortLabel: 'Vistoria',
    description: 'Vistoria de transferência e regularização (unificado com histórico de inspeções)',
    canonicalDocType: 'VISTORIA',
    matches: (item) => {
      const type = String(item.documentType || '').trim().toUpperCase();
      if (type === 'VISTORIA_CAUTELAR' || item.fileName.toLowerCase().includes('cautelar')) return false;
      return (
        item.entityType === 'VehicleInspection' ||
        type === 'VISTORIA' ||
        type === 'INSPECTION_REPORT' ||
        type === 'LAUDO' ||
        item.fileName.toLowerCase().includes('vistoria')
      );
    },
  },
  {
    key: 'vistoria_cautelar',
    name: 'Vistoria Cautelar',
    shortLabel: 'Cautelar',
    description: 'Laudo cautelar de procedência e estrutura',
    canonicalDocType: 'VISTORIA_CAUTELAR',
    matches: (item) => {
      const type = String(item.documentType || '').trim().toUpperCase();
      const name = item.fileName.toLowerCase();
      const desc = String(item.description || '').toLowerCase();
      return (
        type === 'VISTORIA_CAUTELAR' ||
        type === 'CAUTELAR' ||
        name.includes('cautelar') ||
        desc.includes('cautelar')
      );
    },
  },
  {
    key: 'checklist',
    name: 'Checklist / Check-in',
    shortLabel: 'Checklist',
    description: 'Checklist com fotos e vídeos (aceita vídeos MP4/WebM de até 50MB)',
    canonicalDocType: 'CHECKLIST',
    acceptsVideo: true,
    maxSizeMB: 50,
    matches: (item) => {
      const type = String(item.documentType || '').trim().toUpperCase();
      const name = item.fileName.toLowerCase();
      const desc = String(item.description || '').toLowerCase();
      return (
        type === 'CHECKLIST' ||
        type === 'CHECK_IN' ||
        type === 'CHECK_OUT' ||
        name.includes('checklist') ||
        desc.includes('checklist') ||
        item.mimeType.startsWith('video/')
      );
    },
  },
  {
    key: 'nf_entrada',
    name: 'Nota Fiscal de Entrada',
    shortLabel: 'NF Entrada',
    description: 'Nota fiscal de compra / entrada do veículo',
    canonicalDocType: 'NOTA_FISCAL_ENTRADA',
    matches: (item) => {
      const type = String(item.documentType || '').trim().toUpperCase();
      const name = item.fileName.toLowerCase();
      const desc = String(item.description || '').toLowerCase();
      return (
        type === 'NOTA_FISCAL_ENTRADA' ||
        type === 'PURCHASE_INVOICE' ||
        type === 'NF_ENTRADA' ||
        name.includes('nf_entrada') ||
        name.includes('nota_entrada') ||
        desc.includes('nf de compra') ||
        desc.includes('compra')
      );
    },
  },
  {
    key: 'nf_saida',
    name: 'Nota Fiscal de Saída',
    shortLabel: 'NF Saída',
    description: 'Nota fiscal de venda / desmobilização do veículo',
    canonicalDocType: 'NOTA_FISCAL_SAIDA',
    matches: (item) => {
      const type = String(item.documentType || '').trim().toUpperCase();
      const name = item.fileName.toLowerCase();
      const desc = String(item.description || '').toLowerCase();
      return (
        type === 'NOTA_FISCAL_SAIDA' ||
        type === 'SALE_INVOICE' ||
        type === 'NF_SAIDA' ||
        name.includes('nf_saida') ||
        name.includes('nota_saida') ||
        desc.includes('venda')
      );
    },
  },
  {
    key: 'atpv',
    name: 'ATPV',
    shortLabel: 'ATPV',
    description: 'Recibo / autorização para transferência de propriedade do veículo',
    canonicalDocType: 'ATPV',
    matches: (item) => {
      const type = String(item.documentType || '').trim().toUpperCase();
      const name = item.fileName.toLowerCase();
      return (
        type === 'ATPV' ||
        type === 'ATPV_E' ||
        type === 'RECIBO' ||
        type === 'RECIBO_COMPRA_VENDA' ||
        name.includes('atpv') ||
        name.includes('recibo')
      );
    },
  },
  {
    key: 'rastreador',
    name: 'Rastreador',
    shortLabel: 'Rastreador',
    description: 'Comprovante de instalação e termo de comodato do rastreador',
    canonicalDocType: 'RASTREADOR',
    matches: (item) => {
      const type = String(item.documentType || '').trim().toUpperCase();
      const name = item.fileName.toLowerCase();
      return (
        item.entityType === 'Tracker' ||
        type === 'RASTREADOR' ||
        type === 'TRACKER' ||
        type === 'TERMO_RASTREADOR' ||
        name.includes('rastreador') ||
        name.includes('tracker')
      );
    },
  },
  {
    key: 'apolice_seguro',
    name: 'Apólice de Seguro',
    shortLabel: 'Seguro',
    description: 'Apólice, bilhete e certificado de seguro da frota',
    canonicalDocType: 'APOLICE_SEGURO',
    matches: (item) => {
      const type = String(item.documentType || '').trim().toUpperCase();
      const name = item.fileName.toLowerCase();
      return (
        item.entityType === 'Insurance' ||
        type === 'APOLICE_SEGURO' ||
        type === 'INSURANCE_POLICY' ||
        type === 'SEGURO' ||
        name.includes('seguro') ||
        name.includes('apolice')
      );
    },
  },
  {
    key: 'nf_pecas',
    name: 'Nota Fiscal de Peças',
    shortLabel: 'NF Peças',
    description: 'Notas fiscais de peças de reposição e componentes',
    canonicalDocType: 'NOTA_FISCAL_PECAS',
    matches: (item) => {
      const type = String(item.documentType || '').trim().toUpperCase();
      const name = item.fileName.toLowerCase();
      const desc = String(item.description || '').toLowerCase();
      if (type === 'NOTA_FISCAL_PECAS' || type === 'NF_PECAS') return true;
      if (item.entityType === 'MaintenanceWorkOrder' && (type === 'MAINTENANCE_PART_PHOTO' || desc.includes('peça'))) {
        return true;
      }
      return name.includes('peca') || desc.includes('peça');
    },
  },
  {
    key: 'nf_servico',
    name: 'Nota Fiscal de Serviço',
    shortLabel: 'NF Serviço',
    description: 'Notas fiscais e comprovantes de serviços de oficina e mão de obra',
    canonicalDocType: 'NOTA_FISCAL_SERVICO',
    matches: (item) => {
      const type = String(item.documentType || '').trim().toUpperCase();
      const name = item.fileName.toLowerCase();
      const desc = String(item.description || '').toLowerCase();
      if (type === 'NOTA_FISCAL_SERVICO' || type === 'NF_SERVICO' || type === 'MAINTENANCE_INVOICE') return true;
      if (item.entityType === 'MaintenanceWorkOrder' && type !== 'MAINTENANCE_PART_PHOTO') {
        return true;
      }
      return name.includes('servico') || desc.includes('serviço') || desc.includes('oficina');
    },
  },
  {
    key: 'outros',
    name: 'Outros Documentos',
    shortLabel: 'Outros',
    description: 'Documentos e anexos adicionais do veículo',
    canonicalDocType: 'OUTROS',
    matches: () => false, // Utilizado como fallback para itens não agrupados
  },
];

/**
 * Agrupa uma lista de anexos nas 11 pastas canônicas + pasta de salvaguarda.
 */
export function groupAttachmentsIntoVehicleFolders(
  attachments: FileAttachment[]
): Record<string, { folder: VehicleDocumentFolderDef; items: FileAttachment[] }> {
  const result: Record<string, { folder: VehicleDocumentFolderDef; items: FileAttachment[] }> = {};
  for (const folder of VEHICLE_DOCUMENT_FOLDERS) {
    result[folder.key] = { folder, items: [] };
  }

  for (const item of attachments) {
    let matched = false;
    for (const folder of VEHICLE_DOCUMENT_FOLDERS) {
      if (folder.key === 'outros') continue;
      if (folder.matches(item)) {
        result[folder.key].items.push(item);
        matched = true;
        break; // Coloca na primeira pasta correspondente para evitar duplicidade visual
      }
    }
    if (!matched) {
      result['outros'].items.push(item);
    }
  }

  return result;
}
