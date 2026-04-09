type CacheEntry<T> = {
  data: T;
  expiresAt: number;
};

const store = new Map<string, CacheEntry<unknown>>();

export const cache = {
  get<T>(key: string): T | null {
    const entry = store.get(key) as CacheEntry<T> | undefined;

    if (!entry) {
      console.log(`[cache] MISS: ${key}`);
      return null;
    }

    if (Date.now() > entry.expiresAt) {
      store.delete(key);
      console.log(`[cache] EXPIRED: ${key}`);
      return null;
    }

    console.log(`[cache] HIT: ${key}`);
    return entry.data;
  },

  set<T>(key: string, data: T, ttlMinutes: number): void {
    console.log(`[cache] SET: ${key} (${ttlMinutes}min)`);
    store.set(key, {
      data,
      expiresAt: Date.now() + ttlMinutes * 60 * 1000,
    });
  },

  delete(key: string): void {
    console.log(`[cache] DELETE: ${key}`);
    store.delete(key);
  },
};