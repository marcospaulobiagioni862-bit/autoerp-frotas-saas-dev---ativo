-- Unicidade estrita de categorias financeiras por empresa, nome (case-insensitive) e tipo.
-- Garante idempotencia fisica no banco, impedindo duplicatas mesmo sob concorrencia ou multiplos cliques.
CREATE UNIQUE INDEX IF NOT EXISTS uq_financial_categories_company_lower_name_type
  ON financial_categories (company_id, lower(name), type);
