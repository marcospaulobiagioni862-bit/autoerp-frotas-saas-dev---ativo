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

> **Atenção:** Estes scripts **não rodam no CI** exclusivamente por dependerem de credenciais externas do banco Neon e da massa previamente semeada em homologação (`staging-company-001`). O pipeline de CI utiliza seu próprio banco `postgres:16` de serviço efêmero, enquanto o PGlite atua apenas como fallback local de desenvolvimento quando `DATABASE_URL` não está definido.

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

- **Menu do Avatar e Área Administrativa (AUTOERP-46)**:
  ```bash
  npm run verify:avatar-menu-real
  ```
  Valida a autorização em homologação real: usuário ADMIN (`v2demo-ngcompany001-user-admin`) acessa rotas de administração (`/api/admin/users` e `/api/admin/tenant-profile` com 200 OK), usuário não-ADMIN (`v2demo-ngcompany001-user-operational`) recebe 403 Forbidden estritamente nas rotas administrativas e executa logout limpo (204 No Content), usuário com permissões vazias (`staging-canary-001`) recebe 403 em ambas as rotas, e chamadas sem sessão recebem 401 Unauthorized.

- **Auditoria dos 6 Requisitos do Marcos (AUTOERP-65)**:
  ```bash
  npm run verify:marcos-requirements
  ```
  Executa a passada de auditoria automatizada contra a massa real do Neon (`staging-company-001`), comprovando os vereditos factuais dos 6 requisitos do Marcos para a reunião de Sorocaba com IDs de contratos, rotas e status HTTP.


