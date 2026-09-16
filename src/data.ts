import { Veiculo, Motorista, Contrato, Pagamento, Manutencao, Documento, Seguradora, Apolice, Rastreador, Acessorio, ArquivoMortoItem } from './types';

export const initialVeiculos: Veiculo[] = [
  {
    placa: 'PQR-9876',
    modelo: 'Fiat Cronos Drive',
    marca: 'Fiat',
    ano: 2023,
    cor: 'Branco',
    renavam: '12345678901',
    valor: 450,
    plataforma: 'Uber + 99',
    status: 'Alugado',
    km_inicial: 12000,
    km_atual: 18500,
    km: 18500,
    foto: 'https://images.unsplash.com/photo-1533473359331-0135ef1b58bf?auto=format&fit=crop&q=60&w=200',
    segurado: true,
    seguro_vencimento: '2027-09-15',
    seguro_seguradora: 'Porto Seguro S.A.',
    seguro_valor: 2400,
    seguro_valor_franquia: 3000,
    possui_rastreador: true,
    rastreador_marca: 'Suntech',
    rastreador_modelo: 'ST310U',
    rastreador_imei: '358291039482103',
    rastreador_operadora: 'Vivo',
    rastreador_status: 'Ativo',
    crlv_vencimento: '2027-09-10',
    crlv_situacao: 'Em dia',
    ipva_vencimento: '2027-04-15',
    ipva_situacao: 'Pago',
    vistoria_vencimento: '2027-03-20',
    motoristaCpf: '456.789.012-34'
  },
  {
    placa: 'JKL-1234',
    modelo: 'Chevrolet Onix LTZ',
    marca: 'Chevrolet',
    ano: 2022,
    cor: 'Preto',
    renavam: '45612378902',
    valor: 420,
    plataforma: 'Todas',
    status: 'Alugado',
    km_inicial: 42000,
    km_atual: 49800,
    km: 49800,
    foto: 'https://images.unsplash.com/photo-1549399542-7e3f8b79c341?auto=format&fit=crop&q=60&w=200',
    segurado: true,
    seguro_vencimento: '2027-08-25',
    seguro_seguradora: 'Azul Seguros',
    seguro_valor: 2100,
    possui_rastreador: true,
    rastreador_marca: 'Coban',
    rastreador_modelo: 'GPS303G',
    rastreador_imei: '860293849201948',
    rastreador_operadora: 'Claro',
    rastreador_status: 'Ativo',
    crlv_vencimento: '2027-08-25',
    crlv_situacao: 'Em dia',
    ipva_vencimento: '2027-08-25',
    ipva_situacao: 'Pago',
    vistoria_vencimento: '2027-08-01',
    motoristaCpf: '678.901.234-56'
  },
  {
    placa: 'STU-5678',
    modelo: 'Hyundai HB20 Vision',
    marca: 'Hyundai',
    ano: 2023,
    cor: 'Cinza',
    renavam: '78912345603',
    valor: 440,
    plataforma: 'Uber + InDrive',
    status: 'Alugado',
    km_inicial: 18000,
    km_atual: 24200,
    km: 24200,
    foto: 'https://images.unsplash.com/photo-1533473359331-0135ef1b58bf?auto=format&fit=crop&q=60&w=200',
    segurado: true,
    seguro_vencimento: '2027-11-20',
    seguro_seguradora: 'Tokio Marine',
    seguro_valor: 2300,
    possui_rastreador: true,
    rastreador_marca: 'Suntech',
    rastreador_modelo: 'ST310U',
    rastreador_imei: '982736451293847',
    rastreador_operadora: 'Tim',
    rastreador_status: 'Ativo',
    crlv_vencimento: '2027-11-20',
    crlv_situacao: 'Em dia',
    ipva_vencimento: '2027-11-20',
    ipva_situacao: 'Pago',
    vistoria_vencimento: '2027-10-15',
    motoristaCpf: '789.012.345-67'
  }
];

