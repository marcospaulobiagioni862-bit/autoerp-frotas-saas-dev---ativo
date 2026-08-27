import assert from 'node:assert/strict';
import fs from 'node:fs';

const source = fs.readFileSync('src/components/finance/DREReportView.tsx', 'utf8');
const client = fs.readFileSync('src/api/financeReportingClient.ts', 'utf8');

for (const field of [
  'totalIncome', 'rentalIncome', 'kmExcessIncome', 'finesReimbursedIncome', 'otherIncome',
  'totalExpense', 'maintenanceExpense', 'insuranceExpense', 'trackerExpense',
  'documentationExpense', 'finesCompanyExpense', 'financingExpense',
  'depreciationExpense', 'otherExpense', 'kmTraveledPeriod', 'revenuePerKm',
  'costPerKm', 'netProfit', 'profitMarginPercentage',
]) {
  assert.ok(source.includes(`vehicleProfit.${field}`), `missing authoritative profitability field: ${field}`);
  assert.ok(client.includes(`'${field}'`), `client must validate displayed field: ${field}`);
}

assert.match(source, /FinanceReportingClient\.getVehicleProfitability\(/);
assert.match(source, /VehicleClient\.list\(\)/);
assert.doesNotMatch(source, /localRepositories|VehicleRepository/);
assert.doesNotMatch(source, /vehicleProfit\.(grossRevenue|totalExpenses|marginPercentage)/);
assert.doesNotMatch(source, /vehicleProfit\.[A-Za-z]+\s*[+\-*/]/);
console.log('FINANCE-UX-1E profitability breakdown regression: PASS');
