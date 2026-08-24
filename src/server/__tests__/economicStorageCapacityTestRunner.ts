const R2_FREE_STORAGE_BYTES = 10_000_000_000;
const R2_FREE_CLASS_A_WRITES = 1_000_000;
const R2_FREE_CLASS_B_READS = 10_000_000;
const EXPECTED_READS_PER_DOCUMENT_PER_MONTH = 4;

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

interface CapacityRow {
  syntheticDocumentSizeKiB: number;
  documentsByStorage: number;
  documentsByWrites: number;
  documentsByReads: number;
  conservativeFreeTierDocuments: number;
}

export function calculateEconomicStorageCapacity(): CapacityRow[] {
  return [256, 512, 1024, 2048, 5120, 10240].map((syntheticDocumentSizeKiB) => {
    const bytes = syntheticDocumentSizeKiB * 1024;
    const documentsByStorage = Math.floor(R2_FREE_STORAGE_BYTES / bytes);
    const documentsByWrites = R2_FREE_CLASS_A_WRITES;
    const documentsByReads = Math.floor(R2_FREE_CLASS_B_READS / EXPECTED_READS_PER_DOCUMENT_PER_MONTH);
    return {
      syntheticDocumentSizeKiB,
      documentsByStorage,
      documentsByWrites,
      documentsByReads,
      conservativeFreeTierDocuments: Math.min(documentsByStorage, documentsByWrites, documentsByReads),
    };
  });
}

const rows = calculateEconomicStorageCapacity();
assert(rows.find((row) => row.syntheticDocumentSizeKiB === 512)!.conservativeFreeTierDocuments >= 19_000, '512 KiB capacity regression');
assert(rows.find((row) => row.syntheticDocumentSizeKiB === 1024)!.conservativeFreeTierDocuments >= 9_500, '1 MiB capacity regression');
assert(rows.find((row) => row.syntheticDocumentSizeKiB === 10240)!.conservativeFreeTierDocuments >= 950, '10 MiB capacity regression');
console.log(JSON.stringify({
  assumptions: {
    storageBytes: R2_FREE_STORAGE_BYTES,
    monthlyWrites: R2_FREE_CLASS_A_WRITES,
    monthlyReads: R2_FREE_CLASS_B_READS,
    readsPerDocumentPerMonth: EXPECTED_READS_PER_DOCUMENT_PER_MONTH,
    syntheticOnly: true,
  },
  rows,
}, null, 2));
console.log('Economic storage capacity synthetic benchmark PASS');
