/**
 * Server-side in-memory cache for API routes and server components.
 * Prevents repeated DB hits for frequently-accessed, slow-changing data
 * (plans, subscription status, org config, branding).
 *
 * NOT shared across serverless cold starts — each instance has its own cache.
 * This is intentional: the cache acts as a request-coalescing buffer, not a
 * distributed store. For a single Next.js process it eliminates redundant
 * queries within the TTL window.
 */

interface CacheEntry<T> {
    data: T;
    expiresAt: number;
}

const store = new Map<string, CacheEntry<unknown>>();

// Default TTLs (ms)
const TTL = {
    SHORT: 10_000,        // 10s — subscription status, user permissions
    MEDIUM: 60_000,       // 1m  — plan list, org config
    LONG: 300_000,        // 5m  — branding, static lookups
} as const;

export { TTL };

/**
 * Get a value from cache, or compute it via the loader function.
 * Guarantees only ONE concurrent loader call per key (request coalescing).
 */
const inflightLoaders = new Map<string, Promise<unknown>>();

export async function cached<T>(
    key: string,
    loader: () => PromiseLike<T> | Promise<T>,
    ttlMs: number = TTL.MEDIUM
): Promise<T> {
    // 1. Check cache
    const entry = store.get(key) as CacheEntry<T> | undefined;
    if (entry && Date.now() < entry.expiresAt) {
        return entry.data;
    }

    // 2. Coalesce concurrent requests for same key
    const inflight = inflightLoaders.get(key);
    if (inflight) {
        return inflight as Promise<T>;
    }

    // 3. Execute loader — wrap in Promise.resolve to handle PromiseLike (Supabase builders)
    const promise = Promise.resolve(loader()).then((data) => {
        store.set(key, { data, expiresAt: Date.now() + ttlMs });
        inflightLoaders.delete(key);
        return data;
    }).catch((err) => {
        inflightLoaders.delete(key);
        throw err;
    });

    inflightLoaders.set(key, promise);
    return promise;
}

/**
 * Invalidate a specific cache key or all keys matching a prefix.
 */
export function invalidateCache(keyOrPrefix: string): void {
    if (store.has(keyOrPrefix)) {
        store.delete(keyOrPrefix);
        return;
    }
    // Prefix invalidation
    const keys = Array.from(store.keys());
    for (const k of keys) {
        if (k.startsWith(keyOrPrefix)) {
            store.delete(k);
        }
    }
}

/**
 * Clear the entire server cache. Use sparingly (e.g., after deployments).
 */
export function clearServerCache(): void {
    store.clear();
    inflightLoaders.clear();
}

/**
 * Get cache stats for monitoring.
 */
export function cacheStats(): { size: number; keys: string[] } {
    return { size: store.size, keys: Array.from(store.keys()) };
}
