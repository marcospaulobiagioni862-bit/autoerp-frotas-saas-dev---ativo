# Vehicle pós-CRLV — plano de execução

Problema: após a revisão/aplicação do CRLV, o fluxo atual não conduz explicitamente à complementação manual dos dados operacionais/patrimoniais que não existem no documento.

Causa: `VehicleCrlvImportPanel` compara e aplica apenas os campos extraídos do CRLV e encerra a interação no próprio painel.

Escopo mínimo planejado:
- indicar etapa obrigatória de complementação após aplicação do CRLV;
- destacar campos essenciais faltantes sem transformar IA em autoridade;
- manter edição manual como fonte de confirmação;
- acrescentar progresso visual determinístico do fluxo local;
- mapear FIPE como integração separada, server-side e sem misturar valor FIPE com valor de compra.

Riscos: endurecer obrigatoriedade sem conhecer o contrato server-side atual pode bloquear cadastros existentes; integração FIPE pode introduzir dependência externa/custo/instabilidade.

Critérios de aceite:
- CRLV aprovado continua sendo aplicado somente por ação humana;
- usuário vê claramente que o cadastro ainda precisa ser complementado;
- nenhum campo financeiro/patrimonial é inferido do CRLV;
- valor de compra e valor FIPE permanecem distintos;
- produção não é alterada.
