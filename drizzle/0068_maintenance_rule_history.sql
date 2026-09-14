-- Preserve maintenance rule history while allowing only one open-ended version per scope.
DROP INDEX IF EXISTS uq_maintenance_rule_scope;

CREATE UNIQUE INDEX IF NOT EXISTS uq_maintenance_rule_open_scope
  ON maintenance_rule_configs(company_id, scope_type, COALESCE(scope_key,''))
  WHERE effective_to IS NULL;

CREATE INDEX IF NOT EXISTS idx_maintenance_rule_history
  ON maintenance_rule_configs(company_id, scope_type, scope_key, effective_from DESC, effective_to);
