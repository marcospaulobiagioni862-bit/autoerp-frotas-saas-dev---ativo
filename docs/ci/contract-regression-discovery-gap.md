# Contract regression discovery gap

Checkpoint técnico identificado durante #441/#445.

O workflow ativo `.github/workflows/autoerp-pr-gates.yml` executa regressões por uma lista explícita de comandos `npx tsx`. Novos arquivos de regressão em `src/server/__tests__/` não são descobertos automaticamente.

Impacto imediato:
- `contractCloseBindingRegression.ts` (#441) não é executado pelo gate atual;
- `contractCloseFutureDateRegression.ts` (#445) não é executado pelo gate atual;
- CI verde nesses PRs não deve ser tratado como prova desses casos até que os testes sejam explicitamente executados/integrados.

Opções futuras seguras:
1. consolidar as regressões de lifecycle no runner autoritativo de contratos; ou
2. criar um agregador estável de regressões de contrato chamado uma única vez pelo workflow.

Não alterar o workflow apenas para cada novo arquivo de regressão; preferir agregação estável para reduzir manutenção e risco de falso verde.
