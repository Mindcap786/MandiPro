/**
 * Environment configuration — single source of truth for all external URLs and keys.
 * In production, inject via EAS secrets or expo-constants.
 */

export const ENV = {
  SUPABASE_URL: 'https://ldayxjabzyorpugwszpt.supabase.co',
  SUPABASE_ANON_KEY:
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxkYXl4amFienlvcnB1Z3dzenB0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njk1MTMyNzgsImV4cCI6MjA4NTA4OTI3OH0.qdRruQQ7WxVfEUtWHbWy20CFgx66LBgwftvFh9ZDVIk',

  /** Base URL of the Next.js backend (for custom API routes, NOT Supabase direct) */
  API_BASE_URL: __DEV__
    ? 'http://localhost:3000'
    : 'https://mandipro.app',

  /** Token refresh buffer — refresh 60s before actual JWT expiry */
  TOKEN_REFRESH_BUFFER_MS: 60_000,

  /** Maximum retries for failed API calls before giving up */
  MAX_API_RETRIES: 3,

  /** Stale-while-revalidate cache TTL (ms) */
  CACHE_TTL_MS: 30_000,
} as const;
