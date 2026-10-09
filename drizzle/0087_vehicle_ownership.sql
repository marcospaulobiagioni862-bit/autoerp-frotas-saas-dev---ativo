-- AUTOERP-56 — Titularidade do veiculo e suporte a frota mista com historico temporal.
--
-- POR QUE: O sistema nao tinha campo de proprietario e assumia que a locadora era
-- dona de 100% da frota. A medicao real nos CRLVs revelou frota mista:
-- 12 placas no CNPJ da TRIFLEX, 6 no Banco Bradesco Financiamentos, 1 no CPF do sócio
-- (Marcos) e 1 em nome de terceiro.
-- Alem disso, a titularidade muda no tempo (ex: UFI3B85 quitada migrou de Bradesco para TRIFLEX)
-- e o SNE (AUTOERP-57) exige adesao por titular, tornando necessaria a matriz de cobertura.

-- 1. Colunas de titularidade, posse, restricao e SNE em vehicles
ALTER TABLE vehicles
  ADD COLUMN IF NOT EXISTS owner_type text NOT NULL DEFAULT 'COMPANY',
  ADD COLUMN IF NOT EXISTS owner_name text,
  ADD COLUMN IF NOT EXISTS owner_document text,
  ADD COLUMN IF NOT EXISTS possession_type text NOT NULL DEFAULT 'PROPRIO',
  ADD COLUMN IF NOT EXISTS financial_restriction text NOT NULL DEFAULT 'NONE',
  ADD COLUMN IF NOT EXISTS financial_institution text,
  ADD COLUMN IF NOT EXISTS crlv_exercise_year integer,
  ADD COLUMN IF NOT EXISTS registration_city text,
  ADD COLUMN IF NOT EXISTS registration_state text,
  ADD COLUMN IF NOT EXISTS cla_security_code text,
  ADD COLUMN IF NOT EXISTS sne_coverage_status text NOT NULL DEFAULT 'NAO_ADERIDO';

-- 2. Tabela de historico temporal de titularidade
CREATE TABLE IF NOT EXISTS vehicle_ownership_history (
  id text PRIMARY KEY,
  company_id text NOT NULL,
  vehicle_id text NOT NULL REFERENCES vehicles(id) ON DELETE CASCADE,
  owner_type text NOT NULL,
  owner_name text NOT NULL,
  owner_document text,
  possession_type text NOT NULL,
  financial_restriction text NOT NULL DEFAULT 'NONE',
  financial_institution text,
  effective_from timestamptz NOT NULL,
  effective_to timestamptz,
  reason text,
  document_attachment_id text,
  created_by text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Indices para busca por veiculo e por competencia temporal
CREATE INDEX IF NOT EXISTS idx_voh_vehicle
  ON vehicle_ownership_history(company_id, vehicle_id);

CREATE INDEX IF NOT EXISTS idx_voh_effective
  ON vehicle_ownership_history(company_id, effective_from, effective_to);

-- Politica multi-tenant em vehicle_ownership_history
ALTER TABLE vehicle_ownership_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE vehicle_ownership_history FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_vehicle_ownership_history ON vehicle_ownership_history;
CREATE POLICY tenant_isolation_vehicle_ownership_history ON vehicle_ownership_history
  FOR ALL
  USING (company_id = current_setting('app.current_tenant', true))
  WITH CHECK (company_id = current_setting('app.current_tenant', true));

-- 3. Backfill defensivo e inteligente para veiculos existentes a partir de document_ai_extractions
DO $$
DECLARE
  v RECORD;
  ext RECORD;
  v_owner_name text;
  v_owner_doc text;
  v_owner_type text;
  v_poss_type text;
  v_fin_res text;
  v_fin_inst text;
  v_sne text;
BEGIN
  FOR v IN SELECT id, company_id, plate, notes, created_at FROM vehicles LOOP
    -- Busca a extracao de CRLV mais recente para a placa
    SELECT proposed_fields->>'ownerName' as owner_name,
           proposed_fields->>'ownerDocument' as owner_doc
      INTO ext
      FROM document_ai_extractions
     WHERE proposed_fields->>'plate' = v.plate
       AND proposed_fields->>'ownerName' IS NOT NULL
     ORDER BY created_at DESC
     LIMIT 1;

    v_owner_name := COALESCE(ext.owner_name, 'TRIFLEX');
    v_owner_doc := ext.owner_doc;

    -- Inferência de classificação e restrições
    IF v_owner_name ILIKE '%BRADESCO%' THEN
      v_owner_type := 'FINANCED_LEASING';
      v_poss_type := 'FINANCIAMENTO_LEASING';
      v_fin_res := 'ARRENDAMENTO_MERCANTIL';
      v_fin_inst := 'Banco Bradesco Financiamentos S.A.';
      v_sne := 'DESCOBERTO_BANCO_LEASING';
    ELSIF v_owner_name ILIKE '%MARCOS PAULO%' THEN
      v_owner_type := 'PARTNER';
      v_poss_type := 'CESSAO_SOCIO';
      v_fin_res := 'NONE';
      v_fin_inst := NULL;
      v_sne := 'PENDENTE_CPF_TITULAR';
    ELSIF v_owner_name ILIKE '%MARIZETE%' THEN
      v_owner_type := 'THIRD_PARTY';
      v_poss_type := 'SUBLOCACAO_TERCEIRO';
      v_fin_res := 'NONE';
      v_fin_inst := NULL;
      v_sne := 'DESCOBERTO_TERCEIRO';
    ELSE
      v_owner_type := 'COMPANY';
      v_poss_type := 'PROPRIO';
      v_fin_res := 'NONE';
      v_fin_inst := NULL;
      v_sne := 'COBERTO_CNPJ';
    END IF;

    -- Atualiza o veículo
    UPDATE vehicles
       SET owner_type = v_owner_type,
           owner_name = v_owner_name,
           owner_document = v_owner_doc,
           possession_type = v_poss_type,
           financial_restriction = v_fin_res,
           financial_institution = v_fin_inst,
           sne_coverage_status = v_sne
     WHERE id = v.id;

    -- Cria o primeiro registro histórico se não existir nenhum
    IF NOT EXISTS (SELECT 1 FROM vehicle_ownership_history WHERE vehicle_id = v.id) THEN
      INSERT INTO vehicle_ownership_history (
        id, company_id, vehicle_id, owner_type, owner_name, owner_document,
        possession_type, financial_restriction, financial_institution,
        effective_from, effective_to, reason, created_by, created_at
      ) VALUES (
        gen_random_uuid()::text, v.company_id, v.id, v_owner_type, v_owner_name, v_owner_doc,
        v_poss_type, v_fin_res, v_fin_inst,
        v.created_at, NULL, 'CADASTRO_INICIAL', 'system_migration_0087', now()
      );
    END IF;
  END LOOP;
END $$;
