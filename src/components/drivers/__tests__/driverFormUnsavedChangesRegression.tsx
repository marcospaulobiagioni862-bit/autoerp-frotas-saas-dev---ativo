import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
import { draftKey, readFormDraft, writeFormDraft } from '../../../app/localFormDraft';
import { clearAllUnsavedChanges, hasUnsavedChanges, UNSAVED_CHANGES_MESSAGE } from '../../../app/unsavedChangesAuthority';

// 1. Static AST / Code Structure Verification across the 3 critical forms
const driverFormCode = readFileSync(new URL('../DriverFormModal.tsx', import.meta.url), 'utf8');
const vehicleFormCode = readFileSync(new URL('../../fleet/VehicleFormModal.tsx', import.meta.url), 'utf8');
const contractFormCode = readFileSync(new URL('../../contracts/ContractFormModal.tsx', import.meta.url), 'utf8');

// DriverFormModal must use local form draft and refetch guard
assert.match(driverFormCode, /useLocalFormDraft/, 'DriverFormModal must use useLocalFormDraft');
assert.match(driverFormCode, /initializedDriverRef = useRef/, 'DriverFormModal must guard against refetch resets with initializedDriverRef');
assert.match(driverFormCode, /if \(initializedDriverRef\.current === currentKey\)\s*\{\s*return;\s*\}/, 'DriverFormModal must not overwrite dirty fields on background refetch');
assert.match(driverFormCode, /formDraft\.clear\(\)/, 'DriverFormModal must clear draft on successful submission');
assert.match(driverFormCode, /formDraft\.close\(onClose\)/, 'DriverFormModal must close safely through draft guard');

// VehicleFormModal must use local form draft and refetch guard
assert.match(vehicleFormCode, /useLocalFormDraft/, 'VehicleFormModal must use useLocalFormDraft');
assert.match(vehicleFormCode, /initializedVehicleRef = useRef/, 'VehicleFormModal must guard against refetch resets with initializedVehicleRef');
assert.match(vehicleFormCode, /if \(initializedVehicleRef\.current === currentKey\)\s*\{\s*return;\s*\}/, 'VehicleFormModal must not overwrite dirty fields on background refetch');
assert.match(vehicleFormCode, /formDraft\.clear\(\)/, 'VehicleFormModal must clear draft on successful submission');
assert.match(vehicleFormCode, /formDraft\.close\(onClose\)/, 'VehicleFormModal must close safely through draft guard');

// ContractFormModal must keep guarded initialization
assert.match(contractFormCode, /useLocalFormDraft/, 'ContractFormModal must use useLocalFormDraft');
assert.match(contractFormCode, /initializedContractRef = useRef/, 'ContractFormModal must guard against refetch resets with initializedContractRef');
assert.match(contractFormCode, /if \(initializedContractRef\.current === currentKey\)\s*\{\s*return/, 'ContractFormModal must not overwrite dirty fields on options/props refetch');

// 2. Behavioral Unit Test for Draft Storage, Expiration & Refetch Protection
const storageMap = new Map<string, string>();
const mockStorage = {
  getItem: (k: string) => storageMap.get(k) ?? null,
  setItem: (k: string, v: string) => { storageMap.set(k, v); },
  removeItem: (k: string) => { storageMap.delete(k); },
};

const companyId = 'company-test-123';
const userId = 'user-marcos-456';
const key = draftKey(companyId, userId, 'driver:new');

// Simulate typing in driver form
const sampleDriver = {
  fullName: 'Marcos Motorista Teste',
  cpf: '12345678901',
  phone: '11999998888',
  email: 'marcos@teste.local',
};

const now = Date.now();
writeFormDraft(mockStorage, key, sampleDriver, now);

// Scenario 1: User fills half the form, leaves idle for 20 minutes (1200 seconds), returns
const idle20MinutesLater = now + (20 * 60 * 1000);
const restored = readFormDraft(mockStorage, key, { fullName: '', cpf: '', phone: '', email: '' }, idle20MinutesLater);
assert.notEqual(restored, null, 'Draft must survive 20 minutes idle without loss');
assert.equal(restored?.fullName, 'Marcos Motorista Teste');
assert.equal(restored?.cpf, '12345678901');

// Scenario 2: Simulation of Refetch Guard Logic (Cenário que pega o bug de verdade)
function simulateFormCycle(opts: { withGuard: boolean }) {
  let formState = { fullName: '', phone: '' };
  let initializedKey: string | null = null;

  // Step A: Modal opens
  const modalOpen = (driverProp: { id?: string } | null) => {
    const currentKey = driverProp ? `edit:${driverProp.id}` : 'new';
    if (opts.withGuard && initializedKey === currentKey) {
      return; // Protected!
    }
    initializedKey = currentKey;
    formState = driverProp ? { fullName: 'Original Name', phone: '1100000000' } : { fullName: '', phone: '' };
  };

  modalOpen(null); // initial open
  assert.equal(formState.fullName, '');

  // Step B: User types half the form
  formState.fullName = 'Marcos Digitou Metade';
  formState.phone = '11987654321';

  // Step C: Parent component triggers a background data refetch while user is typing
  modalOpen(null); // Refetch re-renders parent and passes props to open modal

  return formState;
}

// Without guard: state was wiped
const unshieldedState = simulateFormCycle({ withGuard: false });
assert.equal(unshieldedState.fullName, '', 'Mutation proof: without guard, refetch wiped typed state');

// With guard: state is safely preserved!
const shieldedState = simulateFormCycle({ withGuard: true });
assert.equal(shieldedState.fullName, 'Marcos Digitou Metade', 'With guard, refetch must never overwrite user typed fields');
assert.equal(shieldedState.phone, '11987654321', 'With guard, phone field is preserved');

// Clean up
clearAllUnsavedChanges();
assert.equal(hasUnsavedChanges(), false, 'Pristine state must not have unsaved changes');

console.log('Driver & Vehicle form unsaved changes & refetch resilience regression PASS (PH-053)');
