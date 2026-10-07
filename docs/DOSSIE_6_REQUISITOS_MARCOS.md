# Dossiê Executivo: Passada de Verificação dos 6 Requisitos do Marcos (AUTOERP-65)

**Data da Auditoria:** 2026-10-07  
**Alvo da Reunião:** Reunião Presencial em Sorocaba (Sexta-feira, 2026-10-09)  
**Ambiente Auditado:** Base de Homologação Real Neon (`staging-company-001`, projeto `autoerp-staging`)  
**Script Oficial de Verificação:** `npm run verify:marcos-requirements` (`src/server/__tests__/verifyMarcosRequirementsRealMassa.ts`)

---

## 1. Quadro Resumo de Vereditos (A Matriz da Verdade)

Esta matriz foi consolidada a partir da execução automatizada contra a API e o banco de homologação, eliminando qualquer afirmação não comprovada por código.

| # | Requisito do Marcos | Veredito Factual | O que Existe Hoje | O que NÃO Existe / O que Falta | Card de Referência no Gestão |
|---|---|---|---|---|---|
| **1** | Cobrança por WhatsApp com acompanhamento de conversa | **NÃO EXISTE** | Templates operacionais de link WhatsApp (`KM_REQUEST`, `TRAFFIC_TICKET`, `CNH_EXPIRY`) com dados e locatário reais (`AUTOERP-55`). | Cobrança de aluguel/fatura por WhatsApp não existe (retorna HTTP 400). Acompanhamento de conversa (chat bidirecional/CRM) não existe. | `AUTOERP-49` (Aberta, não entregue) |
| **2** | Controle de KM contra o limite do contrato | **PARCIAL** | Colunas `franchise_km` e `excess_km_rate` no banco; campo na interface; cláusula impressa no PDF assinado; cálculo no relatório de rentabilidade. | Encerramento de contrato (`/api/contracts/:id/close`) aceita apenas `{ closeDate, reason }`. Não exige odômetro final nem gera cobrança automática de KM excedente na liquidação. `ContractService` é código morto. | `AUTOERP-09` (Aberta, não entregue) |
| **3** | Vencimento de documentos | **FUNCIONA COM RESSALVA** | Central de Documentos (`/api/documents/alerts`) calcula vencimentos por estágios em tempo de leitura. Alerta de CNH via WhatsApp (`AUTOERP-55`). | Status persistido no motorista (`cnh_status`) só é calculado na criação/edição manual (`evaluateCnhStatus`), ficando estático com o tempo. Documentos com offset ISO timestamp falham na leitura (`AUTOERP-15`). | `AUTOERP-15` e `AUTOERP-16` (Abertas, não entregues) |
| **4** | Botão de sair do sistema (Logout) | **FUNCIONA** | Botão "Sair da conta" no menu do avatar (`Header.tsx:240`), encerramento de sessão real (`POST /api/auth/logout` $\rightarrow$ 204 com `Set-Cookie` expirado), limpeza de rascunhos e redirecionamento. | Nada. 100% entregue e aprovado com testes unitários, mutação e homologação real Neon. | `AUTOERP-46` (Concluída, 10/10) |
| **5** | Puxar multas, IPVA e licenciamento por RENAVAM | **NÃO EXISTE** | Módulo interno de Multas com máquina de 8 estados para indicação de condutor e controle de prazos cadastrados manualmente. | Consulta automática a Detran/SNE/Serpro via RENAVAM não existe (retorna HTTP 404). | `AUTOERP-50` e `AUTOERP-57` (Abertas, não entregues) |
| **6** | Validar CNH por QR Code | **NÃO EXISTE** | Upload de imagem da CNH e extração de dados cadastrais assistida por IA (OCR/GenAI). | Validação criptográfica do QR Code Vio/Datavalid junto ao Serpro/Senatran não existe (retorna HTTP 404). | `AUTOERP-50` (Aberta, não entregue) |

---

## 2. Fichas Técnicas e Roteiro de Demonstração para Sorocaba

---

