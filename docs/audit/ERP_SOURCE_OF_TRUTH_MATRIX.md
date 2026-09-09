# AutoERP — Matriz de Fonte da Verdade

> **Frente independente de Auditoria Geral do ERP**
>
> Objetivo: impedir que módulos diferentes interpretem a mesma informação de formas diferentes.
> Esta matriz define a autoridade de cada dado, os consumidores permitidos e as invariantes que devem ser verificadas transversalmente.

## 1. Princípios obrigatórios

1. **Uma informação crítica possui uma única autoridade.**
2. Telas, dashboards e relatórios **não criam regra de negócio própria**; apenas consultam ou derivam a partir da autoridade.
3. Estado derivado deve ser calculado por uma função/serviço compartilhado, nunca copiado manualmente entre módulos.
4. Toda mutação relevante deve:
   - validar tenant;
   - respeitar transição de estado;
   - ser idempotente quando houver origem externa ou geração automática;
   - gerar auditoria;
   - preservar histórico.
5. Nenhum módulo pode assumir que "ausência de vínculo ativo" significa automaticamente "disponível".
6. Dados arquivados/vendidos/inativos permanecem parte da identidade histórica e continuam participando de validações de unicidade quando aplicável.
7. IA é auxiliar de extração/sugestão. **Nunca é autoridade financeira, disciplinar ou contratual.**
8. Dashboard é **consumidor**, nunca fonte de verdade.
9. A UI nunca é a única camada de proteção: regra crítica deve existir também no servidor e, quando possível, no banco.
10. Cada invariante crítica desta matriz deve virar teste de integração/E2E.

---

## 2. Matriz principal

