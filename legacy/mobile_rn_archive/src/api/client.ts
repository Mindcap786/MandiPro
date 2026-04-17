/**
 * API Client — MandiPro Mobile
 * ─────────────────────────────
 * High-performance HTTP client with:
 *   - Automatic JWT injection on every request
 *   - Silent token refresh on 401 (via Supabase SDK)
 *   - Exponential backoff + retry (network errors & 5xx)
 *   - Request/response logging in __DEV__
 *   - Typed error propagation — zero silent failures
 */

import { ENV } from '@/config/env';
import { supabase, getAuthToken } from './supabase';

// ─── Types ───────────────────────────────────────────────────

export interface ApiResponse<T = unknown> {
  ok: boolean;
  data: T | null;
  status: number;
  error: string | null;
}

interface RequestConfig extends RequestInit {
  /** Skip auth header (for public endpoints) */
  noAuth?: boolean;
  /** Override base URL */
  baseUrl?: string;
  /** Max retries (default 3) */
  maxRetries?: number;
}

// ─── Exponential Backoff ─────────────────────────────────────

function backoffDelay(attempt: number): number {
  // 200ms, 400ms, 800ms, 1600ms cap
  return Math.min(200 * Math.pow(2, attempt), 1600);
}

function isRetryable(status: number): boolean {
  return status === 0 || status >= 500;
}

// ─── Token Refresh Lock ──────────────────────────────────────

let refreshPromise: Promise<string | null> | null = null;

async function refreshAccessToken(): Promise<string | null> {
  // Coalesce concurrent refresh attempts
  if (refreshPromise) return refreshPromise;

  refreshPromise = (async () => {
    try {
      const { data, error } = await supabase.auth.refreshSession();
      if (error || !data.session) {
        console.warn('[API] Token refresh failed:', error?.message);
        return null;
      }
      return data.session.access_token;
    } finally {
      refreshPromise = null;
    }
  })();

  return refreshPromise;
}

// ─── Core Fetch Wrapper ──────────────────────────────────────

async function apiFetch<T = unknown>(
  path: string,
  config: RequestConfig = {}
): Promise<ApiResponse<T>> {
  const {
    noAuth = false,
    baseUrl = ENV.API_BASE_URL,
    maxRetries = ENV.MAX_API_RETRIES,
    headers: customHeaders,
    ...fetchOptions
  } = config;

  const url = path.startsWith('http') ? path : `${baseUrl}${path}`;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      // Inject auth token
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        ...(customHeaders as Record<string, string>),
      };

      if (!noAuth) {
        const token = await getAuthToken();
        if (token) {
          headers['Authorization'] = `Bearer ${token}`;
        }
      }

      if (__DEV__) {
        console.log(`[API] ${fetchOptions.method || 'GET'} ${path} (attempt ${attempt + 1})`);
      }

      const res = await fetch(url, { ...fetchOptions, headers });

      // 401 → Try silent token refresh, then retry ONCE
      if (res.status === 401 && attempt === 0 && !noAuth) {
        const newToken = await refreshAccessToken();
        if (newToken) {
          // Retry with fresh token (counts as attempt 1)
          continue;
        }
        // Refresh failed → bubble up as auth error
        return {
          ok: false,
          data: null,
          status: 401,
          error: 'Session expired. Please sign in again.',
        };
      }

      // 403 → Permission denied, don't retry
      if (res.status === 403) {
        return {
          ok: false,
          data: null,
          status: 403,
          error: 'You do not have permission for this action.',
        };
      }

      // 5xx → Retry with backoff
      if (isRetryable(res.status) && attempt < maxRetries) {
        await new Promise((r) => setTimeout(r, backoffDelay(attempt)));
        continue;
      }

      // Parse response
      let body: T | null = null;
      try {
        body = (await res.json()) as T;
      } catch {
        // Non-JSON response (e.g. 204 No Content)
      }

      if (!res.ok) {
        const errMsg =
          (body as any)?.error ||
          (body as any)?.message ||
          `Request failed with status ${res.status}`;
        return { ok: false, data: body, status: res.status, error: errMsg };
      }

      return { ok: true, data: body, status: res.status, error: null };
    } catch (networkError: any) {
      // Network failure (offline, DNS, timeout)
      if (attempt < maxRetries) {
        if (__DEV__) {
          console.warn(`[API] Network error on attempt ${attempt + 1}, retrying...`, networkError.message);
        }
        await new Promise((r) => setTimeout(r, backoffDelay(attempt)));
        continue;
      }

      return {
        ok: false,
        data: null,
        status: 0,
        error: 'Network error. Please check your connection and try again.',
      };
    }
  }

  // Should never reach here, but TypeScript demands it
  return { ok: false, data: null, status: 0, error: 'Max retries exceeded.' };
}

// ─── Public API ──────────────────────────────────────────────

export const api = {
  get: <T = unknown>(path: string, config?: RequestConfig) =>
    apiFetch<T>(path, { ...config, method: 'GET' }),

  post: <T = unknown>(path: string, body?: unknown, config?: RequestConfig) =>
    apiFetch<T>(path, {
      ...config,
      method: 'POST',
      body: body ? JSON.stringify(body) : undefined,
    }),

  put: <T = unknown>(path: string, body?: unknown, config?: RequestConfig) =>
    apiFetch<T>(path, {
      ...config,
      method: 'PUT',
      body: body ? JSON.stringify(body) : undefined,
    }),

  patch: <T = unknown>(path: string, body?: unknown, config?: RequestConfig) =>
    apiFetch<T>(path, {
      ...config,
      method: 'PATCH',
      body: body ? JSON.stringify(body) : undefined,
    }),

  delete: <T = unknown>(path: string, config?: RequestConfig) =>
    apiFetch<T>(path, { ...config, method: 'DELETE' }),
};
