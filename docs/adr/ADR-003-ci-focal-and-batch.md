# ADR-003 — CI focal por frente e gate completo por lote

**Status:** Aceito  
**Data:** 2026-09-07

## Contexto
O workflow atual executa a matriz completa para PRs pequenos, gerando espera e falhas cruzadas.

## Decisão
Adotar dois níveis:
1. PR/fatia: lint, typecheck, build e testes focais/invariantes mínimos;
2. lote central: bateria completa de integração e build de produção.

A otimização não pode remover testes críticos; deve apenas executá-los no estágio apropriado.

## Consequências
- menor tempo de feedback por frente;
- gate completo preservado antes da promoção;
- falhas cruzadas passam a ser tratadas na integração central.
