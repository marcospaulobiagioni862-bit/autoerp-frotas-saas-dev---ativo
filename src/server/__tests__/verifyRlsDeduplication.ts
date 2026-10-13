import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { Client } from 'pg';
import { PGlite } from '@electric-sql/pglite';

// 1. Carregar variáveis Neon
try {
  const envContent = readFileSync(join(homedir(), '.config/autoerp-neon.env'), 'utf-8');
  for (const line of envContent.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const match = /^([A-Z0-9_]+)="?([^"]*)"?$/.exec(trimmed);
    if (match) {
      process.env[match[1]] = match[2];
    }
  }
} catch (e) {
  console.warn('Could not read ~/.config/autoerp-neon.env:', e);
}

const neonUrl = process.env.STAGING_MAIN_DATABASE_URL || process.env.HOMOLOG_DATABASE_URL || process.env.DATABASE_URL;

async function testDeduplicationWithPGlite(): Promise<void> {
  console.log('1. Testando aplicacao da migration 0090 contra PostgreSQL in-memory (PGlite)...');
  const pglite = new PGlite();

  const all27Tables = [
    'account_payables',
    'account_receivables',
    'audit_logs',
    'bank_statement_entries',
    'communication_logs',
    'contracts',
    'credit_card_profiles',
    'credit_card_statement_adjustments',
    'credit_card_statement_credits',
    'credit_card_statement_items',
    'credit_card_statement_payments',
    'credit_card_statements',
    'driver_health_profiles',
    'drivers',
    'financial_accounts',
    'financial_categories',
    'financial_periods',
    'financial_transactions',
    'payment_methods',
    'recurring_rules',
    'security_deposit_commands',
    'security_deposit_movements',
    'security_deposits',
    'trackers',
    'traffic_tickets',
    'users',
    'vehicles',
  ];

  // Criar todas as 27 tabelas com RLS e tenant_isolation_policy padrao
  for (const table of all27Tables) {
    await pglite.exec(`
      CREATE TABLE IF NOT EXISTS ${table} (id text PRIMARY KEY, company_id text NOT NULL);
      ALTER TABLE ${table} ENABLE ROW LEVEL SECURITY;
      CREATE POLICY tenant_isolation_policy ON ${table} FOR ALL
        USING (company_id = current_setting('app.current_tenant', true))
        WITH CHECK (company_id = current_setting('app.current_tenant', true));
    `);
  }

  // Simular todas as politicas duplicadas/legadas mapeadas na migration 0090
  await pglite.exec(`
    CREATE POLICY tenant_isolation_ap ON account_payables FOR ALL USING (company_id = current_setting('app.current_tenant', true));
    CREATE POLICY tenant_isolation_ar ON account_receivables FOR ALL USING (company_id = current_setting('app.current_tenant', true));
    CREATE POLICY tenant_isolation_al ON audit_logs FOR ALL USING (company_id = current_setting('app.current_tenant', true));
    CREATE POLICY no_update_delete_al ON audit_logs FOR UPDATE USING (false);
    CREATE POLICY no_update_delete_al2 ON audit_logs FOR DELETE USING (false);
    CREATE POLICY tenant_access_bank_statement_entries ON bank_statement_entries FOR ALL USING (company_id = current_setting('app.current_tenant', true));
    CREATE POLICY authority_1_communication_tenant ON communication_logs FOR ALL USING (company_id = current_setting('app.current_tenant', true));
    CREATE POLICY tenant_isolation_ct ON contracts FOR ALL USING (company_id = current_setting('app.current_tenant', true));
    CREATE POLICY tenant_access_credit_card_profiles ON credit_card_profiles FOR ALL USING (company_id = current_setting('app.current_tenant', true));
    CREATE POLICY tenant_isolation_credit_card_profiles ON credit_card_profiles FOR ALL USING (company_id = current_setting('app.current_tenant', true));
    CREATE POLICY tenant_access_credit_card_statement_adjustments ON credit_card_statement_adjustments FOR ALL USING (company_id = current_setting('app.current_tenant', true));
    CREATE POLICY tenant_isolation_credit_card_statement_adjustments ON credit_card_statement_adjustments FOR ALL USING (company_id = current_setting('app.current_tenant', true));
    CREATE POLICY tenant_access_credit_card_statement_credits ON credit_card_statement_credits FOR ALL USING (company_id = current_setting('app.current_tenant', true));
    CREATE POLICY tenant_isolation_credit_card_statement_credits ON credit_card_statement_credits FOR ALL USING (company_id = current_setting('app.current_tenant', true));
    CREATE POLICY tenant_access_credit_card_statement_items ON credit_card_statement_items FOR ALL USING (company_id = current_setting('app.current_tenant', true));
    CREATE POLICY tenant_isolation_credit_card_statement_items ON credit_card_statement_items FOR ALL USING (company_id = current_setting('app.current_tenant', true));
    CREATE POLICY tenant_access_credit_card_statement_payments ON credit_card_statement_payments FOR ALL USING (company_id = current_setting('app.current_tenant', true));
    CREATE POLICY tenant_isolation_credit_card_statement_payments ON credit_card_statement_payments FOR ALL USING (company_id = current_setting('app.current_tenant', true));
    CREATE POLICY tenant_access_credit_card_statements ON credit_card_statements FOR ALL USING (company_id = current_setting('app.current_tenant', true));
    CREATE POLICY tenant_isolation_credit_card_statements ON credit_card_statements FOR ALL USING (company_id = current_setting('app.current_tenant', true));
    CREATE POLICY tenant_access_driver_health_profiles ON driver_health_profiles FOR ALL USING (company_id = current_setting('app.current_tenant', true));
    CREATE POLICY tenant_isolation_driver_health_profiles ON driver_health_profiles FOR ALL USING (company_id = current_setting('app.current_tenant', true));
    CREATE POLICY tenant_isolation_dr ON drivers FOR ALL USING (company_id = current_setting('app.current_tenant', true));
    CREATE POLICY tenant_access_financial_accounts ON financial_accounts FOR ALL USING (company_id = current_setting('app.current_tenant', true));
    CREATE POLICY tenant_isolation_fa ON financial_accounts FOR ALL USING (company_id = current_setting('app.current_tenant', true));
    CREATE POLICY tenant_access_financial_categories ON financial_categories FOR ALL USING (company_id = current_setting('app.current_tenant', true));
    CREATE POLICY tenant_isolation_fc ON financial_categories FOR ALL USING (company_id = current_setting('app.current_tenant', true));
    CREATE POLICY tenant_access_financial_periods ON financial_periods FOR ALL USING (company_id = current_setting('app.current_tenant', true));
    CREATE POLICY tenant_isolation_ft ON financial_transactions FOR ALL USING (company_id = current_setting('app.current_tenant', true));
    CREATE POLICY tenant_access_payment_methods ON payment_methods FOR ALL USING (company_id = current_setting('app.current_tenant', true));
    CREATE POLICY tenant_isolation_recurring_rules ON recurring_rules FOR ALL USING (company_id = current_setting('app.current_tenant', true));
    CREATE POLICY tenant_access_security_deposit_commands ON security_deposit_commands FOR ALL USING (company_id = current_setting('app.current_tenant', true));
    CREATE POLICY tenant_isolation_security_deposit_commands ON security_deposit_commands FOR ALL USING (company_id = current_setting('app.current_tenant', true));
    CREATE POLICY tenant_access_security_deposit_movements ON security_deposit_movements FOR ALL USING (company_id = current_setting('app.current_tenant', true));
    CREATE POLICY tenant_access_security_deposits ON security_deposits FOR ALL USING (company_id = current_setting('app.current_tenant', true));
    CREATE POLICY tenant_isolation_trackers ON trackers FOR ALL USING (company_id = current_setting('app.current_tenant', true));
    CREATE POLICY tenant_isolation_traffic_tickets ON traffic_tickets FOR ALL USING (company_id = current_setting('app.current_tenant', true));
    CREATE POLICY tenant_isolation_us ON users FOR ALL USING (company_id = current_setting('app.current_tenant', true));
    CREATE POLICY tenant_isolation_ve ON vehicles FOR ALL USING (company_id = current_setting('app.current_tenant', true));
  `);

  // Aplicar a migration 0090
  const migrationSql = readFileSync('drizzle/0090_deduplicate_rls_policies.sql', 'utf-8');
  await pglite.exec(migrationSql);

  // Validar resultado
  const policiesRes = await pglite.query<{ tablename: string; policyname: string; cmd: string }>(`
    SELECT tablename, policyname, cmd
    FROM pg_policies
    WHERE schemaname = 'public'
    ORDER BY tablename, policyname;
  `);

  const policiesByTable = new Map<string, string[]>();
  for (const row of policiesRes.rows) {
    const list = policiesByTable.get(row.tablename) || [];
    list.push(row.policyname);
    policiesByTable.set(row.tablename, list);
  }

  // Verificar todas as 27 tabelas
  for (const table of all27Tables) {
    const tablePolicies = (policiesByTable.get(table) || []).sort();
    if (table === 'audit_logs') {
      // audit_logs deve ter exatamente as duas regras de imutabilidade + tenant_isolation_policy
      assert.deepEqual(
        tablePolicies,
        ['no_update_delete_al', 'no_update_delete_al2', 'tenant_isolation_policy'].sort(),
        `Tabela ${table} deve conter as políticas de imutabilidade e tenant_isolation_policy`
      );
    } else {
      assert.deepEqual(
        tablePolicies,
        ['tenant_isolation_policy'],
        `Tabela ${table} deve conter unicamente a política canônica tenant_isolation_policy`
      );
    }
  }

  console.log(`PASS: Migration 0090 validada em PostgreSQL in-memory — todas as ${all27Tables.length} tabelas deduplicadas e imutabilidade preservada.`);
}

