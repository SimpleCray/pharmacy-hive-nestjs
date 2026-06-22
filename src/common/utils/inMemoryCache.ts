// In-memory cache with expiry (10 minutes)
const cache = new Map();
const EXPIRY_MS = 10 * 60 * 1000; // 10 minutes

interface CacheEntry<T> {
  value: T;
  timestamp: number;
}

function setCache<T>(key: string, value: T) {
  cache.set(key, { value, timestamp: Date.now() });
}

function getCache<T>(key: string): T | undefined {
  const entry = cache.get(key) as CacheEntry<T> | undefined;
  if (!entry) return undefined;
  if (Date.now() - entry.timestamp > EXPIRY_MS) {
    cache.delete(key);
    return undefined;
  }
  return entry.value;
}

function deleteCache(key: string) {
  cache.delete(key);
}

// Periodic cleanup (optional, for memory safety)
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of cache.entries()) {
    if (now - entry.timestamp > EXPIRY_MS) {
      cache.delete(key);
    }
  }
}, 60 * 1000); // every 1 minute

export { setCache, getCache, deleteCache };
