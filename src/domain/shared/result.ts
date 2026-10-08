export type InvariantCode =
  | 'ACC-1' | 'ACC-2'
  | 'SPL-1' | 'SPL-2' | 'SPL-3' | 'SPL-4' | 'SPL-5' | 'SPL-6' | 'SPL-7' | 'SPL-8' | 'SPL-9' | 'SPL-10' | 'SPL-11'
  | 'COL-1' | 'COL-2' | 'COL-3' | 'COL-4' | 'COL-5' | 'COL-6' | 'COL-7'
  | 'REP-1' | 'REP-2' | 'REP-3' | 'REP-4' | 'REP-5' | 'REP-6' | 'REP-7' | 'REP-8' | 'REP-9' | 'REP-10' | 'REP-11'
  | 'PAY-1' | 'PAY-2' | 'PAY-3' | 'PAY-4' | 'PAY-5' | 'PAY-6' | 'PAY-7' | 'PAY-8' | 'PAY-9'
  | 'STM-3'

export type ReasonCode = InvariantCode | 'NOT_FOUND' | 'INVALID_INPUT'

export interface Reason {
  readonly code: ReasonCode
  readonly message: string
}

export type Result<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly reasons: readonly Reason[] }

export const ok = <T>(value: T): Result<T> => ({ ok: true, value })

export const fail = (code: ReasonCode, message: string): Result<never> => ({
  ok: false,
  reasons: [{ code, message }],
})

export const failAll = (reasons: readonly Reason[]): Result<never> => ({ ok: false, reasons })

/** Gathers every reason from the given checks, in order. Empty when all are ok. */
export const collect = (...checks: readonly Result<unknown>[]): readonly Reason[] =>
  checks.flatMap((c) => (c.ok ? [] : c.reasons))
