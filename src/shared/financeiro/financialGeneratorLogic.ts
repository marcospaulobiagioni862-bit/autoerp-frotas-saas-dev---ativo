import { ContaPagar, ContaReceber } from '../../types';
import { GeradorFinanceiroParams, ParcelaManual } from './types';

// Utility to add months to a date, avoiding skipping months incorrectly (e.g. Jan 31 -> Feb 28)
function addMonthsCorrectly(dateStr: string, months: number): string {
  const d = new Date(dateStr + 'T12:00:00Z');
  const day = d.getUTCDate();
  d.setUTCMonth(d.getUTCMonth() + months);
  
  // if day changed, it means we overflowed (e.g. Jan 31 + 1 month -> Mar 3)
  if (d.getUTCDate() !== day) {
    d.setUTCDate(0); // go back to last day of previous month
  }
  return d.toISOString().split('T')[0];
}

function addDays(dateStr: string, days: number): string {
  const d = new Date(dateStr + 'T12:00:00Z');
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().split('T')[0];
}

export function buildParcelas(params: GeradorFinanceiroParams): ParcelaManual[] {
  if (params.modalidade === 'À vista') {
    return [{ numero: 1, valor: params.valorTotal, vencimento: params.dataPrimeiroVencimento }];
  }

  if (params.modalidade === 'Parcelado' && params.modoDivisao === 'Personalizado') {
    return params.parcelasManuais;
  }

  if (params.modalidade === 'Recorrente') {
    // We only generate upfront up to 12 months for Recurrent, 
    // or until the end date if it's less than 12 months.
    let occurrences = 12; // default generate 12
    if (!params.semDataFim && params.dataFimRecorrencia) {
      // rough calculation of occurrences based on period
      // for now, just generate up to dataFimRecorrencia or max 60 to be safe
      occurrences = 60;
    }
    const parcelas: ParcelaManual[] = [];
    let currentVenc = params.dataPrimeiroVencimento;
    for (let i = 1; i <= occurrences; i++) {
      if (!params.semDataFim && params.dataFimRecorrencia && currentVenc > params.dataFimRecorrencia) {
        break;
      }
      parcelas.push({ numero: i, valor: params.valorTotal, vencimento: currentVenc });
      currentVenc = getNextDate(currentVenc, params.periodicidade);
    }
    return parcelas;
  }

  // Parcelado, Divisão Igual
  const parcelas: ParcelaManual[] = [];
  const baseValue = Math.floor((params.valorTotal / params.qtdParcelas) * 100) / 100;
  let remainder = params.valorTotal - (baseValue * params.qtdParcelas);
  remainder = Math.round(remainder * 100) / 100;

  let currentVenc = params.dataPrimeiroVencimento;
  for (let i = 1; i <= params.qtdParcelas; i++) {
    let valor = baseValue;
    if (i === params.qtdParcelas) {
      valor += remainder; // add remainder to last parcel
      valor = Math.round(valor * 100) / 100;
    }
    parcelas.push({ numero: i, valor, vencimento: currentVenc });
    currentVenc = getNextDate(currentVenc, params.periodicidade);
  }
  return parcelas;
}

function getNextDate(dateStr: string, periodicidade: string): string {
  switch (periodicidade) {
    case 'Diária': return addDays(dateStr, 1);
    case 'Semanal': return addDays(dateStr, 7);
    case 'Quinzenal': return addDays(dateStr, 15);
    case 'Mensal': return addMonthsCorrectly(dateStr, 1);
    case 'Bimestral': return addMonthsCorrectly(dateStr, 2);
    case 'Trimestral': return addMonthsCorrectly(dateStr, 3);
    case 'Semestral': return addMonthsCorrectly(dateStr, 6);
    case 'Anual': return addMonthsCorrectly(dateStr, 12);
    default: return addMonthsCorrectly(dateStr, 1);
  }
}

export function generateKey(
  tipo: 'DESPESA' | 'RECEITA',
  origem: string,
  origemId: string,
  veiculoPlaca: string,
  motoristaCpf: string,
  contratoId: string,
  numeroParcela: number,
  periodoReferencia: string
): string {
  return `${tipo}-${origem}-${origemId}-${veiculoPlaca || 'NOV'}-${motoristaCpf || 'NOM'}-${contratoId || 'NOC'}-PARCELA${String(numeroParcela).padStart(2,'0')}-${periodoReferencia}`;
}
