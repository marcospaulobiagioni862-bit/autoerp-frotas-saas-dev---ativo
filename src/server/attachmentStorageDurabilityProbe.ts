import { createHash } from 'node:crypto';
import type { AttachmentByteStorage } from './attachmentStorage';

const PROBE_COMPANY_ID = 'autoerp_storage_probe';
const PROBE_ATTACHMENT_ID = 'durability_v1';
const PROBE_STORAGE_KEY = `${PROBE_COMPANY_ID}/${PROBE_ATTACHMENT_ID}`;
const PROBE_BYTES = Buffer.from('AUTOERP_STORAGE_DURABILITY_V1\n', 'utf8');
const PROBE_CHECKSUM = createHash('sha256').update(PROBE_BYTES).digest('hex');

export interface AttachmentStorageDurabilityProbeResult {
  provider: string;
  configured: boolean;
  durable: boolean;
  previousObjectFound: boolean;
  previousHashMatched: boolean;
  writeVerified: boolean;
  tenantIsolationVerified: boolean;
  checksum: string;
}

function sha256(bytes: Buffer): string {
  return createHash('sha256').update(bytes).digest('hex');
}

export async function runAttachmentStorageDurabilityProbe(
  storage: AttachmentByteStorage,
): Promise<AttachmentStorageDurabilityProbeResult> {
  const configuration = storage.getConfiguration();
  const result: AttachmentStorageDurabilityProbeResult = {
    provider: configuration.provider,
    configured: configuration.configured,
    durable: configuration.durable,
    previousObjectFound: false,
    previousHashMatched: false,
    writeVerified: false,
    tenantIsolationVerified: false,
    checksum: PROBE_CHECKSUM,
  };

  if (!configuration.configured || !configuration.durable) return result;

  result.previousObjectFound = await storage.exists(PROBE_COMPANY_ID, PROBE_STORAGE_KEY);
  if (result.previousObjectFound) {
    const previousBytes = await storage.read(PROBE_COMPANY_ID, PROBE_STORAGE_KEY);
    result.previousHashMatched = sha256(previousBytes) === PROBE_CHECKSUM;
  }

  const stored = await storage.write(PROBE_COMPANY_ID, PROBE_ATTACHMENT_ID, PROBE_BYTES);
  const readBack = await storage.read(PROBE_COMPANY_ID, stored.storageKey);
  result.writeVerified = stored.checksum === PROBE_CHECKSUM && sha256(readBack) === PROBE_CHECKSUM;
  result.tenantIsolationVerified = !(await storage.exists('autoerp_storage_probe_other', stored.storageKey));

  return result;
}
