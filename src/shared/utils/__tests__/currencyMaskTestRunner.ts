import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
import {
  normalizeCurrencyCentsDraft,
  normalizeCurrencyDraft,
  parseCurrencyDraft,
  numberToCurrencyDraft,
  formatCurrencyBRL,
} from '../currency';

// 1. normalizeCurrencyCentsDraft
assert.equal(normalizeCurrencyCentsDraft('6'), '0,06', '6 cents');
assert.equal(normalizeCurrencyCentsDraft('60'), '0,60', '60 cents (KM excedente)');
assert.equal(normalizeCurrencyCentsDraft('500'), '5,00', '5 reals');
assert.equal(normalizeCurrencyCentsDraft('1000'), '10,00', '10 reals');
assert.equal(normalizeCurrencyCentsDraft('100000'), '1.000,00', '1 thousand reals with thousand dot');
assert.equal(normalizeCurrencyCentsDraft('250000'), '2.500,00', '2.5 thousand reals (rent / deposit)');
assert.equal(normalizeCurrencyCentsDraft('123456789'), '1.234.567,89', 'multiple thousands');
assert.equal(normalizeCurrencyCentsDraft(''), '', 'empty returns empty');
assert.equal(normalizeCurrencyCentsDraft('2.500,00'), '2.500,00', 're-normalizing already formatted string is idempotent');

// 2. parseCurrencyDraft
assert.equal(parseCurrencyDraft('2.500,00'), 2500, 'parses thousand-dot currency string');
assert.equal(parseCurrencyDraft('0,60'), 0.6, 'parses cents correctly');
assert.equal(parseCurrencyDraft('1.234.567,89'), 1234567.89, 'parses large thousand-dot string');
assert.equal(parseCurrencyDraft('10,00'), 10, 'parses plain currency string');
assert(Number.isNaN(parseCurrencyDraft('')), 'empty string is NaN');
assert(Number.isNaN(parseCurrencyDraft('1,234')), '3-decimal fraction is rejected (never silently rounded)');

// 3. numberToCurrencyDraft
assert.equal(numberToCurrencyDraft(2500), '2.500,00', 'number to draft format with thousand dot');
assert.equal(numberToCurrencyDraft(0.6), '0,60', '0.6 number to 0,60 draft');
assert.equal(numberToCurrencyDraft(0), '0,00', '0 number to 0,00 draft');
assert.equal(numberToCurrencyDraft(null), '', 'null returns empty');
assert.equal(numberToCurrencyDraft(undefined), '', 'undefined returns empty');

// 4. Codebase invariants (verify forms use CurrencyInput instead of raw number inputs)
const contractForm = readFileSync(new URL('../../../components/contracts/ContractFormModal.tsx', import.meta.url), 'utf8');
const vehicleForm = readFileSync(new URL('../../../components/fleet/VehicleFormModal.tsx', import.meta.url), 'utf8');
const payablesView = readFileSync(new URL('../../../components/finance/PayablesView.tsx', import.meta.url), 'utf8');
const receivablesView = readFileSync(new URL('../../../components/finance/ReceivablesView.tsx', import.meta.url), 'utf8');

assert.match(contractForm, /<CurrencyInput value=\{form\.rentalAmount\}/, 'ContractFormModal must use CurrencyInput for rentalAmount');
assert.match(contractForm, /<CurrencyInput value=\{form\.securityDepositAmount\}/, 'ContractFormModal must use CurrencyInput for securityDepositAmount');
assert.match(contractForm, /<CurrencyInput value=\{form\.excessKmRate\}/, 'ContractFormModal must use CurrencyInput for excessKmRate');

assert.match(vehicleForm, /<CurrencyInput label="Valor de Aquisição \*" required value=\{formData\.acquisitionValue\}/, 'VehicleFormModal must use CurrencyInput for acquisitionValue');
assert.match(vehicleForm, /<CurrencyInput label="Valor Comercial Atual \*" required value=\{formData\.currentValue\}/, 'VehicleFormModal must use CurrencyInput for currentValue');
assert.match(vehicleForm, /<CurrencyInput label="Valor Aluguel Semanal de Referência \*" required value=\{formData\.rentalValueBase\}/, 'VehicleFormModal must use CurrencyInput for rentalValueBase');

assert.match(payablesView, /<CurrencyInput\s+label="Valor Total \*"/, 'PayablesView must use CurrencyInput for totalAmount');
assert.match(receivablesView, /<CurrencyInput label="Valor Total \*"/, 'ReceivablesView must use CurrencyInput for totalAmount');

console.log('Currency mask & format regression PASS');
