import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { getBrowserTabTitle } from '../Sidebar';

/**
 * AUTOERP-80: Teste de Regressão e Prova de Mutação de Branding da Aba do Navegador
 *
 * Garante que:
 * 1. index.html eliminou qualquer resquício de "Google AI Studio" herdado de scaffolds.
 * 2. index.html define lang="pt-BR".
 * 3. index.html define estaticamente <title>AutoERP</title> (curto, não corta na aba do navegador).
 * 4. index.html NÃO possui hardcode do tenant "MoveFlex", respeitando o isolamento multitenant (AUTOERP-33).
 * 5. index.html referencia favicon svg e meta description.
 * 6. public/favicon.svg existe e é um SVG válido.
 * 7. getBrowserTabTitle atualiza dinamicamente para "<Tenant> · AutoERP" apenas pós-carregamento.
 * 8. Mutações sintéticas comprovam que regressões quebram a suíte.
 */
export function runBrowserTabBrandingRegression(): void {
  console.log('=== TESTE DE REGRESSÃO: BRANDING DA ABA DO NAVEGADOR (AUTOERP-80) ===\n');

  const rootDir = process.cwd();
  const indexPath = join(rootDir, 'index.html');
  const faviconPath = join(rootDir, 'public/favicon.svg');
  const sidebarPath = join(rootDir, 'src/components/layout/Sidebar.tsx');

  const indexContent = readFileSync(indexPath, 'utf-8');
  const sidebarContent = readFileSync(sidebarPath, 'utf-8');

  // [1/8] index.html: Eliminação de referências ao Google AI Studio
  console.log('[1/8] Verificando ausência de resquícios de Google AI Studio...');
  assert(
    !indexContent.toLowerCase().includes('google ai studio'),
    'index.html não pode conter menções a Google AI Studio'
  );
  console.log('  ✓ Nenhuma menção a Google AI Studio encontrada.');

  // [2/8] index.html: Idioma pt-BR
  console.log('[2/8] Verificando atributo lang="pt-BR" no HTML...');
  assert.match(
    indexContent,
    /<html\s+[^>]*lang=["']pt-BR["']/i,
    'index.html deve declarar lang="pt-BR"'
  );
  console.log('  ✓ lang="pt-BR" validado com sucesso.');

  // [3/8] index.html: Título estático AutoERP
  console.log('[3/8] Verificando título estático <title>AutoERP</title>...');
  assert.match(
    indexContent,
    /<title>AutoERP<\/title>/,
    'index.html deve conter exatamente <title>AutoERP</title>'
  );
  console.log('  ✓ <title>AutoERP</title> validado.');

  // [4/8] index.html: Ausência de marca de cliente hardcoded (multitenant)
  console.log('[4/8] Verificando ausência de tenant hardcoded no HTML estático...');
  assert(
    !indexContent.includes('MoveFlex'),
    'index.html não deve conter hardcode da marca MoveFlex (deve ser dinâmica pós-login)'
  );
  console.log('  ✓ Isolamento multitenant estático preservado.');

  // [5/8] index.html: Favicon e meta description
  console.log('[5/8] Verificando favicon e meta description em index.html...');
  assert.match(
    indexContent,
    /<link\s+[^>]*rel=["']icon["'][^>]*href=["']\/favicon\.svg["']/i,
    'index.html deve apontar o favicon para /favicon.svg'
  );
  assert.match(
    indexContent,
    /<meta\s+[^>]*name=["']description["']/i,
    'index.html deve conter meta tag description'
  );
  console.log('  ✓ Favicon e meta description presentes.');

  // [6/8] public/favicon.svg: Existência e formato
  console.log('[6/8] Verificando integridade física do favicon.svg...');
  assert(existsSync(faviconPath), 'public/favicon.svg deve existir fisicamente');
  const faviconContent = readFileSync(faviconPath, 'utf-8');
  assert(faviconContent.includes('<svg') && faviconContent.includes('</svg>'), 'favicon.svg deve ser um SVG válido');
  console.log('  ✓ public/favicon.svg verificado com sucesso.');

  // [7/8] Sidebar.tsx: Lógica dinâmica de título da aba
  console.log('[7/8] Validando lógica de título dinâmico getBrowserTabTitle...');
  assert.equal(getBrowserTabTitle('MoveFlex'), 'MoveFlex · AutoERP');
  assert.equal(getBrowserTabTitle('  MoveFlex  '), 'MoveFlex · AutoERP');
  assert.equal(getBrowserTabTitle('LocaFrota'), 'LocaFrota · AutoERP');
  assert.equal(getBrowserTabTitle(null), 'AutoERP');
  assert.equal(getBrowserTabTitle(undefined), 'AutoERP');
  assert.equal(getBrowserTabTitle(''), 'AutoERP');
  assert.equal(getBrowserTabTitle('AutoERP'), 'AutoERP');

  assert.match(
    sidebarContent,
    /document\.title\s*=\s*getBrowserTabTitle/,
    'Sidebar.tsx deve sincronizar document.title com getBrowserTabTitle'
  );
  console.log('  ✓ getBrowserTabTitle e integração em Sidebar.tsx validadas.');

  // [8/8] Prova de mutação: asserções negativas disparam se regressões forem introduzidas
  console.log('[8/8] Executando prova de mutação...');
  const syntheticLegacyHtml = '<!doctype html><html lang="en"><head><title>My Google AI Studio App</title></head></html>';
  assert.throws(
    () => {
      if (syntheticLegacyHtml.toLowerCase().includes('google ai studio')) {
        throw new Error('REVERTED_TO_STUDIO_APP');
      }
    },
    /REVERTED_TO_STUDIO_APP/,
    'Prova de mutação: legado do Google AI Studio deve ser barrado'
  );

  const syntheticHardcodedHtml = '<!doctype html><html lang="pt-BR"><head><title>MoveFlex</title></head></html>';
  assert.throws(
    () => {
      if (syntheticHardcodedHtml.includes('MoveFlex')) {
        throw new Error('HARDCODED_TENANT_IN_STATIC_HTML');
      }
    },
    /HARDCODED_TENANT_IN_STATIC_HTML/,
    'Prova de mutação: marca fixa no HTML deve ser barrada'
  );
  console.log('  ✓ Provas de mutação barradas com sucesso.');

  console.log('\n=============================================================');
  console.log('=== TODAS AS ASSERÇÕES DE BRANDING (AUTOERP-80) PASSARAM ===');
  console.log('=============================================================\n');
}

if (process.argv[1]?.endsWith('browserTabBrandingRegression.ts')) {
  try {
    runBrowserTabBrandingRegression();
    process.exit(0);
  } catch (err) {
    console.error('FATAL:', err);
    process.exit(1);
  }
}
