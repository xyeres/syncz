import type { Brand } from './ids'

/** Integer USD cents; may be negative only in LedgerEntry. */
export type Cents = Brand<number, 'Cents'>
/** Integer hundredths of a percent; 10000 = 100.00%. */
export type Bps = Brand<number, 'Bps'>

/** 100.00% in bps. */
export const FULL = 10000 as Bps
/** Smallest allowed non-zero share: 0.10% (SPL-3). */
export const MIN_SHARE = 10 as Bps

export type IsoDateTime = Brand<string, 'IsoDateTime'>
/** "YYYY-MM-DD" */
export type IsoDate = Brand<string, 'IsoDate'>
