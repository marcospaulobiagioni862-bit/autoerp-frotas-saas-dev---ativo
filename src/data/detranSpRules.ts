import { DetranRegra, DetranCalendarioExercicio, CategoriaVeiculoDetran, KmRegistro, KmAuditLog, ApuracaoKmCobranca } from '../types';

export const initialDetranCalendarios: DetranCalendarioExercicio[] = [
  {
    ano: 2026,
    estado: 'SP',
    status: 'Publicado Oficial',
    dataUltimaAtualizacao: '2026-01-05',
    fonteOficial: 'Secretaria da Fazenda e Planejamento de São Paulo (SFAZ/SP) - Decreto IPVA/Licenciamento 2026',
    observacoes: 'Calendário oficial do exercício 2026 para o Estado de São Paulo.'
  },
  {
    ano: 2027,
    estado: 'SP',
    status: 'Pendente de Atualização',
    dataUltimaAtualizacao: '2026-08-01',
    fonteOficial: 'Aguardando publicação oficial no Diário Oficial do Estado de SP',
    observacoes: 'Calendário rascunho pendente de homologação das datas pela SFAZ/SP.'
  }
];

// Helper to extract last numeric digit from plate (supports standard ABC-1234 and Mercosul ABC1D23)
export function getVehiclePlateFinalDigit(placa: string): number {
  if (!placa) return 0;
  const clean = placa.replace(/[^a-zA-Z0-9]/g, '');
  if (!clean) return 0;
  // Look for the last digit in the string
  for (let i = clean.length - 1; i >= 0; i--) {
    const code = clean.charCodeAt(i);
    if (code >= 48 && code <= 57) {
      return parseInt(clean[i], 10);
    }
  }
  return 0;
}

// IPVA SP 2026 Official Dates Table for Automóveis/Motos/Camionetas (Final digit 1 to 0)
// Final 1: Jan 11 (Cota Única / P1), Feb 11 (P2), Mar 11 (P3), Apr 11 (P4), May 11 (P5)
// Final 2: Jan 12, Feb 12, Mar 12, Apr 12, May 12
// Final 3: Jan 15, Feb 15, Mar 15, Apr 15, May 15
// Final 4: Jan 16, Feb 16, Mar 16, Apr 16, May 16
// Final 5: Jan 17, Feb 17, Mar 17, Apr 17, May 17
// Final 6: Jan 18, Feb 18, Mar 18, Apr 18, May 18
// Final 7: Jan 19, Feb 19, Mar 19, Apr 19, May 19
// Final 8: Jan 22, Feb 22, Mar 22, Apr 22, May 22
// Final 9: Jan 23, Feb 23, Mar 23, Apr 23, May 23
// Final 0: Jan 24, Feb 24, Mar 24, Apr 24, May 24

const ipvaDayMap: Record<number, { d: string; p1: string; p2: string; p3: string; p4: string; p5: string }> = {
  1: { d: '2026-01-11', p1: '2026-01-11', p2: '2026-02-11', p3: '2026-03-11', p4: '2026-04-11', p5: '2026-05-11' },
  2: { d: '2026-01-12', p1: '2026-01-12', p2: '2026-02-12', p3: '2026-03-12', p4: '2026-04-12', p5: '2026-05-12' },
  3: { d: '2026-01-15', p1: '2026-01-15', p2: '2026-02-15', p3: '2026-03-15', p4: '2026-04-15', p5: '2026-05-15' },
  4: { d: '2026-01-16', p1: '2026-01-16', p2: '2026-02-16', p3: '2026-03-16', p4: '2026-04-16', p5: '2026-05-16' },
  5: { d: '2026-01-17', p1: '2026-01-17', p2: '2026-02-17', p3: '2026-03-17', p4: '2026-04-17', p5: '2026-05-17' },
  6: { d: '2026-01-18', p1: '2026-01-18', p2: '2026-02-18', p3: '2026-03-18', p4: '2026-04-18', p5: '2026-05-18' },
  7: { d: '2026-01-19', p1: '2026-01-19', p2: '2026-02-19', p3: '2026-03-19', p4: '2026-04-19', p5: '2026-05-19' },
  8: { d: '2026-01-22', p1: '2026-01-22', p2: '2026-02-22', p3: '2026-03-22', p4: '2026-04-22', p5: '2026-05-22' },
  9: { d: '2026-01-23', p1: '2026-01-23', p2: '2026-02-23', p3: '2026-03-23', p4: '2026-04-23', p5: '2026-05-23' },
  0: { d: '2026-01-24', p1: '2026-01-24', p2: '2026-02-24', p3: '2026-03-24', p4: '2026-04-24', p5: '2026-05-24' }
};

// Licenciamento SP 2026 Official Dates Table (Automóveis e Similares):
// Final 1 e 2: 31/07/2026
// Final 3 e 4: 31/08/2026
// Final 5 e 6: 30/09/2026
// Final 7 e 8: 31/10/2026
// Final 9: 30/11/2026
// Final 0: 30/12/2026

