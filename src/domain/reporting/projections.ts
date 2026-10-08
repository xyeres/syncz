import { OWNER_ID, isOwner, type CollaboratorId, type EntryId, type PartyId, type ReportId } from '../shared/ids'
import type { Cents, IsoDateTime } from '../shared/numbers'
import type { Period } from '../shared/period'
import type { MonthlyReport, Revision } from './monthly-report'
import type { LedgerEntry, OpenEntry, PaymentLedger } from './payment-ledger'
import type { ActivityEntry, PartySnapshot, VideoAmount } from './snapshots'

// ── statements (STM-1, STM-2) ───────────────────────────────────────────────

/** One revision of a report, for one collaborator (STM-1). */
export type Statement = Readonly<{
  reportId: ReportId
  period: Period
  revision: number
  issuedAt: IsoDateTime
  party: PartySnapshot
  videos: readonly VideoAmount[]
  totalCents: Cents
}>

type StatementBody = Pick<Statement, 'party' | 'videos' | 'totalCents'>

/** The collaborator's line in the revision, or a $0 body with their details as of that revision (REP-8). */
function statementBody(revision: Revision, collaboratorId: CollaboratorId, lastKnown: PartySnapshot): StatementBody {
  const line = revision.lines.find((l) => l.party.partyId === collaboratorId)
  if (!line) return { party: lastKnown, videos: [], totalCents: 0 as Cents }
  return { party: line.party, videos: line.videos, totalCents: line.dueCents }
}

/** STM-1: null for an unknown revision, or a collaborator not listed on any revision up to it. */
export function buildStatement(report: MonthlyReport, collaboratorId: CollaboratorId, revisionNo: number): Statement | null {
  const revision = report.revision(revisionNo)
  const lastKnown = report.latestPartySnapshot(collaboratorId, revisionNo)
  if (!revision || !lastKnown) return null
  return {
    reportId: report.id,
    period: report.period,
    revision: revision.number,
    issuedAt: revision.createdAt,
    ...statementBody(revision, collaboratorId, lastKnown),
  }
}

/**
 * STM-2: the collaborator's current due differs from the revision last sent to them
 * (Revision 1 when nothing was sent). A missing line counts as 0; amounts only.
 */
export const needsResend = (report: MonthlyReport, collaboratorId: CollaboratorId): boolean =>
  report.dueFor(collaboratorId, report.sent[collaboratorId] ?? 1) !== report.dueFor(collaboratorId)

// ── ledger status (PAY-7, PAY-9) ────────────────────────────────────────────

export type LedgerStatusKind = 'none' | 'unpaid' | 'partial' | 'paid' | 'overpaid' | 'settled'

export type LedgerStatus = Readonly<{
  status: LedgerStatusKind
  dueCents: Cents
  paidCents: Cents
  balanceCents: Cents
  /** An un-reversed settlement stands. */
  settled: boolean
  /** The entry "Undo" would reverse. */
  lastOpen: OpenEntry | null
}>

type StatusFacts = Readonly<{ due: number; paid: number; balance: number; settled: boolean }>

/** The first matching rule wins; the last always matches. */
const STATUS_RULES: readonly (readonly [LedgerStatusKind, (f: StatusFacts) => boolean])[] = [
  ['settled', (f) => f.balance === 0 && f.settled],
  ['none', (f) => f.paid === 0 && f.due === 0],
  ['unpaid', (f) => f.paid === 0],
  ['paid', (f) => f.balance === 0],
  ['partial', (f) => f.balance > 0],
  ['overpaid', () => true],
]

const statusOf = (facts: StatusFacts): LedgerStatusKind =>
  STATUS_RULES.find(([, applies]) => applies(facts))?.[0] ?? 'overpaid'