| ID | Domínio / Informação | Fonte da verdade | Pode derivar / exibir | Regra obrigatória / Invariante | Não pode acontecer |
|---|---|---|---|---|---|
| ST-001 | Empresa / Tenant | `companies` + autoridade server-side do tenant | Login, contratos, documentos, relatórios | Todo dado operacional pertence a exatamente um `company_id` | Tela ou cliente escolher tenant diferente do principal autenticado |
| ST-002 | Usuário autenticado | sessão server-side + `users` / credencial | Header, permissões, auditoria | Papel, usuário e empresa vêm da sessão autenticada | Browser informar role/companyId como autoridade |
| ST-003 | Identidade do motorista | `drivers` | Contratos, multas, financeiro, relatórios | CPF/CNH/identificadores obedecem unicidade e tenant | Dois motoristas ativos representarem a mesma pessoa sem fluxo explícito de reconciliação |
| ST-004 | Cadastro completo do motorista | `drivers` + `driver_health...` + documentos vigentes | Ficha do motorista, elegibilidade contratual | Endereço completo + CNH/EAR + contato de emergência necessários para cadastro operacional completo | Motorista ficar "pronto" faltando requisito obrigatório |
| ST-005 | Saúde / emergência do motorista | autoridade protegida de saúde | Aba Saúde & Emergência; ficha inicial autorizada | Dados médicos opcionais; contato de emergência obrigatório no cadastro completo | Saúde sensível espalhada em campos comuns ou logs em claro |
| ST-006 | Documento vigente do motorista | registro documental atual + attachment vigente | CNH & Documentos | Ficha principal mostra somente documento vigente/necessário; histórico preservado separadamente | Versões antigas/duplicadas ocuparem a ficha operacional |
| ST-007 | Identidade do veículo | `vehicles` | Frota, contratos, multas, manutenção, financeiro | Placa, RENAVAM e chassi representam o mesmo veículo ao longo de toda a vida | Novo cadastro porque veículo anterior foi vendido/arquivado |
| ST-008 | Unicidade histórica do veículo | autoridade server-side de identidade + restrições de banco | Cadastro manual/IA | Consulta inclui ativos, vendidos e arquivados | Duplicidade detectada somente no último passo do cadastro |
| ST-009 | Estado cadastral do veículo | `vehicles.status` | Frota, detalhes, histórico | Status próprio do veículo descreve condição cadastral/operacional local | Dashboard usar apenas `vehicles.status` para decidir disponibilidade global |
| ST-010 | Contrato do motorista/veículo | `contracts` | Motorista, veículo, dashboard, financeiro | Contrato não terminal reserva exclusivamente 1 motorista + 1 veículo | Mesmo motorista ou veículo em dois contratos não terminais |
| ST-011 | Estados contratuais bloqueantes | `contracts.status` via autoridade contratual | Seletor de novo contrato, disponibilidade | `DRAFT`, `AWAITING_SIGNATURE`, `ACTIVE`, `SUSPENDED` bloqueiam reutilização | Veículo/motorista aparecer elegível em novo contrato enquanto bloqueado |
| ST-012 | Liberação do vínculo contratual | transição final do contrato | Veículos, Motoristas, seletores | Somente estados finais liberam recurso: `FINISHED/CLOSED/CANCELLED/ARCHIVED` | Cancelar visualmente mas recurso continuar bloqueado; ou liberar antes do estado final |
| ST-013 | Veículo "em contratação" | contrato bloqueante não ativo | Dashboard, Frota, Motorista | Não é "Disponível" nem "Locado"; é recurso comprometido/em contratação | Dashboard contar o mesmo veículo como disponível durante assinatura |
| ST-014 | Veículo "locado" | contrato `ACTIVE` + vínculo operacional coerente | Dashboard, Frota, Motorista | Contrato ACTIVE implica vínculo operacional motorista↔veículo | Contrato ativo e veículo sem vínculo correspondente |
| ST-015 | Veículo atual do motorista | contrato ACTIVE; antes da ativação, "vinculado ao contrato" | Ficha Motorista | Diferenciar vínculo contratual pré-ativo de locação ativa | Aba Contratos mostrar veículo e aba Veículos dizer "nenhum" sem contexto |
| ST-016 | Motorista atual do veículo | contrato ACTIVE | Ficha Veículo, Frota | O motorista operacional vem do contrato ativo | Campo manual divergente do contrato ativo |
| ST-017 | Modelo de contrato operacional | versão atual do modelo salvo sequencial | Novo Contrato | Usuário escolhe `Contrato 01/02/03...` salvo | Masters técnicos/legados aparecerem misturados no seletor operacional |
| ST-018 | Versão do modelo usada | `contract.template_id` / snapshot documental | Contrato histórico | Edição futura cria nova versão sem alterar contrato emitido | Alterar modelo atual modificar PDF/contrato antigo |
| ST-019 | Documento oficial do contrato | artifact/attachment gerado + snapshot/hash | PDF/Assinatura | Documento gerado está ligado ao contrato e modelo usados naquele momento | Regeneração silenciosa alterar evidência histórica |
| ST-020 | Evidência de assinatura | autoridade de execução/assinatura | Contrato, auditoria | Status de assinatura deriva da evidência persistida | Arquivo assinado existir e lista continuar "aguardando" por fonte diferente |
| ST-021 | Receita de aluguel contratual | contrato + obrigação AR idempotente | CR, motorista financeiro, dashboard financeiro | Gerar documento oficial cria a primeira CR; ativação reutiliza a mesma obrigação | Gerar documento sem CR ou ativar criando CR duplicada |
| ST-022 | Idempotência do aluguel | `originType + originId/parcela` | Financeiro | Mesma competência/origem gera no máximo uma obrigação | Reprocessamento/ativação gerar nova CR |
| ST-023 | Cancelamento antes da ativação | contrato cancelado + CR sem recebimento | Financeiro | CR de aluguel não recebida é cancelada de forma auditada | Contrato cancelado manter cobrança aberta indevidamente |
| ST-024 | Contas a Receber | `account_receivables` + autoridade financeira | Motorista, contrato, dashboard financeiro | Saldo/status calculados pela obrigação e recebimentos | Tela do motorista recalcular saldo independentemente |
| ST-025 | Recebimentos | `receipts` / settlement authority | CR, fluxo de caixa | Recebimento parcial/total atualiza obrigação e transação financeira | Marcar CR paga sem receipt/settlement correspondente |
| ST-026 | Contas a Pagar | `account_payables` + autoridade financeira | Veículo, manutenção, multas, seguros | Despesas do veículo criam AP pela origem correta | Despesa aparecer apenas na ficha e não no financeiro |
| ST-027 | Pagamentos | `payments` / settlement authority | AP, fluxo de caixa | Pagamento parcial/total atualiza obrigação | AP "paga" sem pagamento registrado |
| ST-028 | Fluxo de caixa | `FinancialTransaction` originada por Receipt/Payment | Dashboard Financeiro, DRE | Fluxo mostra movimento realizado; não obrigação futura | CR/AP aberto aparecer como caixa realizado |
| ST-029 | Multa — despesa | multa vinculada ao veículo → AP | Multas, veículo, financeiro | Multa representa obrigação da empresa quando aplicável | Multa existir sem refletir AP correspondente |
| ST-030 | Multa — repasse ao motorista | responsabilidade da multa → AR | Motorista, Multas, Financeiro | Motorista responsável gera CR; não identificado segue regra própria/NIC | Repasse criado sem motorista responsável ou duplicado |
| ST-031 | Quilometragem atual | autoridade de leituras de KM | Veículo, manutenção, contratos, dashboard | Nova leitura não pode reduzir KM sem justificativa/auditoria | Aba veículo e manutenção usarem KMs distintos |
| ST-032 | Origem do KM | leitura com origem Manual/Vistoria/Rastreador/Manutenção | Auditoria, manutenção | Toda atualização de KM tem origem e data | Atualizar `currentKm` sem leitura rastreável |
| ST-033 | Excedente de KM | contrato + leituras válidas | CR, contrato | Cobrança usa franquia e KM autoritativo | Financeiro recalcular KM por fonte própria |
| ST-034 | Documento do veículo | documento vigente + attachment | Compliance, veículo, contratos | Documento vencido/pedente pode bloquear elegibilidade conforme regra | Contrato ignorar bloqueio documental que Compliance considera crítico |
| ST-035 | IPVA/Licenciamento | registro documental/financeiro correspondente | Compliance, AP, veículo | Obrigação financeira e documento são relacionados, mas não a mesma entidade | Marcar documento pago sem pagamento ou marcar AP paga só porque documento foi anexado |
| ST-036 | Seguro | apólice vigente + obrigação AP quando aplicável | Contrato, veículo, financeiro | Elegibilidade contratual consulta seguro autoritativo | Contrato permitir veículo sem cobertura quando regra exigir |
| ST-037 | Rastreador | cadastro do tracker + últimas comunicações | Veículo, alertas | Estado do rastreador não pode ser inferido só pela existência do cadastro | "Rastreador ativo" sem comunicação/status válido |
| ST-038 | Plano preventivo | planos/templates + Banco de Regras | Manutenção, veículo, alertas | Sugestão fabricante ≠ regra adotada pela frota | IA/fabricante sobrescrever regra operacional sem aprovação |
| ST-039 | Próxima manutenção | última execução + regra adotada KM/tempo | Manutenção, alertas, dashboard | Se houver KM e tempo, vence pelo que ocorrer primeiro | Tela calcular próximo prazo de forma diferente do servidor |
| ST-040 | Status manutenção preventiva | engine compartilhado | Manutenção, veículo, dashboard | Em dia/Próxima/Atenção/Vencida usam mesma regra | Cores/status divergirem entre ficha e módulo |
| ST-041 | Ordem de Serviço | OS | Manutenção, veículo, financeiro | OS é autoridade do ciclo de execução; abertura não implica AP definitiva | AP definitiva criada só por abrir OS |
| ST-042 | Conclusão da manutenção | OS concluída + execução real KM/data | Histórico veículo, plano preventivo | Conclusão recalcula próximo preventivo a partir do realizado | Próximo prazo permanecer baseado no agendamento antigo |
| ST-043 | Disponibilidade operacional do veículo | **derivação centralizada**: status veículo + contrato bloqueante + manutenção crítica + documentação bloqueante | Dashboard, Frota, Contratos | Um único serviço deve responder "pode ser usado?" e motivo | Cada módulo implementar seu próprio `AVAILABLE` |
| ST-044 | Elegibilidade para novo contrato | serviço central de elegibilidade | Novo Contrato | Considera contrato, veículo, motorista, docs, seguro e bloqueios críticos | Seletor mostrar recurso que servidor rejeita depois |
| ST-045 | Dashboard operacional | projeções/queries sobre autoridades acima | Visão Geral | Dashboard nunca é autoridade; contagens são mutuamente coerentes | Total ≠ soma coerente; veículo simultaneamente Disponível e Em contratação |
| ST-046 | Taxa de ocupação | contratos/estados operacionais centralizados | Dashboard | Fórmula usa definição única de ocupado/comprometido | Dashboard e relatório usarem denominadores diferentes sem explicação |
| ST-047 | Rentabilidade por veículo | receitas/despesas financeiras vinculadas ao veículo | Veículo, relatórios | Resultado vem de transações/obrigações conforme regime definido | Ficha somar valores locais desconectados do Financeiro |
| ST-048 | Histórico/Auditoria | `audit_logs` / eventos server-side | Fichas, auditoria | Toda mutação relevante registra quem/quando/o quê | UI inventar histórico baseado só em timestamps de entidade |
| ST-049 | Arquivamento | flag/status + auditoria, sem apagar histórico | Todos os módulos | Arquivar remove da operação, não da identidade/histórico | Arquivado deixar de participar de unicidade histórica |
| ST-050 | Attachments | autoridade server-side de arquivos | Documentos, contratos, motorista, veículo | Arquivo é evidência; metadado e conteúdo devem pertencer à mesma entidade/tenant | Attachment órfão ou vinculado a tenant diferente |
| ST-051 | IA documental de Veículos/Multas/CNH | resultado de extração revisado pelo usuário | Formulários | IA pré-preenche; usuário confirma; servidor valida | IA criar decisão financeira/disciplinar automática |
| ST-052 | IA de Manutenção | sugestões técnicas | Banco de regras / usuário | Sugestão pode ser Usada/Editada/Ignorada | IA alterar periodicidade adotada sem aprovação |
| ST-053 | Alterações não salvas | autoridade global de UX | Modais, navegação, beforeunload | Editor alterado bloqueia saída até salvar/descartar | Motoristas protegido e outro módulo não; ou X bypassar regra |
| ST-054 | Produção | branch/deploy de produção com promoção controlada | Operação | Auto-deploy continua desligado até auditoria geral aprovada | `main` ou staging promover automaticamente para produção |
| ST-055 | STAGING | `staging-app` + Render staging | Validação | Toda mudança funcional passa por gates + validação integrada | Aprovar feature só porque teste unitário passou |
| ST-056 | Banco de Regras | regra efetiva por escopo/validade/prioridade | Manutenção e futuros engines configuráveis | Específico ativo vence geral; histórico de versões preservado | Valor operacional crítico hardcoded quando deveria ser configurável |

