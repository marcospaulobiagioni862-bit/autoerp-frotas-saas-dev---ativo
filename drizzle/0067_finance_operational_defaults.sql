-- MAINT-FIN-MASTERDATA-1: guarantee the minimum active finance choices needed by work-order creation.
-- Existing custom records are preserved. Inactive records with the same name are not silently reactivated.
DO $$
DECLARE
  tenant RECORD;
BEGIN
  FOR tenant IN SELECT id FROM companies LOOP
    PERFORM set_config('app.current_tenant', tenant.id, true);

    IF NOT EXISTS (
      SELECT 1
      FROM financial_categories
      WHERE company_id = tenant.id
        AND lower(trim(name)) = lower('Manutenção')
    ) THEN
      INSERT INTO financial_categories (
        id, company_id, name, type, active, created_at, updated_at
      ) VALUES (
        'cat-maint-default-' || substr(md5(tenant.id), 1, 16),
        tenant.id,
        'Manutenção',
        'EXPENSE',
        true,
        now(),
        now()
      );
    END IF;

    IF NOT EXISTS (SELECT 1 FROM payment_methods WHERE company_id = tenant.id AND lower(trim(name)) = lower('PIX')) THEN
      INSERT INTO payment_methods (id, company_id, name, type, fee_percentage, active)
      VALUES ('pm-pix-default-' || substr(md5(tenant.id), 1, 16), tenant.id, 'PIX', 'PIX', 0, true);
    END IF;

    IF NOT EXISTS (SELECT 1 FROM payment_methods WHERE company_id = tenant.id AND lower(trim(name)) = lower('Transferência')) THEN
      INSERT INTO payment_methods (id, company_id, name, type, fee_percentage, active)
      VALUES ('pm-transfer-default-' || substr(md5(tenant.id), 1, 16), tenant.id, 'Transferência', 'TRANSFER', 0, true);
    END IF;

    IF NOT EXISTS (SELECT 1 FROM payment_methods WHERE company_id = tenant.id AND lower(trim(name)) = lower('Dinheiro')) THEN
      INSERT INTO payment_methods (id, company_id, name, type, fee_percentage, active)
      VALUES ('pm-cash-default-' || substr(md5(tenant.id), 1, 16), tenant.id, 'Dinheiro', 'CASH', 0, true);
    END IF;

    IF NOT EXISTS (SELECT 1 FROM payment_methods WHERE company_id = tenant.id AND lower(trim(name)) = lower('Boleto')) THEN
      INSERT INTO payment_methods (id, company_id, name, type, fee_percentage, active)
      VALUES ('pm-boleto-default-' || substr(md5(tenant.id), 1, 16), tenant.id, 'Boleto', 'BOLETO', 0, true);
    END IF;

    IF NOT EXISTS (SELECT 1 FROM payment_methods WHERE company_id = tenant.id AND lower(trim(name)) = lower('Cartão')) THEN
      INSERT INTO payment_methods (id, company_id, name, type, fee_percentage, active)
      VALUES ('pm-card-default-' || substr(md5(tenant.id), 1, 16), tenant.id, 'Cartão', 'CARD', 0, true);
    END IF;
  END LOOP;
END
$$;
