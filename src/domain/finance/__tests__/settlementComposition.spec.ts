import { describe, expect, it } from 'vitest';
import {
  adjustment,
  determinePrincipalLiquidated,
  requestedAdjustments,
  reverseSettlementState,
  settlementState,
  type SettlementComposition,
  type SettlementState,
} from '../settlementComposition';
import { ObligationStatus } from '../../../types/enums';

// Rede de regressao sobre a composicao de baixa e estorno.
//
// Por que existe: a revisao do AutoERP concluiu que este e o melhor codigo do
// projeto - a baixa grava um retrato completo do titulo antes e depois, e o
// estorno exige essa prova, recusa operar sem ela e confere campo a campo se o
// estado reconstruido bate com o retrato anterior. A secao "o que esta certo e
// deve ser preservado" do relatorio manda explicitamente NAO encostar aqui.
//
// Acontece que dois trabalhos da semana precisam mexer exatamente nesta area:
// extrair as ~35 rotas financeiras do server.ts, e tirar a composicao de baixa
// de dentro da tabela audit_logs. Esta suite e a rede que torna esses dois
// trabalhos uma mudanca verificavel em vez de uma aposta.

const estado = (over: Partial<SettlementState> = {}): SettlementState => ({
  fineAmount: 0,
  interestAmount: 0,
  additionalAmount: 0,
  discountAmount: 0,
  paidAmount: 0,
  updatedAmount: 1000,
  balanceAmount: 1000,
  status: ObligationStatus.PENDING,
  ...over,
});

const composicao = (over: Partial<SettlementComposition> = {}): SettlementComposition => ({
  version: 1,
  transactionId: 'tx-1',
  obligationId: 'cr-1',
  requested: { fineAmount: 0, interestAmount: 0, discountAmount: 0 },
  applied: { fineAmount: 0, interestAmount: 0, additionalAmount: 0, discountAmount: 0 },
  movementAmount: 400,
  balanceReduction: 400,
  before: estado(),
  after: estado({ paidAmount: 400, balanceAmount: 600, status: ObligationStatus.PARTIALLY_PAID }),
  ...over,
});

describe('adjustment', () => {
  it('trata ausencia de valor como zero, em vez de NaN', () => {
    expect(adjustment(null)).toBe(0);
    expect(adjustment(undefined)).toBe(0);
  });

  it('arredonda para centavos', () => {
    expect(adjustment(10.005)).toBe(10.01);
    expect(adjustment('12.344')).toBe(12.34);
  });

  it('recusa valor negativo, nao numerico ou acima do teto', () => {
    expect(() => adjustment(-0.01)).toThrow('Ajuste financeiro inválido');
    expect(() => adjustment('abc')).toThrow('Ajuste financeiro inválido');
    expect(() => adjustment(Infinity)).toThrow('Ajuste financeiro inválido');
    expect(() => adjustment(10_000_000_000)).toThrow('Ajuste financeiro inválido');
  });
});

describe('requestedAdjustments', () => {
  it('preserva a diferenca entre juros AUSENTE e juros ZERO', () => {
    // A distincao importa: ausente significa "calcule", zero significa "nao ha".
    expect(requestedAdjustments({}).interestAmount).toBeNull();
    expect(requestedAdjustments({ interestAmount: 0 }).interestAmount).toBe(0);
    expect(requestedAdjustments({}).dailyInterestAmount).toBeNull();
  });

  it('recusa modalidade de liquidacao que nao seja booleana', () => {
    expect(() =>
      requestedAdjustments({ settleRemainingBalance: 'sim' as unknown as boolean })
    ).toThrow('Modalidade de liquidação inválida');
  });
});

describe('settlementState', () => {
  it('assume zero quando o acrescimo nao esta presente', () => {
    expect(settlementState({ fineAmount: 1, interestAmount: 2, discountAmount: 3, paidAmount: 4, updatedAmount: 5, balanceAmount: 6, status: ObligationStatus.PENDING }).additionalAmount).toBe(0);
  });
});