---

## 3. Estados compostos obrigatórios

### 3.1 Disponibilidade do veículo

A aplicação não deve tratar `VehicleStatus.AVAILABLE` como resposta suficiente.

**Disponível para novo contrato** somente quando TODOS forem verdadeiros:

- veículo não arquivado/vendido/inativo;
- status cadastral permite locação;
- nenhum contrato bloqueante;
- nenhuma manutenção crítica/bloqueante;
- documentação exigida regular;
- seguro exigido regular;
- nenhum outro bloqueio operacional configurado.

Resultado deve conter **boolean + motivos**.

Exemplo:

```text
eligible: false
reasons:
- CONTRACT_AWAITING_SIGNATURE
```

### 3.2 Estado operacional exibido no Dashboard

Ordem recomendada de precedência:

1. Vendido/Arquivado/Inativo
2. Manutenção/Bloqueio crítico
3. Locado — contrato ACTIVE
4. Em contratação — DRAFT/AWAITING_SIGNATURE/SUSPENDED conforme política
5. Reservado, quando houver reserva autoritativa
6. Disponível

Um veículo não pode ocupar simultaneamente duas categorias principais.

### 3.3 Vínculo Motorista ↔ Veículo

- DRAFT/AWAITING_SIGNATURE: **vinculado por contrato**, ainda não "veículo atual em locação".
- ACTIVE: **veículo atual em locação**.
- FINAL/CANCELLED/ARCHIVED: vínculo histórico, não operacional.

