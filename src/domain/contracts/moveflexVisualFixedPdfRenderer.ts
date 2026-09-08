import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from 'pdf-lib';
import { extractContractDocxPagePngs } from './contractDocxPackageRenderer';
import { getMoveFlexApprovedContractMaster } from './moveflexApprovedContractMaster';
import { ContractDocxTemplateError } from './contractDocxTemplateRenderer';

type Values = Readonly<Record<string, string>>;
type Resolver = (values: Values) => string;

interface Overlay {
  page: number;
  x: number;
  y: number;
  value: Resolver;
  fieldKey: string;
  required?: boolean;
  fontSize?: number;
  maxWidth?: number;
  eraseWidth?: number;
}

const SOURCE_WIDTH = 1055;
const SOURCE_HEIGHT = 1491;
const PDF_WIDTH = 595.28;
const PDF_HEIGHT = 841.89;
const SCALE_X = PDF_WIDTH / SOURCE_WIDTH;
const SCALE_Y = PDF_HEIGHT / SOURCE_HEIGHT;

function val(values: Values, key: string): string {
  return String(values[key] || '').trim();
}

function dateBr(raw: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw.trim());
  return match ? `${match[3]}/${match[2]}/${match[1]}` : raw.trim();
}

function cityState(values: Values, prefix: 'company.address' | 'driver.address'): string {
  const city = val(values, `${prefix}.city`);
  const state = val(values, `${prefix}.state`);
  return [city, state].filter(Boolean).join('/');
}

function first(values: Values, ...keys: string[]): string {
  for (const key of keys) {
    const result = val(values, key);
    if (result) return result;
  }
  return '';
}

function moneyAmount(values: Values, key: string): string {
  return val(values, key).replace(/^R\$\s*/i, '').trim();
}

function checkbox(values: Values, expected: string): string {
  return val(values, 'contract.billingPeriodicity') === expected ? 'X' : '';
}

