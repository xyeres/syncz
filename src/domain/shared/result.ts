import type { PartyId } from './ids'

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
  /** Names parties by id; the application layer substitutes display names (§0 Reason messages). */
  readonly message: string
  /** The party this reason is about, when there is one. Absent (no key) otherwise. */
  readonly partyId?: PartyId
}

export type Result<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly reasons: readonly Reason[] }

export const ok = <T>(value: T): Result<T> => ({ ok: true, value })

/** A reason, with a `partyId` key only when a party is given. */
const reasonOf = (code: ReasonCode, message: string, partyId?: PartyId): Reason =>
  partyId === undefined ? { code, message } : { code, message, partyId }

export const fail = (code: ReasonCode, message: string, partyId?: PartyId): Result<never> => ({
  ok: false,
  reasons: [reasonOf(code, message, partyId)],
})

export const failAll = (reasons: readonly Reason[]): Result<never> => ({ ok: false, reasons })

/** Gathers every reason from the given checks, in order. Empty when all are ok. */
export const collect = (...checks: readonly Result<unknown>[]): readonly Reason[] =>
  checks.flatMap((c) => (c.ok ? [] : c.reasons))

/** Success with no value: what policies and single-rule checks return when they pass. */
export const OK: Result<void> = ok(undefined)

/** A single-rule check: fails with `code`/`message` when `failed` is true, otherwise OK. */
export const failIf = (failed: boolean, code: ReasonCode, message: string, partyId?: PartyId): Result<void> =>
  failed ? fail(code, message, partyId) : OK

/** The values of the successful results, in order. */
export const valuesOf = <T>(results: readonly Result<T>[]): T[] =>
  results.flatMap((r) => (r.ok ? [r.value] : []))
