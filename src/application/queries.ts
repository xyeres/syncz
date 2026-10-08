/**
 * Read models for the screens, built from domain projections. Plain async functions over the
 * ports; they never change state. Refined in Step 5 when the UI is ported.
 */
import type { Account } from '../domain/channel/account'
import { OWNER_ID, type CollaboratorId, type PartyId, type SplitId } from '../domain/shared/ids'
import type { Cents } from '../domain/shared/numbers'
import { Period } from '../domain/shared/period'
import type { Reason } from '../domain/shared/result'
import type { MonthlyReport } from '../domain/reporting/monthly-report'
import type { PaymentLedger } from '../domain/reporting/payment-ledger'
import {
  buildStatement,
  ledgerStatus,
  needsResend,
  payeesOf,
  reportActivity,
  reportTotals,
  type ActivityRow,
  type LedgerStatus,
  type ReportTotals,
  type Statement,
} from '../domain/reporting/projections'
import type { Collaborator } from '../domain/revenue-sharing/collaborator'
import type { Split } from '../domain/revenue-sharing/split'
import type { Ports } from './ports'
import { nameLookup, OWNER_DISPLAY_NAME, presentReasons, type PresentedReason } from './present'
import { roleLabel } from './translate'

// ── loading ─────────────────────────────────────────────────────────────────

type ReportWithLedgers = Readonly<{ report: MonthlyReport; ledgers: readonly PaymentLedger[] }>

type ChannelState = Readonly<{
  account: Account
  splits: readonly Split[]
  collaborators: readonly Collaborator[]
  /** Newest period first. */
  reports: readonly ReportWithLedgers[]
}>

async function withLedgers(ports: Ports, report: MonthlyReport): Promise<ReportWithLedgers> {
  return { report, ledgers: await ports.repos.ledgers.listByReport(report.id) }
}

const byPeriodDesc = (a: ReportWithLedgers, b: ReportWithLedgers) => b.report.period.localeCompare(a.report.period)

/** Everything the screens read for the linked channel; null before sign-in. */
async function loadChannelState(ports: Ports): Promise<ChannelState | null> {
  const account = await ports.repos.account.get()
  if (!account || account.channelId === null) return null
  const [splits, collaborators, reports] = await Promise.all([
    ports.repos.splits.listByChannel(account.channelId),
    ports.repos.collaborators.listByChannel(account.channelId),
    ports.repos.reports.listByChannel(account.channelId),
  ])
  const withAll = await Promise.all(reports.map((r) => withLedgers(ports, r)))
  return { account, splits, collaborators, reports: withAll.sort(byPeriodDesc) }
}

const nameOfParty = (state: ChannelState) => {
  const lookup = nameLookup(state.collaborators)
  return (id: PartyId): string => (id === OWNER_ID ? OWNER_DISPLAY_NAME : lookup(id))
}

// ── balances per collaborator per report ────────────────────────────────────

export type PayeeRow = Readonly<{
  collaboratorId: CollaboratorId
  name: string
  ledger: LedgerStatus
  needsResend: boolean
}>

const ledgerOf = (ledgers: readonly PaymentLedger[], id: CollaboratorId) =>
  ledgers.find((l) => l.collaboratorId === id) ?? null

/** One row per payee: listed on any revision or holding a ledger for the report. */
function payeeRows({ report, ledgers }: ReportWithLedgers): PayeeRow[] {
  return payeesOf(report, ledgers).map((id) => ({
    collaboratorId: id,
    name: report.latestPartySnapshot(id)?.name ?? id,
    ledger: ledgerStatus(report.dueFor(id), ledgerOf(ledgers, id)),
    needsResend: needsResend(report, id),
  }))
}

/** A collaborator's total balance across reports; `periods` oldest first. */
export type PartyBalance = Readonly<{ collaboratorId: CollaboratorId; name: string; cents: Cents; periods: Period[] }>

type DatedRow = Readonly<{ row: PayeeRow; period: Period }>

