# Runbook: armazenamento durável de anexos no Render

## Estado seguro

O AutoERP mantém metadados, autoridade tenant, hash SHA-256 e auditoria no PostgreSQL. Os bytes são gravados pelo serviço em `ATTACHMENT_STORAGE_DIR`. Um caminho em `/tmp` é efêmero e não pode ser tratado como armazenamento durável.

O endpoint autenticado `GET /api/attachments/storage/status` informa somente:

- provedor;
- se há diretório configurado;
- se durabilidade foi declarada;
- se o caminho pertence a uma raiz efêmera conhecida;
- se a configuração pode ser considerada durável;
- limite máximo de upload.

O caminho físico nunca é retornado.

## Configuração recomendada

No serviço Web do Render:

1. Confirmar o serviço e ambiente corretos (staging antes de produção).
2. Criar um disco persistente pequeno, começando entre 1 e 5 GB.
3. Usar o mount path `/opt/render/project/src/storage`.
4. Configurar:
   - `ATTACHMENT_STORAGE_DIR=/opt/render/project/src/storage/attachments`
   - `ATTACHMENT_STORAGE_DURABLE=true`
5. Fazer deploy controlado.
6. Confirmar que o endpoint de status retorna `configured: true`, `durable: true` e `ephemeralPath: false`.

Nunca configurar `ATTACHMENT_STORAGE_DURABLE=true` com `/tmp`, `/var/tmp` ou `/dev/shm`. O servidor rejeita uploads nessa combinação.

## Impactos do disco Render

- gera cobrança por capacidade provisionada;
- restringe o serviço a uma instância;
- impede autoscaling horizontal;
- elimina zero-downtime deploy;
- fica acessível somente ao serviço anexado;
- pode aumentar de tamanho, mas não diminuir;
- snapshots são completos e restaurações descartam alterações posteriores ao snapshot.

A criação do disco exige autorização no momento da ação e está rastreada em #285.

## Validação obrigatória

1. Fazer upload controlado de um PDF não sensível.
2. Registrar ID, tamanho e SHA-256.
3. Baixar e conferir os bytes.
4. Reiniciar o serviço e repetir o download.
5. Fazer um deploy sem alterar o arquivo e repetir o download.
6. Confirmar metadados e auditoria no PostgreSQL.
7. Validar que outro tenant recebe 404.
8. Documentar evidência na #268 e na #285.

## Recuperação

O Render cria snapshots periódicos do disco. A restauração é integral e destrutiva para alterações posteriores. Antes de restaurar:

1. confirmar o ambiente e o snapshot;
2. registrar a janela de perda potencial;
3. interromper gravações;
4. obter autorização explícita;
5. restaurar;
6. validar hash e metadados dos anexos de amostra.
