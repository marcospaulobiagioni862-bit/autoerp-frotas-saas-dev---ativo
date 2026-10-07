# Levantamento Técnico e Comercial: Integrações com Terceiros (AUTOERP-50)

**Data do Levantamento:** 2026-10-07  
**Público-Alvo:** Apoio executivo para negociação presencial com o cliente Marcos (Sorocaba, 2026-10-09)  
**Objetivo:** Fornecer dados factuais, custos apurados, requisitos de credenciamento e roteiro de argumentação para responder às dúvidas do Marcos sobre:
1. Puxar débitos, IPVA, multas e licenciamento por RENAVAM (Requisito 5 do Dossiê);
2. Validar CNH por QR Code / Datavalid (Requisito 6 do Dossiê);
3. Assinatura digital de contratos (SaaS vs In-House vs Confirmação Manual);
4. Acompanhamento de conversa no WhatsApp (wa.me de 1 clique vs Meta Cloud API Oficial).

---

## 1. Matriz Resumo de Decisão Executiva

Esta tabela consolida os caminhos viáveis para uma frota de 13 a 50 veículos, eliminando hipóteses inviáveis de contratação direta estatal para pequenas empresas.

| Frente de Integração | Caminho Recomendado para o Marcos | Custo e Modelo de Cobrança Apurado | Prazo de Ativação | Complexidade no ERP | Fórmula de Resposta para a Reunião |
|---|---|---|---|---|---|
| **1. RENAVAM (Débitos, IPVA, Multas)** | Agregador Comercial (ex: **Infosimples**) | Pré-pago com franquia mínima de R$ 100/mês; R$ 0,08 por consulta de débitos/restrições (Fonte: Infosimples, out/2026). | 1 a 3 dias úteis (ativação imediata de conta). | Média (job agendado de consulta + conciliação em `traffic_tickets`). | *"Existe caminho via agregador que já tem as conexões prontas; o viável para o seu tamanho custa centavos por consulta com franquia mínima de R$ 100/mês; o próximo passo é definir se contratamos a conta da Infosimples para plugar no ERP."* |
| **2. Validação de CNH (QR Code)** | **App Oficial Vio (Serpro)** no balcão + **IA do AutoERP** | **R$ 0,00** (App Vio é 100% gratuito e offline; OCR/IA já roda no AutoERP). Datavalid via API exige contrato Serpro + Credencia Senatran (Fonte: Serpro, out/2026). | Imediato (download do app Vio na Play Store / App Store). | Zero (processo operacional já apoiado pelo ERP). | *"Existe a API do Serpro (Datavalid), mas ela exige credenciamento na Senatran e contrato estatal; o viável e mais seguro hoje é o app oficial gratuito Vio no celular da equipe, que valida o QR Code offline na hora; o próximo passo é padronizar esse checklist no balcão."* |
| **3. Assinatura Digital de Contratos** | Provedor SaaS Especializado (ex: **Clicksign** ou **ZapSign**) | Planos com API a partir de ~R$ 39 a R$ 59/mês para franquia de 20 documentos/mês (Fonte: Clicksign/ZapSign, out/2026). | 2 a 5 dias úteis (geração de token de API e templates). | Média (envio de PDF via API + recebimento de webhook de contrato assinado). | *"Existe assinatura eletrônica própria e provedores de mercado; o viável para o seu volume é um provedor como Clicksign ou ZapSign (cerca de R$ 40 a 60/mês); o próximo passo é escolher o provedor para ativarmos o envio automático para o WhatsApp do motorista."* |
| **4. WhatsApp (Acompanhamento)** | Manter **wa.me de 1 clique** no ERP; avaliar **Meta Cloud API** apenas se exigir chat interno | wa.me: **R$ 0,00**. Meta Cloud API: cobrança por mensagem (~R$ 0,035/msg) com 1.000 msgs de serviço grátis/mês, mas exige infraestrutura de chat e verificação Meta (Fonte: Meta Developers, out/2026). | wa.me: entregue. Meta API: 2 a 4 semanas (Business Verification). | Alta (exige construir tela de chat bidirecional e webhooks). | *"O envio de cobrança com link pronto de um clique nós entregamos sem custo extra; se você quiser ler as respostas do motorista dentro do sistema, isso vira uma central de atendimento que exige a API oficial da Meta e credenciamento comercial."* |

---

## 2. Frente 1: Débitos e Veículos por RENAVAM (Detran / Sefaz / DER)