const licenciamentoAutoMap: Record<number, string> = {
  1: '2026-07-31',
  2: '2026-07-31',
  3: '2026-08-31',
  4: '2026-08-31',
  5: '2026-09-30',
  6: '2026-09-30',
  7: '2026-10-31',
  8: '2026-10-31',
  9: '2026-11-30',
  0: '2026-12-30'
};

// Licenciamento Caminhões SP 2026
const licenciamentoCaminhaoMap: Record<number, string> = {
  1: '2026-07-31',
  2: '2026-07-31',
  3: '2026-08-31',
  4: '2026-08-31',
  5: '2026-08-31',
  6: '2026-09-30',
  7: '2026-09-30',
  8: '2026-09-30',
  9: '2026-11-30',
  0: '2026-12-30'
};

export const initialDetranRegras: DetranRegra[] = [];

// Populate default IPVA & Licenciamento SP 2026 rules
const categoriasList: CategoriaVeiculoDetran[] = [
  'Automóveis', 'Camionetas', 'Caminhonetes', 'Motos', 'Ônibus', 'Micro-ônibus', 'Outros'
];

// Generate IPVA 2026 SP
for (let digit = 0; digit <= 9; digit++) {
  const map = ipvaDayMap[digit];
  categoriasList.forEach((cat) => {
    initialDetranRegras.push({
      id: `rule-ipva-sp-2026-${cat.toLowerCase()}-${digit}`,
      estado: 'SP',
      ano: 2026,
      tipo: 'IPVA',
      categoriaVeiculo: cat,
      finalPlaca: digit,
      dataVencimentoCotaUnicaDesconto: map.d,
      dataVencimentoCotaUnica: map.d,
      parcelasMaximas: 5,
      vencimentoParcelas: [
        { numero: 1, vencimento: map.p1 },
        { numero: 2, vencimento: map.p2 },
        { numero: 3, vencimento: map.p3 },
        { numero: 4, vencimento: map.p4 },
        { numero: 5, vencimento: map.p5 }
      ],
      fonteOficial: 'Secretaria da Fazenda de São Paulo (SFAZ/SP)',
      dataPublicacao: '2025-12-18',
      dataUltimaAtualizacao: '2026-01-05',
      status: 'Ativo'
    });
  });

  // Caminhões IPVA SP 2026
  ['Caminhões', 'Caminhões-tratores'].forEach((cat) => {
    // Caminhões SP IPVA Vencimentos: Cota Única em Março, Parcelas Mar a Jul
    const truckMonthMap: Record<number, { d: string; p1: string; p2: string; p3: string; p4: string; p5: string }> = {
      1: { d: '2026-03-11', p1: '2026-03-11', p2: '2026-04-11', p3: '2026-05-11', p4: '2026-06-11', p5: '2026-07-11' },
      2: { d: '2026-03-12', p1: '2026-03-12', p2: '2026-04-12', p3: '2026-05-12', p4: '2026-06-12', p5: '2026-07-12' },
      3: { d: '2026-03-15', p1: '2026-03-15', p2: '2026-04-15', p3: '2026-05-15', p4: '2026-06-15', p5: '2026-07-15' },
      4: { d: '2026-03-16', p1: '2026-03-16', p2: '2026-04-16', p3: '2026-05-16', p4: '2026-06-16', p5: '2026-07-16' },
      5: { d: '2026-03-17', p1: '2026-03-17', p2: '2026-04-17', p3: '2026-05-17', p4: '2026-06-17', p5: '2026-07-17' },
      6: { d: '2026-03-18', p1: '2026-03-18', p2: '2026-04-18', p3: '2026-05-18', p4: '2026-06-18', p5: '2026-07-18' },
      7: { d: '2026-03-19', p1: '2026-03-19', p2: '2026-04-19', p3: '2026-05-19', p4: '2026-06-19', p5: '2026-07-19' },
      8: { d: '2026-03-22', p1: '2026-03-22', p2: '2026-04-22', p3: '2026-05-22', p4: '2026-06-22', p5: '2026-07-22' },
      9: { d: '2026-03-23', p1: '2026-03-23', p2: '2026-04-23', p3: '2026-05-23', p4: '2026-06-23', p5: '2026-07-23' },
      0: { d: '2026-03-24', p1: '2026-03-24', p2: '2026-04-24', p3: '2026-05-24', p4: '2026-06-24', p5: '2026-07-24' }
    };
    const tMap = truckMonthMap[digit];
    initialDetranRegras.push({
      id: `rule-ipva-sp-2026-${cat.toLowerCase()}-${digit}`,
      estado: 'SP',
      ano: 2026,
      tipo: 'IPVA',
      categoriaVeiculo: cat as CategoriaVeiculoDetran,
      finalPlaca: digit,
      dataVencimentoCotaUnicaDesconto: tMap.d,
      dataVencimentoCotaUnica: tMap.d,
      parcelasMaximas: 5,
      vencimentoParcelas: [
        { numero: 1, vencimento: tMap.p1 },
        { numero: 2, vencimento: tMap.p2 },
        { numero: 3, vencimento: tMap.p3 },
        { numero: 4, vencimento: tMap.p4 },
        { numero: 5, vencimento: tMap.p5 }
      ],
      fonteOficial: 'SFAZ/SP - Tabela Especial de Caminhões 2026',
      dataPublicacao: '2025-12-18',
      dataUltimaAtualizacao: '2026-01-05',
      status: 'Ativo'
    });
  });
}

