export interface Veiculo {
  placa: string;
  modelo: string;
  marca: string;
  ano: number | string;
  cor: string;
  renavam: string;
  valor: number; // Valor semanal
  valor_diario?: number;
  valor_semanal?: number;
  valor_mensal?: number;
  modalidade_aluguel?: 'Diário' | 'Semanal' | 'Mensal';
  plataforma: string;
  status: 'Disponível' | 'Alugado' | 'Em preparação' | 'Fora da frota';
  km_inicial: number;
  km_atual: number;
  km: number; // For backward compatibility
  foto?: string;
  motoristaCpf?: string;
  fotos_videos?: { id: string; url: string; tipo: 'foto' | 'video'; descricao?: string; data: string }[];
  chassi?: string;
  ano_fab?: number;
  ano_mod?: number;
  categoria?: string;
  aquisicao?: string;
  compra?: number;
  mercado?: number;
  obs?: string;

  // New fields requested by user
  segurado?: boolean;
  seguro_vencimento?: string;
  seguro_parcelas?: number;
  seguro_forma_pagamento?: 'Cartão' | 'PIX' | 'Dinheiro' | 'Conta Bancária' | 'Boleto' | '';
  seguro_obs?: string;
  seguro_seguradora?: string;
  seguro_valor?: number;
  seguro_telefone_corretora?: string;
  seguro_valor_franquia?: number;
  seguro_contrato_url?: string;

  // Campos adicionais da apólice de seguro
  seguro_apolice_numero?: string;
  seguro_vigencia_inicio?: string;
  seguro_vigencia_fim?: string;
  seguro_tipo_cobertura?: string;
  seguro_valor_segurado?: number;
  seguro_corretor_nome?: string;

  // Registro de Sinistro
  sinistro_ocorreu?: boolean;
  sinistro_data_hora?: string;
  sinistro_local?: string;
  sinistro_tipo?: string; // colisão, roubo, furto, incêndio, alagamento, perda total, dano a terceiro, etc.
  sinistro_descricao?: string;
  sinistro_houve_vitimas?: 'Sim' | 'Não' | '';
  
  // Boletim de Ocorrência
  sinistro_bo_numero?: string;
  sinistro_bo_data?: string;
  sinistro_bo_delegacia?: string;
  sinistro_bo_anexo_url?: string;

  // Terceiros envolvidos
  sinistro_terceiro_nome?: string;
  sinistro_terceiro_cpf?: string;
  sinistro_terceiro_telefone?: string;
  sinistro_terceiro_placa?: string;
  sinistro_terceiro_seguradora?: string;
  sinistro_terceiro_apolice?: string;

  // Acionamento junto à seguradora
  sinistro_acionamento_data?: string;
  sinistro_acionamento_protocolo?: string;
  sinistro_acionamento_atendente?: string;
  sinistro_acionamento_canal?: 'Telefone' | 'App' | 'Site' | '';
  sinistro_acionamento_prazo?: string;

  // Acompanhamento do processo
  sinistro_acompanhamento_historico?: string;
  sinistro_situacao_atual?: 'Aguardando vistoria' | 'Em análise' | 'Aprovado' | 'Negado' | '';
  sinistro_vistoria_data?: string;
  sinistro_oficina_indicada?: string;
  sinistro_orcamento_aprovado?: number;

  // Documentos entregues
  sinistro_doc_cnh?: boolean;
  sinistro_doc_crlv?: boolean;
  sinistro_doc_bo?: boolean;
  sinistro_doc_fotos?: boolean;
  sinistro_doc_formulario_aviso?: boolean;
  sinistro_doc_laudos?: boolean;

  // Resolução
  sinistro_resolucao_data?: string;
  sinistro_resolucao_tipo?: 'Reparo' | 'Indenização' | 'Perda total' | '';
  sinistro_resolucao_valor_recebido?: number;
  sinistro_resolucao_obs?: string;

  possui_rastreador?: boolean;
  rastreador_marca?: string;
  rastreador_modelo?: string;
  rastreador_imei?: string;
  rastreador_operadora?: string;
  rastreador_status?: string;
  rastreador_obs?: string;