export const initialMotoristas: Motorista[] = [
  {
    nome: 'Pedro Henrique Souza',
    cpf: '456.789.012-34',
    tel: '(11) 98111-2222',
    email: 'pedro.souza@email.com',
    cnh: '45678901234',
    cat: 'B',
    cnh_venc: '2031-10-22',
    plataforma: 'Uber',
    end: 'Av. Paulista, 1000',
    cidade: 'São Paulo',
    emergencia: 'Juliana Souza (Esposa)',
    status: 'Ativo',
    tipo_sangue: 'O+',
    tel_contato: '(11) 98111-3333',
    veiculoPlaca: 'PQR-9876'
  },
  {
    nome: 'Juliana Mendes Costa',
    cpf: '678.901.234-56',
    tel: '(11) 98333-4444',
    email: 'juliana.costa@email.com',
    cnh: '67890123456',
    cat: 'AB',
    cnh_venc: '2029-08-10',
    plataforma: 'Todas',
    end: 'Av. Brigadeiro Luis Antonio, 2000',
    cidade: 'São Paulo',
    emergencia: 'Roberto Costa (Pai)',
    status: 'Ativo',
    tipo_sangue: 'B-',
    tel_contato: '(11) 98333-5555',
    veiculoPlaca: 'JKL-1234'
  },
  {
    nome: 'Marcos Paulo Biagioni',
    cpf: '789.012.345-67',
    tel: '(11) 98444-5555',
    email: 'marcos.biagioni@email.com',
    cnh: '78901234567',
    cat: 'B',
    cnh_venc: '2028-12-05',
    plataforma: 'Uber + InDrive',
    end: 'Rua Bela Cintra, 1200',
    cidade: 'São Paulo',
    emergencia: 'Ana Biagioni (Irmã)',
    status: 'Ativo',
    tipo_sangue: 'AB+',
    tel_contato: '(11) 98444-6666',
    veiculoPlaca: 'STU-5678'
  }
];

export const initialContratos: Contrato[] = [
  {
    id: '#001',
    motoristaCpf: '456.789.012-34',
    veiculoPlaca: 'PQR-9876',
    inicio: '2026-01-10',
    fim: '2027-12-10',
    valor: 450,
    diaCobranca: 'Segunda-feira',
    caucao: 1000,
    kmFranquia: 1500,
    obs: 'Contrato ativo, sem pendências.',
    status: 'Ativo',
    limiteKm: 3000,
    tipoLimiteKm: 'Por mês',
    kmInicialContrato: 15000,
    valorKmExcedente: 0.80,
    toleranciaKm: 100,
    regraCobrancaKm: 'Modo Periódico',
    periodicidadeApuracaoKm: 'Mensal'
  },
  {
    id: '#002',
    motoristaCpf: '678.901.234-56',
    veiculoPlaca: 'JKL-1234',
    inicio: '2026-02-01',
    fim: '2027-08-01',
    valor: 420,
    diaCobranca: 'Segunda-feira',
    caucao: 1200,
    kmFranquia: 2000,
    obs: 'Em perfeitas condições.',
    status: 'Ativo',
    limiteKm: 2500,
    tipoLimiteKm: 'Por mês',
    kmInicialContrato: 42000,
    valorKmExcedente: 0.75,
    toleranciaKm: 50,
    regraCobrancaKm: 'Modo Periódico',
    periodicidadeApuracaoKm: 'Mensal'
  },
  {
    id: '#003',
    motoristaCpf: '789.012.345-67',
    veiculoPlaca: 'STU-5678',
    inicio: '2026-05-10',
    fim: '2027-11-10',
    valor: 440,
    diaCobranca: 'Segunda-feira',
    caucao: 1000,
    kmFranquia: 1500,
    obs: 'Contrato ativo, sem pendências.',
    status: 'Ativo',
    limiteKm: 3000,
    tipoLimiteKm: 'Por mês',
    kmInicialContrato: 28000,
    valorKmExcedente: 0.85,
    toleranciaKm: 100,
    regraCobrancaKm: 'No Encerramento do Contrato',
    periodicidadeApuracaoKm: 'Final'
  }
];

export const initialPagamentos: Pagamento[] = [
  { id: '#1001', motoristaCpf: '456.789.012-34', veiculoPlaca: 'PQR-9876', periodo: '01/07 a 07/07', valor: 450, vencimento: '2026-07-08', dataPagamento: '2026-07-08', forma: 'PIX', status: 'Pago', obs: 'Pago pontualmente' },
  { id: '#1002', motoristaCpf: '678.901.234-56', veiculoPlaca: 'JKL-1234', periodo: '01/07 a 07/07', valor: 420, vencimento: '2026-07-08', dataPagamento: '2026-07-08', forma: 'PIX', status: 'Pago', obs: 'Pago pontualmente' },
  { id: '#1003', motoristaCpf: '789.012.345-67', veiculoPlaca: 'STU-5678', periodo: '01/07 a 07/07', valor: 440, vencimento: '2026-07-08', dataPagamento: '2026-07-08', forma: 'PIX', status: 'Pago', obs: 'Pago pontualmente' }
];

