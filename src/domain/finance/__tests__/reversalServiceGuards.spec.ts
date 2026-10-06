import { describe, expect, it } from 'vitest';
import { ReversalService } from '../ReversalService';
import type { ITransactionContext } from '../ITransactionContext';
import type { FinancialTransaction, User } from '../../../types/entities';
import { TransactionType, UserRole } from '../../../types/enums';

// Rede de regressao das GUARDAS do ReversalService (AUTOERP-45, camada 2).
//
// Por que existe: a revisao concluiu que o estorno e o melhor codigo do
// projeto, porque exige a prova da baixa e RECUSA operar sem ela, e mandou nao
// encostar nele. Mas dois trabalhos da semana precisam mexer exatamente aqui -
// extrair as ~35 rotas financeiras do server.ts (AUTOERP-39) e tirar a
// composicao de baixa de dentro de audit_logs (AUTOERP-24) - e os dois dependem
// deste card. Com esta rede, uma guarda que caia no caminho aparece como teste
// vermelho em segundos, em vez de aparecer como dinheiro estornado errado.
//
// Como: todas as guardas sao private static, entao sao exercitadas pela porta
// da frente, por reverseTransaction, que recebe o txContext como PARAMETRO.
// Isso dispensa banco e dispensa stub de modulo. A autorizacao, com contexto,
// usa txContext.getUserRepo().findById(), entao um repositorio falso resolve.

const EMPRESA = 'empresa-a';
const OUTRA_EMPRESA = 'empresa-b';
const USUARIO = 'usuario-1';
const TRANSACAO = 'tx-original-1';
const CHAVE = 'chave-de-comando-1';

const usuarioValido = (over: Partial<User> = {}): User => ({
  id: USUARIO,
  companyId: EMPRESA,
  name: 'Operador',
  email: 'operador@teste.invalid',
  role: UserRole.ADMIN,
  active: true,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  ...over,
});

const transacaoOriginal = (over: Partial<FinancialTransaction> = {}): FinancialTransaction => ({
  id: TRANSACAO,
  companyId: EMPRESA,
  financialAccountId: 'conta-1',
  type: TransactionType.INCOME,
  amount: 500,
  paymentMethodId: 'pix',
  transactionDate: '2026-10-01',
  competenceDate: '2026-10-01',
  description: 'Aluguel outubro',
  isReversed: false,
  createdById: USUARIO,
  createdAt: '2026-10-01T00:00:00.000Z',
  updatedAt: '2026-10-01T00:00:00.000Z',
  ...over,
});

/** Contexto falso com apenas o que as guardas alcancam antes das travas. */
function contexto(opcoes: {
  usuario?: User | null;
  original?: FinancialTransaction | null;
  existente?: FinancialTransaction | null;
  semBuscaComTrava?: boolean;
} = {}): ITransactionContext {
  const { usuario = usuarioValido(), original = transacaoOriginal(), existente = null } = opcoes;
  const parcial: Record<string, unknown> = {
    getUserRepo: () => ({ findById: async () => usuario }),
    findFinancialTransactionByIdempotencyKey: async () => existente,
    findFinancialAccountByIdWithLock: async () => null,
  };
  if (!opcoes.semBuscaComTrava) {
    parcial.findFinancialTransactionByIdWithLock = async () => original;
  }
  return parcial as unknown as ITransactionContext;
}

/** Chamada completa, com um unico parametro variado por caso. */
const estornar = (over: Partial<{
  companyId: string; transactionId: string; valor: number; motivo: string;
  userId: string; chave: string | undefined; ctx: ITransactionContext | undefined;
}> = {}) => {
  const p = {
    companyId: EMPRESA, transactionId: TRANSACAO, valor: 100, motivo: 'erro de lancamento',
    userId: USUARIO, chave: CHAVE as string | undefined, ctx: contexto() as ITransactionContext | undefined,
    ...over,
  };
  return ReversalService.reverseTransaction(
    p.companyId, p.transactionId, p.valor, p.motivo, p.userId, 'Operador', p.ctx, p.chave
  );
};

