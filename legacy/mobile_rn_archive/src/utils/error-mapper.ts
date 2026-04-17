/**
 * Error Mapper Utility
 * Turns low-level Postgres/Supabase errors into user-friendly business instructions.
 */

export interface AppError {
  message: string;
  code?: string;
  severity: 'error' | 'warning';
}

export function mapDatabaseError(error: any): AppError {
  if (!error) return { message: 'An unknown error occurred', severity: 'error' };

  const message = error.message || String(error);
  const code = error.code || '';

  // 1. Transaction Errors (from RPC)
  if (message.includes('Insufficient stock')) {
    return {
      message: 'Insufficient stock available for one or more items.',
      severity: 'error',
    };
  }

  if (message.includes('idempotency_key')) {
    return {
      message: 'This transaction was already processed. Please refresh.',
      severity: 'warning',
    };
  }

  // 2. Postgres Constraints
  switch (code) {
    case '23505': // Unique violation
      return { message: 'A record with this ID already exists.', severity: 'error' };
    case '42P01': // Undefined table
      return { message: 'System error: Database table not found.', severity: 'error' };
    case 'PGRST116': // JSON object expected
      return { message: 'Record not found.', severity: 'error' };
    case '42501': // RLS violation
      return { message: 'Permission denied. Please check your access level.', severity: 'error' };
    default:
      return { message, code, severity: 'error' };
  }
}
