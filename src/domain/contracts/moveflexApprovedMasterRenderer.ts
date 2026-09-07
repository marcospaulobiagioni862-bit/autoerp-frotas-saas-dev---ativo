import {
  renderContractApprovedMasterDocxPackage,
  type ContractDocxLiteralReplacement,
} from './contractDocxPackageRenderer';
import {
  getMoveFlexApprovedContractMaster,
  type MoveFlexApprovedContractMaster,
} from './moveflexApprovedContractMaster';
import { ContractDocxTemplateError } from './contractDocxTemplateRenderer';

type Values = Readonly<Record<string, string>>;

function value(values: Values, key: string): string {
  return String(values[key] || '').trim();
}

function required(values: Values, key: string): string {
  const result = value(values, key);
  if (!result) throw new ContractDocxTemplateError(`Missing approved master value: ${key}`);
  return result;
}

function dateBr(raw: string): string {
  const clean = raw.trim();
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(clean);
  return match ? `${match[3]}/${match[2]}/${match[1]}` : clean;
}

function kmBr(raw: string): string {
  const numeric = Number(raw.replace(/[^0-9.-]/g, ''));
  if (!Number.isFinite(numeric)) return raw;
  return `${new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 0 }).format(numeric)} km`;
}

function add(
  items: ContractDocxLiteralReplacement[],
  paragraphIndex: number,
  expectedText: string,
  needle: string,
  replacement: string,
  fieldKey: string,
  optional = false,
): void {
  const clean = replacement.trim();
  if (!clean) {
    if (optional) return;
    throw new ContractDocxTemplateError(`Missing approved master value: ${fieldKey}`);
  }
  items.push({ paragraphIndex, expectedText, needle, replacement: clean, fieldKey });
}