describe('autorizacao', () => {
  it('recusa sem companyId', async () => {
    await expect(estornar({ companyId: '' })).rejects.toThrow('companyId é obrigatório');
  });

  it('recusa sem usuario informado', async () => {
    await expect(estornar({ userId: '' })).rejects.toThrow('Usuário não informado');
  });

  it('recusa quando o usuario nao existe', async () => {
    await expect(estornar({ ctx: contexto({ usuario: null }) })).rejects.toThrow('Usuário não encontrado');
  });

  it('recusa usuario de OUTRA empresa, mesmo com papel de admin', async () => {
    const ctx = contexto({ usuario: usuarioValido({ companyId: OUTRA_EMPRESA }) });
    await expect(estornar({ ctx })).rejects.toThrow('Tenant incorreto ou descompasso de empresa');
  });

  it('recusa usuario inativo', async () => {
    const ctx = contexto({ usuario: usuarioValido({ active: false }) });
    await expect(estornar({ ctx })).rejects.toThrow('inativo ou suspenso');
  });

  it('recusa papel sem permissao de estorno', async () => {
    const ctx = contexto({ usuario: usuarioValido({ role: UserRole.READONLY }) });
    await expect(estornar({ ctx })).rejects.toThrow('Permissão insuficiente (FINANCIAL_REVERSAL)');
  });
});

describe('validacao de entrada', () => {
  it('recusa valor zero', async () => {
    await expect(estornar({ valor: 0 })).rejects.toThrow('Valor de estorno inválido');
  });

  it('recusa valor negativo', async () => {
    await expect(estornar({ valor: -1 })).rejects.toThrow('Valor de estorno inválido');
  });

  it('recusa valor nao finito', async () => {
    await expect(estornar({ valor: Number.NaN })).rejects.toThrow('Valor de estorno inválido');
  });

  it('recusa transacao sem identificador', async () => {
    await expect(estornar({ transactionId: '' })).rejects.toThrow('Transação não encontrada');
  });

  it('recusa motivo vazio', async () => {
    await expect(estornar({ motivo: '   ' })).rejects.toThrow('Motivo do estorno é obrigatório');
  });

  it('recusa motivo acima de 1000 caracteres', async () => {
    await expect(estornar({ motivo: 'x'.repeat(1001) })).rejects.toThrow('Motivo do estorno é obrigatório');
  });
});

describe('idempotencia', () => {
  it('EXIGE chave de comando quando ha contexto transacional', async () => {
    await expect(estornar({ chave: undefined })).rejects.toThrow('Chave de idempotência do estorno é obrigatória');
  });

  it('recusa chave acima de 200 caracteres', async () => {
    await expect(estornar({ chave: 'k'.repeat(201) })).rejects.toThrow('Chave de idempotência do estorno é obrigatória');
  });

  it('devolve o estorno JA EXISTENTE em vez de estornar de novo', async () => {
    // Repeticao do mesmo comando com a mesma chave: a transacao anterior volta,
    // e nenhum estorno novo e criado.
    const original = transacaoOriginal();
    const existente = transacaoOriginal({
      id: 'tx-estorno-1',
      type: TransactionType.REVERSAL,
      reversalTransactionId: original.id,
      amount: 100,
      description: `ESTORNO (erro de lancamento): ${original.description}`,
    });
    const resultado = await estornar({ ctx: contexto({ original, existente }) });
    expect(resultado.id).toBe('tx-estorno-1');
    expect(resultado.type).toBe(TransactionType.REVERSAL);
  });

  it('recusa a MESMA chave usada com comando DIFERENTE', async () => {
    // assertRetryMatches compara 11 campos; aqui varia so o valor, para provar
    // que a comparacao e real e nao apenas a existencia da chave.
    const original = transacaoOriginal();
    const existente = transacaoOriginal({
      id: 'tx-estorno-1',
      type: TransactionType.REVERSAL,
      reversalTransactionId: original.id,
      amount: 999,
      description: `ESTORNO (erro de lancamento): ${original.description}`,
    });
    await expect(estornar({ ctx: contexto({ original, existente }) })).rejects.toThrow(
      'Chave de idempotência reutilizada com comando de estorno diferente'
    );
  });
});

describe('capacidades do contexto transacional', () => {
  it('recusa contexto incompleto, em vez de operar pela metade', async () => {
    await expect(estornar({ ctx: contexto({ semBuscaComTrava: true }) })).rejects.toThrow(
      'Autoridade transacional de estorno indisponível'
    );
  });
});

describe('identidade da transacao original', () => {
  it('recusa quando a transacao nao e encontrada', async () => {
    await expect(estornar({ ctx: contexto({ original: null }) })).rejects.toThrow('Transação não encontrada');
  });

  it('recusa transacao de OUTRA empresa', async () => {
    const ctx = contexto({ original: transacaoOriginal({ companyId: OUTRA_EMPRESA }) });
    await expect(estornar({ ctx })).rejects.toThrow('Transação pertence a outra empresa');
  });

  it('recusa estornar um estorno', async () => {
    const ctx = contexto({ original: transacaoOriginal({ type: TransactionType.REVERSAL }) });
    await expect(estornar({ ctx })).rejects.toThrow('Transação do tipo REVERSAL não pode ser estornada');
  });
});
