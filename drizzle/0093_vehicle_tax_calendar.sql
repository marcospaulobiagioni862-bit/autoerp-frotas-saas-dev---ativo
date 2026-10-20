-- PH-074: calendario de IPVA e licenciamento por final de placa.
--
-- As datas NAO vem embutidas no codigo de proposito. O calendario e publicado pela
-- Sefaz de cada estado e muda todo ano; chutar data de vencimento de imposto gera
-- multa para o cliente. A tabela e cadastravel e o sistema so faz o que e seguro
-- fazer: casar o final da placa do veiculo com a linha correspondente do ano.
CREATE TABLE IF NOT EXISTS vehicle_tax_calendar (
  id text PRIMARY KEY NOT NULL,
  company_id text NOT NULL,
  uf text NOT NULL,
  reference_year integer NOT NULL,
  plate_last_digit integer NOT NULL,
  tax_type text NOT NULL,
  installment integer NOT NULL DEFAULT 1,
  due_date date NOT NULL,
  notes text,
  created_by text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT vehicle_tax_calendar_digit_check CHECK (plate_last_digit BETWEEN 0 AND 9),
  CONSTRAINT vehicle_tax_calendar_type_check CHECK (tax_type IN ('IPVA_COTA_UNICA','IPVA_PARCELADO','LICENCIAMENTO')),
  CONSTRAINT vehicle_tax_calendar_installment_check CHECK (installment BETWEEN 1 AND 12),
  CONSTRAINT vehicle_tax_calendar_uf_check CHECK (uf ~ '^[A-Z]{2}$')
);

-- Uma data por (empresa, UF, ano, final de placa, tipo, parcela). Sem isso, dois
-- cadastros do mesmo vencimento gerariam duas obrigacoes para o mesmo imposto.
CREATE UNIQUE INDEX IF NOT EXISTS uq_vehicle_tax_calendar_entry
  ON vehicle_tax_calendar (company_id, uf, reference_year, plate_last_digit, tax_type, installment);

CREATE INDEX IF NOT EXISTS idx_vehicle_tax_calendar_lookup
  ON vehicle_tax_calendar (company_id, uf, reference_year, plate_last_digit);

ALTER TABLE vehicle_tax_calendar ENABLE ROW LEVEL SECURITY;
ALTER TABLE vehicle_tax_calendar FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_isolation_vehicle_tax_calendar ON vehicle_tax_calendar;
CREATE POLICY tenant_isolation_vehicle_tax_calendar ON vehicle_tax_calendar
  AS PERMISSIVE
  FOR ALL
  USING (company_id = current_setting('app.current_tenant', true))
  WITH CHECK (company_id = current_setting('app.current_tenant', true));
