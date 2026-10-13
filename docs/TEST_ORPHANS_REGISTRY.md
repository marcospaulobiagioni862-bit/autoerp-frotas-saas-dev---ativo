# Registro Canônico de Test Runners e Decisão de Gates (AUTOERP-95)

Documento de inventário e governança técnica gerado pela varredura completa de **todos os 53 arquivos de testes órfãos** (arquivos em `src/**/__tests__` que não constavam no `package.json` nem nos workflows da CI e não eram importados por outros arquivos de teste).

---

## 1. Diretrizes de Governança & Saneamento de Aliases

1. **Eliminação de Aliases `verify:` Falsos ou Duplicados (Regra 2 & 3.2-h do CLAUDE.md)**:
   - No AutoERP, o prefixo `verify:*` é reservado exclusivamente para rotinas que executam contra banco de dados real em homologação/staging com massa provisionada (ex: `verify:user-permissions-real`, `verify:marcos-requirements`, `verify:rls-deduplication`).
   - Foram removidos os aliases duplicados `verify:contract-close-atomic` e `verify:whatsapp-rent-billing`, que apontavam para o mesmo arquivo dos scripts `test:*` sem utilizar runner de massa real.
   - Foram removidos também aliases redundantes de testes in-memory que não tocam o Neon.

2. **Decisão sobre Testes Dependentes de Banco Neon / Staging**:
   - `test:contract-close-atomic` (`contractCloseAtomicRegression.ts`): Executa encerramento atômico de contratos e exige conexão ativa com PostgreSQL/Neon totalmente migrado (para tabelas de empresas, contratos e motoristas). **Decisão: Excluído da CI fast**, mantido como script manual/periódico com pré-requisito explícito de banco migrado.
   - `test:whatsapp-rent-billing` (`whatsappRentBillingRegression.ts`): Executa geração de link `wa.me` de cobrança de aluguel validando contra motorista seedado no Neon (`v2demo-ngcompany001-driver-09`). **Decisão: Excluído da CI fast**, mantido como script manual dependente das credenciais do Neon em `~/.config/autoerp-neon.env`.

3. **Decisão sobre Invariantes com Regressão Identificada**:
   - `test:navigation-menu-parity` (`navigationMenuParityRegression.ts`): Falha atualmente pela presença de `title: 'INÍCIO'` em `Sidebar.tsx:106` (cabeçalho redundante visível ao usuário). **Decisão: Excluído da CI até a conclusão do card AUTOERP-97**, criado no banco `gestao` para tratar a remoção do cabeçalho.

4. **Entrada na CI (`validate-fast`)**:
   - Testes herméticos, rápidos (<5s) e de alta relevância preventiva foram incorporados ao job `validate-fast` do GitHub Actions:
     - `test:migration-prefix-collision`: impede colisões silenciosas de prefixos numéricos de migrações DDL.
     - `test:browser-tab-branding`: assegura que nenhuma marca hardcoded ou resquício de template polua a aba do navegador.
     - `test:contract-pdf-overlays`: validação hermética com `pdf-lib` de sobreposições em PDF de contratos.
     - `test:api-clients`: suíte agregada dos 9 runners de client HTTP/API, garantindo integridade de contratos e payloads.

---

## 2. Inventário Completo dos 53 Test Runners Órfãos