async function inspectNeonState(): Promise<void> {
  if (!neonUrl) {
    console.log('2. Neon URL nao informada, pulando inspecao remota.');
    return;
  }

  console.log('2. Inspecionando estado no cluster Neon...');
  const client = new Client({ connectionString: neonUrl, ssl: { rejectUnauthorized: false } });
  await client.connect();

  try {
    const userRes = await client.query('SELECT current_user, session_user;');
    const currentUser = String(userRes.rows[0]?.current_user || '');
    console.log(`Conectado no Neon como role: ${currentUser}`);

    const duplicatesRes = await client.query(`
      SELECT tablename, COUNT(*) as cnt, string_agg(policyname, ', ') as policies
      FROM pg_policies
      WHERE schemaname = 'public'
      GROUP BY tablename
      HAVING COUNT(*) > 1
      ORDER BY tablename;
    `);

    console.log(`Tabelas com RLS redundante mapeadas no Neon: ${duplicatesRes.rows.length}`);
    for (const r of duplicatesRes.rows) {
      console.log(`  - ${r.tablename} (${r.cnt} policies): ${r.policies}`);
    }

    // Se estiver conectado como neondb_owner (deploy no Render), aplica DDL diretamente
    if (currentUser === 'neondb_owner') {
      console.log('Role e neondb_owner: aplicando DDL 0090 no Neon...');
      const migrationSql = readFileSync('drizzle/0090_deduplicate_rls_policies.sql', 'utf-8');
      await client.query('BEGIN');
      await client.query(migrationSql);
      await client.query('COMMIT');
      console.log('DDL 0090 aplicada no Neon com sucesso.');
    } else {
      console.log(`Role '${currentUser}' e perfil analitico de dev; a aplicacao DDL no Neon ocorre de forma confiavel via 'migrate_db.cjs' no deploy do Render (que roda como neondb_owner).`);
    }
  } finally {
    await client.end();
  }
}

async function main() {
  console.log('=== TESTE E VERIFICAÇÃO DE DEDUPLICAÇÃO DE RLS (AUTOERP-52) ===');
  await testDeduplicationWithPGlite();
  await inspectNeonState();
  console.log('\n✅ AUTOERP-52 validado com sucesso.');
}

main().catch((err) => {
  console.error('Falha na verificacao de RLS:', err);
  process.exit(1);
});
