import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const source = readFileSync(resolve(process.cwd(), 'src/components/finance/ReceivablesView.tsx'), 'utf8');

assert(source.includes('DriverClient.list()'), 'manual receivable must load registered drivers');
assert(source.includes('VehicleClient.list()'), 'manual receivable must load registered vehicles');
assert(source.includes('Motorista do cadastro'), 'manual receivable must expose driver by registration');
assert(source.includes('Veículo do cadastro'), 'manual receivable must expose vehicle by registration');
assert(source.includes('Outros / Diversos'), 'manual receivable must expose Other/Diverse category');
assert(source.includes('FinanceMasterDataClient.createCategory'), 'Other/Diverse must use server-side finance category authority');
assert(source.includes('Prévia das parcelas'), 'manual receivable must show installment preview');
assert(source.includes('due.setMonth'), 'installment preview must mirror monthly recurrence authority');
assert(source.includes('roundCurrency(total - baseAmount * (count - 1))'), 'last installment must absorb cent rounding');
assert(!source.includes('Motorista ID (Opcional)'), 'manual technical driver id input must be removed');
assert(!source.includes('Veículo ID (Opcional)'), 'manual technical vehicle id input must be removed');

console.log('Manual receivables UI regression: PASS');
