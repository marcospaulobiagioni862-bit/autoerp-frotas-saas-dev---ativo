# Mensagem semanal para o Marcos (05/10 a 12/10/2026)

**Status:** revisada pelo Claude em 12/10. Três afirmações numéricas da versão anterior foram corrigidas por não se sustentarem (detalhe no fim deste arquivo). O texto abaixo está pronto para envio.

---

Fala, Marcos! Tudo certo?

Fechando a semana com o resumo do que andou no AutoERP. Teve coisa que você vai ver na hora que abrir, e teve coisa de bastidor que não aparece na tela mas é o que segura o sistema de pé.

## O que você vai notar abrindo o sistema

**Cobrança por WhatsApp, em um clique.** No Contas a Receber apareceu o botão "Cobrar WhatsApp". Ele abre a conversa com o motorista já com o texto pronto: nome dele, valor, vencimento e a chave Pix da locadora. O sistema registra que a cobrança saiu, então fica o histórico.

**Devolução não fecha mais sem o KM.** Quando o contrato tem franquia de quilometragem, o sistema não deixa encerrar sem o odômetro de devolução. Se o motorista rodou além do contratado, ele calcula e lança a cobrança do excedente no Contas a Receber na mesma hora, junto com a liberação do carro. E se o motorista ainda não mandou a foto do painel, tem um botão que pede o KM por WhatsApp.

**Gestão da sua equipe, sem depender da gente.** Dá para cadastrar colaborador na Área Administrativa escolhendo a função (Gestor, Operacional, Financeiro, Somente leitura), editar dados depois e gerar uma senha forte com um clique, já com botão de copiar para mandar no WhatsApp. Cada pessoa também tem a tela "Meu Perfil", onde coloca a própria foto e troca a própria senha.

**Entrada no sistema mais simples.** Login agora é só e-mail e senha — acabou a digitação de CNPJ. E tem o botão de sair da conta no topo.

**Avisos de documento vencendo.** CRLV de carro e CNH de motorista aparecem com aviso antecipado, para não virar carro parado ou multa.

**Frota mista organizada.** O cadastro agora separa de quem é cada carro: da locadora, financiado, do sócio ou de terceiro.

**Visual novo.** O sistema inteiro passou por uma padronização de cores e acabamento. Antes cada tela tinha um tom diferente; agora segue um padrão só, mais sóbrio.

## O que mexemos por baixo

**O sistema ficou bem mais rápido.** A ficha do veículo fazia 13 consultas separadas ao banco para montar uma tela só; agora faz uma. Medindo uma navegação completa pelo sistema, as consultas caíram de 123 para 32, e o tempo somado de espera caiu de 58 para 15 segundos. É a diferença entre a tela "pensar" e a tela abrir.

**Acesso virou bloqueio por padrão.** Antes, um usuário sem permissão configurada acabava com mais acesso do que um configurado — o contrário do esperado. Invertemos: nada é liberado sem permissão explícita. Também fechamos uma brecha que deixava quem administrava usuários promover a si mesmo a administrador.

**Encerramento de contrato virou tudo ou nada.** Se cair a internet no meio do encerramento, o sistema desfaz tudo em vez de gravar pela metade. Não existe mais carro liberado sem a cobrança lançada, nem cobrança lançada sem o carro liberado.

**Baixa de pagamento ganhou estrutura própria.** O dado que permite estornar um pagamento morava numa tabela de registro geral. Se alguém limpasse aquela tabela, a capacidade de estorno ia junto. Agora tem lugar próprio e protegido.

**Datas e fusos corrigidos.** Documento não aparece mais vencendo um dia antes por diferença de fuso do servidor.

**Foto de vistoria agora funciona de verdade.** Tinha um limite técnico que fazia a vistoria com foto de celular falhar sempre na hora de salvar. Corrigido, e as fotos passaram a ser guardadas no lugar certo.

**Esteira de verificação automática.** Toda alteração passa por seis verificações na nuvem antes de entrar no ar. Se qualquer uma reprovar, a atualização não sobe.

## Por que isso importa para a locadora

O caixa passa a bater: não tem mais devolução sem cobrar o excedente, nem cobrança sem registro. Você administra sua equipe sozinho, inclusive resetando senha. E o sistema aguenta a operação do dia sem travar no meio do atendimento.

## Se puder testar, são 10 minutos

O sistema está no ar no link de sempre: autoerp-frotas-saas-dev-ativo.onrender.com

1. **Cobrar pelo WhatsApp** — Contas a Receber, escolha um título pendente, clique em "Cobrar WhatsApp" e veja a mensagem montada.
2. **Colocar sua foto** — clique nas suas iniciais no canto superior direito, vá em "Meu Perfil" e suba uma foto.
3. **Cadastrar alguém da equipe** — Área Administrativa, botão "+ Novo Usuário". Depois edite e teste o gerador de senha.
4. **Encerrar um contrato com KM extra** — Contratos, abra um contrato **que tenha franquia de KM configurada**, clique em Encerrar e digite uma quilometragem acima da contratada. Se o contrato não tiver franquia, o sistema encerra direto e não cobra nada — é o comportamento correto, não um erro.

Pode testar no celular também. Manda print ou áudio de qualquer coisa que incomodar, até detalhe pequeno.

## Semana que vem

- Visão única de contas a pagar e a receber, com previsão de caixa
- Checklist de vistoria mais rápido no pátio
- O que você apontar nos testes

Abraço!

---

## Notas da revisão (não enviar ao Marcos)

Três afirmações foram corrigidas por não se sustentarem na verificação:

1. **"Eliminação de mais de 60.000 linhas fantasmas" / "40% do código era fantasma"** — a semana removeu 50.058 linhas, mas adicionou 67.837: saldo positivo de 17.779. Além disso, 31.431 das remoções foram a troca de classes de cor da padronização visual, que reescreve linha, não apaga código morto. Afirmação retirada.
2. **"Até 16x mais rápido"** — o que foi medido: ficha do veículo de 13 consultas para 1, e numa navegação completa 123 consultas para 32, com o tempo somado caindo de 58s para 15,2s. São números bons e verificáveis; "16x mais rápido" não é nenhum deles. Trocado pelos números reais.
3. **"Criptografia scrypt agora protege as senhas"** — o scrypt já existia antes desta semana (commit `c409a02e`, anterior a 05/10). Apresentar como entrega da semana seria incorreto. Item retirado.

Também ajustado: o roteiro de teste nº 4 agora avisa que o contrato precisa ter franquia de KM configurada — sem esse aviso, o Marcos pode abrir um contrato sem franquia, ver que nada acontece e achar que está quebrado.

Expressões de reforço sem lastro foram retiradas ("nível bancário", "blindagem", "drástica", "reforma estrutural", "100% publicado", "trabalho pesado"), junto com os emojis de seção e o excesso de negrito. O texto perde o tom de anúncio e fica mais perto de alguém contando o que fez.
