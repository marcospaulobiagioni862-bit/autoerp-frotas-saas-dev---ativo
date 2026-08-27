import assert from 'node:assert/strict';
import fs from 'node:fs';

const view = fs.readFileSync('src/components/finance/VehicleProfitabilityBreakdown.tsx', 'utf8');
const dre = fs.readFileSync('src/components/finance/DREReportView.tsx', 'utf8');

for (const field of [
  'kmTraveledPeriod',
  'rentalIncome',
  'kmExcessIncome',
  'finesReimbursedIncome',
  'otherIncome',
  'totalIncome',
  'maintenanceExpense',
  'insuranceExpense',
  'trackerExpense',
  'documentationExpense',
  'finesCompanyExpense',
  'financingExpense',
  'depreciationExpense',
  'otherExpense',
  'totalExpense',
  'netProfit',
  'profitMarginPercentage',
  'costPerKm',
  'revenuePerKm',
]) {
  assert.ok(view.includes(`report.${field}`), `missing authoritative profitability field: ${field}`);
}

assert.match(dre, /FinanceReportingClient\.getVehicleProfitability\(/);
assert.match(dre, /VehicleClient\.list\(\)/);
assert.match(dre, /<VehicleProfitabilityBreakdown report=\{vehicleProfit\}/);
assert.doesNotMatch(view, /netProfit\s*\/\s*report\.kmTraveledPeriod/);
assert.doesNotMatch(view, /totalIncome\s*[-+]\s*report\.totalExpense/);
assert.doesNotMatch(view, /localRepositories|VehicleRepository/);

console.log('FINANCE-UX-1E vehicle profitability UI regression: PASS');
