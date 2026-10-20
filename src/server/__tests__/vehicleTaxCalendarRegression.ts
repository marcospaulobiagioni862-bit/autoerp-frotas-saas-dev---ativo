/**
 * PH-074 — calendário de IPVA e licenciamento por final de placa (SP).
 * Hermético: exercita a regra pura, sem banco e sem rede. Idempotente.
 *
 * O que está sendo protegido aqui é dinheiro: vencimento de imposto errado vira
 * multa para o cliente. Por isso a regra erra para o lado seguro — placa que não
 * dá para classificar devolve null e aparece como não classificável, em vez de
 * receber uma data qualquer.
 */
import assert from 'node:assert';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { plateLastDigit, VEHICLE_TAX_TYPES } from '../vehicleTaxCalendarAuthority';

// --- último dígito da placa -------------------------------------------------
assert.equal(plateLastDigit('ABC1234'), 4, 'placa antiga: último caractere é o dígito');
assert.equal(plateLastDigit('abc1234'), 4, 'minúsculas não podem mudar o resultado');
assert.equal(plateLastDigit('ABC-1234'), 4, 'hífen não pode mudar o resultado');
assert.equal(plateLastDigit('ABC1D23'), 3, 'placa Mercosul comum termina em dígito');

// 🔴 O caso que justifica a função existir: Mercosul terminada em LETRA.
// `plate.at(-1)` devolveria 'S' aqui e classificaria o veículo no dígito errado.
assert.equal(plateLastDigit('BRA0S17'), 7, 'deve usar o último caractere NUMÉRICO');
assert.equal(plateLastDigit('ABC1D2E'), 2, 'placa terminada em letra usa o último dígito antes dela');

// Sem nenhum dígito não existe resposta certa: devolver null é o comportamento seguro.
assert.equal(plateLastDigit('ABCDEFG'), null, 'placa sem dígito não pode ser classificada');
assert.equal(plateLastDigit(''), null, 'placa vazia não pode ser classificada');
assert.equal(plateLastDigit(undefined as any), null, 'placa ausente não pode ser classificada');

// --- as datas não podem estar embutidas no código ---------------------------
const authoritySource = readFileSync(fileURLToPath(new URL('../vehicleTaxCalendarAuthority.ts', import.meta.url)), 'utf8');
const migration = readFileSync(fileURLToPath(new URL('../../../drizzle/0093_vehicle_tax_calendar.sql', import.meta.url)), 'utf8');
for (const fonte of [authoritySource, migration]) {
  assert.doesNotMatch(
    fonte,
    /'20\d{2}-\d{2}-\d{2}'/,
    'nenhuma data de vencimento pode estar fixa no código ou na migration: o calendário da Sefaz muda todo ano e chutar data gera multa',
  );
}

// --- integridade do cadastro ------------------------------------------------
assert.deepEqual([...VEHICLE_TAX_TYPES], ['IPVA_COTA_UNICA', 'IPVA_PARCELADO', 'LICENCIAMENTO']);
assert.match(
  authoritySource,
  /taxType !== 'IPVA_PARCELADO' && installment !== 1/,
  'cota única e licenciamento não podem aceitar número de parcela: geraria duas cobranças do mesmo imposto',
);
assert.match(
  migration,
  /CREATE UNIQUE INDEX IF NOT EXISTS uq_vehicle_tax_calendar_entry/,
  'uma data por empresa/UF/ano/dígito/tipo/parcela: sem o índice único, recadastrar o calendário duplica o vencimento',
);
assert.match(migration, /ENABLE ROW LEVEL SECURITY/, 'a tabela precisa de RLS como as demais');
assert.match(migration, /current_setting\('app\.current_tenant', true\)/, 'o isolamento por tenant segue o padrão do projeto');

console.log('PH-074 vehicle tax calendar regression: PASS');