export const initialManutencoes: Manutencao[] = [
  { id: 'm1', veiculoPlaca: 'PQR-9876', tipo: 'Troca de Óleo', desc: 'Troca preventiva de óleo 5W30 e filtros.', data: '2026-07-15', custo: 250, oficina: 'Speed Oil', km: 18000, status: 'Concluída' }
];

export const initialDocumentos: Documento[] = [
  { id: 'doc1', veiculoPlaca: 'PQR-9876', tipo: 'CRLV', numero: '1234567890', vencimento: '2027-09-10', status: 'Válido', obs: 'Licenciamento em dia.' },
  { id: 'doc2', veiculoPlaca: 'JKL-1234', tipo: 'CRLV', numero: '0987654321', vencimento: '2027-08-25', status: 'Válido', obs: 'Licenciamento em dia.' },
  { id: 'doc3', veiculoPlaca: 'STU-5678', tipo: 'CRLV', numero: '1122334455', vencimento: '2027-11-20', status: 'Válido', obs: 'Licenciamento em dia.' }
];

export const initialSeguradoras: Seguradora[] = [
  { id: 's1', nome: 'Porto Seguro S.A.', cnpj: '61.198.164/0001-60', tel: '(11) 3337-6786', email: 'contato@portoseguro.com.br', end: 'Av. Rio Branco, 1489 - São Paulo/SP', responsavel: 'Roberto Carlos Santos', obs: 'Parceiro preferencial de seguros da frota.' }
];

export const initialApolices: Apolice[] = [
  { id: 'ap1', veiculoPlaca: 'PQR-9876', seguradoraId: 's1', numero: 'POL-2023-A', cobertura: 'Completa', franquia: 3000, valor: 2400, inicio: '2026-09-15', vencimento: '2027-09-15', status: 'Ativa' },
  { id: 'ap2', veiculoPlaca: 'JKL-1234', seguradoraId: 's1', numero: 'POL-2023-B', cobertura: 'Completa', franquia: 2500, valor: 2100, inicio: '2026-08-25', vencimento: '2027-08-25', status: 'Ativa' },
  { id: 'ap3', veiculoPlaca: 'STU-5678', seguradoraId: 's1', numero: 'POL-2023-C', cobertura: 'Completa', franquia: 2800, valor: 2300, inicio: '2026-11-20', vencimento: '2027-11-20', status: 'Ativa' }
];

export const initialRastreadores: Rastreador[] = [
  { id: 'r1', veiculoPlaca: 'PQR-9876', marca: 'Suntech', modelo: 'ST310U', imei: '358291039482103', operadora: 'Vivo', instalacao: '2024-02-15', planoMensal: '20GB M2M', valorMensal: 39.9, status: 'Ativo', ultimaAtualizacao: '2026-07-10T14:00:00Z', chip_valor: 15.00, chip_vencimento: '2026-07-10', empresa_valor: 24.90, empresa_vencimento: '2026-07-15' },
  { id: 'r2', veiculoPlaca: 'JKL-1234', marca: 'Coban', modelo: 'GPS303G', imei: '860293849201948', operadora: 'Claro', instalacao: '2025-05-12', planoMensal: 'Plano Controle M2M', valorMensal: 35.0, status: 'Ativo', ultimaAtualizacao: '2026-07-10T13:50:00Z', chip_valor: 12.00, chip_vencimento: '2026-07-05', empresa_valor: 23.00, empresa_vencimento: '2026-07-12' },
  { id: 'r3', veiculoPlaca: 'STU-5678', marca: 'Suntech', modelo: 'ST310U', imei: '982736451293847', operadora: 'Tim', instalacao: '2025-06-10', planoMensal: 'Plano Tim M2M', valorMensal: 39.9, status: 'Ativo', ultimaAtualizacao: '2026-07-10T14:15:00Z', chip_valor: 14.90, chip_vencimento: '2026-07-10', empresa_valor: 25.00, empresa_vencimento: '2026-07-20' }
];

export const initialAcessorios: Acessorio[] = [];

export const initialArquivoMorto: ArquivoMortoItem[] = [];

// =========================================
// MÓDULO FINANCEIRO — SEED DATA INICIAL
// =========================================

