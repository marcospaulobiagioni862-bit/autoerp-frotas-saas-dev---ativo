import { StorageAdapter } from './storageAdapter';

export interface AttachmentStorageProvider {
  save(companyId: string, storageKey: string, dataBase64: string, mimeType: string): Promise<string>;
  get(companyId: string, storageKey: string): Promise<string>;
  delete(companyId: string, storageKey: string): Promise<void>;
  exists(companyId: string, storageKey: string): Promise<boolean>;
  getMetadata(companyId: string, storageKey: string): Promise<{ mimeType: string; fileSize: number } | null>;
}

export class LocalAttachmentStorageProvider implements AttachmentStorageProvider {
  private adapter = StorageAdapter.getInstance();

  public async save(companyId: string, storageKey: string, dataBase64: string, mimeType: string): Promise<string> {
    const fileSize = Math.round(dataBase64.length * 0.75); // estimate decoded size
    await this.adapter.saveItem('fileAttachmentsBinaries', {
      id: storageKey,
      companyId,
      dataBase64,
      mimeType,
      fileSize,
      updatedAt: new Date().toISOString(),
    });
    return storageKey;
  }

  public async get(companyId: string, storageKey: string): Promise<string> {
    const item = await this.adapter.getItem<any>('fileAttachmentsBinaries', storageKey);
    if (!item) {
      throw new Error(`Arquivo não encontrado no storage local: ${storageKey}`);
    }
    // Cross-tenant check for absolute safety
    if (item.companyId !== companyId) {
      throw new Error('Acesso não autorizado: Cross-tenant storage access blocked.');
    }
    return item.dataBase64;
  }

  public async delete(companyId: string, storageKey: string): Promise<void> {
    const item = await this.adapter.getItem<any>('fileAttachmentsBinaries', storageKey);
    if (item && item.companyId !== companyId) {
      throw new Error('Acesso não autorizado: Cross-tenant storage access blocked.');
    }
    await this.adapter.removeItem('fileAttachmentsBinaries', storageKey);
  }

  public async exists(companyId: string, storageKey: string): Promise<boolean> {
    const item = await this.adapter.getItem<any>('fileAttachmentsBinaries', storageKey);
    if (!item) return false;
    if (item.companyId !== companyId) return false;
    return true;
  }

  public async getMetadata(companyId: string, storageKey: string): Promise<{ mimeType: string; fileSize: number } | null> {
    const item = await this.adapter.getItem<any>('fileAttachmentsBinaries', storageKey);
    if (!item) return null;
    if (item.companyId !== companyId) return null;
    return {
      mimeType: item.mimeType,
      fileSize: item.fileSize,
    };
  }
}

export class CloudAttachmentStorageProvider implements AttachmentStorageProvider {
  // Mock cloud storage to be configured with S3, Supabase, Azure, GCP, or Cloudflare later.
  private mockStore = new Map<string, { companyId: string; dataBase64: string; mimeType: string; fileSize: number }>();

  public async save(companyId: string, storageKey: string, dataBase64: string, mimeType: string): Promise<string> {
    const fileSize = Math.round(dataBase64.length * 0.75);
    this.mockStore.set(storageKey, { companyId, dataBase64, mimeType, fileSize });
    // In real cloud, we would upload to bucket and return a signed URL or path key
    return `https://cloud-storage.autoerp.com/buckets/${companyId}/${storageKey}`;
  }

  public async get(companyId: string, storageKey: string): Promise<string> {
    const item = this.mockStore.get(storageKey);
    if (!item) {
      throw new Error(`Arquivo não encontrado no storage cloud: ${storageKey}`);
    }
    if (item.companyId !== companyId) {
      throw new Error('Acesso não autorizado: Cross-tenant storage access blocked.');
    }
    return item.dataBase64;
  }

  public async delete(companyId: string, storageKey: string): Promise<void> {
    const item = this.mockStore.get(storageKey);
    if (item && item.companyId !== companyId) {
      throw new Error('Acesso não autorizado: Cross-tenant storage access blocked.');
    }
    this.mockStore.delete(storageKey);
  }

  public async exists(companyId: string, storageKey: string): Promise<boolean> {
    const item = this.mockStore.get(storageKey);
    if (!item) return false;
    if (item.companyId !== companyId) return false;
    return true;
  }

  public async getMetadata(companyId: string, storageKey: string): Promise<{ mimeType: string; fileSize: number } | null> {
    const item = this.mockStore.get(storageKey);
    if (!item) return null;
    if (item.companyId !== companyId) return null;
    return {
      mimeType: item.mimeType,
      fileSize: item.fileSize,
    };
  }
}

let activeProvider: AttachmentStorageProvider | null = null;

export function getAttachmentStorageProvider(): AttachmentStorageProvider {
  if (activeProvider) return activeProvider;

  // Read environment variable with dual compatibility (process.env vs import.meta.env for Vite)
  const mode = typeof process !== 'undefined' && process.env && process.env.ATTACHMENT_STORAGE_MODE
    ? process.env.ATTACHMENT_STORAGE_MODE
    : ((import.meta as any)?.env?.VITE_ATTACHMENT_STORAGE_MODE || 'LOCAL');

  if (mode === 'CLOUD') {
    activeProvider = new CloudAttachmentStorageProvider();
  } else {
    activeProvider = new LocalAttachmentStorageProvider();
  }

  return activeProvider;
}

export function setAttachmentStorageProvider(provider: AttachmentStorageProvider): void {
  activeProvider = provider;
}
