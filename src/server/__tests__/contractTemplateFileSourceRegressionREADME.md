# Contract template file-source regression

Cobertura focada da issue #676:

- Markdown existente continua ativo e atual.
- Nova versão por arquivo nasce inativa e não substitui a versão atual antes do upload.
- Promoção sem arquivo falha fechada.
- PDF e DOCX são aceitos apenas como `CONTRACT_TEMPLATE_SOURCE` de `ContractTemplate`.
- Escrita do arquivo-fonte é restrita a ADMIN/MANAGER.
- Tenant estrangeiro não acessa o arquivo.
- Repetição de promoção é idempotente.
- Arquivo-fonte pode ser lido novamente sem alteração dos bytes.

O teste é executado pelo `contractSignatureTimeGateRegression.ts`, já presente no AutoERP PR Gates.
