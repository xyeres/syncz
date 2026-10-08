/**
 * Step 3 (payments + projections) builders. Kept apart from ./test-fixtures so the Step 2
 * suites never depend on payment-ledger.ts. Imports only shared/, channel/ and reporting/.
 */
import { OWNER_ID, type CollaboratorId } from '../shared/ids'
import type { Cents } from '../shared/numbers'
import type { MonthlyReport } from './monthly-report'
import { PaymentLedger } from './payment-ledger'
import type { PartySnapshot, SplitSnapshot } from './snapshots'
import {
  ALEX,
  aSplitSnapshot,
  defaultParties,
  expectOk,
  meta,
  reportId,
  sharesOf,
} from './test-fixtures'

export * from './test-fixtures'

/** The id `aReport()` uses. */
export const REPORT_ID = reportId('rep-2026-09')

/** An empty ledger for one collaborator in the default report. */
export const aLedger = (collaboratorId: CollaboratorId = ALEX, rid = REPORT_ID): PaymentLedger =>
  PaymentLedger.open(rid, collaboratorId)

/** A ledger with one `markPaid(due)` payment at meta(n). */
export const paidLedger = (due: number, n = 50, collaboratorId: CollaboratorId = ALEX): PaymentLedger =>
  expectOk(aLedger(collaboratorId).markPaid(due as Cents, meta(n)))

/** Paid in full at `paid`, then the due dropped to `due` and the overpayment was settled. */
export const settledLedger = (paid: number, due: number): PaymentLedger =>
  expectOk(paidLedger(paid).recordSettlement(due as Cents, paid - due, meta(51)))

// Default report (aReport): v1 1001¢ + v2 2999¢ in "Intro series", v3 101¢ unsplit; gross 4101¢.
/** Owner 7000 / Alex 3000 (the default): Alex 1199¢, owner 2902¢. */
export const ALEX_DUE_R1 = 1199
/** Owner 6000 / Alex 4000: Alex 1599¢, owner 2502¢. */
export const alexUp = (): SplitSnapshot[] => [aSplitSnapshot({ shares: sharesOf([OWNER_ID, 6000], [ALEX, 4000]) })]
/** Owner 8000 / Alex 2000: Alex 799¢, owner 3302¢. */
export const alexDown = (): SplitSnapshot[] => [aSplitSnapshot({ shares: sharesOf([OWNER_ID, 8000], [ALEX, 2000]) })]
/** Alex removed from every split: Alex 0¢ (no line). */
export const alexDropped = (): SplitSnapshot[] => [aSplitSnapshot({ shares: sharesOf([OWNER_ID, 10000]) })]

export const recalc = (
  report: MonthlyReport,
  splits: readonly SplitSnapshot[],
  n: number,
  parties: readonly PartySnapshot[] = defaultParties(),
): MonthlyReport => expectOk(report.recalculate(splits, parties, meta(n)))
