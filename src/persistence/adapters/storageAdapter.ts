// AutoERP Storage Adapter (IndexedDB & LocalStorage Wrapper with Transaction Locks)

const DB_NAME = 'AutoERP_DB';
const DB_VERSION = 3;

export class StorageAdapter {
  private static instance: StorageAdapter;
  private dbPromise: Promise<IDBDatabase> | null = null;

  private constructor() {
    this.initDB().catch(() => {
      // Fallback to LocalStorage in environments without IndexedDB (e.g. Node / SSR / tests)
    });
  }

  public static getInstance(): StorageAdapter {
    if (!StorageAdapter.instance) {
      StorageAdapter.instance = new StorageAdapter();
    }
    return StorageAdapter.instance;
  }

  private initDB(): Promise<IDBDatabase> {
    if (this.dbPromise) return this.dbPromise;

    this.dbPromise = new Promise((resolve, reject) => {
      if (typeof window === 'undefined' || !window.indexedDB) {
        reject(new Error('IndexedDB is not supported in this environment'));
        return;
      }

      const requiredStores = [
        'vehicles',
        'drivers',
        'contracts',
        'contractTemplates',
        'financialAccounts',
        'paymentMethods',
        'financialCategories',
        'securityDeposits',
        'securityDepositMovements',
        'accountsReceivable',
        'accountsPayable',
        'financialTransactions',
        'recurringRules',
        'suppliers',
        'maintenances',
        'vehicleDocuments',
        'driverDocuments',
        'insurances',
        'trackers',
        'kmRecords',
        'trafficTickets',
        'auditLogs',
        'fileAttachments',
        'fileAttachmentsBinaries',
        'archivedRecords',
        'notifications',
      ];

      const openReq = (version?: number) => {
        const request = indexedDB.open(DB_NAME, version);

        request.onupgradeneeded = (event: IDBVersionChangeEvent) => {
          const db = (event.target as IDBOpenDBRequest).result;
          requiredStores.forEach((storeName) => {
            if (!db.objectStoreNames.contains(storeName)) {
              db.createObjectStore(storeName, { keyPath: 'id' });
            }
          });
        };

        request.onsuccess = () => {
          const db = request.result;
          const missing = requiredStores.some((s) => !db.objectStoreNames.contains(s));
          if (missing) {
            const nextVersion = db.version + 1;
            db.close();
            openReq(nextVersion);
          } else {
            resolve(db);
          }
        };

        request.onerror = () => {
          console.error('IndexedDB error:', request.error);
          reject(request.error);
        };
      };

      openReq(DB_VERSION);
    });
    return this.dbPromise;
  }

  public async getCollection<T>(collectionName: string): Promise<T[]> {
    try {
      const db = await this.initDB();
      if (!db.objectStoreNames.contains(collectionName)) {
        throw new Error(`Store ${collectionName} not found in IndexedDB`);
      }
      return await new Promise<T[]>((resolve, reject) => {
        const tx = db.transaction(collectionName, 'readonly');
        const store = tx.objectStore(collectionName);
        const request = store.getAll();

        request.onsuccess = () => resolve(request.result as T[]);
        request.onerror = () => reject(request.error);
      });
    } catch (err) {
      // Fallback to LocalStorage
      const raw = localStorage.getItem(`autoerp_${collectionName}`);
      return raw ? JSON.parse(raw) : [];
    }
  }

  public async getItem<T>(collectionName: string, id: string): Promise<T | null> {
    try {
      const db = await this.initDB();
      if (!db.objectStoreNames.contains(collectionName)) {
        throw new Error(`Store ${collectionName} not found in IndexedDB`);
      }
      return await new Promise<T | null>((resolve, reject) => {
        const tx = db.transaction(collectionName, 'readonly');
        const store = tx.objectStore(collectionName);
        const request = store.get(id);

        request.onsuccess = () => resolve((request.result as T) || null);
        request.onerror = () => reject(request.error);
      });
    } catch (err) {
      const items = await this.getCollection<T & { id: string }>(collectionName);
      return items.find((item) => item.id === id) || null;
    }
  }

  public async saveItem<T extends { id: string }>(collectionName: string, item: T): Promise<T> {
    try {
      const db = await this.initDB();
      if (!db.objectStoreNames.contains(collectionName)) {
        throw new Error(`Store ${collectionName} not found in IndexedDB`);
      }
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(collectionName, 'readwrite');
        const store = tx.objectStore(collectionName);
        const request = store.put(item);

        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
      });
    } catch (err) {
      // LocalStorage Sync Fallback
      const items = await this.getCollection<T>(collectionName);
      const index = items.findIndex((i) => i.id === item.id);
      if (index >= 0) {
        items[index] = item;
      } else {
        items.push(item);
      }
      localStorage.setItem(`autoerp_${collectionName}`, JSON.stringify(items));
    }

    // Always mirror to LocalStorage for quick cache / backup
    this.syncLocalStorageFallback(collectionName);
    return item;
  }

  public async removeItem(collectionName: string, id: string): Promise<boolean> {
    try {
      const db = await this.initDB();
      if (!db.objectStoreNames.contains(collectionName)) {
        throw new Error(`Store ${collectionName} not found in IndexedDB`);
      }
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(collectionName, 'readwrite');
        const store = tx.objectStore(collectionName);
        const request = store.delete(id);

        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
      });
    } catch (err) {
      const items = await this.getCollection<{ id: string }>(collectionName);
      const filtered = items.filter((i) => i.id !== id);
      localStorage.setItem(`autoerp_${collectionName}`, JSON.stringify(filtered));
    }

    this.syncLocalStorageFallback(collectionName);
    return true;
  }

  public async saveBatch<T extends { id: string }>(collectionName: string, items: T[]): Promise<T[]> {
    try {
      const db = await this.initDB();
      if (!db.objectStoreNames.contains(collectionName)) {
        throw new Error(`Store ${collectionName} not found in IndexedDB`);
      }
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(collectionName, 'readwrite');
        const store = tx.objectStore(collectionName);

        items.forEach((item) => store.put(item));

        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
    } catch (err) {
      localStorage.setItem(`autoerp_${collectionName}`, JSON.stringify(items));
    }
    this.syncLocalStorageFallback(collectionName);
    return items;
  }

  public async clearCollection(collectionName: string): Promise<void> {
    try {
      const db = await this.initDB();
      if (!db.objectStoreNames.contains(collectionName)) {
        throw new Error(`Store ${collectionName} not found in IndexedDB`);
      }
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(collectionName, 'readwrite');
        const store = tx.objectStore(collectionName);
        const request = store.clear();

        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
      });
    } catch (err) {
      // Ignore clear errors
    } finally {
      localStorage.removeItem(`autoerp_${collectionName}`);
    }
  }

  private async syncLocalStorageFallback(collectionName: string): Promise<void> {
    try {
      const db = await this.initDB();
      if (!db.objectStoreNames.contains(collectionName)) return;

      const tx = db.transaction(collectionName, 'readonly');
      const store = tx.objectStore(collectionName);
      const request = store.getAll();

      request.onsuccess = () => {
        try {
          if (collectionName !== 'fileAttachmentsBinaries') {
            localStorage.setItem(`autoerp_${collectionName}`, JSON.stringify(request.result));
          }
        } catch (e) {
          console.warn('LocalStorage quota exceeded for cache mirror, IndexedDB primary is safe.', e);
        }
      };
    } catch (e) {
      // Ignore sync warnings
    }
  }
}
