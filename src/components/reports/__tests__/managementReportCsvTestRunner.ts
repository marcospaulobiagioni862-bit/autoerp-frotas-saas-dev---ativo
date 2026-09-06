import assert from 'node:assert/strict';
import { buildManagementReportCsv, managementReportCsvFilename } from '../managementReportCsv';
import { buildManagementReportXlsx, managementReportXlsxFilename } from '../managementReportXlsx';

const report:any = {
  companyId: 'company-1',
  generatedAt: '2026-09-06T12:00:00.000Z',
  fleet: { totalVehicles: 2, available: 1 },
  contracts: { totalContracts: 1, activeContracts: 1 },
  maintenance: { totalMaintenances: 0 },
  documents: { totalDocuments: 1 },
  tickets: { totalTickets: 0 },
  healthScore: { score: 92, status: 'GOOD', components: { fleetAvailability: 90 } },
  pendings: [{ id: 'p1', title: '=HYPERLINK("x")', priority: 'P1' }],
  vehicleDetails: [{ vehicleId: 'v1', plate: 'ABC1D23', brand: 'Fiat', model: 'Argo' }],
  driverDetails: [{ driverId: 'd1', fullName: 'João "Teste"', cnhNumber: '123' }],
};

const csv = buildManagementReportCsv(report);
assert.ok(csv.startsWith('\uFEFF'), 'CSV must include UTF-8 BOM for spreadsheet compatibility');
assert.match(csv, /"secao";"registro";"campo";"valor"/, 'CSV must expose stable long-format headers');
assert.match(csv, /"frota";"resumo";"totalVehicles";"2"/, 'fleet summary must be exported');
assert.match(csv, /"veiculos";"ABC1D23";"plate";"ABC1D23"/, 'vehicle details must be exported');
assert.match(csv, /"motoristas";"João ""Teste""";"fullName";"João ""Teste"""/, 'quotes must be escaped');
assert.match(csv, /"'=HYPERLINK\(""x""\)"/, 'spreadsheet formula injection must be neutralized');
assert.equal(managementReportCsvFilename(report.generatedAt), 'autoerp-relatorio-gerencial-2026-09-06.csv');

const xlsx = buildManagementReportXlsx(report);
assert.equal(String.fromCharCode(...xlsx.slice(0, 4)), 'PK\x03\x04', 'XLSX must be a ZIP/OOXML package');
const xlsxText = Buffer.from(xlsx).toString('utf8');
assert.match(xlsxText, /\[Content_Types\]\.xml/, 'XLSX must include OOXML content types');
assert.match(xlsxText, /xl\/workbook\.xml/, 'XLSX must include workbook metadata');
assert.match(xlsxText, /xl\/worksheets\/sheet1\.xml/, 'XLSX must include the report worksheet');
assert.match(xlsxText, /ABC1D23/, 'XLSX must include vehicle data');
assert.match(xlsxText, /&apos;=HYPERLINK/, 'XLSX must neutralize spreadsheet formulas');
assert.equal(managementReportXlsxFilename(report.generatedAt), 'autoerp-relatorio-gerencial-2026-09-06.xlsx');

console.log('Management report CSV/XLSX export PASS');
