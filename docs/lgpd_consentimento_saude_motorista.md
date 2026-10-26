# Consentimento LGPD — dados de saúde do motorista

**Versão do texto: 1.0** · Aprovada por: Pedro (pendente) · Data: 2026-10-26 · Card: PH-132

Este arquivo é a fonte única do texto de autorização e das regras de registro, versionamento,
revogação e descarte. A tela não escreve o texto por conta própria: ela carrega a versão
vigente daqui. Mudou o texto, muda a versão aqui, e quem aceitou a anterior continua valendo
pela anterior.

---

## 1. O texto que vai na tela (versão 1.0)

> **Autorização para usar seus dados de saúde**
>
> Para alugar um veículo com a gente, precisamos saber algumas coisas sobre sua saúde. Você
> decide se quer informar.
>
> **O que pedimos:** tipo de sangue, alergias, condições de saúde que afetem a direção,
> remédios de uso contínuo e remédios controlados. Também pedimos um contato de emergência.
>
> **Para que usamos:** para acionar seu contato de emergência e passar as informações certas
> ao atendimento médico se você se acidentar dirigindo nosso veículo. É só para isso. Não
> usamos para decidir seu aluguel, seu preço, nem passamos para seguradora, empresa de
> aplicativo ou qualquer outra pessoa.
>
> **Quem vê:** somente as pessoas da nossa equipe autorizadas a ver dados de saúde. Nem todo
> funcionário tem esse acesso, e todo acesso fica registrado.
>
> **Por quanto tempo guardamos:** até 6 meses depois do fim do seu contrato. Passado esse
> prazo, apagamos.
>
> **Você pode mudar de ideia:** pode pedir para apagar seus dados de saúde quando quiser, sem
> precisar justificar, e sem perder o contrato nem o veículo. Basta falar com a gente. Em até
> 15 dias apagamos e te confirmamos.
>
> ☐ **Eu autorizo** o uso dos meus dados de saúde para a finalidade descrita acima.

**Regras da caixa de marcar:**

- Nasce **desmarcada**. Consentimento pré-marcado não é consentimento.
- Fica em bloco próprio, imediatamente antes dos campos de saúde — não misturada com o aceite
  geral de uso do sistema (LGPD art. 11: consentimento **específico e destacado**).
- Sem a marcação, os campos de saúde ficam desabilitados e **não são enviados**.
- O mesmo bloco e o mesmo texto valem no formulário externo de 24h, que abre sem login.

## 2. O que gravar quando alguém aceita

| Campo | Conteúdo | Observação |
|---|---|---|
| `lgpd_consent_at` | data e hora do aceite | sem isso, não há consentimento — é o campo que o servidor exige |
| `lgpd_consent_version` | `1.0` | a versão **deste** arquivo que estava na tela no momento do aceite |
| origem | `INTERNAL_FORM` ou `EXTERNAL_TOKEN_FORM` | o card PH-059 pede a origem; hoje não há coluna para ela |
| quem registrou | id do usuário interno, ou o id do token no caso externo | no caso externo, quem aceita é o próprio titular |

A origem e o "quem registrou" **ainda não têm coluna**. São duas colunas novas em
`driver_health_profiles`, numa migration cujo número deve ser conferido com
`ls -1 drizzle/*.sql | sort | tail -1` e anunciado no card antes de criar.

## 3. Versionamento

- A versão vigente é a deste arquivo, exposta ao código por uma constante única. Hoje existe
  `LGPD_HEALTH_CONSENT_VERSION` em `src/server/driverFormTokenRoutes.ts:14`, usada só pelo
  formulário externo; ela precisa sair de lá para um módulo próprio e ser usada também pelo
  caminho interno.
- Publicar versão nova é: acrescentar a seção do texto novo **abaixo** da atual neste arquivo
  (as antigas não são apagadas — é o que prova o que a pessoa aceitou), subir a constante, e
  registrar a mudança no devlog.
- Quem aceitou `1.0` continua valendo por `1.0`. Não se pede aceite novo retroativamente, e
  **não** se reescreve `lgpd_consent_version` de ninguém.
- Para saber quem aceitou o quê: `lgpd_consent_version` por motorista, cruzado com as seções
  deste arquivo.

## 4. Revogação

- **Quem pode pedir:** o titular, a qualquer momento, sem justificar. Também aceito por quem
  atende o motorista, registrando que foi pedido por ele.
- **Efeito imediato:** `lgpd_consent_at` passa a nulo, os campos de saúde saem da tela (volta
  o badge "Consentimento LGPD Pendente", que já existe em
  `DriverDetailsModal.tsx:1040-1044`), e o registro entra na fila de descarte.
- **Prazo de execução:** apagar em até 15 dias do pedido, e confirmar ao titular.
- **O que fica:** o registro de que houve consentimento e de que foi revogado — data do
  aceite, versão aceita, data da revogação e quem registrou. O **dado de saúde** vai embora; a
  **trilha do consentimento** fica, porque é ela que prova que agimos certo.
- **Não** bloqueia nem cancela contrato, e não muda o preço. Revogar não é penalizado.

## 5. Descarte

- **Prazo: 6 meses após o encerramento do contrato** (decisão do Pedro, 2026-10-26). Escolhido
  por cobrir reclamação trabalhista imediata e disputa de sinistro recente, guardando dado
  sensível pelo menor tempo que ainda serve.
- Vencido o prazo, apagar os campos de saúde e manter a trilha do consentimento (item 4).
- Motorista com contrato novo dentro dos 6 meses: o prazo passa a contar do fim do contrato
  mais recente.
- **Como implementar:** o padrão já existe no projeto —
  `VehicleInspectionSettlementAuthority.listEligiblePurgeAttachments`
  (`src/server/vehicleInspectionRoutes.ts:400`) lista o que está elegível a expurgo com janela
  de retenção de 90 dias. Seguir o mesmo desenho: primeiro listar o elegível, depois executar,
  e o expurgo tem de ser idempotente (rodar duas vezes seguidas sem efeito na segunda, e provar
  isso — regra 3.2.h do CLAUDE.md).

## 6. Quem vê o bloco de saúde

**Já resolvido, não redefinir.** Medido em 2026-10-26: a leitura exige autoridade server-side
— `DriverService.getDriverHealthAndEmergency` e `updateHealthAndEmergency` lançam
`"Acesso negado: dados de saúde exigem autoridade server-side."`; a permissão é
`VIEW_DRIVER_HEALTH` / `EDIT_DRIVER_HEALTH`; e a tela tem bloqueio manual (`isHealthUnlocked`,
botão "Bloquear tela").

A regra que **não** pode ser quebrada ao mexer nisso: nunca alargar uma guarda existente para
caber saúde junto com o resto. Foi assim que o `AUTOERP-59` abriu escalada de privilégio —
`assertAdmin` passou a aceitar `MANAGE_USERS` e a mesma função guardava `setPermissions`.

---

## Histórico de versões

| Versão | Data | O que mudou |
|---|---|---|
| 1.0 | 2026-10-26 | Primeira versão. Prazo de descarte de 6 meses definido pelo Pedro. |
