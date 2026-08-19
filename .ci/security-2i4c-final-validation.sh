#!/usr/bin/env bash
set -euo pipefail

REPO_BASE="68b2ab0315bfb9e77cacb760b8f1bffdb4034357"
CANDIDATE="2288ee011415f69f011f6b21fb16db96d1e24196"
TREE="036909fab49f8532aa8b83cc2576b51f7d9e2004"

printf 'FINAL_VALIDATE candidate=%s tree=%s\n' "$CANDIDATE" "$TREE"
test "$(git rev-parse HEAD)" = "$CANDIDATE"
test "$(git rev-parse HEAD^{tree})" = "$TREE"
test "$(git rev-parse HEAD^)" = "$REPO_BASE"
test "$(git rev-list --count ${REPO_BASE}..HEAD)" = "1"
test "$(git merge-base "$REPO_BASE" HEAD)" = "$REPO_BASE"

changed="$(git diff --name-only "${REPO_BASE}..HEAD" | sort)"
expected="$(printf '%s\n' \
  drizzle/0014_contract_execution_authority.sql \
  drizzle/meta/_journal.json \
  package.json \
  src/api/contractClient.ts \
  src/api/contractExecutionClient.ts \
  src/api/contractTemplateClient.ts \
  src/components/contracts/ContractDetailsModal.tsx \
  src/components/contracts/ContractExecutionPanel.tsx \
  src/components/contracts/ContractFormModal.tsx \
  src/components/contracts/ContractTemplateManagementModal.tsx \
  src/components/contracts/ContractsManagement.tsx \
  src/db/repositories/postgresContractArtifactRepository.ts \
  src/db/repositories/postgresContractRepository.ts \
  src/db/repositories/postgresContractTemplateRepository.ts \
  src/db/schema.ts \
  src/db/uow.ts \
  src/domain/contracts/contractTemplatePolicy.ts \
  src/domain/finance/ITransactionContext.ts \
  src/server/__tests__/contractAuthorityIntegration.ts \
  src/server/__tests__/contractExecutionAuthorityIntegration.ts \
  src/server/contractExecutionRoutes.ts \
  src/server/contractRoutes.ts \
  src/server/contractTemplateRoutes.ts \
  src/server/vehicleRoutes.ts \
  src/types/entities/contract.ts | sort)"
test "$changed" = "$expected"
git diff --check "${REPO_BASE}..HEAD"

# Static authority surface.
grep -F '0014_contract_execution_authority' drizzle/meta/_journal.json >/dev/null
grep -F 'ALTER TABLE contract_templates FORCE ROW LEVEL SECURITY' drizzle/0014_contract_execution_authority.sql >/dev/null
grep -F 'ALTER TABLE contract_artifacts FORCE ROW LEVEL SECURITY' drizzle/0014_contract_execution_authority.sql >/dev/null
test "$(grep -c 'AS PERMISSIVE' drizzle/0014_contract_execution_authority.sql)" -ge 2
test "$(grep -c 'WITH CHECK' drizzle/0014_contract_execution_authority.sql)" -ge 2
grep -F 'signatureRequired: true' src/server/contractRoutes.ts >/dev/null
grep -F 'Signed contract evidence required' src/server/contractRoutes.ts >/dev/null
grep -F 'Contract terms are locked after PDF generation' src/server/contractRoutes.ts >/dev/null
grep -F 'registerContractTemplateRoutes(app)' src/server/vehicleRoutes.ts >/dev/null
grep -F 'registerContractExecutionRoutes(app)' src/server/vehicleRoutes.ts >/dev/null
grep -F 'ServerAttachmentStorage' src/server/contractExecutionRoutes.ts >/dev/null
grep -F "documentType: 'GENERATED_CONTRACT'" src/server/contractExecutionRoutes.ts >/dev/null
grep -F "attachment.documentType !== 'SIGNED_CONTRACT'" src/server/contractExecutionRoutes.ts >/dev/null
grep -F "%PDF-" src/server/contractExecutionRoutes.ts >/dev/null
grep -F 'pdf-lib' package.json >/dev/null
grep -F 'ContractTemplateClient.list' src/components/contracts/ContractFormModal.tsx >/dev/null
grep -F 'ContractExecutionPanel' src/components/contracts/ContractDetailsModal.tsx >/dev/null
grep -F 'PDF / Assinatura' src/components/contracts/ContractsManagement.tsx >/dev/null
grep -F 'Regenerar PDF oficial' src/components/contracts/ContractExecutionPanel.tsx >/dev/null
grep -F 'esta tela não declara certificação ICP-Brasil' src/components/contracts/ContractExecutionPanel.tsx >/dev/null
grep -F 'markLegacyContract' src/server/__tests__/contractAuthorityIntegration.ts >/dev/null
if grep -R -E 'generatedPdfUrl.*(body|req\.)|signedContractUrl.*(body|req\.)' src/server src/api src/components/contracts; then exit 1; fi
if grep -R -E 'base64|readAsDataURL|dataBase64' src/server/contractExecutionRoutes.ts src/api/contractExecutionClient.ts src/api/contractTemplateClient.ts src/components/contracts/ContractExecutionPanel.tsx; then exit 1; fi
if grep -R -F 'signatureRequired: false' src/server/contractRoutes.ts; then exit 1; fi