---

## 4. Invariantes transversais prioritárias para testes

### INV-001 — Contrato pré-ativo reserva recursos
Dado um contrato `AWAITING_SIGNATURE`:
- motorista não aparece em novo contrato;
- veículo não aparece em novo contrato;
- veículo não conta como Disponível;
- motorista mostra o veículo como "vinculado ao contrato";
- Dashboard mostra "Em contratação", não "Locado".

### INV-002 — Ativação mantém consistência
Ao ativar contrato:
- contrato → ACTIVE;
- veículo → vínculo operacional ao contrato/motorista;
- motorista → veículo atual via contrato;
- Dashboard → Locado;
- CR existente é reutilizada;
- histórico registra a transição.

### INV-003 — Documento gerado cria cobrança idempotente
Ao gerar documento oficial:
- 1 CR de aluguel é criada;
- reprocessar documento não cria segunda CR;
- ativar contrato não cria segunda CR.

### INV-004 — Cancelamento libera recurso
Ao cancelar contrato sem recebimento:
- contrato → CANCELLED;
- CR aberta do aluguel → CANCELLED;
- motorista volta a elegível;
- veículo volta a elegível se nenhum outro bloqueio;
- Dashboard recalcula estado;
- auditoria registra tudo.

### INV-005 — Veículo histórico não duplica
Dado veículo vendido/arquivado:
- leitura IA pela mesma placa/RENAVAM/chassi encontra o cadastro;
- novo cadastro é bloqueado;
- usuário pode abrir histórico existente.

