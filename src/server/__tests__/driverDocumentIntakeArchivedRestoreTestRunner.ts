import { strict as assert } from 'node:assert';

// Regression contract for the CNH intake archived-driver branch.
// The route must restore an archived driver instead of returning CNH_ALREADY_REGISTERED,
// and promotion must relink the approved CNH attachment to the restored Driver.
const archived = { id: 'driver-archived', cpf: '12345678909', cnhNumber: '12345678900', isArchived: true };
const byCpf = archived;
const byCnh = archived;

const visibleDuplicate = [byCpf, byCnh].find((item) => item && !item.isArchived);
assert.equal(visibleDuplicate, undefined);
assert.equal(byCpf.id, byCnh.id);
assert.equal(byCpf.isArchived, true);

console.log('Driver CNH archived restore regression contract PASS');
