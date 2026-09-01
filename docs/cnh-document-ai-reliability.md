# CNH Document AI — diretriz de confiabilidade

## Decisão

O fluxo de cadastro por CNH não pode depender de uma única chamada síncrona ao Gemini 3.6 Flash como condição para preservar o documento ou para permitir retomada do processo.

### Princípios

1. O arquivo original da CNH é persistido antes da análise e permanece a fonte documental do processo.
2. Falha de capacidade/quota do provedor (`429`) é falha de infraestrutura externa, não falha de legibilidade da CNH.
3. O operador nunca deve precisar reenviar o mesmo documento apenas porque o provedor ficou indisponível.
4. O modelo primário para extração simples de CNH deve priorizar capacidade, custo e análise documental. Em staging, usar `gemini-3.5-flash-lite`, modelo multimodal estável indicado pelo Google para document parsing e high-throughput.
5. O modelo mais pesado só deve ser considerado como escalonamento para casos de baixa confiança/extração incompleta, nunca como primeira tentativa obrigatória de todo documento.
6. `429` deve entrar em espera/reprocessamento controlado, com cooldown/backoff e reaproveitamento do mesmo intake/anexo/extraction; não criar um novo upload.
7. A UI deve distinguir: capacidade temporária, documento inválido, saída inválida e erro permanente.
8. A aprovação humana continua obrigatória antes de materializar dados da CNH no cadastro.
9. CPF, número de CNH, datas e categoria devem continuar passando por validações determinísticas do servidor; IA não é fonte de autoridade.
10. Nenhum dado real da CNH, chave de API ou payload bruto do provedor deve aparecer em logs, testes ou issues.

## Plano de estabilização

- Etapa A: validar `gemini-3.5-flash-lite` em staging com uma única CNH real já autorizada pelo operador.
- Etapa B: expor reprocessamento do mesmo extraction/intake após `PROVIDER_RATE_LIMITED`, sem novo upload e com cooldown persistente/server-side.
- Etapa C: só então avaliar fallback de modelo para baixa confiança, não para mascarar quota esgotada.
- Etapa D: promover para produção apenas após regressões, build, fluxo completo CNH → revisão → materialização → completar dados → documentos do motorista.

## Critério de parada

Não repetir uploads em sequência para diagnosticar `429`. Primeiro confirmar tier/quota do projeto no AI Studio e o comportamento do modelo primário de parsing. Produção permanece bloqueada enquanto o fluxo não completar de ponta a ponta em staging.
