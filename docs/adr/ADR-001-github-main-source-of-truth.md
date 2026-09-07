# ADR-001 — GitHub main como fonte única da verdade

**Status:** Aceito  
**Data:** 2026-09-07

## Contexto
O AutoERP é desenvolvido em frentes paralelas e utiliza ChatGPT, Gemini/AI Studio, GitHub, Render, Neon e Cloudflare. Decisões e alterações não podem existir apenas em chats, previews ou consoles externos.

## Decisão
A branch `main` do repositório oficial é a autoridade do código, migrations, regras versionadas, documentação e decisões arquiteturais aprovadas.

Chats e IAs são interfaces de trabalho. Render, Neon e Cloudflare executam/configuram o que foi aprovado, mas não substituem a autoridade do GitHub.

## Consequências
- alteração não commitada não é considerada parte do ERP;
- preview visual não prova deploy;
- migrations manuais sem correspondente versionado são proibidas;
- decisões técnicas relevantes devem ser registradas no repositório.