  // Documentação detalhada do veículo
  estado_registro?: string; // ex: 'SP'
  crlv_ano_exercicio?: number;
  crlv_vencimento?: string;
  crlv_situacao?: 'Em dia' | 'Vencido' | '';
  crlv_digital?: boolean;

  licenciamento_ano_referencia?: number;
  licenciamento_vencimento?: string;
  licenciamento_situacao?: 'Regular' | 'Próximo do vencimento' | 'Vencido' | 'Pendente' | 'Pago' | 'Em análise';
  licenciamento_valor?: number;
  licenciamento_data_pagamento?: string;
  licenciamento_comprovante_url?: string;
  licenciamento_pagar_gerado?: boolean;

  ipva_ano_referencia?: number;
  ipva_valor_total?: number;
  ipva_forma_pagamento?: 'Cota única' | 'Parcelado' | '';
  ipva_vencimento?: string;
  ipva_situacao?: 'Pago' | 'Pendente' | 'Isento' | 'Vencido' | '';
  ipva_parcelado_gerado?: boolean;

  dpvat_ano_referencia?: number;
  dpvat_valor?: number;
  dpvat_data_pagamento?: string;
  dpvat_situacao?: 'Pago' | 'Pendente' | 'Isento' | '';

  multas_quantidade?: number;
  multas_valor_total?: number;
  multas_situacao?: 'Contestada' | 'Paga' | 'Pendente' | 'Recebido' | 'A receber' | '';
  multas_data?: string;

  vistoria_data_ultima?: string;
  vistoria_resultado?: 'Aprovado' | 'Reprovado' | 'Aprovado com apontamento' | '';
  vistoria_vencimento?: string;
  vistoria_km_ultima?: number;

  alienacao_possui?: boolean;
  alienacao_credor?: string;
  alienacao_contrato?: string;
  alienacao_previsao_baixa?: string;
  alienacao_valor_parcela?: number;
  alienacao_data_pagamento?: string;
  alienacao_parcelas_restantes?: number;
  alienacao_parcelas_pagas?: number;

  recall_pendente?: boolean;
  recall_descricao?: string;
  recall_situacao?: 'Realizado' | 'Aguardando' | 'Agendado' | '';
  recall_data?: string;

  ipva_p1_valor?: number;
  ipva_p1_vencimento?: string;
  ipva_p2_valor?: number;
  ipva_p2_vencimento?: string;
  ipva_p3_valor?: number;
  ipva_p3_vencimento?: string;
  ipva_p4_valor?: number;
  ipva_p4_vencimento?: string;
  ipva_p5_valor?: number;
  ipva_p5_vencimento?: string;
  ipva_p6_valor?: number;
  ipva_p6_vencimento?: string;
  ipva_desconto_cota_unica?: number;

  doc_observacoes?: string;
  documentos_anexos?: { id: string; nome: string; url: string; data_upload: string; tamanho?: string }[];

  // Controle de Manutenção Preventiva e Periodicidade
  maint_oleo_km_ultimo?: number;
  maint_oleo_periodo?: number;
  maint_correia_km_ultimo?: number;
  maint_correia_periodo?: number;
  maint_freio_km_ultimo?: number;
  maint_freio_periodo?: number;
  maint_embreagem_km_ultimo?: number;
  maint_embreagem_periodo?: number;
  maint_custom_items?: CustomMaintItem[];
}

import { GeradorFinanceiroParams } from './shared/financeiro/types';

export interface CustomMaintItem {
  id: string;
  label: string;
  emoji: string;
  lastKm: number;
  period: number;
  extendToAll?: boolean;
}