function commonCompanyAndDriver01(): Overlay[] {
  return [
    { page: 0, x: 165, y: 264, fieldKey: 'company.name', required: true, value: (v) => val(v, 'company.name'), maxWidth: 355 },
    { page: 0, x: 180, y: 284, fieldKey: 'company.tradeName', value: (v) => val(v, 'company.tradeName'), maxWidth: 340 },
    { page: 0, x: 120, y: 305, fieldKey: 'company.document', required: true, value: (v) => val(v, 'company.document'), maxWidth: 395 },
    { page: 0, x: 154, y: 326, fieldKey: 'company.address.full', required: true, value: (v) => val(v, 'company.address.full'), maxWidth: 360 },
    { page: 0, x: 145, y: 346, fieldKey: 'company.address.cityState', required: true, value: (v) => cityState(v, 'company.address'), maxWidth: 370 },
    { page: 0, x: 140, y: 367, fieldKey: 'company.phone', value: (v) => val(v, 'company.phone'), maxWidth: 370 },
    { page: 0, x: 122, y: 387, fieldKey: 'company.email', value: (v) => val(v, 'company.email'), maxWidth: 390 },
    { page: 0, x: 217, y: 408, fieldKey: 'company.legalRepresentative.name', value: (v) => val(v, 'company.legalRepresentative.name'), maxWidth: 290 },
    { page: 0, x: 122, y: 429, fieldKey: 'company.legalRepresentative.cpf', value: (v) => val(v, 'company.legalRepresentative.cpf'), maxWidth: 385 },

    { page: 0, x: 184, y: 511, fieldKey: 'driver.name', required: true, value: (v) => val(v, 'driver.name'), maxWidth: 340 },
    { page: 0, x: 110, y: 531, fieldKey: 'driver.cpf', required: true, value: (v) => val(v, 'driver.cpf'), maxWidth: 400 },
    { page: 0, x: 103, y: 551, fieldKey: 'driver.rg', value: (v) => val(v, 'driver.rg'), maxWidth: 395 },
    { page: 0, x: 126, y: 572, fieldKey: 'driver.cnh', required: true, value: (v) => val(v, 'driver.cnh'), maxWidth: 380 },
    { page: 0, x: 142, y: 592, fieldKey: 'driver.cnhCategory', required: true, value: (v) => val(v, 'driver.cnhCategory'), maxWidth: 365 },
    { page: 0, x: 185, y: 613, fieldKey: 'driver.cnhExpiration', required: true, value: (v) => dateBr(val(v, 'driver.cnhExpiration')), maxWidth: 320 },
    { page: 0, x: 211, y: 634, fieldKey: 'driver.birthDate', required: true, value: (v) => dateBr(val(v, 'driver.birthDate')), maxWidth: 295 },
    { page: 0, x: 153, y: 654, fieldKey: 'driver.maritalStatus', value: (v) => val(v, 'driver.maritalStatus'), maxWidth: 350 },
    { page: 0, x: 137, y: 674, fieldKey: 'driver.profession', value: (v) => val(v, 'driver.profession'), maxWidth: 365 },
    { page: 0, x: 211, y: 695, fieldKey: 'driver.address.full', required: true, value: (v) => val(v, 'driver.address.full'), maxWidth: 300 },
    { page: 0, x: 141, y: 715, fieldKey: 'driver.address.cityState', required: true, value: (v) => cityState(v, 'driver.address'), maxWidth: 375 },
    { page: 0, x: 106, y: 735, fieldKey: 'driver.address.zipCode', required: true, value: (v) => val(v, 'driver.address.zipCode'), maxWidth: 400 },
    { page: 0, x: 136, y: 756, fieldKey: 'driver.phone', required: true, value: (v) => val(v, 'driver.phone'), maxWidth: 370 },
    { page: 0, x: 121, y: 776, fieldKey: 'driver.email', value: (v) => val(v, 'driver.email'), maxWidth: 385 },
    { page: 0, x: 170, y: 796, fieldKey: 'driver.motherName', value: (v) => val(v, 'driver.motherName'), maxWidth: 345 },
    { page: 0, x: 145, y: 816, fieldKey: 'driver.pixKey', value: (v) => val(v, 'driver.pixKey'), maxWidth: 365 },

    { page: 0, x: 118, y: 950, fieldKey: 'vehicle.brand', required: true, value: (v) => val(v, 'vehicle.brand'), maxWidth: 395 },
    { page: 0, x: 121, y: 971, fieldKey: 'vehicle.model', required: true, value: (v) => val(v, 'vehicle.model'), maxWidth: 390 },
    { page: 0, x: 135, y: 992, fieldKey: 'vehicle.yearDisplay', required: true, value: (v) => val(v, 'vehicle.yearDisplay'), maxWidth: 370 },
    { page: 0, x: 119, y: 1013, fieldKey: 'vehicle.plate', required: true, value: (v) => val(v, 'vehicle.plate'), maxWidth: 390 },
    { page: 0, x: 149, y: 1033, fieldKey: 'vehicle.renavam', required: true, value: (v) => val(v, 'vehicle.renavam'), maxWidth: 365 },
    { page: 0, x: 111, y: 1054, fieldKey: 'vehicle.color', required: true, value: (v) => val(v, 'vehicle.color'), maxWidth: 395 },
    { page: 0, x: 123, y: 1075, fieldKey: 'vehicle.chassis', required: true, value: (v) => val(v, 'vehicle.chassis'), maxWidth: 380 },
    { page: 0, x: 198, y: 1096, fieldKey: 'vehicle.currentKm', required: true, value: (v) => `${val(v, 'vehicle.currentKm')} km`, maxWidth: 300 },
    { page: 0, x: 181, y: 1116, fieldKey: 'vehicle.tracker.identifier', value: (v) => first(v, 'vehicle.tracker.serialNumber', 'vehicle.tracker.imei'), maxWidth: 315 },

    { page: 0, x: 194, y: 1314, fieldKey: 'contract.startDate', required: true, value: (v) => dateBr(val(v, 'contract.startDate')), maxWidth: 125, eraseWidth: 90 },
    { page: 0, x: 279, y: 1334, fieldKey: 'contract.endDate', value: (v) => dateBr(val(v, 'contract.endDate')), maxWidth: 120, eraseWidth: 90 },

    { page: 1, x: 96, y: 317, fieldKey: 'contract.rentalAmount', required: true, value: (v) => moneyAmount(v, 'contract.rentalAmount'), maxWidth: 380 },
    { page: 1, x: 91, y: 354, fieldKey: 'contract.billingPeriodicity.weekly', value: (v) => checkbox(v, 'WEEKLY'), fontSize: 7.5 },
    { page: 1, x: 91, y: 395, fieldKey: 'contract.billingPeriodicity.monthly', value: (v) => checkbox(v, 'MONTHLY'), fontSize: 7.5 },
    { page: 1, x: 108, y: 441, fieldKey: 'contract.billingDue', value: (v) => first(v, 'contract.billingDueDayOfWeekLabel', 'contract.billingDueDayOfMonth'), maxWidth: 210 },
    { page: 1, x: 96, y: 611, fieldKey: 'contract.securityDepositAmount', value: (v) => moneyAmount(v, 'contract.securityDepositAmount'), maxWidth: 380 },

    { page: 3, x: 289, y: 559, fieldKey: 'company.address.forum', required: true, value: (v) => cityState(v, 'company.address'), maxWidth: 220 },
    { page: 3, x: 123, y: 866, fieldKey: 'company.address.city.signature', required: true, value: (v) => val(v, 'company.address.city'), maxWidth: 180 },
    { page: 3, x: 145, y: 929, fieldKey: 'company.document.signature', required: true, value: (v) => val(v, 'company.document'), maxWidth: 235 },
    { page: 3, x: 111, y: 970, fieldKey: 'driver.cpf.signature', required: true, value: (v) => val(v, 'driver.cpf'), maxWidth: 255 },
  ];
}