echo 'INSTALL'
npm install --no-package-lock --no-audit --no-fund

echo 'TYPESCRIPT'
npm run lint

echo 'BUILD'
npm run build

echo 'DOCUMENT POLICY CLIENT'
npx tsx src/api/__tests__/documentClientTestRunner.ts
npx tsx src/domain/documents/__tests__/documentPolicyTestRunner.ts

echo 'MIGRATIONS 0000..0014'
for file in $(find drizzle -maxdepth 1 -name '*.sql' | sort); do
  echo "Applying $file"
  PGPASSWORD=postgres psql -h localhost -U postgres -d autoerp_ci -v ON_ERROR_STOP=1 -f "$file" >/dev/null
done

echo 'I4C RLS/SCHEMA'
PGPASSWORD=postgres psql -h localhost -U postgres -d autoerp_ci -v ON_ERROR_STOP=1 <<'SQL'
DO $$
DECLARE tpl_enabled boolean; tpl_forced boolean; art_enabled boolean; art_forced boolean;
        tpl_using text; tpl_check text; art_using text; art_check text; idx_count integer;
BEGIN
  SELECT relrowsecurity, relforcerowsecurity INTO tpl_enabled, tpl_forced FROM pg_class WHERE oid='public.contract_templates'::regclass;
  SELECT relrowsecurity, relforcerowsecurity INTO art_enabled, art_forced FROM pg_class WHERE oid='public.contract_artifacts'::regclass;
  IF NOT tpl_enabled OR NOT tpl_forced THEN RAISE EXCEPTION 'contract_templates RLS/FORCE failed'; END IF;
  IF NOT art_enabled OR NOT art_forced THEN RAISE EXCEPTION 'contract_artifacts RLS/FORCE failed'; END IF;
  SELECT qual, with_check INTO tpl_using, tpl_check FROM pg_policies
    WHERE schemaname='public' AND tablename='contract_templates' AND policyname='tenant_isolation_contract_templates';
  SELECT qual, with_check INTO art_using, art_check FROM pg_policies
    WHERE schemaname='public' AND tablename='contract_artifacts' AND policyname='tenant_isolation_contract_artifacts';
  IF tpl_using IS NULL OR tpl_using NOT LIKE '%app.current_tenant%' OR tpl_check IS NULL OR tpl_check NOT LIKE '%app.current_tenant%' THEN
    RAISE EXCEPTION 'contract_templates policy invalid';
  END IF;
  IF art_using IS NULL OR art_using NOT LIKE '%app.current_tenant%' OR art_check IS NULL OR art_check NOT LIKE '%app.current_tenant%' THEN
    RAISE EXCEPTION 'contract_artifacts policy invalid';
  END IF;
  SELECT count(*) INTO idx_count FROM pg_indexes WHERE schemaname='public' AND indexname IN (
    'uq_contract_template_version','uq_contract_template_current','idx_contract_template_company_current',
    'uq_contract_artifact_current','idx_contract_artifact_contract','idx_contract_artifact_attachment','idx_contract_artifact_source'
  );
  IF idx_count <> 7 THEN RAISE EXCEPTION 'I4C indexes missing: %', idx_count; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='contracts'
      AND column_name='signature_required' AND is_nullable='NO' AND column_default='true'
  ) THEN RAISE EXCEPTION 'contracts.signature_required invalid'; END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='autoerp_i4c_final_rls') THEN
    CREATE ROLE autoerp_i4c_final_rls LOGIN PASSWORD 'autoerp-i4c-final-rls' NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT;
  END IF;
END $$;
GRANT USAGE ON SCHEMA public TO autoerp_i4c_final_rls;
GRANT SELECT, INSERT, UPDATE ON contract_templates, contract_artifacts TO autoerp_i4c_final_rls;
SQL

