-- AUTOERP-24 — a composicao de baixa sai de dentro do audit_logs.
--
-- POR QUE: a reversibilidade do dinheiro dependia de uma tabela chamada
-- "logs". Quem limpasse ou rotacionasse audit_logs destruiria a capacidade de
-- estornar, e nada no nome avisava. Alem disso, sem unicidade uma linha
-- duplicada bloqueava o estorno PARA SEMPRE (a leitura lancava "Auditoria da
-- liquidacao ambigua"), e a decisao de preserveCharges varria a tabela com
-- duplo cast de text para JSON, sem indice.
--
-- A linha de auditoria CONTINUA sendo escrita: ela e auditoria legitima, e o
-- teste settlementResidualRegression.ts afirma que ela existe. O que muda e a
-- AUTORIDADE do dado, que passa para esta tabela.
--
-- Aditiva. Nenhuma linha de audit_logs e alterada ou removida.

CREATE TABLE IF NOT EXISTS settlement_compositions (
  company_id text NOT NULL,
  transaction_id text NOT NULL,
  obligation_id text NOT NULL,
  composition jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  -- Chave composta: mata estruturalmente a duplicata que antes so era
  -- detectada em tempo de leitura. Composta, e nao so transaction_id, para a
  -- consulta bater direto na chave e para um tenant nao inferir a existencia de
  -- linha de outro por conflito de chave.
  CONSTRAINT settlement_compositions_pkey PRIMARY KEY (company_id, transaction_id),
  -- As duas validacoes que antes eram feitas em codigo, na leitura, agora sao
  -- estruturais: versao conhecida, e a composicao pertence a ESTA transacao.
  CONSTRAINT settlement_compositions_version_chk
    CHECK (coalesce(composition->>'version','') = '1'),
  CONSTRAINT settlement_compositions_transaction_chk
    CHECK (coalesce(composition->>'transactionId','') = transaction_id)
);

-- Indice que substitui a varredura com duplo cast do preserveCharges.
CREATE INDEX IF NOT EXISTS idx_settlement_compositions_company_obligation
  ON settlement_compositions(company_id, obligation_id);

-- Tabela nova com company_id SEM politica viraria buraco cross-tenant no
-- instante em que o AUTOERP-30 ativar o RLS. Mesmo padrao da 0072.
ALTER TABLE settlement_compositions ENABLE ROW LEVEL SECURITY;
ALTER TABLE settlement_compositions FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_settlement_compositions ON settlement_compositions;
CREATE POLICY tenant_isolation_settlement_compositions ON settlement_compositions
  FOR ALL
  USING (company_id = current_setting('app.current_tenant', true))
  WITH CHECK (company_id = current_setting('app.current_tenant', true));

-- audit_logs nao tinha NENHUM indice e so cresce. Este serve a toda consulta de
-- auditoria por entidade, nao apenas a que saiu daqui.
CREATE INDEX IF NOT EXISTS idx_audit_logs_company_entity
  ON audit_logs(company_id, entity_type, entity_id);

-- BACKFILL DEFENSIVO.
--
-- O formato guardado e ambiguo: a propria leitura em uow.ts tratava
-- changes.newState que pode vir como OBJETO ou como STRING JSON. E esta
-- migration roda DENTRO do build do deploy, entao um cast que estoure numa
-- linha malformada impede o servico de subir. Por isso: pg_input_is_valid
-- antes de qualquer cast, CTEs MATERIALIZED para garantir que o filtro acontece
-- antes da conversao (CTE comum e inlinada no Postgres 12+, e a ordem de
-- avaliacao nao seria garantida), e so entram linhas cuja extracao resulte em
-- objeto valido, com versao 1 e com transactionId coerente.
WITH validos AS MATERIALIZED (
  SELECT company_id, entity_id, timestamp, changes
  FROM audit_logs
  WHERE entity_type = 'FinancialSettlement'
    AND changes IS NOT NULL
    AND pg_input_is_valid(changes, 'jsonb')
),
objetos AS MATERIALIZED (
  SELECT company_id, entity_id, timestamp, (changes::jsonb) AS doc
  FROM validos
  WHERE jsonb_typeof(changes::jsonb) = 'object'
),
extraidos AS MATERIALIZED (
  SELECT
    company_id,
    entity_id,
    timestamp,
    CASE jsonb_typeof(doc->'newState')
      WHEN 'object' THEN doc->'newState'
      WHEN 'string' THEN
        CASE WHEN pg_input_is_valid(doc->>'newState', 'jsonb')
             AND jsonb_typeof((doc->>'newState')::jsonb) = 'object'
          THEN (doc->>'newState')::jsonb
          ELSE NULL
        END
      ELSE NULL
    END AS composition
  FROM objetos
)
INSERT INTO settlement_compositions (company_id, transaction_id, obligation_id, composition, created_at)
SELECT company_id, entity_id, composition->>'obligationId', composition, timestamp
FROM extraidos
WHERE composition IS NOT NULL
  AND composition->>'version' = '1'
  AND composition->>'transactionId' = entity_id
  AND composition->>'obligationId' IS NOT NULL
ON CONFLICT (company_id, transaction_id) DO NOTHING;
