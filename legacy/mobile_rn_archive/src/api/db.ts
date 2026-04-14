/**
 * Database Query Layer
 * --------------------
 * Thin wrappers around Supabase PostgREST for typed, schema-qualified queries.
 * All queries go through the user's JWT → RLS enforces multi-tenant isolation.
 */

import { supabase } from './supabase';

/** Schema-qualified query builders */
export const core = () => supabase.schema('core');
export const mandi = () => supabase.schema('mandi');
/** Public schema (for tables web calls with bare supabase.from()) */
export const pub = () => supabase;

/**
 * Generic fetch helper with error handling — no silent failures.
 */
export async function query<T>(
  queryFn: () => PromiseLike<{ data: T | null; error: any }>
): Promise<T> {
  const { data, error } = await queryFn();
  if (error) {
    console.error('[DB Query]', error.message);
    throw new Error(error.message || 'Database query failed');
  }
  if (data === null) {
    throw new Error('No data returned from query');
  }
  return data;
}

/**
 * Safe version — returns null instead of throwing on not-found.
 */
export async function queryOrNull<T>(
  queryFn: () => PromiseLike<{ data: T | null; error: any }>
): Promise<T | null> {
  const { data, error } = await queryFn();
  if (error) {
    console.error('[DB Query]', error.message);
    throw new Error(error.message || 'Database query failed');
  }
  return data;
}
