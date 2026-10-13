-- AUTOERP-52 (reescrita em 2026-10-13 pelo claude, depois de a versao anterior
-- derrubar a CI com "bank statement RLS leaked tenant rows").
--
-- A PREMISSA ORIGINAL ESTAVA ERRADA. O card dizia "27 tabelas com politicas de RLS
-- duplicadas", e a versao anterior desta migration apagava, em cada uma, a politica de
-- nome "legado" mantendo tenant_isolation_policy. Auditando o catalogo do Postgres com
-- as 93 migrations reais aplicadas em ordem, o que existe nao e duplicacao: e um PAR
-- DELIBERADO por tabela.
--
--   politica PERMISSIVE  -> e a que CONCEDE acesso. Varias se somam por OR, e sem
--                           nenhuma delas a tabela nao devolve linha para ninguem.
--   politica RESTRICTIVE -> so SUBTRAI. Aplica-se por AND e, sozinha, nao libera nada.
--
-- Em 19 das 27 tabelas o nome tenant_isolation_policy ja esta ocupado pela RESTRICTIVE,
-- e os nomes "legados" (tenant_isolation_ve, tenant_isolation_us, tenant_access_*) sao
-- justamente as PERMISSIVAS. Apagar essas deixava 18 tabelas sem nenhuma politica
-- permissiva - entre elas vehicles, users, contracts, drivers, financial_transactions e
-- account_receivables, ou seja, o nucleo do sistema.
--
-- Comparando tipo + comando + expressao USING + expressao WITH CHECK de cada politica,
-- a redundancia real do banco inteiro e de DUAS politicas, em duas tabelas: ali existem
-- duas PERMISSIVAS equivalentes, e uma delas nao tem WITH CHECK. Mantem-se a que tem
-- WITH CHECK, porque e a unica que tambem barra INSERT/UPDATE para outra empresa.
--
-- O resto das 27 tabelas fica como esta: o par permissiva+restritiva e a defesa em
-- profundidade do multi-tenant, nao deriva de migracao.

-- 1. financial_accounts: tenant_isolation_fa e tenant_access_financial_accounts sao
--    ambas PERMISSIVE com a mesma expressao USING; so a segunda tem WITH CHECK.
DROP POLICY IF EXISTS tenant_isolation_fa ON financial_accounts;

-- 2. financial_categories: mesmo caso.
DROP POLICY IF EXISTS tenant_isolation_fc ON financial_categories;

-- As politicas de imutabilidade de audit_logs (no_update_delete_al, no_update_delete_al2)
-- nao sao tocadas, assim como nenhuma politica RESTRICTIVE de nenhuma tabela.
