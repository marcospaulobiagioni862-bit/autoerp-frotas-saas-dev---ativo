import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

/**
 * AUTOERP-61/62 — a foto da vistoria vive em file_attachments, nunca em base64.
 *
 * Três defeitos vinham da mesma causa e esta suíte tranca os três:
 *  1. era impossível salvar vistoria com foto real de celular (as fotos iam em
 *     base64 dentro do JSON e estouravam o limite de 100kb do express.json);
 *  2. a listagem devolvia todas as fotos inteiras, o que travaria a tela assim
 *     que a massa crescesse;
 *  3. a retenção jurídica de 90 dias procura em file_attachments e, como as
 *     fotos nunca viravam anexo, nunca achava nada.
 */

const wizard = readFileSync('src/components/fleet/VehicleInspectionWizardModal.tsx', 'utf8');
const rotas = readFileSync('src/server/vehicleInspectionRoutes.ts', 'utf8');

// 1. O wizard sobe foto pelo caminho de anexo do sistema
assert.match(
  wizard,
  /AttachmentClient\.upload\(\{[\s\S]{0,400}entityType: 'VehicleInspection'/,
  'o wizard deve enviar a foto por AttachmentClient.upload com entityType VehicleInspection'
);
assert.match(wizard, /documentType: 'INSPECTION_PHOTO'/, 'a foto precisa ser marcada como INSPECTION_PHOTO');
assert.match(wizard, /documentType: 'INSPECTION_SIGNATURE'/, 'a assinatura precisa ser marcada como INSPECTION_SIGNATURE');
console.log('PASS 1/5: wizard envia foto e assinatura pelo caminho de anexo');

// 2. O payload de criação NÃO pode voltar a carregar o conteúdo da imagem
const blocoPayload = wizard.slice(wizard.indexOf('const photoList'), wizard.indexOf('VehicleInspectionClient.create'));
assert.doesNotMatch(
  blocoPayload,
  /url:\s*item\.dataUrl|url:\s*[a-zA-Z]+\.dataUrl/,
  'o payload de criacao da vistoria nao pode carregar o conteudo da imagem (dataUrl) de novo'
);
assert.doesNotMatch(
  wizard.slice(wizard.indexOf('VehicleInspectionClient.create'), wizard.indexOf('AttachmentClient.upload')),
  /driverSignatureUrl: signatureDataUrl/,
  'a assinatura nao pode voltar a ser enviada embutida no JSON da vistoria'
);
console.log('PASS 2/5: payload de criacao nao carrega imagem embutida');

// 3. O servidor recusa guardar conteúdo embutido, mesmo se alguém enviar
assert.match(
  rotas,
  /startsWith\('data:'\)\?resto:/,
  'a rota de criacao deve descartar url embutida (data:) antes de gravar'
);
assert.match(
  rotas,
  /driverSignatureUrl[\s\S]{0,120}!String\(req\.body\.driverSignatureUrl\)\.startsWith\('data:'\)/,
  'a rota de criacao deve recusar assinatura embutida (data:)'
);
console.log('PASS 3/5: servidor descarta conteudo embutido na gravacao');

// 4. A leitura monta as fotos a partir dos anexos e nunca devolve base64
assert.match(rotas, /function loadInspectionMedia/, 'deve existir a carga de midia a partir de file_attachments');
assert.match(rotas, /FROM file_attachments[\s\S]{0,200}entity_type='VehicleInspection'/, 'a midia deve vir de file_attachments da propria vistoria');
assert.match(rotas, /function withoutInlineContent/, 'fotos legadas precisam ser limpas de conteudo embutido antes de responder');
assert.match(rotas, /url\.startsWith\('data:'\)\s*\?\s*\{\.\.\.p,url:undefined/, 'foto legada com data: nao pode ser devolvida com o conteudo');
console.log('PASS 4/5: leitura usa anexos e limpa base64 legado');

// 5. A listagem carrega a mídia de todas as vistorias numa consulta só (sem N+1)
const blocoLista = rotas.slice(rotas.indexOf("app.get('/api/fleet/vehicles/:id/inspections'"), rotas.indexOf("app.post('/api/fleet/vehicles/:id/inspections'"));
assert.match(blocoLista, /loadInspectionMedia\(tx,principal\.companyId,rows\.map/, 'a listagem deve buscar a midia de todas as vistorias de uma vez');
assert.doesNotMatch(blocoLista, /for\s*\([^)]*\)\s*\{[\s\S]{0,200}loadInspectionMedia/, 'a listagem nao pode chamar a carga de midia dentro de laco (N+1)');
console.log('PASS 5/5: listagem carrega midia em uma consulta so');

console.log('\ninspectionPhotoStorage (AUTOERP-61/62): 5/5 PASS');