export interface Motorista {
  nome: string;
  cpf: string;
  rg?: string;
  tel: string;
  email: string;
  cnh: string;
  cat: string; // 'B', 'AB', etc.
  cnh_venc: string; // YYYY-MM-DD
  plataforma: string;
  end: string;
  cidade: string;
  emergencia: string;
  status: 'Ativo' | 'Inadimplente' | 'Inativo' | 'Bloqueado';
  tipo_sangue?: string;
  tel_contato?: string;
  nascimento?: string; // YYYY-MM-DD
  estado?: string;
  obs?: string;
  veiculoPlaca?: string;
  cnh_foto?: string;
  foto_perfil?: string;
  cep_fiscal?: string;
  emergencia_grau?: string;
  emergencia_grau_outros?: string;
  end_numero?: string;
  end_complemento?: string;
  end_tipo?: 'Casa' | 'Apartamento' | '';
  end_apartamento?: string;
  end_bloco?: string;
  end_torre?: string;
  end_andar?: string;
  end_predio_nome?: string;
}

export interface HistoricoKmValorContrato {
  id: string;
  dataHora: string;
  usuario: string;
  valorAnterior: number;
  valorNovo: number;
  motivo: string;
  opcaoAplicacao: 'Futuras' | 'RecalcularAbertas';
}

export interface Contrato {
  id: string; // ex: "#001"
  motoristaCpf: string;
  veiculoPlaca: string;
  inicio: string; // YYYY-MM-DD
  fim?: string; // YYYY-MM-DD
  valor: number; // Valor semanal
  diaCobranca: string; // "Segunda-feira", etc.
  caucao: number;
  kmFranquia: number;
  obs: string;
  status: 'Ativo' | 'Suspenso' | 'Finalizado';
  frequencia?: 'Diário' | 'Semanal' | 'Mensal' | 'Anual';
  
  // Recurring payment fields
  isRecorrente?: boolean;
  formaPagamento?: string; // e.g. PIX, Boleto, Cartão, Dinheiro
  valorRecorrente?: number;
  frequenciaRecorrente?: 'Diário' | 'Semanal' | 'Mensal' | 'Anual';
  recorrenteQtd?: number;

  // Controle de Quilometragem
  limiteKm?: number;
  tipoLimiteKm?: 'Por mês' | 'Por semana' | 'Por dia' | 'Por contrato' | 'Personalizado';
  kmInicialContrato?: number;
  kmFinalContrato?: number;
  valorKmExcedente?: number; // R$ por km excedente
  toleranciaKm?: number; // km de tolerância sem cobrança
  regraCobrancaKm?: 'Modo Periódico' | 'No Encerramento do Contrato';
  periodicidadeApuracaoKm?: 'Mensal' | 'Semanal' | 'Final';
  historicoValoresKm?: HistoricoKmValorContrato[];
  finConfig?: GeradorFinanceiroParams;
}

export interface Pagamento {
  id: string; // ex: "#1001"
  motoristaCpf: string;
  veiculoPlaca?: string; // Associated vehicle
  periodo: string; // ex: "01/07 a 07/07"
  valor: number;
  vencimento: string; // YYYY-MM-DD
  dataPagamento?: string; // YYYY-MM-DD
  forma?: string; // "PIX", "Dinheiro", etc.
  status: 'Pago' | 'Pendente' | 'Atrasado';
  categoria?: string; // "Aluguel de Veículo" | "Cobrança de Motorista" or other
  obs?: string;

  // Partial payments & case-by-case interest
  valorOriginal?: number;
  valorPago?: number;
  saldoDevedor?: number;
  taxaJuros?: number; // % rate
  valorJurosAcumulado?: number; // R$ juros
  multaMoraRate?: number; // % fee fine applied once if late
  jurosDiarioRate?: number; // % daily interest rate applied per day of delay

  // Recurring & Outflow indicators
  isRecorrente?: boolean;
  frequenciaRecorrente?: 'Diário' | 'Semanal' | 'Mensal' | 'Anual';
  isDespesa?: boolean; // true = despesa/saída, false/undefined = recebimento de aluguel

  // Installments tracking
  qtdParcelas?: number;
  parcelaNumero?: number;
  valorTotal?: number;
  valorParcela?: number;
}