| # | Arquivo de Teste | Script npm (`package.json`) | Classificação / Runtime | Decisão CI | Racional & Pré-requisitos |
|---|---|---|---|---|---|
| 1 | `src/api/__tests__/contractClientTestRunner.ts` | `test:client-contract` / `test:api-clients` | Client Unit (Mock Fetch) | CI (`validate-fast`) | Valida chamadas e payloads do cliente de contratos. Hermético. |
| 2 | `src/api/__tests__/documentClientTestRunner.ts` | `test:client-document` / `test:api-clients` | Client Unit (Mock Fetch) | CI (`validate-fast`) | Valida chamadas da central de documentos. Hermético. |
| 3 | `src/api/__tests__/driverClientTestRunner.ts` | `test:client-driver` / `test:api-clients` | Client Unit (Mock Fetch) | CI (`validate-fast`) | Valida payload de motoristas e CNH. Hermético. |
| 4 | `src/api/__tests__/driverDocumentIntakeClientTestRunner.ts` | `test:client-driver-intake` / `test:api-clients` | Client Unit (Mock Fetch) | CI (`validate-fast`) | Valida intake de documentos via IA. Hermético. |
| 5 | `src/api/__tests__/driverHealthClientTestRunner.ts` | `test:client-driver-health` / `test:api-clients` | Client Unit (Mock Fetch) | CI (`validate-fast`) | Valida perfil de saúde de motoristas. Hermético. |
| 6 | `src/api/__tests__/financeRenegotiationClientTestRunner.ts` | `test:client-finance-renegotiation` / `test:api-clients` | Client Unit (Mock Fetch) | CI (`validate-fast`) | Valida renegociação de contas a pagar. Hermético. |
| 7 | `src/api/__tests__/telemetryKmDivergenceClientTestRunner.ts` | `test:client-telemetry-km` / `test:api-clients` | Client Unit (Mock Fetch) | CI (`validate-fast`) | Valida divergências telemétricas de KM. Hermético. |
| 8 | `src/api/__tests__/vehicleClientTestRunner.ts` | `test:client-vehicle` / `test:api-clients` | Client Unit (Mock Fetch) | CI (`validate-fast`) | Valida 12 métodos do cliente de veículos. Hermético. |
| 9 | `src/api/__tests__/attachmentClientTestRunner.ts` | `test:client-attachment` / `test:api-clients` | Client Unit (Mock Fetch) | CI (`validate-fast`) | Valida upload e download de anexos. Hermético. |
| 10 | `src/auth/__tests__/authSessionTestRunner.ts` | `test:auth-session` | Auth / Session Logic | Manual | Teste unitário de payload de sessão e expiração. |
| 11 | `src/components/contracts/__tests__/approvedMasterManagementRegression.ts` | `test:contracts-approved-master` | Component / UI Logic | Manual | Regressão de gestão de minutas contratuais. |
| 12 | `src/components/contracts/__tests__/contractLifecycleActionTestRunner.ts` | `test:contracts-lifecycle-action` | Component / UI Action | Manual | Ações de ciclo de vida contratual na UI. |
| 13 | `src/components/drivers/__tests__/driverDetailsDocumentsUxTestRunner.ts` | `test:driver-details-documents-ux` | Component / UI UX | Manual | Validação de acabamento de documentos de condutores. |
| 14 | `src/components/finance/__tests__/bankReconciliationViewTestRunner.ts` | `test:bank-reconciliation-view` | Component / UI UX | Manual | Validação visual da conciliação bancária. |
| 15 | `src/components/finance/__tests__/vehicleProfitabilityViewTestRunner.ts` | `test:vehicle-profitability-view` | Component / UI UX | Manual | Validação do painel de lucratividade por veículo. |
| 16 | `src/components/fleet/__tests__/vehicleCrlvImportPanelTestRunner.ts` | `test:vehicle-crlv-import-panel` | Component / UI UX | Manual | Validação do painel de importação de CRLV. |
| 17 | `src/components/fleet/__tests__/simpleTrackerUiRegression.tsx` | `test:tracker-ui` | Component / React UI | Manual | Validação de rastreadores e formulário seguro. |
| 18 | `src/components/layout/__tests__/browserTabBrandingRegression.ts` | `test:browser-tab-branding` | Invariant / Layout | CI (`validate-fast`) | Invariante de título e branding dinâmico da aba (AUTOERP-80). |
| 19 | `src/components/layout/__tests__/navigationMenuParityRegression.ts` | `test:navigation-menu-parity` | Invariant / Layout | Fora da CI (AUTOERP-97) | Cobra remoção de `title: 'INÍCIO'` do menu (rastreado no AUTOERP-97). |
| 20 | `src/domain/finance/__tests__/payableInstallmentOrderTestRunner.ts` | `test:payable-installment-order` | Domain / Rules | Manual | Ordenação de parcelas de contas a pagar. Hermético. |
| 21 | `src/domain/services/__tests__/trafficTicketTestRunner.ts` | `test:traffic-ticket-service` | Domain / Rules | Manual | Regras e máquina de estado de multas de trânsito. |
| 22 | `src/server/__tests__/bootstrapTestRunner.ts` | `test:server-bootstrap` | Server Unit | Manual | Inicialização e bootstrap de serviços do servidor. |
| 23 | `src/server/__tests__/contractVehicleInsuranceSnapshotTestRunner.ts` | `test:contract-insurance-snapshot` | Server Logic | Manual | Snapshot de apólice de seguro vinculada ao contrato. |
| 24 | `src/server/__tests__/contractVehicleTrackerSnapshotTestRunner.ts` | `test:contract-tracker-snapshot` | Server Logic | Manual | Snapshot de rastreador vinculado ao contrato. |
| 25 | `src/server/__tests__/creditCardStatementOverdueTestRunner.ts` | `test:credit-card-overdue` | Server Logic | Manual | Derivação de faturas de cartão em atraso. |
| 26 | `src/server/__tests__/driverDocumentIntakeAiPolicyTestRunner.ts` | `test:driver-intake-ai-policy` | DOC-AI Policy | Manual | Política de enfileiramento de intake de CNH. |
| 27 | `src/server/__tests__/driverDocumentIntakeAiQueueTestRunner.ts` | `test:driver-intake-ai-queue` | DOC-AI Queue | Manual | Idempotência e enfileiramento do worker de IA. |
| 28 | `src/server/__tests__/driverDocumentIntakeAiReviewSyncTestRunner.ts` | `test:driver-intake-ai-review-sync` | DOC-AI Sync | Manual | Sincronização de revisão humana de CNHs. |
| 29 | `src/server/__tests__/driverDocumentIntakeAiWorkerSyncTestRunner.ts` | `test:driver-intake-ai-worker-sync` | DOC-AI Sync | Manual | Sincronização do worker de background de IA. |
| 30 | `src/server/__tests__/driverDocumentIntakeAuthorityTestRunner.ts` | `test:driver-intake-authority` | Server Authority | Manual | Autoridade de intake e transições de estado. |
| 31 | `src/server/__tests__/passwordTestRunner.ts` | `test:server-password` | Security / Crypto | Manual | Hashing scrypt e validação de requisitos de senha. |
| 32 | `src/server/__tests__/contractPdfVisualOverlaysRegression.ts` | `test:contract-pdf-overlays` | PDF Processing | CI (`validate-fast`) | Geração e renderização de assinaturas visuais em PDF. |
| 33 | `src/server/__tests__/migrationPrefixCollisionRegression.ts` | `test:migration-prefix-collision` | Static DDL Guard | CI (`validate-fast`) | Guarda estática anti-colisão de prefixos numéricos em `drizzle/`. |
| 34 | `src/server/__tests__/tollPassageDriverReceivableBoundary.ts` | `test:toll-passage-boundary` | Domain Boundary | Manual | Repasse e fronteira financeira de passagens de pedágio. |
| 35 | `src/server/__tests__/documentTimezoneReproduction.ts` | `test:document-timezone-reproduction` | Date Parsing Guard | Manual | Prova de recusa de timestamp e aceitação de formato civil. |
| 36 | `src/server/__tests__/contractBillPeriodRegression.ts` | `test:contract-bill-period` | Database Integration | Fora da CI (DB Migrado) | Exige banco de dados com contratos ativos e períodos migrados. |
| 37 | `src/server/__tests__/contractCloseBindingRegression.ts` | `test:contract-close-binding` | Database Integration | Fora da CI (DB Migrado) | Exige banco de dados com schema de vínculos contratuais. |
| 38 | `src/server/__tests__/contractCloseFutureDateRegression.ts` | `test:contract-close-future-date` | Database Integration | Fora da CI (DB Migrado) | Exige banco de dados com validação de datas de encerramento. |
| 39 | `src/server/__tests__/contractCancelLifecycleRegression.ts` | `test:contract-cancel-lifecycle` | Database Integration | Fora da CI (DB Migrado) | Exige banco de dados com ciclo de cancelamento transacional. |
| 40 | `src/server/__tests__/contractExecutionAuthorityIntegration.ts` | `test:contract-execution-authority` | Database Integration | Fora da CI (DB Migrado) | Exige banco migrado para execução contratual e assinaturas. |
| 41 | `src/server/__tests__/contractLifecycleAndShareRegression.ts` | `test:contract-lifecycle-share` | Database Integration | Fora da CI (DB Migrado) | Exige banco migrado para links de compartilhamento seguro. |
| 42 | `src/server/__tests__/contractSuspendRegression.ts` | `test:contract-suspend` | Database Integration | Fora da CI (DB Migrado) | Exige banco migrado para suspensão transacional de contrato. |
| 43 | `src/server/__tests__/financeCreditCardPaymentReversalIntegration.ts` | `test:credit-card-payment-reversal` | Database Integration | Fora da CI (DB Migrado) | Exige tabelas de cartões de crédito e conciliação financeira. |
| 44 | `src/server/__tests__/financeCreditCardPostCloseCreditIntegration.ts` | `test:credit-card-post-close-credit` | Database Integration | Fora da CI (DB Migrado) | Exige tabelas de cartões de crédito e créditos pós-fechamento. |
| 45 | `src/server/__tests__/financeCreditCardPurchaseCycleIntegration.ts` | `test:credit-card-purchase-cycle` | Database Integration | Fora da CI (DB Migrado) | Exige tabelas de cartões e ciclo de fechamento de faturas. |
| 46 | `src/server/__tests__/financeCreditCardPurchaseReversalIntegration.ts` | `test:credit-card-purchase-reversal` | Database Integration | Fora da CI (DB Migrado) | Exige tabelas de cartões e auditoria transacional. |
| 47 | `src/server/__tests__/financeCreditCardStatementAdjustmentIntegration.ts` | `test:credit-card-statement-adjustment` | Database Integration | Fora da CI (DB Migrado) | Exige tabelas `credit_card_statement_adjustments` migradas. |
| 48 | `src/server/__tests__/financeCreditCardStatementDetailIntegration.ts` | `test:credit-card-statement-detail` | Database Integration | Fora da CI (DB Migrado) | Exige tabelas de itens de fatura e transações de cartão. |
| 49 | `src/server/__tests__/financeCreditCardStatementPersistenceIntegration.ts` | `test:credit-card-statement-persistence` | Database Integration | Fora da CI (DB Migrado) | Exige persistência de faturas e credenciais de banco. |
| 50 | `src/server/__tests__/payableInstallmentOrderIntegration.ts` | `test:payable-installment-order-integration` | Database Integration | Fora da CI (DB Migrado) | Exige tabelas `account_payables` migradas com parcelamento. |
| 51 | `src/server/__tests__/telemetryKmDivergenceIntegration.ts` | `test:telemetry-km-divergence` | Database Integration | Fora da CI (DB Migrado) | Exige tabelas de telemetria e registros de KM migrados. |
| 52 | `src/server/__tests__/trafficTicketDriverIndicationStateMachine.ts` | `test:traffic-ticket-indication-state` | Database Integration | Fora da CI (DB Migrado) | Exige tabela `traffic_tickets` e motoristas migrados. |
| 53 | `src/server/__tests__/userPermissionsMatrixRegression.ts` | `test:user-permissions-matrix` | Database Integration | Fora da CI (DB Migrado) | Exige tabela `users` com colunas `phone` e permissões migradas. |