describe('determinePrincipalLiquidated', () => {
  const base = { ...estado(), originalAmount: 1000 };
  const semAjuste = { fineAmount: 0, interestAmount: 0, additionalAmount: 0, discountAmount: 0 };

  it('aloca o principal quando nao havia ajuste anterior e cabe no saldo', () => {
    expect(determinePrincipalLiquidated(base, semAjuste, 400)).toBe(400);
  });

  it('devolve nulo em vez de chutar quando o caixa recebido e menor que os encargos aplicados', () => {
    // Pagamento parcial menor que a multa aplicada: ele reduz a divida, mas a
    // alocacao de principal e indeterminada - e nao pode bloquear a baixa.
    expect(determinePrincipalLiquidated(base, { ...semAjuste, fineAmount: 500 }, 100)).toBeNull();
  });

  it('reconhece a quitacao integral quando ja existiam encargos no titulo', () => {
    const comEncargos = { ...estado({ fineAmount: 50, updatedAmount: 1050, balanceAmount: 1050 }), originalAmount: 1000 };
    expect(determinePrincipalLiquidated(comEncargos, semAjuste, 1050)).toBe(1000);
  });

  it('nao chuta principal quando o titulo ja tinha encargos e o pagamento e parcial', () => {
    const comEncargos = { ...estado({ fineAmount: 50, updatedAmount: 1050, balanceAmount: 1050 }), originalAmount: 1000 };
    expect(determinePrincipalLiquidated(comEncargos, semAjuste, 300)).toBeNull();
  });
});

describe('reverseSettlementState', () => {
  it('recusa estorno PARCIAL de baixa que teve ajuste', () => {
    // E a invariante mais importante do modulo: com multa ou desconto na baixa,
    // estornar pela metade deixaria o titulo num estado que ninguem consegue
    // reconstruir.
    const comp = composicao({ applied: { fineAmount: 50, interestAmount: 0, additionalAmount: 0, discountAmount: 0 } });
    expect(() => reverseSettlementState(estado({ paidAmount: 400, fineAmount: 50 }), comp, 200, 0)).toThrow(
      'Baixa com ajustes exige estorno integral'
    );
  });

  it('recusa segundo estorno de baixa que teve ajuste, mesmo somando o valor integral', () => {
    const comp = composicao({ applied: { fineAmount: 50, interestAmount: 0, additionalAmount: 0, discountAmount: 0 } });
    expect(() => reverseSettlementState(estado({ paidAmount: 400 }), comp, 200, 200)).toThrow(
      'Baixa com ajustes exige estorno integral'
    );
  });

  it('restaura EXATAMENTE o retrato anterior no estorno integral com ajustes', () => {
    const antes = estado();
    const comp = composicao({
      applied: { fineAmount: 50, interestAmount: 10, additionalAmount: 0, discountAmount: 20 },
      movementAmount: 440,
      before: antes,
    });
    const atual = estado({
      fineAmount: 50,
      interestAmount: 10,
      discountAmount: 20,
      paidAmount: 440,
      updatedAmount: 1040,
      balanceAmount: 600,
      status: ObligationStatus.PARTIALLY_PAID,
    });
    const resultado = reverseSettlementState(atual, comp, 440, 0);
    expect(resultado).toEqual(antes);
    // O status volta a ser o do retrato, e nao um status recalculado.
    expect(resultado.status).toBe(ObligationStatus.PENDING);
  });

  it('permite estorno parcial quando a baixa nao teve ajuste nenhum', () => {
    const comp = composicao();
    const atual = estado({ paidAmount: 400, balanceAmount: 600, status: ObligationStatus.PARTIALLY_PAID });
    const resultado = reverseSettlementState(atual, comp, 150, 0);
    expect(resultado.paidAmount).toBe(250);
    expect(resultado.balanceAmount).toBe(750);
    expect(resultado.status).toBe(ObligationStatus.PARTIALLY_PAID);
  });

  it('recusa estorno quando o titulo nao tem mais os ajustes que a baixa aplicou', () => {
    // Alguem alterou o titulo depois da baixa: a prova nao corresponde mais.
    const comp = composicao({ applied: { fineAmount: 50, interestAmount: 0, additionalAmount: 0, discountAmount: 0 }, movementAmount: 400 });
    const atual = estado({ fineAmount: 0, paidAmount: 400 });
    expect(() => reverseSettlementState(atual, comp, 400, 0)).toThrow(
      'Composição da baixa não corresponde mais aos ajustes do título'
    );
  });

  it('recusa estorno maior do que o que foi pago', () => {
    const comp = composicao({ movementAmount: 900 });
    expect(() => reverseSettlementState(estado({ paidAmount: 100 }), comp, 900, 0)).toThrow(
      'Estorno incompatível com o estado atual do título'
    );
  });
});