export interface Manutencao {
  id: string;
  veiculoPlaca: string;
  tipo: string; // "Revisão Preventiva", "Troca de Óleo", etc.
  desc: string;
  data: string; // YYYY-MM-DD
  custo: number;
  oficina: string;
  km: number;
  status: 'Concluída' | 'Em Andamento' | 'Agendada';
  formaPagamento?: string; // "Pix", "Boleto", "Cartão", etc.
  modoPagamento?: 'À Vista' | 'Parcelado' | 'Cortesia' | ''; // Modo de pagamento
  qtdParcelas?: number; // Quantidade de parcelas se for parcelado
  finConfig?: GeradorFinanceiroParams;
}

export interface Documento {
  id: string;
  veiculoPlaca: string;
  tipo: string; // "CRLV", "IPVA", "Licenciamento", "Seguro", "Multas", "Contrato", "Laudo de vistoria", "Comprovante", "Certidão"
  numero: string;
  emissao?: string;
  vencimento?: string;
  status: 'Válido' | 'Vencido' | 'A vencer';
  obs?: string;
  motoristaCpf?: string;
  multa_status_condutor?: 'pendente' | 'enviado' | 'paga_dobrado';
  multa_data_indicacao?: string;
  url?: string;
}

export interface Seguradora {
  id: string;
  nome: string;
  cnpj: string;
  tel: string;
  email: string;
  end: string;
  responsavel: string;
  obs?: string;
  finConfig?: GeradorFinanceiroParams;
}

export interface Apolice {
  id: string;
  veiculoPlaca: string;
  seguradoraId: string;
  numero: string;
  cobertura: string;
  franquia: number;
  valor: number;
  inicio: string;
  vencimento: string;
  status: 'Ativa' | 'Vencida' | 'Renovada' | 'Cancelada';
  obs?: string;
  finConfig?: GeradorFinanceiroParams;
}

export interface Rastreador {
  id: string;
  veiculoPlaca: string;
  marca: string;
  modelo: string;
  imei: string;
  operadora: string;
  instalacao: string;
  planoMensal: string;
  valorMensal: number;
  status: 'Ativo' | 'Inativo' | 'Em Manutenção';
  ultimaAtualizacao: string;
  obs?: string;
  chip_valor?: number;
  chip_vencimento?: string;
  empresa_valor?: number;
  empresa_vencimento?: string;
  aparelho_frequencia?: 'Mensal' | 'Anual' | 'Única';
  aparelho_forma?: string;
  chip_frequencia?: 'Mensal' | 'Anual' | 'Única';
  chip_forma?: string;
  empresa_frequencia?: 'Mensal' | 'Anual' | 'Única';
  empresa_forma?: string;
}

export interface Acessorio {
  id: string;
  veiculoPlaca: string;
  nome: string;
  tipo: string;
  qtd: number;
  valor: number;
  instalacao: string;
  garantia: string;
  status: 'Ativo' | 'Inativo' | 'Em manutenção';
  obs?: string;
  finConfig?: GeradorFinanceiroParams;
}

export interface ArquivoMortoItem {
  id: string;
  tipo: 'Veículo' | 'Motorista' | 'Contrato' | 'Pagamento' | 'Manutenção' | 'Documento' | 'Seguradora' | 'Apólice' | 'Rastreador' | 'Acessório';
  originalId: string;
  dados: any;
  arquivado_em: string;
  arquivado_por: string;
  motivo_arquivamento: string;
}

export function getFormattedAddress(m: {
  end: string;
  end_numero?: string;
  end_complemento?: string;
  end_tipo?: 'Casa' | 'Apartamento' | '';
  end_apartamento?: string;
  end_bloco?: string;
  end_torre?: string;
  end_andar?: string;
  end_predio_nome?: string;
  cidade?: string;
  estado?: string;
}) {
  if (!m.end) return '—';
  let addr = m.end;
  if (m.end_numero) {
    addr += `, Nº ${m.end_numero}`;
  }
  if (m.end_complemento) {
    addr += ` (${m.end_complemento})`;
  }
  if (m.end_tipo === 'Apartamento') {
    const details = [];
    if (m.end_predio_nome) details.push(`Cond. ${m.end_predio_nome}`);
    if (m.end_torre) details.push(`Torre ${m.end_torre}`);
    if (m.end_bloco) details.push(`Bloco ${m.end_bloco}`);
    if (m.end_andar) details.push(`${m.end_andar}º Andar`);
    if (m.end_apartamento) details.push(`Apto ${m.end_apartamento}`);
    if (details.length > 0) {
      addr += ` - ${details.join(', ')}`;
    }
  }
  if (m.cidade) {
    addr += `, ${m.cidade}`;
  }
  if (m.estado) {
    addr += ` - ${m.estado}`;
  }
  return addr;
}