function contract01(values: Values): ContractDocxLiteralReplacement[] {
  const items: ContractDocxLiteralReplacement[] = [];
  add(items, 3, 'Razão Social: ___________________________________________', '___________________________________________', required(values, 'company.name'), 'company.name');
  add(items, 4, 'Nome Fantasia: __________________________________________', '__________________________________________', value(values, 'company.tradeName'), 'company.tradeName', true);
  add(items, 5, 'CNPJ: _________________________________________________', '_______________________________________________', required(values, 'company.document'), 'company.document');
  add(items, 6, 'Endereço: ______________________________________________', '______________________________________________', required(values, 'company.address.full'), 'company.address.full');
  add(items, 7, 'Cidade/UF: _____________________________________________', '_____________________________________________', `${required(values, 'company.address.city')}/${required(values, 'company.address.state')}`, 'company.address.cityState');
  add(items, 8, 'Telefone: ______________________________________________', '______________________________________________', value(values, 'company.phone'), 'company.phone', true);
  add(items, 9, 'E-mail: ________________________________________________', '________________________________________________', value(values, 'company.email'), 'company.email', true);
  add(items, 10, 'Representante Legal: ____________________________________', '____________________________________', value(values, 'company.legalRepresentative.name'), 'company.legalRepresentative.name', true);
  add(items, 11, 'CPF: _________________________________________________', '_______________________________________________', value(values, 'company.legalRepresentative.cpf'), 'company.legalRepresentative.cpf', true);

  add(items, 15, 'Nome Completo: _________________________________________', '_________________________________________', required(values, 'driver.name'), 'driver.name');
  add(items, 16, 'CPF: _________________________________________________', '_______________________________________________', required(values, 'driver.cpf'), 'driver.cpf');
  add(items, 17, 'RG: _________________________________________________', '_______________________________________________', value(values, 'driver.rg'), 'driver.rg', true);
  add(items, 18, 'CNH nº: _______________________________________________', '_______________________________________________', required(values, 'driver.cnh'), 'driver.cnh');
  add(items, 19, 'Categoria: _____________________________________________', '_____________________________________________', required(values, 'driver.cnhCategory'), 'driver.cnhCategory');
  add(items, 20, 'Validade da CNH: _______________________________________', '_______________________________________', dateBr(required(values, 'driver.cnhExpiration')), 'driver.cnhExpiration');
  add(items, 21, 'Data de Nascimento: ____________________________________', '____________________________________', dateBr(required(values, 'driver.birthDate')), 'driver.birthDate');
  add(items, 22, 'Estado Civil: ___________________________________________', '___________________________________________', value(values, 'driver.maritalStatus'), 'driver.maritalStatus', true);
  add(items, 23, 'Profissão: _____________________________________________', '_____________________________________________', value(values, 'driver.profession'), 'driver.profession', true);
  add(items, 24, 'Endereço Completo: _____________________________________', '_____________________________________', required(values, 'driver.address.full'), 'driver.address.full');
  add(items, 25, 'Cidade/UF: _____________________________________________', '_____________________________________________', `${required(values, 'driver.address.city')}/${required(values, 'driver.address.state')}`, 'driver.address.cityState');
  add(items, 26, 'CEP: _________________________________________________', '_______________________________________________', required(values, 'driver.address.zipCode'), 'driver.address.zipCode');
  add(items, 27, 'Telefone: ______________________________________________', '______________________________________________', required(values, 'driver.phone'), 'driver.phone');
  add(items, 28, 'E-mail: ________________________________________________', '________________________________________________', value(values, 'driver.email'), 'driver.email', true);
  add(items, 29, 'Nome da Mãe: ___________________________________________', '___________________________________________', value(values, 'driver.motherName'), 'driver.motherName', true);
  add(items, 30, 'Chave PIX: _____________________________________________', '_____________________________________________', value(values, 'driver.pixKey'), 'driver.pixKey', true);

  add(items, 35, 'Marca: ________________________________________________', '________________________________________________', required(values, 'vehicle.brand'), 'vehicle.brand');
  add(items, 36, 'Modelo: _______________________________________________', '_______________________________________________', required(values, 'vehicle.model'), 'vehicle.model');
  add(items, 37, 'Ano/Modelo: ___________________________________________', '___________________________________________', required(values, 'vehicle.yearDisplay'), 'vehicle.yearDisplay');
  add(items, 38, 'Placa: ________________________________________________', '________________________________________________', required(values, 'vehicle.plate'), 'vehicle.plate');
  add(items, 39, 'RENAVAM: _____________________________________________', '_____________________________________________', required(values, 'vehicle.renavam'), 'vehicle.renavam');
  add(items, 40, 'Cor: _________________________________________________', '_______________________________________________', required(values, 'vehicle.color'), 'vehicle.color');
  add(items, 41, 'Chassi: _______________________________________________', '_______________________________________________', required(values, 'vehicle.chassis'), 'vehicle.chassis');
  add(items, 42, 'Quilometragem Inicial: _________________________________', '_________________________________', kmBr(required(values, 'vehicle.currentKm')), 'vehicle.currentKm');
  add(items, 43, 'Número do Rastreador: __________________________________', '__________________________________', value(values, 'vehicle.tracker.serialNumber') || value(values, 'vehicle.tracker.imei'), 'vehicle.tracker.identifier', true);

  add(items, 51, 'Data de Retirada: //________', '//________', dateBr(required(values, 'contract.startDate')), 'contract.startDate');
  const endDate = value(values, 'contract.endDate');
  add(items, 52, 'Data Prevista para Devolução: //________', '//________', endDate ? dateBr(endDate) : '', 'contract.endDate', true);
  add(items, 59, 'R$ _______________________________________________', 'R$ _______________________________________________', required(values, 'contract.rentalAmount'), 'contract.rentalAmount');

  const periodicity = required(values, 'contract.billingPeriodicity');
  if (periodicity === 'WEEKLY') {
    add(items, 61, '( ) Semanal', '( )', '(X)', 'contract.billingPeriodicity.weekly');
    const dueDay = value(values, 'contract.billingDueDayOfWeekLabel');
    add(items, 65, 'Toda __________________________.', '__________________________', dueDay, 'contract.billingDueDayOfWeekLabel', true);
  } else if (periodicity === 'MONTHLY') {
    add(items, 63, '( ) Mensal', '( )', '(X)', 'contract.billingPeriodicity.monthly');
  }

  add(items, 73, 'R$ _______________________________________________', 'R$ _______________________________________________', required(values, 'contract.securityDepositAmount'), 'contract.securityDepositAmount');
  add(items, 176, 'Fica eleito o foro da Comarca de:', 'Fica eleito o foro da Comarca de:', `Fica eleito o foro da Comarca de: ${required(values, 'company.address.city')}/${required(values, 'company.address.state')}`, 'company.address.forum');
  add(items, 190, 'Cidade: ______________________', '______________________', required(values, 'company.address.city'), 'company.address.city.signature');
  add(items, 193, 'CPF/CNPJ: ___________________________', '___________________________', required(values, 'company.document'), 'company.document.signature');
  add(items, 195, 'CPF: ________________________________', '________________________________', required(values, 'driver.cpf'), 'driver.cpf.signature');
  return items;
}

