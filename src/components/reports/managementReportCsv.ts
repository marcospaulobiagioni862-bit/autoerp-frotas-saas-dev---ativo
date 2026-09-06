import type { ManagementReportData } from '../../domain/reports/ManagementReportsService';

export type ManagementReportRow = [string, string, string, string];

export function sanitizeSpreadsheetText(value: unknown): string {
  let text = value === null || value === undefined ? '' : String(value);
  if (/^[=+\-@]/.test(text)) text = `'${text}`;
  return text;
}

function safeCell(value: unknown): string {
  const text = sanitizeSpreadsheetText(value);
  return `"${text.replace(/"/g, '""')}"`;
}

function addObjectRows(rows: ManagementReportRow[], section: string, record: string, value: Record<string, unknown>): void {
  for (const [field, fieldValue] of Object.entries(value)) {
    if (fieldValue !== null && typeof fieldValue === 'object') continue;
    rows.push([section, record, field, fieldValue === undefined ? '' : String(fieldValue)]);
  }
}

export function buildManagementReportRows(data: ManagementReportData): ManagementReportRow[] {
  const rows: ManagementReportRow[] = [['secao', 'registro', 'campo', 'valor']];

  rows.push(['metadados', 'relatorio', 'geradoEm', data.generatedAt]);
  rows.push(['metadados', 'relatorio', 'empresaId', data.companyId]);

  addObjectRows(rows, 'frota', 'resumo', data.fleet as unknown as Record<string, unknown>);
  addObjectRows(rows, 'contratos', 'resumo', data.contracts as unknown as Record<string, unknown>);
  addObjectRows(rows, 'manutencao', 'resumo', data.maintenance as unknown as Record<string, unknown>);
  addObjectRows(rows, 'documentos', 'resumo', data.documents as unknown as Record<string, unknown>);
  addObjectRows(rows, 'multas', 'resumo', data.tickets as unknown as Record<string, unknown>);

  rows.push(['saude', 'geral', 'score', String(data.healthScore.score)]);
  rows.push(['saude', 'geral', 'status', String(data.healthScore.status)]);
  for (const [field, value] of Object.entries(data.healthScore.components)) {
    rows.push(['saude', 'componente', field, String(value)]);
  }

  for (const item of data.vehicleDetails) {
    const record = item.plate || item.vehicleId;
    addObjectRows(rows, 'veiculos', record, item as unknown as Record<string, unknown>);
  }

  for (const item of data.driverDetails) {
    const record = item.fullName || item.driverId;
    addObjectRows(rows, 'motoristas', record, item as unknown as Record<string, unknown>);
  }

  for (const item of data.pendings) {
    const record = item.id;
    addObjectRows(rows, 'pendencias', record, item as unknown as Record<string, unknown>);
  }

  return rows;
}

export function buildManagementReportCsv(data: ManagementReportData): string {
  return '\uFEFF' + buildManagementReportRows(data).map((row) => row.map(safeCell).join(';')).join('\r\n');
}

export function managementReportCsvFilename(generatedAt: string): string {
  const day = /^\d{4}-\d{2}-\d{2}/.exec(generatedAt)?.[0] || new Date().toISOString().slice(0, 10);
  return `autoerp-relatorio-gerencial-${day}.csv`;
}

export function downloadManagementReportCsv(data: ManagementReportData): void {
  const csv = buildManagementReportCsv(data);
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = managementReportCsvFilename(data.generatedAt);
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