export function formatBRL(val: number): string {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val);
}

// ==========================================
// MÓDULO FINANCEIRO — INTERFACES COMPLETAS
// ==========================================

export type StatusContaReceber = 
  | 'Em aberto' 
  | 'Parcialmente recebido' 
  | 'Recebido' 
  | 'Vencido' 
  | 'Cancelado' 
  | 'Renegociado';

export type StatusContaPagar = 
  | 'Em aberto' 
  | 'Parcialmente pago' 
  | 'Pago' 
  | 'Vencido' 
  | 'Cancelado' 
  | 'Contestação' 
  | 'Renegociado';

export interface AnexoFinanceiro {
  id: string;
  nome: string;
  url: string;
  dataUpload: string;
}

export interface HistoricoFinanceiroItem {
  id: string;
  dataHora: string;
  usuario: string;
  acao: string; // Ex: 'Criado', 'Recebido', 'Pago', 'Editado', 'Cancelado', 'Estornado', 'Renegociado'
  valorAnterior?: number;
  valorNovo?: number;
  observacao?: string;
}

export interface ContaReceber {
  id: string;
  numeroLancamento: string; // Ex: "REC-2026-001"
  descricao: string;
  clienteResponsavel: string;
  motoristaCpf?: string;
  contratoId?: string;
  veiculoPlaca?: string;
  categoria: string; // Ex: 'Aluguel de Veículo', 'Caução', 'Cobrança Extra', 'Multa Repassada', etc.
  subcategoria?: string;
  centroCusto: string; // Ex: 'Frota Principal', 'Administrativo', 'Operacional'
  valorOriginal: number;
  desconto: number;
  acrescimo: number;
  juros: number;
  multa: number;
  valorFinal: number;
  valorRecebido: number;
  saldoDevedor: number;
  dataEmissao: string; // YYYY-MM-DD
  dataVencimento: string; // YYYY-MM-DD
  dataPrevistaRecebimento?: string;
  dataRealRecebimento?: string;
  formaPagamento?: string; // Dinheiro, PIX, Transferência, Boleto, Cartão, Débito, Crédito, Outro
  status: StatusContaReceber;
  periodicidade?: 'Única' | 'Diária' | 'Semanal' | 'Quinzenal' | 'Mensal' | 'Personalizada';
  observacoes?: string;
  anexos?: AnexoFinanceiro[];
  historico?: HistoricoFinanceiroItem[];
  origemTipo?: 'contrato' | 'manual' | 'recorrente' | 'outro';
  origemId?: string;
}

export interface ContaPagar {
  id: string;
  numeroLancamento: string; // Ex: "PAG-2026-001"
  descricao: string;
  fornecedor: string;
  cnpjCpfFornecedor?: string;
  veiculoPlaca?: string;
  motoristaCpf?: string;
  contratoId?: string;
  categoria: 'DOCUMENTAÇÃO' | 'SEGURO' | 'RASTREADOR' | 'MANUTENÇÃO' | 'MULTAS E INFRAÇÕES' | 'OUTRAS DESPESAS';
  subcategoria: string; // Ex: IPVA, Licenciamento, Apólice, Franquia, Mensalidade, Revisão, Peças, Guincho, Multas, Combustível, etc.
  centroCusto: string;
  numeroNotaFiscal?: string;
  numeroDocumento?: string;
  valorOriginal: number;
  desconto: number;
  juros: number;
  multa: number;
  valorFinal: number;
  valorPago: number;
  saldoDevedor: number;
  dataEmissao: string; // YYYY-MM-DD
  dataVencimento: string; // YYYY-MM-DD
  dataPrevistaPagamento?: string;
  dataRealPagamento?: string;
  formaPagamento?: string;
  status: StatusContaPagar;
  periodicidade?: 'Única' | 'Diária' | 'Semanal' | 'Quinzenal' | 'Mensal' | 'Anual' | 'Personalizada';
  observacoes?: string;
  anexos?: AnexoFinanceiro[];
  historico?: HistoricoFinanceiroItem[];
  origemTipo?: 'seguro' | 'rastreador' | 'manutencao' | 'multa' | 'documentacao' | 'manual';
  origemId?: string;
}

