/**
 * Module-level in-memory data cache - Stale-While-Revalidate pattern.
 * Data persists across React navigations and is mirrored to localStorage.
 * This makes main menu pages show instantly on revisit, tab switch, and after reload.
 *
 * ── Session Safety ──────────────────────────────────────────────────────────
 * Cache keys are scoped to `userId:orgId:key` so two different users on the
 * same device can NEVER see each other's data, even if the browser tab is
 * reused without a full reload.
 *
 * The AuthProvider calls `cacheClearForSession()` on every SIGNED_OUT event
 * and on SIGNED_IN when the user identity changes, so manual cache-clearing
 * by the user is never required.
 * ────────────────────────────────────────────────────────────────────────────
 */

interface CacheEntry<T> {
    data: T;
    timestamp: number;
    orgId: string;
    userId: string;
}

// Global store - lives for the lifetime of the browser session
const store = new Map<string, CacheEntry<any>>();

// Cache TTL in ms (30 seconds - data refreshes in background after this)
const TTL = 30 * 1000;
const STORAGE_KEY = 'mandi_data_cache_v2'; // bumped to v2 — old v1 keys are user-unscoped
const MAX_PERSIST_AGE = 12 * 60 * 60 * 1000;
let hydrated = false;

// ── Active session tracking ─────────────────────────────────────────────────
// Updated by auth-provider on every SIGNED_IN / SIGNED_OUT event.
let _activeUserId: string | null = null;

/** Called by AuthProvider on SIGNED_IN to bind the current user. */
export function setActiveCacheUser(userId: string | null): void {
    _activeUserId = userId;
}

/** Returns the currently authenticated user ID (or null). */
export function getActiveCacheUser(): string | null {
    return _activeUserId;
}
// ────────────────────────────────────────────────────────────────────────────

function canUseStorage() {
    return typeof window !== 'undefined' && typeof window.localStorage !== 'undefined';
}

function makeKey(key: string, orgId: string, userId: string): string {
    return `${userId}:${orgId}:${key}`;
}

function hydrateStore() {
    if (hydrated || !canUseStorage()) return;
    hydrated = true;

    try {
        const raw = window.localStorage.getItem(STORAGE_KEY);
        if (!raw) return;

        const parsed = JSON.parse(raw) as Array<[string, CacheEntry<unknown>]>;
        if (!Array.isArray(parsed)) {
            window.localStorage.removeItem(STORAGE_KEY);
            return;
        }

        const now = Date.now();
        parsed.forEach(([key, entry]) => {
            if (!key || !entry || typeof entry.timestamp !== 'number' || !entry.orgId) return;
            if (now - entry.timestamp > MAX_PERSIST_AGE) return;
            store.set(key, entry);
        });

        persistStore();
    } catch {
        window.localStorage.removeItem(STORAGE_KEY);
    }
}

function persistStore() {
    if (!canUseStorage()) return;

    try {
        const now = Date.now();
        const serializable = Array.from(store.entries()).filter(([, entry]) => now - entry.timestamp <= MAX_PERSIST_AGE);
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(serializable));
    } catch {
        // Ignore storage quota / serialization issues — memory cache still works.
    }
}

export function cacheGet<T>(key: string, orgId: string): T | null {
    hydrateStore();
    const userId = _activeUserId ?? 'anonymous';
    const entry = store.get(makeKey(key, orgId, userId));
    if (!entry) return null;
    // Extra safety: ensure the stored entry belongs to the current user
    if (entry.userId !== userId || entry.orgId !== orgId) return null;
    // Return even stale data — caller will revalidate in background
    return entry.data as T;
}

export function cacheSet<T>(key: string, orgId: string, data: T): void {
    hydrateStore();
    const userId = _activeUserId ?? 'anonymous';
    store.set(makeKey(key, orgId, userId), { data, timestamp: Date.now(), orgId, userId });
    persistStore();
}

export function cacheIsStale(key: string, orgId: string): boolean {
    hydrateStore();
    const userId = _activeUserId ?? 'anonymous';
    const entry = store.get(makeKey(key, orgId, userId));
    if (!entry) return true;
    return Date.now() - entry.timestamp > TTL;
}

export function cacheDelete(key: string, orgId: string): void {
    hydrateStore();
    const userId = _activeUserId ?? 'anonymous';
    store.delete(makeKey(key, orgId, userId));
    persistStore();
}

export function cacheClear(orgId?: string): void {
    hydrateStore();
    if (orgId) {
        Array.from(store.keys()).forEach(k => {
            // Key format: userId:orgId:dataKey — match on the orgId segment
            const parts = k.split(':');
            if (parts.length >= 2 && parts[1] === orgId) store.delete(k);
        });
    } else {
        store.clear();
    }
    persistStore();
}

/**
 * Clear all cache entries for a specific org that start with a given dataKey prefix.
 */
export function cacheClearPrefix(prefix: string, orgId: string): void {
    hydrateStore();
    const userId = _activeUserId ?? 'anonymous';
    const _orgId = orgId || '';
    Array.from(store.keys()).forEach(k => {
        const parts = k.split(':');
        if (parts.length >= 3 && parts[1] === _orgId && parts[0] === userId && parts[2].startsWith(prefix)) {
            store.delete(k);
        }
    });
    persistStore();
}

/**
 * Flush all entries NOT belonging to the given userId.
 * Called on SIGNED_IN when the user identity changes (device switching / shared device).
 */
export function cacheFlushExcept(userId: string): void {
    hydrateStore();
    Array.from(store.keys()).forEach(k => {
        const parts = k.split(':');
        // Key format: userId:orgId:dataKey
        if (parts[0] !== userId) store.delete(k);
    });
    persistStore();
}

/**
 * Full session wipe: clear everything and purge localStorage.
 * Called by AuthProvider on SIGNED_OUT to guarantee zero stale data.
 */
export function cacheClearForSession(): void {
    store.clear();
    if (canUseStorage()) {
        window.localStorage.removeItem(STORAGE_KEY);
    }
    hydrated = false; // Allow fresh hydration on next login
}
