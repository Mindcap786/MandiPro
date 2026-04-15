/**
 * packages/domain/src/validation-helper.ts
 *
 * Type-safe validation result helper.
 * Avoids the discriminated union narrowing issue in TS.
 */

export type ValidationResult<T> =
  | { ok: true; data: T }
  | { ok: false; issues: string[] }

/** Narrow the result and extract data safely */
export function getValidData<T>(result: ValidationResult<T>): T {
  if (!result.ok) throw new Error('Validation failed — call ok check first')
  return result.data
}