export interface CategoriaFinanceira {
  id: string;
  nome: string;
  tipo: 'Receita' | 'Despesa';
  subcategorias: string[];
  centroCustoPadrao?: string;
  icone?: string;
}

export interface FormaPagamentoItem {
  id: string;
  nome: string;
  taxaPercentual: number;
  diasCompensacao: number;
  ativa: boolean;
  obs?: string;
  finConfig?: GeradorFinanceiroParams;
}

export interface RegistroInadimplenciaContato {
  id: string;
  motoristaCpf: string;
  dataHora: string;
  tipoContato: 'Telefone' | 'WhatsApp' | 'E-mail' | 'Presencial' | 'Notificação';
  observacao: string;
  usuario: string;
  acordoRealizado?: boolean;
  valorAcordo?: number;
  novaDataVencimento?: string;
}

// ==========================================
// REGRAS DETRAN/SP E CALENDÁRIOS OFICIAIS
// ==========================================

export type CategoriaVeiculoDetran = 
  | 'Automóveis'
  | 'Camionetas'
  | 'Caminhonetes'
  | 'Ônibus'
  | 'Micro-ônibus'
  | 'Motos'
  | 'Caminhões'
  | 'Caminhões-tratores'
  | 'Outros';

export interface VencimentoParcelaDetran {
  numero: number;
  vencimento: string; // YYYY-MM-DD
}

export interface DetranRegra {
  id: string;
  estado: string; // 'SP'
  ano: number; // ex: 2026
  tipo: 'IPVA' | 'Licenciamento';
  categoriaVeiculo: CategoriaVeiculoDetran;
  finalPlaca: number; // 0..9
  dataVencimentoCotaUnicaDesconto?: string; // YYYY-MM-DD
  dataVencimentoCotaUnica?: string; // YYYY-MM-DD
  parcelasMaximas: number;
  vencimentoParcelas?: VencimentoParcelaDetran[];
  fonteOficial?: string;
  dataPublicacao?: string;
  dataUltimaAtualizacao?: string;
  status: 'Ativo' | 'Rascunho' | 'Arquivado';
}

export interface DetranCalendarioExercicio {
  ano: number;
  estado: string; // 'SP'
  status: 'Publicado Oficial' | 'Pendente de Atualização' | 'Rascunho';
  dataUltimaAtualizacao: string;
  fonteOficial: string;
  observacoes?: string;
}

// ==========================================
// CONTROLE DE QUILOMETRAGEM E APURAÇÃO KM
// ==========================================

export type OrigemKmRegistro = 
  | 'Registro Manual' 
  | 'Entrega do Veículo' 
  | 'Devolução do Veículo' 
  | 'Vistoria' 
  | 'Manutenção' 
  | 'Atualização Periódica' 
  | 'Integração Externa';

// ==========================================
// DOCUMENTOS DO MOTORISTA (PDF UPLOADS)
// ==========================================

export type TipoDocumentoMotorista = 
  | 'CNH' 
  | 'RG' 
  | 'CPF' 
  | 'Comprovante de endereço' 
  | 'Contrato' 
  | 'Comprovante de pagamento'
  | 'Documento de identificação' 
  | 'Certificado' 
  | 'Declaração' 
  | 'Outro';

export interface HistoricoDocumentoMotorista {
  id: string;
  dataHora: string; // ISO
  usuario: string;
  acao: 'Upload' | 'Visualização' | 'Download' | 'Substituição' | 'Arquivamento' | 'Exclusão' | 'Restauração';
  versao: number;
  motivo?: string;
  detalhes?: string;
}