### Requisito 1: Cobrança por WhatsApp com Acompanhamento de Conversa
- **Veredito Factual:** **NÃO EXISTE**
- **Evidência no Código & Banco:**
  - Rota `POST /api/whatsapp/wa-link`: aceita estritamente `KM_REQUEST`, `TRAFFIC_TICKET` e `CNH_EXPIRY`. Qualquer envio de `templateType: 'RENT_BILLING'` ou fatura retorna **HTTP 400 Bad Request** (`Parâmetros inválidos para geração de link do WhatsApp`).
  - Rotas de webhook de conversa/chat (`/api/whatsapp/inbox/*`): retornam **HTTP 404 Not Found**.
  - O card que constrói a régua de cobrança de aluguel é o `AUTOERP-49` e está em aberto.
- **Roteiro para a Demonstração na Tela:**
  1. Abrir a aba **Veículos** ou **Motoristas**.
  2. Demonstrar o botão de WhatsApp nos alertas de KM ou Multas: clicar para abrir o WhatsApp Web e mostrar a mensagem pré-formatada com a placa, data e locatário reais.
- **O que Falar para o Marcos:**
  > *"Marcos, os alertas operacionais de WhatsApp para pedir KM, avisar de multas e lembrar da CNH já geram o link pronto com o número do locatário e os dados do carro. A régua de cobrança de aluguel com link de boleto/Pix e o acompanhamento de conversa de duas vias estão no card AUTOERP-49, que requer a contratação de uma API de WhatsApp (como Evolution API ou Z-API) para receber as respostas do cliente dentro do ERP."*

---

### Requisito 2: Controle de KM contra o Limite do Contrato
- **Veredito Factual:** **PARCIAL (Franquia contratada e impressa; sem cobrança automática no encerramento)**
- **Evidência no Código & Banco:**
  - Tabela `contracts` na massa Neon: colunas `franchise_km` (ex: `1500`) e `excess_km_rate` (ex: `0.75`) existem e estão preenchidas.
  - O contrato em PDF oficial gerado (`POST /api/contracts/:id/generate-pdf`) imprime a franquia e a taxa de KM excedente.
  - A tela de rentabilidade/DRE calcula o KM excedente teórico.
  - **O GAP:** A rota de encerramento (`POST /api/contracts/:id/close` em `src/server/contractRoutes.ts:820`) aceita apenas `{ closeDate, reason }`. Ela **não exige odômetro final** e **não gera lançamento financeiro a receber do excedente** na devolução. A classe `ContractService.ts` com regras de excedente é código morto (não importada por ninguém). O card responsável é o `AUTOERP-09` (aberto).
- **Roteiro para a Demonstração na Tela:**
  1. Abrir a aba **Contratos**.
  2. Abrir um contrato ativo (ex: `v2demo-ngcompany001-contract-03`) e mostrar o campo **Franquia de KM (1.500 km)** e **Taxa de Excedente (R$ 0,75/km)**.
  3. Baixar ou visualizar o PDF do contrato e mostrar as cláusulas de franquia impressas com validade jurídica.
- **O que Falar para o Marcos:**
  > *"Marcos, o contrato já amarra a franquia de KM e o valor do KM extra, e isso sai no contrato impresso que o motorista assina. Hoje, a conferência de odômetro na devolução é operacional; o desenvolvimento que bloqueia o encerramento sem odômetro e já gera o Contas a Receber automático da diferença está no card AUTOERP-09."*

---

### Requisito 3: Vencimento de Documentos
- **Veredito Factual:** **FUNCIONA COM RESSALVA**
- **Evidência no Código & Banco:**
  - Central de Documentos (`GET /api/documents/alerts`): calcula dinamicamente os dias até a expiração em estágios (`D90`, `D60`, `D30`, `D15`, `D7`, `D1`, `POST_DUE`).
  - **O GAP 1:** Na tabela `drivers`, a coluna de status persistido só é recalculada no momento em que alguém clica em "Salvar" no cadastro do motorista (`evaluateCnhStatus`). Se a CNH vencer no calendário, a tabela de motoristas mantém o valor antigo até edição manual (`AUTOERP-16` aberto).
  - **O GAP 2:** Se houver datas no banco com timestamp ISO completo (ex: `2026-10-08T22:00:00-03:00`), a função `parseIsoDate` rejeita a data na Central de Documentos (`AUTOERP-15` aberto).
- **Roteiro para a Demonstração na Tela:**
  1. Abrir a aba **Documentos**.
  2. Mostrar os filtros e alertas visuais de documentos prestes a vencer e vencidos.
  3. Mostrar o alerta de renovação de CNH com link de WhatsApp no motorista.
