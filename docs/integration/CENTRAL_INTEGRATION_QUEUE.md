# AutoERP — Fila Central de Integração

**Status:** ATIVA  
**Fonte do código existente:** `main`  
**Baseline de abertura:** `53fb8969bb0628c6efeaa5b46c6791e3b7db4ba4`  
**Regra:** nenhum chat/frente promove, mergeia ou deploya de forma independente.

## Estados

- `READY`: candidato tecnicamente pronto para integração central.
- `BLOCKED`: não pode ser integrado até resolver erro/conflito.
- `EXTRACT`: PR grande/antigo; funcionalidades válidas devem ser extraídas para branches novas a partir da `main`.
- `SUPERSEDED`: substituído por implementação mais nova comprovada.
- `INTEGRATED`: já incorporado ao lote/main.
- `REJECTED`: descartado após comparação explícita.

## Lote estrutural inicial

| PR | Frente | Estado central | Evidência atual | Decisão |
|---|---|---|---|---|
| #962 | Layout / Sidebar | BLOCKED | branch antiga, não mergeável; sobrepõe #970 mas contém lógica adicional de viewport | não mergear nem fechar automaticamente; comparar e extrair apenas o que ainda faltar |
| #963 | Veículos | READY | CI #833 verde; branch está atrás da main | replay/rebase seletivo na integração; não mergear diretamente |
| #964 | Veículos/KM | EXTRACT | draft, não mergeável, 78 commits à frente / 5 atrás, múltiplos domínios e migrations | nunca mergear como bloco; extrair fatias aprovadas desde a main atual |
| #968 | Layout global | BLOCKED | CI #892 falhou; diff remove navegação de notificações ao tentar exibir scrollbar | reconstruir correção de scrollbar a partir da main atual sem remover `handleResolveNotification` |
| #971 | Manutenção | READY | head `45d1ed4f...`; CI #898 verde | candidato ao lote; reservar migration final somente na integração |

## Conflito de migrations

A `main` possui migrations até `0063`.

Hoje há colisão conhecida:
- PR #964: `0064_vehicle_km_batch_schedule.sql`
- PR #971: `0064_maintenance_work_order_finance.sql`

**Regra central:** número final de migration é definido somente no lote de integração. PRs/fatias extraídas devem ser renumerados antes do gate final.

## Regras de promoção

1. Toda fatia nasce/rebaseia da `main` atual.
2. Não reaplicar arquivo inteiro de branch velha.
3. Arquivos compartilhados (`App.tsx`, `vite.config.ts`, layout, tipos globais, workflows, schema) exigem comparação com a `main` imediatamente antes da integração.
4. Teste focal ocorre na frente.
5. Gate completo ocorre no lote central.
6. Merge na `main` ocorre somente após o lote estar coerente.
7. Staging recebe um único deploy do lote.
8. Produção exige autorização explícita do proprietário.

## Critério de “concluído”

Uma alteração só pode ser marcada como concluída quando:
- código correto está integrado;
- testes focais passaram;
- gate do lote passou;
- merge foi concluído;
- deploy esperado está live;
- SHA/build implantado foi identificado;
- validação externa foi concluída quando aplicável.
