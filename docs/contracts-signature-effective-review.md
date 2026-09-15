# Contratos: assinatura como início efetivo

## Entrega

Branch: `codex/contracts-signature-effective`, baseada em `b835f45d`.
Alterações locais, sem commit novo, push, merge ou deploy. Nenhuma alteração em main,
produção, arquivos de Veículos/Motoristas ou Manutenção M1.

## Comportamento

- A evidência atual `SIGNED_EVIDENCE`, vinculada à versão atual do documento, fornece
  `signedAt`. O dia UTC dessa assinatura governa ativação, retomada, encerramento,
  cobrança contratual e a validação das regras de recorrência.
- `startDate` continua armazenada como planejamento. Não é reescrita e não substitui
  a assinatura nesses fluxos. A assinatura manual mantém o comportamento existente:
  registra o instante em que o usuário confirma a assinatura.
- Documento PDF/DOCX, incluindo repetição de geração, não cria cobrança.
- Contratos sem evidência válida não ativam nem criam cobrança contratual, inclusive
  quando `signatureRequired=false`. A validação financeira exige contexto transacional.
- O caso informado CNT-000004 é reproduzido por fixture: planejamento 2026-10-09,
  assinatura 2026-09-15, início efetivo 2026-09-15. Nenhum registro real foi consultado.
- Gates de veículo, motorista, CNH, documentos, seguro, conflitos e período financeiro
  permanecem ativos. Na ativação, documentos e seguro são verificados no início efetivo
  e na data atual.
- PDF assinado, bytes, snapshot e hashes não são alterados. A geração de novos PDFs
  recebeu uma correção de compatibilidade de buffer JPEG exigida pelo teste real:
  copia os mesmos bytes para `Uint8Array`, sem acessar documentos assinados.
- Erros 409 usam uma lista explícita de mensagens públicas e códigos estáveis.
  Erros desconhecidos recebem mensagem genérica; SQL, nomes de constraints e dados
  internos não são devolvidos ao cliente.

## Compatibilidade financeira

Na ativação, retomada ou conciliação inicial existente, o contrato e os títulos são
bloqueados na transação. Títulos contratuais anteriores à assinatura são conciliados:

- Não pagos: cancelamento auditado e reemissão pelo valor contratado, com competência
  e vencimento na assinatura. Múltiplas projeções anteriores à assinatura convergem
  para a cobrança inicial; títulos cancelados e suas chaves são preservados.
- Pagos ou parcialmente pagos: preservação integral. A divergência é auditada uma vez
  por evidência/conjunto de títulos. Não é criada outra cobrança inicial equivalente.
- A chave de idempotência e o índice existente por período continuam protegendo
  contra duplicação. Reexecução e chamadas concorrentes foram exercitadas localmente.
- A recorrência projetada pelo trigger existente é alinhada antes do commit, com
  auditoria. Títulos históricos pagos antes da assinatura não deslocam o início para
  a data planejada. Regras explicitamente pausadas não são reativadas pela correção
  de data; a retomada mantém o comportamento de ativação do lifecycle.
- Falha de auditoria, vínculo ou período financeiro fechado reverte a transação.

Não há migração de esquema nem atualização em lote. Contratos existentes são
conciliados quando passam pelos comandos acima, sem alteração antecipada de produção.

## Arquivos alterados

### Implementação e comando de teste

- `package.json`
- `src/domain/contracts/contractEffectivePeriod.ts` (novo)
- `src/domain/finance/ReceivableService.ts`
- `src/server/contractConflictResponse.ts` (novo)
- `src/server/contractRoutes.ts`
- `src/server/contractExecutionRoutes.ts`
- `src/server/contractSimpleSignRoutes.ts`
- `src/server/contractFinanceAuthority.ts`
- `src/server/contractFinanceReconcileRoutes.ts`
- `src/server/recurringAuthority.ts`

### Testes

- `src/server/__tests__/contractSignatureEffectiveLocalRunner.ts` (novo)
- `src/server/__tests__/contractSignatureEffectiveRegression.ts` (novo)
- `src/server/__tests__/contractSignedFixture.ts` (novo)
- `src/server/__tests__/contractAuthorityIntegration.ts`
- `src/server/__tests__/contractExecutionAuthorityIntegration.ts`
- `src/server/__tests__/contractFinancialCrDefaultsRegression.ts`
- `src/server/__tests__/contractSuspendRegression.ts`
- `src/server/__tests__/recurringAuthorityIntegration.ts`
- `src/server/__tests__/financeRecurringAuthorityIntegration.ts`

### Documentação

- `docs/contracts-signature-effective-review.md` (este arquivo)

## Validação executada: PASS

- Nova regressão de vigência: ausência de assinatura, data futura planejada, caso
  CNT-000004, cancelamento/reemissão, múltiplos títulos, pagos/parciais imutáveis,
  reexecução, auditoria, isolamento por empresa, scheduler real, retomada/encerramento,
  preservação dos artefatos, conflitos exclusivos, período fechado com rollback,
  14 cenários de gates e resposta pública segura.
- `contractBillPeriodRegression` (inclui `contractAuthorityIntegration`).
- `contractCancelLifecycleRegression`.
- `contractCloseBindingRegression`.
- `contractCloseFutureDateRegression`.
- `contractSignatureTimeGateRegression` (inclui execução documental real, suspensão,
  fonte de template e renderizadores DOCX).
- `recurringAuthorityIntegration`: cobrança exatamente uma vez e alertas/documentos.
- `financeRecurringAuthorityIntegration`: recuperação de falha, período fechado,
  origem temporariamente inelegível e isolamento de origem financeira.
- `contractSimpleSignStatusRegression`.
- `contractSignatureListRegression`.
- `contractIdempotencyRegression`.
- `contractFinancialCrDefaultsRegression`.
- `contractBillingDayClientTestRunner`.
- `recurringScheduleTestRunner`.
- `tsc --noEmit`, build Vite e bundle esbuild do servidor.
- `git diff --check`.

Execução da nova suíte:

```sh
pnpm run test:contract-signature-effective
```

Execução das regressões exportadas em banco descartável:

```sh
node node_modules/tsx/dist/cli.mjs src/server/__tests__/contractSignatureEffectiveLocalRunner.ts ./contractBillPeriodRegression.ts runContractBillPeriodRegression
```

## Limites e riscos residuais

- Testes usam PGlite em memória, com todas as migrações locais. Não acessam banco
  externo. Advisory locks são substituídos por funções neutras somente nesse runner;
  concorrência multiprocesso e RLS sob usuário PostgreSQL não-superusuário continuam
  sendo responsabilidade da suíte PostgreSQL/CI. A parte RLS dessa suíte não foi
  executada localmente.
- Validação feita no Node 24 disponível; o projeto declara Node 22. Build passou,
  com avisos de imports dinâmicos/estáticos do Vite, sem erros.
- Datas seguem a convenção UTC existente. Não foi introduzida política de fuso por empresa.
- Legados sem evidência canônica válida exigem regularização; não foi criado bypass
  de assinatura nem inferida assinatura a partir de criação, URL ou status ACTIVE.
- Escopo: lifecycle e cobrança contratual. Não foram alterados consumidores temporais
  de outros módulos, como associação histórica de multas à data planejada.
- A conciliação de legados é sob demanda; nenhum saneamento em lote foi executado.

STATUS: READY_FOR_REVIEW