function contract02(): Overlay[] {
  return [
    { page: 0, x: 184, y: 329, fieldKey: 'driver.name', required: true, value: (v) => val(v, 'driver.name'), maxWidth: 390 },
    { page: 0, x: 106, y: 350, fieldKey: 'driver.cpf', required: true, value: (v) => val(v, 'driver.cpf'), maxWidth: 255 },
    { page: 0, x: 105, y: 370, fieldKey: 'driver.rg', value: (v) => val(v, 'driver.rg'), maxWidth: 255 },
    { page: 0, x: 106, y: 390, fieldKey: 'driver.cnh', required: true, value: (v) => val(v, 'driver.cnh'), maxWidth: 255 },
    { page: 0, x: 145, y: 411, fieldKey: 'driver.cnhCategory', required: true, value: (v) => val(v, 'driver.cnhCategory'), maxWidth: 210 },
    { page: 0, x: 194, y: 432, fieldKey: 'driver.cnhExpiration', required: true, value: (v) => dateBr(val(v, 'driver.cnhExpiration')), maxWidth: 120, eraseWidth: 82 },
    { page: 0, x: 119, y: 452, fieldKey: 'driver.phone', required: true, value: (v) => val(v, 'driver.phone'), maxWidth: 230 },
    { page: 0, x: 119, y: 473, fieldKey: 'driver.email', value: (v) => val(v, 'driver.email'), maxWidth: 410 },
    { page: 0, x: 140, y: 493, fieldKey: 'driver.address.full', required: true, value: (v) => val(v, 'driver.address.full'), maxWidth: 440 },

    { page: 0, x: 171, y: 541, fieldKey: 'vehicle.brandModel', required: true, value: (v) => val(v, 'vehicle.brandModel'), maxWidth: 400 },
    { page: 0, x: 109, y: 562, fieldKey: 'vehicle.yearDisplay', required: true, value: (v) => val(v, 'vehicle.yearDisplay'), maxWidth: 220 },
    { page: 0, x: 107, y: 583, fieldKey: 'vehicle.color', required: true, value: (v) => val(v, 'vehicle.color'), maxWidth: 205 },
    { page: 0, x: 118, y: 604, fieldKey: 'vehicle.plate', required: true, value: (v) => val(v, 'vehicle.plate'), maxWidth: 200 },
    { page: 0, x: 144, y: 625, fieldKey: 'vehicle.renavam', required: true, value: (v) => val(v, 'vehicle.renavam'), maxWidth: 185 },
    { page: 0, x: 183, y: 646, fieldKey: 'contract.startDate', required: true, value: (v) => dateBr(val(v, 'contract.startDate')), maxWidth: 120, eraseWidth: 84 },
    { page: 0, x: 281, y: 687, fieldKey: 'contract.endDate', value: (v) => dateBr(val(v, 'contract.endDate')), maxWidth: 120, eraseWidth: 84 },

    { page: 3, x: 119, y: 1315, fieldKey: 'driver.name.signature', required: true, value: (v) => val(v, 'driver.name'), maxWidth: 380 },
    { page: 3, x: 108, y: 1337, fieldKey: 'driver.cpf.signature', required: true, value: (v) => val(v, 'driver.cpf'), maxWidth: 270 },
    { page: 4, x: 164, y: 210, fieldKey: 'company.legalRepresentative.name.signature', value: (v) => val(v, 'company.legalRepresentative.name'), maxWidth: 335 },
    { page: 4, x: 108, y: 231, fieldKey: 'company.legalRepresentative.cpf.signature', value: (v) => val(v, 'company.legalRepresentative.cpf'), maxWidth: 390 },
  ];
}