### 2.1 Comparativo de Caminhos de Acesso
1. **Via Oficial Direta (SP.GOV.BR Integrador de APIs / Prodesp / Detran-SP):**
   - *Portal:* `integrador.sp.gov.br` / `api.prodesp.sp.gov.br`.
   - *Exigência Burocrática:* Exige celebração de **acordo bilateral formalizado via Processo SEI-SP** (Sistema Eletrônico de Informações do Governo do Estado de SP), credenciamento no Provedor de Identidade (IDP.SP.GOV.BR), justificativa de interesse público/institucional e análise jurídica do órgão.
   - *Prazo Típico:* Vários meses (trâmite estatal de convênio).
   - *Veredito Técnico:* **Inviável para locadora de pequeno/médio porte**. Modelo concebido para órgãos públicos, seguradoras de grande porte ou entidades financeiras.

2. **Via Agregador Comercial Especializado (Recomendado — ex: Infosimples):**
   - *Como Funciona:* Empresas de inteligência de dados que mantêm robôs e conectores homologados com portais governamentais e revendem o acesso via API REST padronizada (JSON).
   - *Custos e Modelo (Fonte: Infosimples - Tabela de Preços e Área do Cliente, consultado em 2026-10-07):*
     - Modelo **pré-pago** com recarga via cartão de crédito ou boleto/Pix.
     - Franquia mínima de consumo mensal: **R$ 100,00/mês** (se o consumo for menor, debita R$ 100,00 do saldo).
     - Custo unitário da consulta `DETRAN / SP / Débitos e Restrições`: **R$ 0,08 por consulta bem-sucedida**.
   - *Endpoints Cobertos para o Estado de São Paulo:*
     - `DETRAN/SP Débitos e Restrições`: retorna multas ativas, autuações em processamento, taxas de licenciamento e restrições administrativas/judiciais.
     - `SEFAZ/SP IPVA`: retorna guias de IPVA abertas com código de barras/Pix para pagamento.
     - `DETRAN/SP CRLV-e`: automação de emissão do documento veicular digital em PDF.
     - `DER/SP Indicação de Condutor Infrator`: automação de envio do formulário de indicação para o DER-SP.
   - *Atenção Técnica Crítica:* O portal do Detran-SP exige credenciais de autenticação (CPF e senha cadastrada ou login gov.br) para liberar a visualização de débitos de veículos. O agregador repassa esse parâmetro na chamada.

### 2.2 O Desconto de Multas: 20% vs 40% (Artigo 284 do CTB)
Uma dúvida frequente dos proprietários de frotas é o desconto no pagamento de multas de trânsito:
- **Desconto de 20% (Garantido por Lei):**
  - Previsto no caput do Art. 284 do CTB.
  - Concedido para **qualquer pagamento efetuado até a data de vencimento**, impresso diretamente no código de barras da Notificação de Penalidade.
  - **Não exige adesão a nenhum sistema eletrônico** e **não impede** o proprietário ou motorista de recorrer administrativamente da multa (se o recurso for provido, o valor é ressarcido).
- **Desconto de 40% (Exclusivo via SNE / CDT):**
  - Previsto no § 1º do Art. 284 do CTB.
  - Exige que o proprietário do veículo faça adesão prévia ao **Sistema de Notificação Eletrônica (SNE)** através do aplicativo da Carteira Digital de Trânsito (CDT) ou portal Senatran *antes* da emissão da notificação.
  - **Condição Obrigatória:** O proprietário deve **reconhecer expressamente o cometimento da infração** e **renunciar de forma irretratável a qualquer direito de defesa prévia ou recurso**.
  - O órgão autuador da multa (Detran, DER, PRF ou município) também precisa estar integrado ao SNE.
- **Conclusão para a Reunião:**
  - O pagamento pelo ERP com desconto padrão de 20% é imediato via código de barras. O desconto de 40% só é aplicável se a locadora aceitar abrir mão de qualquer recurso e fizer a gestão pelo app da Carteira Digital de Trânsito.

---

## 3. Frente 2: Validação de CNH por QR Code (Datavalid vs App Vio)

### 3.1 Via Oficial Datavalid (Serpro / Senatran API)
- *Fonte:* Serpro Loja e Normativas Senatran (Portaria nº 139/2025), consultado em 2026-10-07.
- *Requisitos de Credenciamento:*
  - A Senatran passou a exigir credenciamento prévio da pessoa jurídica interessada através da plataforma oficial **Credencia** da Senatran antes da liberação do contrato no Serpro.
  - Exige assinatura de Termo de Adesão na Loja Serpro, certificação digital e análise de conformidade com a LGPD.
- *Custos:*
  - O Serpro **não publica tabela de preço fixo universal de prateleira** aberta (preço sob consulta/faixas de consumo com franquia mínima mensal).
  - Disponibiliza período de teste demonstrativo de até 30 dias ou 3.000 consultas.
  - Para validações completas (dados cadastrais + biometria facial), o modelo exige franquias que partem de centenas a milhares de reais por mês, tornando-o desproporcional para 13 veículos.
- *Prazo:* 3 a 6 semanas para tramitação de credenciamento e liberação técnica.

