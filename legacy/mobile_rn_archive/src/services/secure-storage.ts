/**
 * Secure Storage Service
 * ---------------------
 * Handles encrypted persistence of authentication tokens and sensitive data.
 *
 * iOS  : Uses Keychain Services (AES-256 encrypted, hardware-backed on Secure Enclave devices)
 * Android: Uses EncryptedSharedPreferences (AES-256-GCM, backed by Android Keystore)
 *
 * Non-sensitive data (cached profiles, settings) uses MMKV for speed.
 */

import * as SecureStore from 'expo-secure-store';
import AsyncStorage from '@react-native-async-storage/async-storage';

// ─── Keys ────────────────────────────────────────────────────
const KEYS = {
  ACCESS_TOKEN: 'mp_access_token',
  REFRESH_TOKEN: 'mp_refresh_token',
  TOKEN_EXPIRY: 'mp_token_expiry',
  SESSION_JSON: 'mp_session',
  USER_ID: 'mp_user_id',
} as const;

// ─── In-memory cache for synchronous access ──────────────────
// Since AsyncStorage is async, we keep a memory copy for "instant" reads.
const memoryCache: Record<string, string> = {};

// Initialize memory cache from AsyncStorage (call once on boot)
export async function hydrateCache(): Promise<void> {
  try {
    const keys = await AsyncStorage.getAllKeys();
    const pairs = await AsyncStorage.multiGet(keys);
    pairs.forEach(([key, value]: [string, string | null]) => {
      if (value) memoryCache[key] = value;
    });
  } catch (e: any) {
    console.error('[Storage] Hydration failed:', e);
  }
}

// ─── Secure Token Operations ─────────────────────────────────

export async function saveTokens(params: {
  accessToken: string;
  refreshToken: string;
  expiresAt: number; // Unix timestamp in seconds
}): Promise<void> {
  await Promise.all([
    SecureStore.setItemAsync(KEYS.ACCESS_TOKEN, params.accessToken),
    SecureStore.setItemAsync(KEYS.REFRESH_TOKEN, params.refreshToken),
    SecureStore.setItemAsync(KEYS.TOKEN_EXPIRY, String(params.expiresAt)),
  ]);
}

export async function getAccessToken(): Promise<string | null> {
  return SecureStore.getItemAsync(KEYS.ACCESS_TOKEN);
}

export async function getRefreshToken(): Promise<string | null> {
  return SecureStore.getItemAsync(KEYS.REFRESH_TOKEN);
}

export async function getTokenExpiry(): Promise<number> {
  const raw = await SecureStore.getItemAsync(KEYS.TOKEN_EXPIRY);
  return raw ? parseInt(raw, 10) : 0;
}

export async function isTokenExpired(bufferMs = 60_000): Promise<boolean> {
  const expiry = await getTokenExpiry();
  if (!expiry) return true;
  return Date.now() >= expiry * 1000 - bufferMs;
}

export async function saveSession(sessionJson: string): Promise<void> {
  await SecureStore.setItemAsync(KEYS.SESSION_JSON, sessionJson);
}

export async function getSession(): Promise<string | null> {
  return SecureStore.getItemAsync(KEYS.SESSION_JSON);
}

export async function saveUserId(userId: string): Promise<void> {
  await SecureStore.setItemAsync(KEYS.USER_ID, userId);
}

export async function getUserId(): Promise<string | null> {
  return SecureStore.getItemAsync(KEYS.USER_ID);
}

/**
 * Wipe all secure tokens — called on logout or session invalidation.
 */
export async function clearAllSecureData(): Promise<void> {
  await Promise.all(
    Object.values(KEYS).map((key) => SecureStore.deleteItemAsync(key))
  );
}

// ─── AsyncStorage Cache Helpers (non-sensitive, handles sync fallback) ───

export function cacheSet(key: string, value: unknown): void {
  const str = JSON.stringify(value);
  memoryCache[key] = str;
  // Fire and forget persistence
  AsyncStorage.setItem(key, str).catch((e: any) =>
    console.error('[Storage] Save failed:', e)
  );
}

export function cacheGet<T = unknown>(key: string): T | null {
  const raw = memoryCache[key];
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export function cacheClear(): void {
  Object.keys(memoryCache).forEach((k) => delete memoryCache[k]);
  AsyncStorage.clear().catch((e: any) => console.error('[Storage] Clear failed:', e));
}

export function cacheDelete(key: string): void {
  delete memoryCache[key];
  AsyncStorage.removeItem(key).catch((e: any) =>
    console.error('[Storage] Delete failed:', e)
  );
}