/** Due, paid, balance and status for one collaborator in one report. */
export function ledgerStatus(dueCents: Cents, ledger: PaymentLedger | null): LedgerStatus {
  const open = ledger?.openEntries() ?? []
  const paidCents = ledger?.netPaidCents() ?? (0 as Cents)
  const balanceCents = (dueCents - paidCents) as Cents
  const settled = open.some((e) => e.kind === 'settlement')
  return {
    status: statusOf({ due: dueCents, paid: paidCents, balance: balanceCents, settled }),
    dueCents,
    paidCents,
    balanceCents,
    settled,
    lastOpen: open.at(-1) ?? null,
  }
}

// ── report totals ───────────────────────────────────────────────────────────

export type ReportTotals = Readonly<{
  dueCents: Cents
  paidCents: Cents
  /** Σ positive balances. */
  outstandingCents: Cents
  /** Σ overpaid amounts (never netted against what others are owed). */
  overpaidCents: Cents
  /** The owner's current due. */
  retainedCents: Cents
}>

const ledgersOf = (report: MonthlyReport, ledgers: readonly PaymentLedger[]) =>
  ledgers.filter((l) => l.reportId === report.id)

const ledgerFor = (ledgers: readonly PaymentLedger[], collaboratorId: CollaboratorId) =>
  ledgers.find((l) => l.collaboratorId === collaboratorId) ?? null

/** Non-owners listed on any revision, plus anyone with a ledger for this report. */
export function payeesOf(report: MonthlyReport, ledgers: readonly PaymentLedger[]): CollaboratorId[] {
  const listed = report.revisions.flatMap((r) => r.lines.map((l) => l.party.partyId))
  const ids = new Set<PartyId>([...listed, ...ledgers.map((l) => l.collaboratorId)])
  return [...ids].filter((id): id is CollaboratorId => !isOwner(id))
}

const sum = (values: readonly number[]) => values.reduce((total, v) => total + v, 0) as Cents

/** Report-wide money totals, from each payee's current due and ledger. */
export function reportTotals(report: MonthlyReport, ledgers: readonly PaymentLedger[]): ReportTotals {
  const own = ledgersOf(report, ledgers)
  const rows = payeesOf(report, own).map((id) => ledgerStatus(report.dueFor(id), ledgerFor(own, id)))
  return {
    dueCents: sum(rows.map((r) => r.dueCents)),
    paidCents: sum(rows.map((r) => r.paidCents)),
    outstandingCents: sum(rows.map((r) => Math.max(r.balanceCents, 0))),
    overpaidCents: sum(rows.map((r) => Math.max(-r.balanceCents, 0))),
    retainedCents: report.dueFor(OWNER_ID),
  }
}

// ── activity feed (REP-9) ───────────────────────────────────────────────────

export type ActivityRow =
  | Readonly<{ source: 'report'; id: EntryId; at: IsoDateTime; entry: ActivityEntry }>
  | Readonly<{
      source: 'ledger'
      id: EntryId
      at: IsoDateTime
      collaboratorId: CollaboratorId
      name: string
      entry: LedgerEntry
    }>

const reportRow = (entry: ActivityEntry): ActivityRow => ({ source: 'report', id: entry.id, at: entry.at, entry })

function ledgerRows(report: MonthlyReport, ledger: PaymentLedger): ActivityRow[] {
  const { collaboratorId } = ledger
  const name = report.latestPartySnapshot(collaboratorId)?.name ?? collaboratorId
  return ledger.entries.map((entry) => ({ source: 'ledger', id: entry.id, at: entry.at, collaboratorId, name, entry }))
}

const byAt = (a: ActivityRow, b: ActivityRow): number => (a.at === b.at ? 0 : a.at < b.at ? -1 : 1)

/**
 * The report's activity merged with its ledgers' entries, oldest first. For equal `at`,
 * report rows come before ledger rows, then input order (the sort is stable).
 */
export function reportActivity(report: MonthlyReport, ledgers: readonly PaymentLedger[]): readonly ActivityRow[] {
  const rows = [
    ...report.activity.map(reportRow),
    ...ledgersOf(report, ledgers).flatMap((ledger) => ledgerRows(report, ledger)),
  ]
  return rows.sort(byAt)
}