### 3.2 O Caminho Operacional Gratuito e Confiável: App Oficial Vio (Serpro)
- *O que é:* Aplicativo móvel oficial desenvolvido pelo próprio Serpro para leitura e validação do QR Code criptográfico impresso nas CNHs e CRLVs digitais.
- *Custo:* **Totalmente gratuito** (disponível na Google Play Store e Apple App Store).
- *Diferencial Técnico:* Funciona **offline**, sem consumir internet. O QR Code da CNH possui assinatura digital governamental; o app Vio decodifica a chave e exibe instantaneamente na tela do celular a **foto oficial do condutor**, nome completo, CPF, categoria e validade.
- *Solução no AutoERP para Sorocaba:*
  - O AutoERP já realiza a extração inteligente via IA (Gemini OCR) ao subir a foto/PDF da CNH, preenchendo todos os dados cadastrais do motorista.
  - Para garantia antifraude, a conferência do QR Code pelo operador no balcão via app Vio leva 5 segundos, tem validade oficial da autoridade de trânsito e **custo financeiro zero**.

---

## 4. Frente 3: Provedor de Assinatura Digital de Contratos

### 4.1 Níveis de Assinatura e Segurança Jurídica
1. **Nível 1 — Confirmação Manual / Interna (Já Existente no AutoERP):**
   - Método `MANUAL_CONFIRMATION`: o contrato é impresso ou gerado em PDF e o operador marca a confirmação manual no sistema.
   - Validade operacional interna, mas exige guarda do papel assinado fisicamente.
2. **Nível 2 — Eletrônica com Trilha Própria (In-House):**
   - Envio de link com hash SHA-256 do documento, registro de IP, data/hora e User-Agent.
   - Válida pela MP 2.200-2/2001 e Lei Federal nº 14.063/2020 (Assinatura Eletrônica Simples/Avançada entre partes que concordarem com a forma).
   - Desvantagem: exige desenvolvimento de esteira de envio de e-mail/SMS com token, custódia de logs de auditoria e pode sofrer contestação em caso de litígio com motorista de má-fé.
3. **Nível 3 — Provedor SaaS Especializado (Recomendado para Automação):**
   - Plataformas consagradas no mercado com ampla aceitação e jurisprudência pacificada nos tribunais brasileiros.
   - O contrato em PDF gerado pelo AutoERP é enviado automaticamente via API para o motorista assinar na tela do próprio celular (via link de WhatsApp ou e-mail), com selfie, geolocalização e carimbo de tempo ICP-Brasil.

### 4.2 Comparativo Comercial dos Principais Provedores de API
*(Valores vigentes pesquisados em páginas públicas de planos e documentação oficial em 2026-10-07)*

| Provedor | Plano de Entrada com API | Franquia de Documentos Inclusa | Custo Adicional / WhatsApp | Observações Técnicas |
|---|---|---|---|---|
| **Clicksign** | **Plano Start:** a partir de **R$ 39,00/mês** | **20 documentos/mês** | No plano Start: envio por e-mail. Para envio de link nativo via WhatsApp, planos superiores (Plus a partir de R$ 59/mês). | API REST madura, documentação clara, suporte a webhooks para ativar contrato automaticamente no ERP quando assinado. |
| **ZapSign** | Planos profissionais a partir de **R$ 39,90 a R$ 69,90/mês** | 20 a 80 documentos/mês (plano Web). Planos de API possuem contratação dedicada com franquias anuais/mensais. | **R$ 0,50 por envio de WhatsApp**; R$ 0,10 por SMS; R$ 1,50 por biometria facial. | Interface muito intuitiva para o motorista assinar direto no WhatsApp pelo celular. |
| **D4Sign** | Planos Starter a partir de **R$ 39,90/mês** | Faixas a partir de 20 a 50 documentos/mês. | Recursos avançados de API / chave de integração podem exigir planos superiores (a partir de R$ 59,90/mês). | Forte presença em frotas e imobiliárias; exige confirmação com suporte se a chave de API está inclusa no plano Starter. |

*Recomendação para a Operação do Marcos:*  
Começar com **Clicksign (Plano Start/Plus)** ou **ZapSign**, que cobrem com folga a emissão mensal de contratos para 13 veículos com custo mensal fixo em torno de R$ 40 a R$ 60, integrando o webhook de retorno para mudar o status do contrato para `ACTIVE` de forma 100% automatizada.

---

## 5. Frente 4: WhatsApp — Envio por Link (`wa.me`) vs Meta Cloud API Oficial