// Generate Licenciamento 2026 SP
for (let digit = 0; digit <= 9; digit++) {
  categoriasList.forEach((cat) => {
    initialDetranRegras.push({
      id: `rule-licenc-sp-2026-${cat.toLowerCase()}-${digit}`,
      estado: 'SP',
      ano: 2026,
      tipo: 'Licenciamento',
      categoriaVeiculo: cat,
      finalPlaca: digit,
      dataVencimentoCotaUnica: licenciamentoAutoMap[digit],
      parcelasMaximas: 1,
      fonteOficial: 'DETRAN/SP - Calendário Anual de Licenciamento 2026',
      dataPublicacao: '2025-12-18',
      dataUltimaAtualizacao: '2026-01-05',
      status: 'Ativo'
    });
  });

  ['Caminhões', 'Caminhões-tratores'].forEach((cat) => {
    initialDetranRegras.push({
      id: `rule-licenc-sp-2026-${cat.toLowerCase()}-${digit}`,
      estado: 'SP',
      ano: 2026,
      tipo: 'Licenciamento',
      categoriaVeiculo: cat as CategoriaVeiculoDetran,
      finalPlaca: digit,
      dataVencimentoCotaUnica: licenciamentoCaminhaoMap[digit],
      parcelasMaximas: 1,
      fonteOficial: 'DETRAN/SP - Tabela de Licenciamento de Caminhões 2026',
      dataPublicacao: '2025-12-18',
      dataUltimaAtualizacao: '2026-01-05',
      status: 'Ativo'
    });
  });
}

// Initial KM records for demo fleet
export const initialKmRegistros: KmRegistro[] = [
  {
    id: 'km-reg-1',
    veiculoPlaca: 'ABC-1234',
    contratoId: '#001',
    motoristaCpf: '111.222.333-44',
    dataHora: '2026-07-25T09:00',
    km: 51100,
    kmAnterior: 50000,
    kmPercorridos: 1100,
    usuario: 'Administrador ERP',
    origem: 'Vistoria',
    observacao: 'Vistoria quinzenal de rotina.'
  },
  {
    id: 'km-reg-2',
    veiculoPlaca: 'ABC-1234',
    contratoId: '#001',
    motoristaCpf: '111.222.333-44',
    dataHora: '2026-08-01T10:15',
    km: 51500,
    kmAnterior: 51100,
    kmPercorridos: 400,
    usuario: 'Administrador ERP',
    origem: 'Atualização Periódica',
    observacao: 'Registro de checagem semanal.'
  },
  {
    id: 'km-reg-3',
    veiculoPlaca: 'ABC-1234',
    contratoId: '#001',
    motoristaCpf: '111.222.333-44',
    dataHora: '2026-08-05T14:30',
    km: 51900,
    kmAnterior: 51500,
    kmPercorridos: 400,
    usuario: 'Administrador ERP',
    origem: 'Registro Manual',
    observacao: 'Checagem no pátio.'
  },
  {
    id: 'km-reg-4',
    veiculoPlaca: 'ABC-1234',
    contratoId: '#001',
    motoristaCpf: '111.222.333-44',
    dataHora: '2026-08-10T16:00',
    km: 52250,
    kmAnterior: 51900,
    kmPercorridos: 350,
    usuario: 'Administrador ERP',
    origem: 'Manutenção',
    observacao: 'Registro pós-troca de óleo.'
  },
  {
    id: 'km-reg-5',
    veiculoPlaca: 'ABC-1234',
    contratoId: '#001',
    motoristaCpf: '111.222.333-44',
    dataHora: '2026-08-15T11:20',
    km: 52800,
    kmAnterior: 52250,
    kmPercorridos: 550,
    usuario: 'Administrador ERP',
    origem: 'Atualização Periódica',
    observacao: 'Leitura enviada pelo motorista.'
  }
];

export const initialApuracoesKm: ApuracaoKmCobranca[] = [];

export const initialKmAuditLogs: KmAuditLog[] = [
  {
    id: 'km-audit-1',
    dataHora: '2026-07-01 08:00',
    usuario: 'Sistema ERP',
    acao: 'Atualização das Regras do Estado de São Paulo',
    motivo: 'Carga inicial do Calendário Oficial DETRAN/SP 2026.'
  }
];