/** Adds one report's |balance| to the collaborator's running total. */
function addBalance(totals: Map<CollaboratorId, PartyBalance>, { row, period }: DatedRow) {
  const prev = totals.get(row.collaboratorId) ?? { collaboratorId: row.collaboratorId, name: row.name, cents: 0, periods: [] }
  const cents = prev.cents + Math.abs(row.ledger.balanceCents)
  totals.set(row.collaboratorId, { ...prev, cents: cents as Cents, periods: [period, ...prev.periods] })
  return totals
}

/** Per-collaborator totals, largest first. */
const totalsOf = (rows: readonly DatedRow[]): PartyBalance[] =>
  [...rows.reduce(addBalance, new Map<CollaboratorId, PartyBalance>()).values()].sort((a, b) => b.cents - a.cents)

/** Positive balances are owed, negative ones overpaid; never netted (PAY-7). Reports are newest first. */
function balancesAcross(reports: readonly ReportWithLedgers[]) {
  const rows = reports.flatMap((r) => payeeRows(r).map((row) => ({ row, period: r.report.period })))
  return {
    owed: totalsOf(rows.filter((r) => r.row.ledger.balanceCents > 0)),
    overpaid: totalsOf(rows.filter((r) => r.row.ledger.balanceCents < 0)),
  }
}

const sumCents = (items: readonly Readonly<{ cents: Cents }>[]) => items.reduce((s, i) => s + i.cents, 0) as Cents

// ── screens ─────────────────────────────────────────────────────────────────

export type Dashboard = Readonly<{
  ownerName: string
  latestReportablePeriod: Period
  /** "Generate <month> report" when false, "View" when true. */
  latestReportGenerated: boolean
  outstandingCents: Cents
  owed: readonly PartyBalance[]
  overpaidCents: Cents
  overpaid: readonly PartyBalance[]
}>

async function dashboard(ports: Ports): Promise<Dashboard | null> {
  const state = await loadChannelState(ports)
  if (!state) return null
  const latest = Period.latestReportable(ports.clock.today())
  const { owed, overpaid } = balancesAcross(state.reports)
  return {
    ownerName: state.account.ownerName,
    latestReportablePeriod: latest,
    latestReportGenerated: state.reports.some((r) => r.report.period === latest),
    outstandingCents: sumCents(owed),
    owed,
    overpaidCents: sumCents(overpaid),
    overpaid,
  }
}

export type SplitListItem = Readonly<{
  id: SplitId
  name: string
  videoCount: number
  shares: readonly Readonly<{ partyId: PartyId; name: string; bps: number }>[]
}>

async function splitsList(ports: Ports): Promise<readonly SplitListItem[]> {
  const state = await loadChannelState(ports)
  if (!state) return []
  const nameOf = nameOfParty(state)
  return state.splits.map((s) => ({
    id: s.id,
    name: s.name,
    videoCount: s.videoIds.length,
    shares: s.shares.map((x) => ({ partyId: x.partyId, name: nameOf(x.partyId), bps: x.bps })),
  }))
}

export type CollaboratorListItem = Readonly<{
  id: CollaboratorId
  name: string
  email: string
  role: string
  deleted: boolean
  splits: readonly Readonly<{ id: SplitId; name: string }>[]
  paidToDateCents: Cents
}>

const paidToDate = (reports: readonly ReportWithLedgers[], id: CollaboratorId) =>
  reports.flatMap((r) => r.ledgers.filter((l) => l.collaboratorId === id)).reduce((s, l) => s + l.netPaidCents(), 0) as Cents

/** Active and deleted collaborators, with their splits and net paid to date. */
async function collaboratorsList(ports: Ports): Promise<readonly CollaboratorListItem[]> {
  const state = await loadChannelState(ports)
  if (!state) return []
  return state.collaborators.map((c) => ({
    id: c.id,
    name: c.name,
    email: c.email.value,
    role: roleLabel(c.role),
    deleted: c.isDeleted(),
    splits: state.splits.filter((s) => s.hasParty(c.id)).map((s) => ({ id: s.id, name: s.name })),
    paidToDateCents: paidToDate(state.reports, c.id),
  }))
}