function contract02(values: Values): ContractDocxLiteralReplacement[] {
  const items: ContractDocxLiteralReplacement[] = [];
  add(items, 4, 'Nome completo: _______________________________________________', '_______________________________________________', required(values, 'driver.name'), 'driver.name');
  add(items, 5, 'CPF: ______________________________', '______________________________', required(values, 'driver.cpf'), 'driver.cpf');
  add(items, 6, 'RG: _______________________________', '_______________________________', value(values, 'driver.rg'), 'driver.rg', true);
  add(items, 7, 'CNH: ______________________________', '______________________________', required(values, 'driver.cnh'), 'driver.cnh');
  add(items, 8, 'Categoria: _________________________', '_________________________', required(values, 'driver.cnhCategory'), 'driver.cnhCategory');
  add(items, 9, 'Validade da CNH: //________', '//________', dateBr(required(values, 'driver.cnhExpiration')), 'driver.cnhExpiration');
  add(items, 10, 'Telefone: __________________________', '__________________________', required(values, 'driver.phone'), 'driver.phone');
  add(items, 11, 'E-mail: _________________________________________________', '_______________________________________________', value(values, 'driver.email'), 'driver.email', true);
  add(items, 12, 'Endereço: ____________________________________________________', '____________________________________________________', required(values, 'driver.address.full'), 'driver.address.full');

  add(items, 14, 'Marca/Modelo: ________________________________________________', '________________________________________________', required(values, 'vehicle.brandModel'), 'vehicle.brandModel');
  add(items, 15, 'Ano: __________________________', '__________________________', required(values, 'vehicle.yearDisplay'), 'vehicle.yearDisplay');
  add(items, 16, 'Cor: _________________________', '_________________________', required(values, 'vehicle.color'), 'vehicle.color');
  add(items, 17, 'Placa: ________________________', '________________________', required(values, 'vehicle.plate'), 'vehicle.plate');
  add(items, 18, 'RENAVAM: _____________________', '_____________________', required(values, 'vehicle.renavam'), 'vehicle.renavam');
  add(items, 19, 'Data de retirada: //________', '//________', dateBr(required(values, 'contract.startDate')), 'contract.startDate');
  const endDate = value(values, 'contract.endDate');
  add(items, 21, 'Data prevista para devolução: //________', '//________', endDate ? dateBr(endDate) : '', 'contract.endDate', true);

  add(items, 161, 'Nome: ______________________________________________', '______________________________________________', required(values, 'driver.name'), 'driver.name.signature');
  add(items, 162, 'CPF: _______________________________________________', '_______________________________________________', required(values, 'driver.cpf'), 'driver.cpf.signature');
  add(items, 164, 'Responsável: ________________________________________', '________________________________________', value(values, 'company.legalRepresentative.name'), 'company.legalRepresentative.name.signature', true);
  add(items, 165, 'CPF: _______________________________________________', '_______________________________________________', value(values, 'company.legalRepresentative.cpf'), 'company.legalRepresentative.cpf.signature', true);
  return items;
}

export function renderMoveFlexApprovedMasterDocx(
  docx: Buffer,
  templateKey: string,
  values: Values,
): { bytes: Buffer; replacedKeys: string[]; master: MoveFlexApprovedContractMaster } {
  const master = getMoveFlexApprovedContractMaster(templateKey);
  if (!master) throw new ContractDocxTemplateError('Contract template is not an approved MoveFlex master');
  const replacements = master.templateKey === 'locacao-padrao' ? contract01(values) : contract02(values);
  const rendered = renderContractApprovedMasterDocxPackage(docx, replacements);
  return { ...rendered, master };
}
