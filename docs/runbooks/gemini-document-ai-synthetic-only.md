# Runbook: Gemini Document AI somente com documentos sintéticos

## Escopo autorizado

Autorização de 2026-08-24, registrada na #283:

- provedor Gemini executado somente no servidor;
- somente no serviço de staging `srv-da5irgjbc2fs7397pau0`;
- somente com documentos integralmente sintéticos;
- produção e documentos reais continuam proibidos até nova autorização explícita.

## Barreira técnica

`GeminiDocumentAiProvider` recebe uma allowlist não vazia de SHA-256. Antes de chamar o SDK, calcula o hash dos bytes e recusa qualquer conteúdo que não esteja na lista. A recusa acontece antes de transmitir dados ao provedor.

O adaptador não está conectado automaticamente à fila. Uma ativação futura deve fornecer uma fixture sintética conhecida e seu SHA-256 exato. Não basta marcar um upload como sintético nem definir apenas uma variável booleana.

## Configuração permitida em staging

- `GEMINI_API_KEY`: segredo somente no servidor; nunca no bundle do navegador, log, issue ou PR.
- modelo inicial: `gemini-2.5-flash` pela API estável `v1`.
- lista de SHA-256: somente hashes produzidos de fixtures sintéticas versionadas ou geradas pelo roteiro de validação.

Não copiar essas variáveis para produção. Não inserir documento real na allowlist.

## Validação segura

1. Gerar uma fixture sem nome, CPF/CNPJ, placa, endereço ou outro dado real.
2. Calcular e registrar o SHA-256 da fixture.
3. Instanciar o adaptador com uma allowlist contendo exclusivamente esse hash.
4. Confirmar que a fixture permitida chega ao client e retorna JSON.
5. Alterar um byte e confirmar rejeição antes de qualquer chamada externa.
6. Confirmar que `tools` não é enviado ao Gemini e que a saída passa pela validação estrita do processador.
7. Registrar modelo, hash sintético, horário, resultado e custo na #288; nunca registrar a chave.

## Pendências para chamada externa

- autenticar no painel Render;
- confirmar ou cadastrar `GEMINI_API_KEY` somente no staging;
- criar a fixture sintética definitiva e registrar seu hash;
- executar uma única validação controlada;
- anexar evidência sanitizada à #288.

Qualquer pedido para processar bytes fora da allowlist, usar produção ou usar documento real exige nova autorização na #283.
