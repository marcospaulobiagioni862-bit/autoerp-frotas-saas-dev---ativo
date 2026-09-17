# AutoERP V2 — Princípios e Plano Enxuto

## Regra-mestra
Pegar o que já funciona, tirar a burocracia e fazer o ERP operar com poucos cliques.

## Proteção da V1
- V1 atual, `main`, produção e `staging-app` ficam intocados durante a construção da V2.
- A V1 serve apenas como fonte de banco, regras validadas, serviços e componentes funcionais.
- Nenhuma simplificação da V2 deve exigir alteração na V1.

## Estratégia de velocidade
1. Reutilizar backend, banco, autenticação, multiempresa, idempotência, auditoria e serviços financeiros que já funcionam.
2. Reconstruir apenas a camada operacional que estiver burocrática ou excessiva.
3. Não migrar estados, gates, workflows ou campos técnicos sem necessidade real.
4. Manter detalhes avançados escondidos por padrão.
5. Priorizar fluxo fim a fim antes de recursos secundários.

## Primeira etapa — núcleo operacional
Fluxo A: Veículo -> Motorista -> Contrato -> Conta a Receber -> Recebimento.

Fluxo B: Despesa -> Conta a Pagar -> Pagamento.

Módulos da primeira etapa:
- Veículos
- Motoristas
- Contratos
- Contas a Receber
- Contas a Pagar
- Movimentações financeiras essenciais

## Regras atuais de contrato
- Ao salvar um contrato válido, veículo e motorista ficam vinculados e indisponíveis para outro contrato.
- A assinatura é evidência documental, não o gatilho para impedir dupla locação.
- O contrato salvo gera Contas a Receber de forma idempotente conforme a regra financeira.
- Encerrar o contrato interrompe novas recorrências, mas não apaga obrigações financeiras já criadas.

## Regras atuais de documentos
- IA/OCR extrai dados e preenche o formulário.
- O operador confere e corrige.
- Ao salvar, os dados salvos são a fonte operacional válida.
- O arquivo permanece como evidência/consulta, sem criar workflows posteriores desnecessários.

## Regras atuais do financeiro
- Criar CP/CR não movimenta caixa.
- Pagamento/recebimento cria a movimentação financeira real.
- Campos técnicos, UUIDs e chaves de idempotência não aparecem para o operador.
- CP, CR e lançamentos manuais devem parecer um único sistema financeiro.

## Critério para cada item legado
- REUTILIZAR: funciona e já atende a V2.
- ADAPTAR: lógica boa, UX/regra antiga precisa simplificação.
- DESCARTAR: burocracia, duplicidade, excesso ou regra sem valor operacional.

## Ordem de execução
1. Navegação V2 enxuta.
2. Veículos + Motoristas.
3. Contratos com vínculo imediato e geração de CR.
4. CP + CR + pagamento/recebimento.
5. Teste E2E do núcleo.
6. Só depois: manutenção, multas, seguro, rastreador e documentos complementares.

## Critério de conclusão da primeira etapa
A primeira etapa termina quando os dois fluxos abaixo passarem em teste E2E sem intervenção manual fora do ERP:
- cadastrar/selecionar veículo e motorista -> salvar contrato -> gerar CR -> receber;
- lançar despesa -> gerar CP -> pagar.