### 5.1 O Reenquadramento Estratégico da Decisão de Produto
A decisão de arquitetura consolidada da V2 do AutoERP foi **descartar intermediários e priorizar os links diretos `wa.me` de um clique**:
- O `AUTOERP-55` já entregou a geração de mensagens pré-formatadas para solicitação de KM, aviso de multas e lembrete de vencimento de CNH.
- O `AUTOERP-49` entregará a mesma esteira para cobrança de aluguel (com valores, chave Pix e linha digitável do boleto).
- **Vantagens do modelo `wa.me`:** Custo zero de mensageria, zero taxa de adesão, sem dependência de verificação da Meta, sem intermediários (como Z-API) e sem risco de banimento de número comercial.

### 5.2 Como Responder à Pergunta do Marcos: *"E se eu quiser ver as respostas do motorista dentro do sistema?"*
Se o Marcos levantar a necessidade de ler as respostas dos clientes dentro do ERP ("acompanhamento de conversa" bidirecional / CRM):
1. **Esclarecer a fronteira do produto:**
   - O link de WhatsApp (`wa.me`) abre o WhatsApp oficial do atendente com a mensagem pronta. A conversa continua no celular/WhatsApp Web da empresa.
   - Trazer as respostas de volta para uma tela interna do ERP transforma o módulo em um **CRM / Chatbot de atendimento**, o que constitui um produto à parte.
2. **Custos e Regras da Meta Cloud API Oficial (Atualizado para outubro/2026):**
   - *Fonte:* Meta Business Platform Documentation & Rate Cards, consultado em 2026-10-07.
   - **Novo Modelo de Cobrança por Mensagem ("Per-Message Pricing"):** A Meta encerrou o modelo antigo de cobrança por janelas de 24 horas para templates e passou a cobrar por mensagem entregue.
   - Mensagens de Utilidade (notificações) e Mensagens de Serviço (respostas de atendimento) no Brasil custam em média **~R$ 0,035 por mensagem entregue** (cerca de 3,5 a 4 centavos).
   - **Franquia Gratuita:** Cada conta empresarial (WABA) recebe **1.000 mensagens de serviço gratuitas por mês**.
   - Para o volume de 13 a 50 carros (cerca de 100 a 300 mensagens/mês), o custo da Meta ficaria dentro da franquia gratuita ou em menos de R$ 10 a R$ 20/mês.
3. **O Custo Real da API Oficial não é a mensagem, é a infraestrutura:**
   - Exige processo de **Verificação de Empresa na Meta (Meta Business Verification)** com envio de contrato social e conta de consumo do Marcos (prazo de 2 a 4 semanas).
   - Exige construção de servidor de Webhooks, armazenamento de mensagens e tela de chat bidirecional no AutoERP.

---

## 6. Guia de Bolso para o Pedro na Reunião (Fórmulas de Resposta)

Para cada uma das dúvidas, use a fórmula aprovada:  
**"Existe caminho, o viável para o seu tamanho é X, e o próximo passo é Y."**

### 1. Sobre consulta automática de Multas / IPVA por RENAVAM:
> *"Marcos, existe caminho para puxar isso automaticamente. O caminho viável para uma frota do seu tamanho não é o convênio direto com o Detran — que leva meses e é burocrático —, mas sim um agregador comercial especializado que já tem essa ponte pronta e cobra centavos por consulta com uma franquia mínima de R$ 100 por mês. O próximo passo é decidirmos se você quer contratar esse agregador para conectarmos no ERP."*

### 2. Sobre validação de CNH por QR Code:
> *"Existe a API governamental do Serpro (Datavalid), mas ela exige credenciamento formal na Senatran e contrato estatal com franquias mínimas elevadas. O caminho viável, mais rápido e 100% seguro para a sua equipe hoje é o aplicativo oficial Vio do Serpro: ele é gratuito, roda no celular da recepção e lê o QR Code da CNH offline na hora, mostrando a foto oficial. O AutoERP já extrai os dados cadastrais da CNH por inteligência artificial, então o próximo passo é só colocar o app Vio no balcão como procedimento de conferência."*

### 3. Sobre Assinatura Digital de Contratos no celular:
> *"Existe assinatura eletrônica própria e provedores de mercado homologados. O caminho viável para o seu volume é usar um provedor especializado como Clicksign ou ZapSign, que custa entre R$ 40 e R$ 60 por mês para a sua quantidade de contratos e envia o link para o motorista assinar na hora pelo celular com validade jurídica indiscutível. O próximo passo é você escolher o provedor para integrarmos o link de envio automático no contrato."*

### 4. Sobre Cobrança por WhatsApp com acompanhamento de conversa:
> *"A cobrança com o texto pronto, valor, chave Pix e linha digitável do boleto nós vamos entregar com envio de um clique pelo WhatsApp oficial da sua empresa, sem nenhum custo extra de mensalidade. Se no futuro você quiser ler as respostas do motorista dentro de uma tela do sistema, isso exige a contratação da API oficial da Meta e verificação comercial da sua empresa; para o momento atual da frota, o envio rápido de um clique resolve a operação sem adicionar custo fixo."*