function overlaysFor(templateKey: string): Overlay[] {
  if (templateKey === 'locacao-padrao') return commonCompanyAndDriver01();
  if (templateKey === 'termo-multas-infracoes') return contract02();
  throw new ContractDocxTemplateError('Unknown MoveFlex VISUAL_FIXO template key');
}

function fittedSize(font: PDFFont, text: string, preferred: number, maxWidthPt: number): number {
  let size = preferred;
  while (size > 5.2 && font.widthOfTextAtSize(text, size) > maxWidthPt) size -= 0.2;
  return size;
}

function drawOverlay(page: PDFPage, font: PDFFont, overlay: Overlay, text: string): void {
  const x = overlay.x * SCALE_X;
  const baselineY = PDF_HEIGHT - overlay.y * SCALE_Y;
  const preferred = overlay.fontSize || 7.1;
  const maxWidthPt = (overlay.maxWidth || 300) * SCALE_X;
  const size = fittedSize(font, text, preferred, maxWidthPt);

  if (overlay.eraseWidth) {
    page.drawRectangle({
      x: x - 1.5,
      y: baselineY - 1.5,
      width: overlay.eraseWidth * SCALE_X,
      height: 10.5,
      color: rgb(1, 1, 1),
    });
  }
  page.drawText(text, {
    x,
    y: baselineY,
    size,
    font,
    color: rgb(0.05, 0.05, 0.05),
    maxWidth: maxWidthPt,
  });
}

export async function renderMoveFlexVisualFixedPdf(
  masterDocx: Buffer,
  templateKey: string,
  values: Values,
): Promise<{ bytes: Buffer; filledKeys: string[]; pageCount: number }> {
  const master = getMoveFlexApprovedContractMaster(templateKey);
  if (!master) throw new ContractDocxTemplateError('Contract template is not a VISUAL_FIXO MoveFlex master');

  const pagePngs = extractContractDocxPagePngs(masterDocx);
  const expectedPageCount = templateKey === 'locacao-padrao' ? 4 : 5;
  if (pagePngs.length !== expectedPageCount) {
    throw new ContractDocxTemplateError('VISUAL_FIXO master page count mismatch');
  }

  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  for (const pageBytes of pagePngs) {
    const image = await pdf.embedPng(pageBytes);
    const page = pdf.addPage([PDF_WIDTH, PDF_HEIGHT]);
    page.drawImage(image, { x: 0, y: 0, width: PDF_WIDTH, height: PDF_HEIGHT });
  }

  const filled = new Set<string>();
  for (const overlay of overlaysFor(templateKey)) {
    const text = overlay.value(values).trim();
    if (!text) {
      if (overlay.required) throw new ContractDocxTemplateError(`Missing VISUAL_FIXO value: ${overlay.fieldKey}`);
      continue;
    }
    const page = pdf.getPage(overlay.page);
    drawOverlay(page, font, overlay, text);
    filled.add(overlay.fieldKey);
  }

  const saved = Buffer.from(await pdf.save({ useObjectStreams: false }));
  if (saved.subarray(0, 5).toString('ascii') !== '%PDF-') {
    throw new ContractDocxTemplateError('VISUAL_FIXO PDF signature invalid');
  }
  return { bytes: saved, filledKeys: [...filled].sort(), pageCount: pagePngs.length };
}
