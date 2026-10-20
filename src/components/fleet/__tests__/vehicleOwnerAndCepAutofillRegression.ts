/**
 * PH-072 / PH-073 / PH-075 e a busca de CEP compartilhada — pedidos do Marcos em 19 e 20/10/2026.
 * Hermetico: le o codigo-fonte, nao toca em banco nem em rede. Idempotente.
 */
import assert from 'node:assert';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const read = (rel: string) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8');
const vehicleForm = read('../VehicleFormModal.tsx');
const vehicleDetails = read('../VehicleDetailsModal.tsx');
const cepHelper = read('../../../utils/cepLookup.ts');
const driverForm = read('../../drivers/DriverFormModal.tsx');
const publicForm = read('../../public/PublicDriverFormPage.tsx');
const adminView = read('../../admin/AdministrationCenterView.tsx');

// --- PH-072: titular da empresa sai do cadastro, nunca do codigo -------------
assert.doesNotMatch(
  vehicleForm,
  /TRIFLEX ASSISTENCIA TECNICA DE MAQUINAS|22\.791\.551\/0001-53/,
  'nome e CNPJ da empresa nao podem estar fixos no codigo: preencheriam o titular errado para qualquer outra empresa',
);
assert.match(vehicleForm, /CompanyProfileClient\.get\(\)/, 'o titular da empresa deve vir do cadastro da empresa logada');
assert.match(
  vehicleForm,
  /if \(field === 'ownerType'\)/,
  'trocar o tipo de titular deve preencher sozinho, sem depender de clique no botao',
);
assert.match(
  vehicleForm,
  /next\.ownerName = '';\s*\n\s*next\.ownerDocument = '';/,
  'sair de "Proprio da Empresa" deve LIMPAR os campos: deixar o CNPJ da empresa num veiculo de terceiro e pior que campo vazio',
);

// --- PH-073: a cobranca se define no contrato, nao no cadastro do veiculo ----
assert.match(vehicleForm, /Valor Aluguel Semanal de Referência/, 'o campo do veiculo deve se identificar como valor de referencia');
assert.match(vehicleForm, /contrato do motorista/, 'a tela deve dizer onde periodicidade e vencimento sao definidos');
assert.doesNotMatch(
  vehicleForm,
  /billingPeriodicity|billingDueDay/,
  'os campos de cobranca nao podem ser duplicados no veiculo: duas fontes para a mesma regra geram cobranca errada',
);

// --- PH-075: o Marcos procurou "seguro" e "rastreador" ----------------------
assert.match(
  vehicleDetails,
  /label:'Seguro, Rastreador & Documentos'/,
  'a aba deve comecar pelo que o usuario procura; comecando por "Documentos" ele nao acha',
);
assert.match(vehicleDetails, /cota única/, 'a apolice deve mostrar a forma de pagamento (cota unica ou parcelado)');
assert.match(vehicleDetails, /contas a pagar/, 'a apolice deve indicar as parcelas ja lancadas no contas a pagar');

// --- Busca de CEP: uma implementacao so, usada pelos tres formularios -------
assert.match(cepHelper, /viacep\.com\.br/, 'o helper compartilhado e quem fala com o ViaCEP');
for (const [nome, fonte] of [['formulario publico do motorista', publicForm], ['cadastro da empresa', adminView]] as const) {
  assert.match(fonte, /lookupCepAddress/, `${nome} deve usar a busca de CEP compartilhada`);
}
for (const [nome, fonte] of [['formulario publico', publicForm], ['cadastro da empresa', adminView], ['cadastro de motorista', driverForm]] as const) {
  const chamadasDiretas = (fonte.match(/viacep\.com\.br/g) || []).length;
  assert.equal(chamadasDiretas, 0, `${nome} nao pode chamar o ViaCEP direto: a regra vive no helper, senao uma das copias fica para tras numa correcao`);
}

console.log('PH-072/073/075 + CEP autofill regression: PASS');