export interface DocumentoMotorista {
  id: string;
  motoristaCpf: string;
  tipo: TipoDocumentoMotorista;
  nomeOriginal: string;
  nomeInterno: string;
  descricaoOutro?: string;
  observacao?: string;
  tamanhoBytes: number;
  dataEnvio: string; // ISO
  dataAtualizacao: string; // ISO
  usuarioResponsavel: string;
  status: 'Ativo' | 'Arquivado' | 'Excluído';
  historico: HistoricoDocumentoMotorista[];
}

export interface KmRegistro {
  id: string;
  veiculoPlaca: string;
  contratoId?: string;
  motoristaCpf?: string;
  dataHora: string; // ISO string YYYY-MM-DDTHH:mm
  km: number;
  kmAnterior: number;
  kmPercorridos: number;
  usuario: string;
  origem: OrigemKmRegistro;
  observacao?: string;
  fotoPainelUrl?: string;
  isCorrecaoAprovada?: boolean;
  motivoCorrecao?: string;
}

export interface ApuracaoKmCobranca {
  id: string; // Chave única ex: "km-excedente-#001-2026-08"
  contratoId: string;
  veiculoPlaca: string;
  motoristaCpf: string;
  dataInicial: string;
  dataFinal: string;
  kmInicial: number;
  kmFinal: number;
  kmUtilizado: number;
  limiteContratado: number;
  toleranciaKm: number;
  kmExcedente: number;
  valorPorKm: number;
  valorTotalExcedente: number;
  contaReceberId?: string;
  dataApuracao: string;
  tipoApuracao: 'Periódica' | 'Final Encerramento';
  status: 'Cobrado' | 'Cancelado';
}

export interface KmAuditLog {
  id: string;
  dataHora: string;
  usuario: string;
  acao: string; // 'Cadastro KM', 'Correção KM', 'Alteração Limite KM', 'Alteração Valor KM Excedente', 'Cobrança Gerada', 'Recálculo'
  veiculoPlaca?: string;
  contratoId?: string;
  valorAnterior?: string | number;
  valorNovo?: string | number;
  motivo?: string;
}

export interface PlanilhaBackupDetails {
  veiculos: number;
  motoristas: number;
  contratos: number;
  pagamentos: number;
  manutencoes: number;
  contasReceber: number;
  contasPagar: number;
  documentos: number;
  seguradoras: number;
  apolices: number;
  rastreadores: number;
  acessorios: number;
  arquivoMorto: number;
  kmRegistros: number;
  apuracoesKm: number;
  kmAuditLogs: number;
  totalGeral: number;
}

export interface PlanilhaBackupSnapshot {
  veiculos: Veiculo[];
  motoristas: Motorista[];
  contratos: Contrato[];
  pagamentos: Pagamento[];
  manutencoes: Manutencao[];
  contasReceber: ContaReceber[];
  contasPagar: ContaPagar[];
  documentos: Documento[];
  seguradoras: Seguradora[];
  apolices: Apolice[];
  rastreadores: Rastreador[];
  acessorios: Acessorio[];
  arquivoMorto: ArquivoMortoItem[];
  kmRegistros: KmRegistro[];
  apuracoesKm: ApuracaoKmCobranca[];
  kmAuditLogs: KmAuditLog[];
}

export interface PlanilhaBackup {
  id: string;
  nomePlanilha: string;
  dataHora: string;
  usuarioResponsavel: string;
  quantidadeRegistrosTotal: number;
  detalhesRegistros: PlanilhaBackupDetails;
  periodoInicio?: string;
  periodoFim?: string;
  dadosSnapshot: PlanilhaBackupSnapshot;
  motivoExclusao?: string;
}

export interface PlanilhaResetAuditLog {
  id: string;
  usuario: string;
  dataHora: string;
  nomePlanilha: string;
  quantidadeRegistrosRemovidos: number;
  backupId: string;
  motivo?: string;
  tipoAcao: 'ZERAR_PLANILHA' | 'RESTAURAR_BACKUP';
}