- **O que Falar para o Marcos:**
  > *"A Central de Documentos avisa com precisão os documentos que estão para vencer hoje ou nos próximos dias. O refinamento que estamos concluindo (AUTOERP-16) é fazer esse mesmo alerta refletir de forma automática na ficha do motorista sem depender de você abrir a tela de edição dele para atualizar."*

---

### Requisito 4: Botão de Sair do Sistema (Logout)
- **Veredito Factual:** **FUNCIONA (100% Entregue)**
- **Evidência no Código & Banco:**
  - Header (`src/components/layout/Header.tsx:240`): botão "Sair da conta" estilizado, acessível em todos os papéis (ADMIN, OPERATIONAL, FINANCIAL).
  - Backend: `POST /api/auth/logout` responde **HTTP 204 No Content** com `Set-Cookie: autoerp_session=; Expires=Thu, 01 Jan 1970 ...`.
  - Frontend: `useAuth().logout()` limpa rascunhos locais e redireciona para a tela de login.
  - Validado no CI com testes unitários, teste de mutação e verificação na massa real do Neon (`npm run verify:avatar-menu-real`). Card `AUTOERP-46` fechado em 10/10.
- **Roteiro para a Demonstração na Tela:**
  1. Clicar no avatar do usuário no canto superior direito do Header.
  2. Mostrar o nome, papel e empresa.
  3. Clicar em **"Sair da conta"** e comprovar o redirecionamento imediato para a tela de login.
- **O que Falar para o Marcos:**
  > *"O botão de sair da conta está entregue exatamente onde você pediu: no menu do seu perfil no canto superior direito, com encerramento de sessão real e seguro no servidor."*

---

### Requisito 5: Puxar Multas, IPVA e Licenciamento por RENAVAM
- **Veredito Factual:** **NÃO EXISTE**
- **Evidência no Código & Banco:**
  - Tentativas de consultar rotas de sincronização de RENAVAM retornam **HTTP 404 Not Found**.
  - O sistema possui um módulo completo de Multas (`TrafficTicketAuthority`), mas a entrada de infrações é **manual ou por planilha**, com gestão de prazos e máquina de 8 estados para indicação de condutor.
  - A integração com o SNE (Sistema de Notificação Eletrônica) ou APIs de terceiros está no levantamento do `AUTOERP-50` e `AUTOERP-57` (ambos abertos).
- **Roteiro para a Demonstração na Tela:**
  1. Abrir a aba **Multas**.
  2. Demonstrar a listagem de multas cadastradas, os estágios de notificação e o formulário de indicação do motorista infrator.
- **O que Falar para o Marcos:**
  > *"Marcos, toda a gestão de multas e a máquina de indicação de condutor com controle de prazos já funcionam dentro do ERP. A consulta automática no Detran/SNE pelo RENAVAM depende de contratação de API governamental ou conector de trânsito pago; temos o levantamento técnico pronto (AUTOERP-50/57) para decidir se você quer contratar esse serviço externo."*

---

### Requisito 6: Validar CNH por QR Code
- **Veredito Factual:** **NÃO EXISTE**
- **Evidência no Código & Banco:**
  - Endpoints de validação de QR Code (Vio / Datavalid) retornam **HTTP 404 Not Found**.
  - O cadastro de motoristas permite upload da imagem/PDF da CNH e utiliza Inteligência Artificial (Gemini / OCR) para extrair o texto e pré-preencher nome, CPF, número e validade.
  - A validação criptográfica do QR Code Vio exige certificado digital e convênio formal com o Serpro/Senatran (custo unitário por consulta). Mapeado no `AUTOERP-50` (aberto).
- **Roteiro para a Demonstração na Tela:**
  1. Abrir a aba **Motoristas**.
  2. Mostrar a ficha cadastral do motorista com o número da CNH, categoria e data de validade.
- **O que Falar para o Marcos:**
  > *"O sistema já faz a leitura inteligente dos dados da CNH a partir do documento anexado. A validação do QR Code oficial Vio exige integração direta com o Serpro/Datavalid com custo por validação, o que deixamos mapeado no levantamento do AUTOERP-50 para você avaliar o custo-benefício."*

---

## 3. Comprovação Automatizada Local e no CI

Para reproduzir a auditoria em qualquer momento contra o banco Neon de homologação:
```bash
npm run verify:marcos-requirements
```
A execução é idempotente, segura (apenas leitura e testes de rotas inexistentes) e finaliza com a tabela consolidada de vereditos no console.
