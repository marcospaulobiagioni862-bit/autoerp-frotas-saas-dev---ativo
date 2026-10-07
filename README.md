<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://ai.google.dev/static/site-assets/images/share-ais-513315318.png" />
</div>

# Run and deploy your AI Studio app

This contains everything you need to run your app locally.

View your app in AI Studio: https://ai.studio/apps/5e63dc1b-6a37-40d1-a0d7-6c57026ba069

## Run Locally

**Prerequisites:**  Node.js


1. Install dependencies:
   `npm install`
2. Set the `GEMINI_API_KEY` in [.env.local](.env.local) to your Gemini API key
3. Run the app:
   `npm run dev`

## Verificações em Homologação Real (Neon)

Estes scripts executam validações de ponta a ponta contra o banco Neon de homologação (`staging-company-001`). Eles dependem de credenciais reais configuradas em `~/.config/autoerp-neon.env` ou nas variáveis de ambiente `HOMOLOG_DATABASE_URL` / `DATABASE_URL`.

> **Atenção:** Por dependerem de banco PostgreSQL externo com credenciais de homologação, estes scripts **não rodam no CI** (que utiliza regressões herméticas com PGlite em memória).

Comandos disponíveis via npm:

- **WhatsApp wa.me (AUTOERP-55)**:
  ```bash
  npm run verify:whatsapp-real
  ```
  Valida a geração autoritativa e auditada de links do WhatsApp para KM, multas e renovação de CNH com número do locatário e valores reais.

- **Ciclo de Vida de Contrato (AUTOERP-53)**:
  ```bash
  npm run verify:contract-lifecycle-real
  ```
  Valida o fluxo completo de contrato: `DRAFT` -> guarda `SIGN_CONTRACT` (403) -> geração de PDF -> assinatura -> ativação formal (`ACTIVE` / veículo `RENTED`) -> recálculo financeiro seguro.

- **Matriz de Permissões de Usuário (AUTOERP-59)**:
  ```bash
  npm run verify:user-permissions-real
  ```
  Valida a guarda no servidor de todas as 11 permissões da matriz granular (bloqueio 403 Forbidden quando desmarcado, 200/201 OK quando concedido).

