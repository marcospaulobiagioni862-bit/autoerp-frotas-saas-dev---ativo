# ADR-002 — Fila Central de Integração

**Status:** Aceito  
**Data:** 2026-09-07

## Contexto
Contratos, Veículos, Motoristas e Manutenção podem trabalhar em paralelo, mas merges/deploys independentes envelhecem branches e podem sobrescrever arquivos compartilhados.

## Decisão
As frentes produzem candidatos. Somente a Fila Central de Integração decide a promoção para lote, merge em `main` e deploy de staging.

Estados oficiais: `READY`, `BLOCKED`, `EXTRACT`, `SUPERSEDED`, `INTEGRATED`, `REJECTED`.

## Consequências
- nenhum PR de frente é mergeado diretamente;
- branches antigas não são usadas para substituir arquivos inteiros;
- conflitos são resolvidos antes do gate final;
- staging recebe um deploy por lote testável.
