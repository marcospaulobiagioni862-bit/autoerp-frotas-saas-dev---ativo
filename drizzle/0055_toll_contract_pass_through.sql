CREATE TABLE IF NOT EXISTS toll_contract_policies (
  company_id text NOT NULL,
  contract_id text NOT NULL,
  pass_through_enabled boolean NOT NULL DEFAULT false,
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now(),
  PRIMARY KEY (company_id, contract_id)
);
--> statement-breakpoint

ALTER TABLE toll_contract_policies ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE toll_contract_policies FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
DROP POLICY IF EXISTS toll_contract_policies_company_isolation ON toll_contract_policies;
--> statement-breakpoint
CREATE POLICY toll_contract_policies_company_isolation ON toll_contract_policies
  USING (company_id = current_setting('app.current_company_id', true))
  WITH CHECK (company_id = current_setting('app.current_company_id', true));
