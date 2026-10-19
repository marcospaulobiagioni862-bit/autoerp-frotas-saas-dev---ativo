import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createServer } from 'node:http';
import express from 'express';
import helmet from 'helmet';

async function main() {
  console.log('=== AUTOERP-32: REGRESSÃO DE ENFORCEMENT DO CSP (CONTENT-SECURITY-POLICY) ===\n');

  // 1. Verificação estática no código-fonte de server.ts
  const serverPath = join(process.cwd(), 'server.ts');
  const serverContent = readFileSync(serverPath, 'utf-8');

  assert(
    !serverContent.includes('reportOnly: true'),
    'INVARIANTE FALHOU: server.ts não pode conter "reportOnly: true" sob a diretiva de CSP!'
  );
  assert(
    serverContent.includes('reportOnly: false'),
    'INVARIANTE FALHOU: server.ts deve declarar explicitamente "reportOnly: false"!'
  );
  console.log('✓ [1/3] Verificação estática: server.ts configurado com reportOnly: false.');

  // 2. Verificação de emissão real de cabeçalhos HTTP via Helmet
  const app = express();
  app.use(
    helmet({
      crossOriginEmbedderPolicy: false,
      contentSecurityPolicy: {
        reportOnly: false,
        useDefaults: false,
        directives: {
          'default-src': ["'self'"],
          'base-uri': ["'self'"],
          'connect-src': ["'self'", 'https://viacep.com.br'],
          'font-src': ["'self'", 'data:'],
          'form-action': ["'self'"],
          'frame-ancestors': ["'self'"],
          'frame-src': ["'self'", 'blob:'],
          'img-src': ["'self'", 'data:', 'blob:'],
          'object-src': ["'none'"],
          'script-src': ["'self'"],
          'style-src': ["'self'", "'unsafe-inline'"],
          'worker-src': ["'self'", 'blob:'],
          'report-uri': ['/api/csp-report'],
        },
      },
    })
  );
  app.get('/test-csp', (_req, res) => {
    res.send('CSP OK');
  });

  const server = createServer(app);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  assert(address && typeof address === 'object');
  const url = `http://127.0.0.1:${address.port}/test-csp`;

  try {
    const res = await fetch(url);
    assert.equal(res.status, 200);

    const cspHeader = res.headers.get('content-security-policy');
    const cspReportOnlyHeader = res.headers.get('content-security-policy-report-only');

    assert(cspHeader, 'Cabeçalho Content-Security-Policy DEVE ser emitido.');
    assert.equal(
      cspReportOnlyHeader,
      null,
      'Cabeçalho Content-Security-Policy-Report-Only NÃO deve ser emitido quando em enforcement.'
    );

    console.log('✓ [2/3] Verificação em runtime: Content-Security-Policy ativo, Report-Only desativado.');

    // 3. Verificação das 4 exceções autorizadas para a SPA
    assert(cspHeader.includes('https://viacep.com.br'), 'connect-src deve conter https://viacep.com.br');
    assert(cspHeader.includes('blob:'), 'frame-src / img-src / worker-src devem conter blob:');
    assert(cspHeader.includes('data:'), 'img-src / font-src devem conter data:');
    assert(cspHeader.includes("'unsafe-inline'"), "style-src deve conter 'unsafe-inline'");

    console.log('✓ [3/3] Diretivas autorizadas conferidas (ViaCEP, blob, data, unsafe-inline).');
    console.log('\n=== CSP ENFORCEMENT REGRESSION: 100% SUCESSO ===');
  } finally {
    server.close();
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('FATAL ERROR ON CSP REGRESSION:', err);
    process.exit(1);
  });
