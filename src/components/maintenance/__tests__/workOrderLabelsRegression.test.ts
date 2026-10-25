import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';

const maintenanceSource = readFileSync(
  new URL('../MaintenanceManagement.tsx', import.meta.url),
  'utf8'
);
const financeFieldsSource = readFileSync(
  new URL('../WorkOrderFinanceFields.tsx', import.meta.url),
  'utf8'
);

// 1. Número da OS must have permanent visible label
assert.match(
  maintenanceSource,
  /<label[^>]*>[\s\S]*?Número da OS[\s\S]*?<Input[\s\S]*?value=\{woNumber\}/,
  'Número da OS must have permanent visible label wrapping or preceding input'
);

// 2. Veículo must have permanent visible label
assert.match(
  maintenanceSource,
  /<label[^>]*>[\s\S]*?Veículo[\s\S]*?<select[\s\S]*?value=\{woVehicleId\}/,
  'Veículo select must have permanent visible label'
);

// 3. Data do serviço must have permanent visible label and keep aria-label
assert.match(
  maintenanceSource,
  /<label[^>]*>[\s\S]*?Data do serviço[\s\S]*?<Input[\s\S]*?value=\{woServiceDate\}[\s\S]*?aria-label="Data do serviço"/,
  'Data do serviço must have permanent visible label while retaining aria-label'
);

// 4. Fornecedor / oficina must have permanent visible label
assert.match(
  maintenanceSource,
  /<label[^>]*>[\s\S]*?Fornecedor \/ oficina[\s\S]*?<select[\s\S]*?value=\{woSupplierId\}/,
  'Fornecedor / oficina must have permanent visible label'
);

// 5. KM do serviço must have permanent visible label and example placeholder
assert.match(
  maintenanceSource,
  /<label[^>]*>[\s\S]*?KM do serviço[\s\S]*?<Input[\s\S]*?value=\{woEntryKm\}/,
  'KM do serviço must have permanent visible label'
);
assert.doesNotMatch(
  maintenanceSource,
  /placeholder="KM do serviço \*"/,
  'KM do serviço must not use field name as placeholder'
);

// 6. Descrição do serviço must have permanent visible label
assert.match(
  maintenanceSource,
  /<label[^>]*>[\s\S]*?Descrição do serviço \/ diagnóstico[\s\S]*?<Input[\s\S]*?value=\{woDescription\}/,
  'Descrição do serviço must have permanent visible label'
);
assert.doesNotMatch(
  maintenanceSource,
  /placeholder="Descrição do serviço \/ diagnóstico \*"/,
  'Descrição do serviço must not use field name as placeholder'
);

// 7. Valor dos serviços (opcional) must have permanent visible label
assert.match(
  maintenanceSource,
  /<label[^>]*>[\s\S]*?Valor dos serviços \(opcional\)[\s\S]*?<Input[\s\S]*?value=\{woServiceCost\}/,
  'Valor dos serviços must have permanent visible label'
);

// 8. Valor da mão de obra (opcional) must have permanent visible label
assert.match(
  maintenanceSource,
  /<label[^>]*>[\s\S]*?Valor da mão de obra \(opcional\)[\s\S]*?<Input[\s\S]*?value=\{woLaborCost\}/,
  'Valor da mão de obra must have permanent visible label'
);

// 9. Peças items: Peça and Quantidade must have permanent visible labels
assert.match(
  maintenanceSource,
  /<label[^>]*>[\s\S]*?Peça[\s\S]*?<select[\s\S]*?value=\{woPartId\}/,
  'Peça select must have permanent visible label'
);
assert.match(
  maintenanceSource,
  /<label[^>]*>[\s\S]*?Quantidade[\s\S]*?<Input[\s\S]*?value=\{woPartQty\}/,
  'Quantidade input must have permanent visible label'
);

// 10. WorkOrderFinanceFields invoice number must have visible label when enabled
assert.match(
  financeFieldsSource,
  /<label[^>]*>[\s\S]*?Número da nota fiscal[\s\S]*?<Input[\s\S]*?value=\{draft\.invoiceNumber\}/,
  'Invoice number in finance fields must have permanent visible label'
);

console.log('workOrderLabelsRegression: PASS');
