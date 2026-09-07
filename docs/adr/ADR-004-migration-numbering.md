# ADR-004 — Numeração e promoção de migrations

**Status:** Aceito  
**Data:** 2026-09-07

## Contexto
Branches paralelas podem partir da mesma migration e reservar o mesmo próximo prefixo, como ocorreu com duas migrations `0064`.

## Decisão
A sequência final de migrations é autoridade da Fila Central. Antes do gate do lote:
- comparar migrations novas com a `main`;
- resolver prefixos duplicados;
- renumerar em ordem determinística;
- executar check automatizado de duplicidade de prefixos;
- aplicar schema somente por migrations versionadas.

## Consequências
Nenhuma migration de feature branch tem número final garantido até entrar no lote central.