export type ReportTags = Readonly<{ settled: boolean; dueCents: Cents; overpaidCents: Cents; needsResend: number }>

export type ReportListItem = Readonly<{
  id: MonthlyReport['id']
  period: Period
  revision: number
  grossCents: Cents
  totals: ReportTotals
  tags: ReportTags
}>

function reportListItem(r: ReportWithLedgers): ReportListItem {
  const totals = reportTotals(r.report, r.ledgers)
  const current = r.report.currentRevision()
  return {
    id: r.report.id,
    period: r.report.period,
    revision: current.number,
    grossCents: current.grossCents,
    totals,
    tags: {
      settled: totals.outstandingCents === 0 && totals.overpaidCents === 0,
      dueCents: totals.outstandingCents,
      overpaidCents: totals.overpaidCents,
      needsResend: payeeRows(r).filter((row) => row.needsResend).length,
    },
  }
}

async function reportsList(ports: Ports): Promise<readonly ReportListItem[]> {
  const state = await loadChannelState(ports)
  return (state?.reports ?? []).map(reportListItem)
}

export type ReportViewModel = Readonly<{
  report: MonthlyReport
  totals: ReportTotals
  rows: readonly PayeeRow[]
  activity: readonly ActivityRow[]
}>

/** The report for a month, with its ledgers; null if not generated (or not signed in). */
const reportForPeriod = async (ports: Ports, period: string): Promise<ReportWithLedgers | null> =>
  (await loadChannelState(ports))?.reports.find((r) => r.report.period === period) ?? null

const reportViewOf = ({ report, ledgers }: ReportWithLedgers): ReportViewModel => ({
  report,
  totals: reportTotals(report, ledgers),
  rows: payeeRows({ report, ledgers }),
  activity: reportActivity(report, ledgers),
})

async function reportView(ports: Ports, period: string): Promise<ReportViewModel | null> {
  const found = await reportForPeriod(ports, period)
  return found ? reportViewOf(found) : null
}

export type StatementViewModel = Readonly<{ statement: Statement; ledger: LedgerStatus }>

/** One collaborator's statement for a revision (default: current), with their payment status. */
function statementOf(
  { report, ledgers }: ReportWithLedgers,
  collaboratorId: CollaboratorId,
  revisionNo?: number,
): StatementViewModel | null {
  const statement = buildStatement(report, collaboratorId, revisionNo ?? report.currentRevision().number)
  const ledger = ledgerStatus(report.dueFor(collaboratorId), ledgerOf(ledgers, collaboratorId))
  return statement && { statement, ledger }
}

async function statementView(
  ports: Ports,
  period: string,
  collaboratorId: CollaboratorId,
  revisionNo?: number,
): Promise<StatementViewModel | null> {
  const found = await reportForPeriod(ports, period)
  return found ? statementOf(found, collaboratorId, revisionNo) : null
}

/** Reasons with display names in place of party ids, for toasts (see present.ts). */
async function presentReasonsFor(ports: Ports, reasons: readonly Reason[]): Promise<PresentedReason[]> {
  const state = await loadChannelState(ports)
  return presentReasons(reasons, state ? nameOfParty(state) : (id) => id)
}

export const makeQueries = (ports: Ports) => ({
  dashboard: () => dashboard(ports),
  splitsList: () => splitsList(ports),
  collaboratorsList: () => collaboratorsList(ports),
  reportsList: () => reportsList(ports),
  reportView: (period: string) => reportView(ports, period),
  statementView: (period: string, collaboratorId: CollaboratorId, revisionNo?: number) =>
    statementView(ports, period, collaboratorId, revisionNo),
  presentReasons: (reasons: readonly Reason[]) => presentReasonsFor(ports, reasons),
})

export type Queries = ReturnType<typeof makeQueries>