export const initialCategoriasFinanceiras = [
  { id: 'cat-rec-1', nome: 'Aluguel de Veículo', tipo: 'Receita', subcategorias: ['Diária', 'Semanal', 'Mensal'], centroCustoPadrao: 'Locação de Frota' },
  { id: 'cat-rec-2', nome: 'Caução / Depósito', tipo: 'Receita', subcategorias: ['Caução Inicial', 'Caução Complementar'], centroCustoPadrao: 'Garantias' },
  { id: 'cat-rec-3', nome: 'Cobrança de Multa / Avaria', tipo: 'Receita', subcategorias: ['Reembolso de Multa', 'Cobrança Avaria', 'Franquia Repassada'], centroCustoPadrao: 'Sinistros & Multas' },
  { id: 'cat-rec-4', nome: 'Receitas Adicionais', tipo: 'Receita', subcategorias: ['Taxa de Troca de Motorista', 'Segunda Via Documento', 'Serviço Extra'], centroCustoPadrao: 'Administrativo' },

  { id: 'cat-pag-1', nome: 'DOCUMENTAÇÃO', tipo: 'Despesa', subcategorias: ['IPVA', 'Licenciamento', 'CRLV', 'DPVAT', 'Taxas', 'Vistorias', 'Emolumentos', 'Regularizações'], centroCustoPadrao: 'Documentação' },
  { id: 'cat-pag-2', nome: 'SEGURO', tipo: 'Despesa', subcategorias: ['Seguro Apólice', 'Franquia', 'Endossos', 'Assistência 24h'], centroCustoPadrao: 'Proteção & Seguro' },
  { id: 'cat-pag-3', nome: 'RASTREADOR', tipo: 'Despesa', subcategorias: ['Mensalidade', 'Instalação', 'Manutenção', 'Troca de Equipamento'], centroCustoPadrao: 'Tecnologia' },
  { id: 'cat-pag-4', nome: 'MANUTENÇÃO', tipo: 'Despesa', subcategorias: ['Revisão', 'Troca de Óleo', 'Pneus', 'Freios', 'Suspensão', 'Motor', 'Elétrica', 'Funilaria', 'Peças', 'Mão de Obra', 'Guincho', 'Preventiva', 'Corretiva'], centroCustoPadrao: 'Oficina & Manutenção' },
  { id: 'cat-pag-5', nome: 'MULTAS E INFRAÇÕES', tipo: 'Despesa', subcategorias: ['Multa Trânsito', 'Juros Mora', 'Taxas Detran', 'Custos Recursos'], centroCustoPadrao: 'Infrações' },
  { id: 'cat-pag-6', nome: 'OUTRAS DESPESAS', tipo: 'Despesa', subcategorias: ['Combustível', 'Lavagem', 'Estacionamento', 'Pedágio', 'Despesas Administrativas', 'Serviços Terceirizados'], centroCustoPadrao: 'Geral' }
];

export const initialFormasPagamento = [
  { id: 'fp-1', nome: 'PIX', taxaPercentual: 0, diasCompensacao: 0, ativa: true, obs: 'Recebimento/Pagamento Instantâneo' },
  { id: 'fp-2', nome: 'Boleto Bancário', taxaPercentual: 1.5, diasCompensacao: 1, ativa: true, obs: 'Compensação em 1 dia útil' },
  { id: 'fp-3', nome: 'Cartão de Crédito', taxaPercentual: 3.5, diasCompensacao: 30, ativa: true, obs: 'Repasse mensal ou antecipado' },
  { id: 'fp-4', nome: 'Cartão de Débito', taxaPercentual: 1.8, diasCompensacao: 1, ativa: true },
  { id: 'fp-5', nome: 'Dinheiro Espécie', taxaPercentual: 0, diasCompensacao: 0, ativa: true, obs: 'Caixa físico da empresa' },
  { id: 'fp-6', nome: 'Transferência / TED', taxaPercentual: 0, diasCompensacao: 0, ativa: true }
];

