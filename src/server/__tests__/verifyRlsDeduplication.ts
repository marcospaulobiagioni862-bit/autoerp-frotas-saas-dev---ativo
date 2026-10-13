/**
 * AUTOERP-52 — verificacao da deduplicacao de politicas de RLS.
 *
 * REESCRITO em 2026-10-13. A versao anterior subia um PGlite e CRIAVA AS PROPRIAS
 * TABELAS com CREATE TABLE IF NOT EXISTS, criando tenant_isolation_policy ela mesma, sem
 * AS RESTRICTIVE. Validava a migration contra um schema inventado onde a politica
 * canonica era permissiva e sempre existia - cenario em que apagar as "legadas" e de
 * fato inofensivo. Contra o schema real, a mesma migration deixava 18 tabelas sem
 * nenhuma politica permissiva e a CI acusou "bank statement RLS leaked tenant rows".
 * E a regra 3.2-g do CLAUDE.md: teste que inventa o proprio schema nunca roda de
 * verdade contra o que esta em producao.
 *
 * Agora o schema vem das migrations reais, aplicadas em ordem, e as asercoes olham o
 * catalogo do Postgres (pg_policy), nao um SQL escrito a mao.
 */
import { PGlite } from '@electric-sql/pglite';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import assert from 'node:assert/strict';

type Politica = {
  tabela: string;
  politica: string;
  permissiva: boolean;
  cmd: string;
  usando: string | null;
  comcheck: string | null;
};

const DIR = 'drizzle';
const MIGRATION = '0090_deduplicate_rls_policies.sql';

const lerPoliticas = async (db: PGlite): Promise<Politica[]> => {
  const r = await db.query<Politica>(`
    SELECT c.relname AS tabela, p.polname AS politica, p.polpermissive AS permissiva,
           p.polcmd::text AS cmd,
           pg_get_expr(p.polqual, p.polrelid) AS usando,
           pg_get_expr(p.polwithcheck, p.polrelid) AS comcheck
      FROM pg_policy p JOIN pg_class c ON c.oid = p.polrelid
     ORDER BY 1, 2`);
  return r.rows;
};

const permissivasPorTabela = (ps: Politica[]) => {
  const m = new Map<string, number>();
  for (const p of ps) if (p.permissiva) m.set(p.tabela, (m.get(p.tabela) ?? 0) + 1);
  return m;
};

const run = async () => {
  const db = new PGlite();
  const arquivos = readdirSync(DIR).filter((f) => f.endsWith('.sql')).sort();
  let aplicadas = 0;
  for (const f of arquivos) {
    if (f === MIGRATION) continue;
    await db.exec(readFileSync(join(DIR, f), 'utf8'));
    aplicadas += 1;
  }
  assert.ok(aplicadas > 80, `esperava aplicar o historico real de migrations, apliquei ${aplicadas}`);
  console.log(`1. ${aplicadas} migrations reais aplicadas em ordem (nenhuma tabela inventada).`);

  const antes = await lerPoliticas(db);
  await db.exec(readFileSync(join(DIR, MIGRATION), 'utf8'));
  const depois = await lerPoliticas(db);

  // 1) A garantia que faltava: nenhuma tabela pode perder a ultima politica permissiva.
  // Sem permissiva, a tabela deixa de responder - e foi assim que a versao anterior
  // derrubou o isolamento de bank_statement_entries.
  const pa = permissivasPorTabela(antes);
  const pd = permissivasPorTabela(depois);
  const desprotegidas = [...pa.entries()].filter(([t, n]) => n > 0 && (pd.get(t) ?? 0) === 0).map(([t]) => t);
  assert.deepEqual(desprotegidas, [], `tabelas que ficaram sem politica permissiva: ${desprotegidas.join(', ')}`);
  console.log(`2. Nenhuma das ${pa.size} tabelas com RLS perdeu a ultima politica permissiva.`);

  // 2) Nenhuma politica RESTRICTIVE pode sumir: ela e a defesa em profundidade, e some
  // calada porque sua ausencia nao quebra nenhuma consulta.
  const chave = (p: Politica) => `${p.tabela}.${p.politica}`;
  const restritivasAntes = antes.filter((p) => !p.permissiva).map(chave);
  const restritivasDepois = new Set(depois.filter((p) => !p.permissiva).map(chave));
  const perdidas = restritivasAntes.filter((k) => !restritivasDepois.has(k));
  assert.deepEqual(perdidas, [], `politicas RESTRICTIVE removidas: ${perdidas.join(', ')}`);
  console.log(`3. As ${restritivasAntes.length} politicas RESTRICTIVE continuam todas no lugar.`);

  // 3) A imutabilidade de audit_logs e inegociavel.
  for (const nome of ['no_update_delete_al', 'no_update_delete_al2']) {
    assert.ok(depois.some((p) => p.tabela === 'audit_logs' && p.politica === nome),
      `audit_logs perdeu a politica de imutabilidade ${nome}`);
  }
  console.log('4. Imutabilidade de audit_logs preservada.');

  // 4) O que a migration promete entregar: toda tabela que ela toca fica sem permissiva
  // redundante, isto e, sem duas permissivas com mesmo comando e mesma expressao USING.
  const porTabela = new Map<string, Politica[]>();
  for (const p of depois) porTabela.set(p.tabela, [...(porTabela.get(p.tabela) ?? []), p]);
  const redundantes: string[] = [];
  for (const [t, ps] of porTabela) {
    const vistas = new Map<string, string[]>();
    for (const p of ps.filter((x) => x.permissiva && x.usando)) {
      const k = `${p.cmd}|${p.usando}`;
      vistas.set(k, [...(vistas.get(k) ?? []), p.politica]);
    }
    for (const nomes of vistas.values()) if (nomes.length > 1) redundantes.push(`${t}: ${nomes.join(' == ')}`);
  }
  assert.deepEqual(redundantes, [], `ainda ha permissivas redundantes: ${redundantes.join(' ; ')}`);
  console.log('5. Nenhuma politica permissiva redundante restou.');

  await db.close();
  console.log('\nverifyRlsDeduplication: PASS (schema real, catalogo do Postgres, 5/5)');
};

run().catch((e) => { console.error('verifyRlsDeduplication: FALHOU\n', e); process.exit(1); });
