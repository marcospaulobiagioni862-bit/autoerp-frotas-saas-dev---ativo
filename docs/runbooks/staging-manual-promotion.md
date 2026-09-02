# Promoção econômica e determinística do staging

## Decisão operacional

O AutoERP adota promoção **manual e única** para o staging depois que uma mudança ou lote incremental obtém gate verde na pull request.

O Render continua com `checksPass`, mas esse mecanismo não é considerado autoridade de promoção: o workflow oficial roda no `head` da pull request e o merge squash não publica o mesmo check no commit resultante da `main`. Não se repete a bateria completa no merge apenas para satisfazer o gatilho automático.

Esta política vale somente para staging. Produção permanece separada e exige autorização explícita.

## Pré-condições obrigatórias

Antes de disparar um deploy, registrar e conferir:

1. PR aberta, não draft e mergeável;
2. `head SHA` exato da PR;
3. execução `AutoERP PR Gates` associada a esse `head SHA`;
4. workflow e todos os jobs concluídos com `success`;
5. merge feito com proteção por `expected_head_sha`;
6. commit resultante confirmado como `HEAD` da `main`;
7. staging não está já nesse mesmo commit;
8. não há outro deploy de staging em andamento.

Uma PR sem gate verde não pode ser promovida. Um gate de outra revisão/commit não serve como evidência.

## Economia e agrupamento

- Agrupar correções pequenas relacionadas e fazer um deploy quando o lote tiver valor testável.
- Não disparar novo deploy para documentação, comentário, fechamento de issue ou mudança que não altere o runtime.
- Não repetir deploy enquanto o primeiro estiver `build_in_progress`, `update_in_progress` ou equivalente.
- Falha transitória é observada antes de qualquer retry. Retry não é automático nem em loop.
- Limpeza de cache fica desativada por padrão; só usar quando houver evidência de cache de build corrompido.

## Procedimento

1. Capturar o commit atual da `main` e o deploy live atual do serviço de staging.
2. Se ambos forem iguais, encerrar como `NOOP_ALREADY_LIVE`.
3. Conferir a cadeia de evidência da PR conforme as pré-condições.
4. Disparar exatamente um deploy manual do commit da `main`, sem limpar cache.
5. Aguardar o estado terminal do mesmo deploy.
6. Confirmar que o deploy ficou `live` no commit esperado.
7. Consultar apenas a janela de logs desse deploy e verificar:
   - migrations concluídas;
   - processo iniciado;
   - health check aprovado;
   - ausência de erro, exceção não tratada ou resposta 5xx recorrente.
8. Executar somente o teste funcional de staging relacionado ao lote promovido.
9. Registrar na issue/PR: commit, ID do gate, ID do deploy, resultado do teste e confirmação de que produção não foi alterada.

## Estados de parada

Interromper a promoção e não repetir automaticamente quando ocorrer:

- commit da `main` diferente do merge validado;
- gate ausente, cancelado ou falho;
- deploy concorrente;
- migration falha;
- health check falha;
- erro persistente de inicialização;
- necessidade de segredo, custo, dado real ou decisão operacional;
- qualquer destino que não seja o serviço autorizado de staging.

## Evidência mínima de conclusão

A promoção só é considerada concluída com o conjunto:

`PR + head SHA + gate success + merge SHA/main + deploy ID live + teste focal PASS`.

A ausência de teste focal não autoriza produção e mantém somente aquela validação pendente, sem bloquear outras frentes independentes.