export const initialContasReceber = [
  {
    id: 'rec-1001',
    numeroLancamento: 'REC-2026-001',
    descricao: 'Aluguel Semanal — Fiat Cronos PQR-9876',
    clienteResponsavel: 'Pedro Henrique Souza',
    motoristaCpf: '456.789.012-34',
    contratoId: '#001',
    veiculoPlaca: 'PQR-9876',
    categoria: 'Aluguel de Veículo',
    subcategoria: 'Semanal',
    centroCusto: 'Locação de Frota',
    valorOriginal: 450,
    desconto: 0,
    acrescimo: 0,
    juros: 0,
    multa: 0,
    valorFinal: 450,
    valorRecebido: 450,
    saldoDevedor: 0,
    dataEmissao: '2026-07-01',
    dataVencimento: '2026-07-08',
    dataRealRecebimento: '2026-07-08',
    formaPagamento: 'PIX',
    status: 'Recebido',
    periodicidade: 'Semanal',
    observacoes: 'Recebido via PIX no prazo.',
    origemTipo: 'contrato',
    origemId: '#001'
  },
  {
    id: 'rec-1002',
    numeroLancamento: 'REC-2026-002',
    descricao: 'Aluguel Semanal — Chevrolet Onix JKL-1234',
    clienteResponsavel: 'Juliana Mendes Costa',
    motoristaCpf: '678.901.234-56',
    contratoId: '#002',
    veiculoPlaca: 'JKL-1234',
    categoria: 'Aluguel de Veículo',
    subcategoria: 'Semanal',
    centroCusto: 'Locação de Frota',
    valorOriginal: 420,
    desconto: 0,
    acrescimo: 0,
    juros: 0,
    multa: 0,
    valorFinal: 420,
    valorRecebido: 420,
    saldoDevedor: 0,
    dataEmissao: '2026-07-01',
    dataVencimento: '2026-07-08',
    dataRealRecebimento: '2026-07-08',
    formaPagamento: 'PIX',
    status: 'Recebido',
    periodicidade: 'Semanal',
    observacoes: 'Recebido pontualmente.',
    origemTipo: 'contrato',
    origemId: '#002'
  },
  {
    id: 'rec-1003',
    numeroLancamento: 'REC-2026-003',
    descricao: 'Aluguel Semanal — Hyundai HB20 STU-5678',
    clienteResponsavel: 'Marcos Paulo Biagioni',
    motoristaCpf: '789.012.345-67',
    contratoId: '#003',
    veiculoPlaca: 'STU-5678',
    categoria: 'Aluguel de Veículo',
    subcategoria: 'Semanal',
    centroCusto: 'Locação de Frota',
    valorOriginal: 440,
    desconto: 0,
    acrescimo: 0,
    juros: 0,
    multa: 0,
    valorFinal: 440,
    valorRecebido: 440,
    saldoDevedor: 0,
    dataEmissao: '2026-07-01',
    dataVencimento: '2026-07-08',
    dataRealRecebimento: '2026-07-08',
    formaPagamento: 'PIX',
    status: 'Recebido',
    periodicidade: 'Semanal',
    observacoes: 'Comprovante anexado.',
    origemTipo: 'contrato',
    origemId: '#003'
  }
];

export const initialContasPagar = [
  {
    id: 'pag-1001',
    numeroLancamento: 'PAG-2026-001',
    descricao: 'Manutenção — Troca de Óleo PQR-9876',
    fornecedor: 'Speed Oil Autocenter',
    cnpjCpfFornecedor: '12.345.678/0001-99',
    veiculoPlaca: 'PQR-9876',
    categoria: 'MANUTENÇÃO',
    subcategoria: 'Troca de Óleo',
    centroCusto: 'Oficina & Manutenção',
    numeroNotaFiscal: 'NF-8821',
    valorOriginal: 250,
    desconto: 0,
    juros: 0,
    multa: 0,
    valorFinal: 250,
    valorPago: 250,
    saldoDevedor: 0,
    dataEmissao: '2026-07-15',
    dataVencimento: '2026-07-15',
    dataRealPagamento: '2026-07-15',
    formaPagamento: 'PIX',
    status: 'Pago',
    observacoes: 'Troca de óleo efetuada.',
    origemTipo: 'manutencao',
    origemId: 'm1'
  },
  {
    id: 'pag-1002',
    numeroLancamento: 'PAG-2026-002',
    descricao: 'Mensalidade Rastreamento Suntech — PQR-9876',
    fornecedor: 'Suntech Rastreamento Ltda',
    cnpjCpfFornecedor: '98.765.432/0001-10',
    veiculoPlaca: 'PQR-9876',
    categoria: 'RASTREADOR',
    subcategoria: 'Mensalidade',
    centroCusto: 'Tecnologia',
    valorOriginal: 39.9,
    desconto: 0,
    juros: 0,
    multa: 0,
    valorFinal: 39.9,
    valorPago: 39.9,
    saldoDevedor: 0,
    dataEmissao: '2026-07-01',
    dataVencimento: '2026-07-15',
    dataRealPagamento: '2026-07-15',
    formaPagamento: 'Boleto Bancário',
    status: 'Pago',
    origemTipo: 'rastreador',
    origemId: 'r1'
  }
];



