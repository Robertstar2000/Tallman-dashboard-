interface StorageAPI {
    getItem(key: string): string | null;
    setItem(key: string, value: string): void;
    removeItem(key: string): void;
}

class MemoryStorage implements StorageAPI {
    private data: Record<string, string> = {};

    getItem(key: string): string | null {
        return key in this.data ? this.data[key] : null;
    }

    setItem(key: string, value: string): void {
        this.data[key] = value;
    }

    removeItem(key: string): void {
        delete this.data[key];
    }
}

function createSafeStorage(storageType: 'localStorage' | 'sessionStorage'): StorageAPI {
    try {
        const storage = window[storageType];
        const testKey = '__test_storage_availability__';
        storage.setItem(testKey, testKey);
        storage.removeItem(testKey);
        return storage;
    } catch (e) {
        console.warn(`${storageType} is not available. Falling back to in-memory storage.`);
        return new MemoryStorage();
    }
}

export const safeLocalStorage = createSafeStorage('localStorage');
export const safeSessionStorage = createSafeStorage('sessionStorage');