### INV-006 — KM único
Ao registrar KM:
- veículo, manutenção, contrato e relatórios consultam a mesma leitura autoritativa;
- redução exige justificativa/auditoria.

### INV-007 — Multa interliga operação e financeiro
Multa de motorista:
- multa → veículo;
- responsabilidade → motorista;
- AP da empresa quando aplicável;
- AR de repasse quando aplicável;
- nenhuma duplicidade por reprocessamento.

### INV-008 — Manutenção bloqueante
Manutenção crítica:
- veículo não elegível para novo contrato;
- Dashboard não mostra Disponível;
- conclusão válida recalcula plano e pode liberar o veículo.

### INV-009 — Documento bloqueante
Documento obrigatório vencido:
- Compliance aponta pendência;
- elegibilidade de contrato usa a mesma pendência;
- Dashboard/frota pode exibir motivo operacional.

### INV-010 — Alterações não salvas
Em qualquer editor:
- alterar campo → sair exige confirmação;
- salvar → saída não alerta;
- descartar explicitamente → saída permitida;
- X, Esc, menu, navegação e browser obedecem a mesma autoridade.

---

## 5. Regra de desenvolvimento a partir desta matriz

Toda correção ou feature que tocar um ID `ST-xxx` deve declarar:

1. **IDs da matriz afetados**
2. fonte da verdade consultada;
3. consumidores afetados;
4. invariantes testadas;
5. o que não foi alterado.

Exemplo:

```text
Mudança: Dashboard não contar AWAITING_SIGNATURE como disponível
Matriz: ST-010, ST-011, ST-013, ST-043, ST-045
Testes: INV-001
```

Nenhum PR de regra de negócio deve ser considerado concluído apenas com teste de componente.

---

## 6. Ordem da Auditoria Geral

### Onda A — Relações fundamentais
1. Veículo ↔ Motorista ↔ Contrato
2. Contrato ↔ Documento/Assinatura ↔ CR
3. Veículo/Contrato ↔ Dashboard
4. Motorista ↔ Financeiro

### Onda B — Operação
5. KM ↔ Contrato ↔ Manutenção
6. Documentos/Seguro ↔ elegibilidade
7. Multas ↔ Veículo ↔ Motorista ↔ AP/AR
8. Manutenção ↔ Veículo ↔ AP

### Onda C — Financeiro
9. AP/AR ↔ Pagamentos/Recebimentos
10. Settlements ↔ FinancialTransaction ↔ Fluxo de Caixa
11. Veículo ↔ Rentabilidade
12. Inadimplência ↔ Contrato/Motorista

### Onda D — Integridade e UX
13. Arquivamento/histórico
14. Attachments
15. Auditoria
16. Proteção de alterações não salvas
17. permissões/tenant
18. Dashboard e relatórios consolidados

---

## 7. Condição para liberar produção

Produção somente poderá ser considerada quando:

- todas as invariantes críticas INV-001 a INV-010 possuírem teste automatizado;
- nenhuma divergência crítica da Matriz estiver aberta;
- a Auditoria Independente não tiver achado inconsistência P0/P1 sem tratamento;
- STAGING tiver passado fluxo E2E dos módulos prioritários;
- produção continuar sem promoção automática até autorização explícita.

---

**Status deste documento:** Baseline da Auditoria Geral — primeira versão.

**Regra:** este arquivo é especificação operacional/auditável. Alterações devem ocorrer por PR e nunca silenciosamente.