PGPASSWORD='autoerp-i4c-final-rls' psql -h localhost -U autoerp_i4c_final_rls -d autoerp_ci -v ON_ERROR_STOP=1 <<'SQL'
SET app.current_tenant = 'i4c-final-a';
INSERT INTO contract_templates(id,company_id,template_key,title,content_markdown,version_number,is_current,is_active,is_archived,created_by)
  VALUES ('i4c-final-tpl-a','i4c-final-a','rental','Rental A','Contrato teste',1,true,true,false,'user-a');
INSERT INTO contract_artifacts(id,company_id,contract_id,artifact_type,attachment_id,template_id,snapshot_json,snapshot_hash,is_current,is_archived,created_by)
  VALUES ('i4c-final-art-a','i4c-final-a','contract-a','GENERATED_PDF','attachment-a','i4c-final-tpl-a','{}','aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',true,false,'user-a');
SET app.current_tenant = 'i4c-final-b';
DO $$ DECLARE c integer; BEGIN
  SELECT count(*) INTO c FROM contract_templates WHERE id='i4c-final-tpl-a';
  IF c <> 0 THEN RAISE EXCEPTION 'template RLS leak'; END IF;
  SELECT count(*) INTO c FROM contract_artifacts WHERE id='i4c-final-art-a';
  IF c <> 0 THEN RAISE EXCEPTION 'artifact RLS leak'; END IF;
END $$;
SQL

set +e
PGPASSWORD='autoerp-i4c-final-rls' psql -h localhost -U autoerp_i4c_final_rls -d autoerp_ci -v ON_ERROR_STOP=1 <<'SQL'
SET app.current_tenant = 'i4c-final-b';
INSERT INTO contract_templates(id,company_id,template_key,title,content_markdown,version_number,is_current,is_active,is_archived,created_by)
  VALUES ('i4c-final-forged','i4c-final-a','forged','Forged','Contrato teste',1,true,true,false,'user-x');
SQL
rc=$?
set -e
test "$rc" -ne 0

echo 'I4C EXECUTION'
npx tsx src/server/__tests__/contractExecutionAuthorityIntegration.ts

echo 'POSTGRES REGRESSIONS'
npx tsx src/server/__tests__/documentAuthorityIntegration.ts
npx tsx src/server/__tests__/attachmentAuthorityIntegration.ts
npx tsx src/server/__tests__/driverAuthorityIntegration.ts
npx tsx src/server/__tests__/contractAuthorityIntegration.ts

echo 'CLIENT FINANCE SECURITY AUTH REGRESSIONS'
export USE_PGLITE=true
export ALLOW_MOCK_AUTH=false
export JWT_SECRET='security-2i4c-final-secret-at-least-32-bytes'
export JWT_ISSUER='autoerp-ci'
export JWT_AUDIENCE='autoerp-users'
npx tsx src/api/__tests__/documentClientTestRunner.ts
npx tsx src/api/__tests__/attachmentClientTestRunner.ts
npx tsx src/api/__tests__/contractClientTestRunner.ts
npx tsx src/api/__tests__/driverClientTestRunner.ts
npx tsx src/api/__tests__/vehicleClientTestRunner.ts
npx tsx src/api/__tests__/driverHealthClientTestRunner.ts
npx tsx src/api/__tests__/financeDepositClientTestRunner.ts
npx tsx src/api/__tests__/financeReportingClientTestRunner.ts
npx tsx src/api/__tests__/financeOverviewClientTestRunner.ts
npx tsx src/api/__tests__/financeObligationClientTestRunner.ts
npx tsx src/api/__tests__/financeSettlementClientTestRunner.ts
npx tsx src/api/__tests__/financeTransactionClientTestRunner.ts
npx tsx src/api/__tests__/financeRenegotiationClientTestRunner.ts
npx tsx src/domain/services/__tests__/contractTestRunner.ts
npx tsx src/domain/finance/__tests__/financeTestRunner.ts
npx tsx src/domain/services/__tests__/securityTestRunner.ts
npx tsx src/auth/__tests__/authSessionTestRunner.ts
npx tsx src/server/__tests__/bootstrapTestRunner.ts
npx tsx src/server/__tests__/sessionLoginTestRunner.ts
npx tsx src/server/__tests__/passwordTestRunner.ts
npx tsx src/server/__tests__/authTestRunner.ts

echo 'FINAL IMMUTABILITY'
test -z "$(git status --porcelain)"
test "$(git rev-parse HEAD)" = "$CANDIDATE"
test "$(git rev-parse HEAD^{tree})" = "$TREE"
test "$(git rev-parse HEAD^)" = "$REPO_BASE"
test "$(git rev-list --count ${REPO_BASE}..HEAD)" = "1"
echo 'SECURITY-2I4C_FINAL_VALIDATION_PASS'
