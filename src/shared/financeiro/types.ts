export type GeradorModalidade = 'À vista' | 'Parcelado' | 'Recorrente';
export type GeradorPeriodicidade = 'Diária' | 'Semanal' | 'Quinzenal' | 'Mensal' | 'Bimestral' | 'Trimestral' | 'Semestral' | 'Anual' | 'Personalizada';

export interface ParcelaManual {
  numero: number;
  valor: number;
  vencimento: string; // YYYY-MM-DD
  observacao?: string;
}

export interface GeradorFinanceiroParams {
  tipo: 'Receita' | 'Despesa';
  modalidade: GeradorModalidade;
  valorTotal: number;
  dataPrimeiroVencimento: string; // YYYY-MM-DD
  formaPagamento: string;
  observacaoGeral: string;

  // Parcelado
  qtdParcelas: number;
  periodicidade: GeradorPeriodicidade;
  parcelasManuais: ParcelaManual[];
  modoDivisao: 'Igual' | 'Personalizado';

  // Recorrente
  dataFimRecorrencia?: string;
  semDataFim: boolean;
}
