/**
 * In-memory repositories. They store aggregate SNAPSHOTS as JSON text, so nothing a caller
 * holds can alias stored state, and rehydrate with `fromSnapshot` on every read.
 */
import type {
  AccountRepository,
  CollaboratorRepository,
  MonthlyReportRepository,
  PaymentLedgerRepository,
  Ports,
  SplitRepository,
} from '../../application/ports'
import { Account, type AccountSnapshot } from '../../domain/channel/account'
import type { ChannelId } from '../../domain/shared/ids'
import type { Period } from '../../domain/shared/period'
import { MonthlyReport, type MonthlyReportSnapshot } from '../../domain/reporting/monthly-report'
import { PaymentLedger, type PaymentLedgerSnapshot } from '../../domain/reporting/payment-ledger'
import { Collaborator, type CollaboratorSnapshot } from '../../domain/revenue-sharing/collaborator'
import { Split, type SplitSnapshot } from '../../domain/revenue-sharing/split'
import type { Store } from './store'

/** A keyed table of JSON snapshots. */
function table<S>(store: Store) {
  const rows = new Map<string, string>()
  const all = () => [...rows.values()].map((json) => JSON.parse(json) as S)
  return {
    get: (key: string): S | null => {
      const json = rows.get(key)
      return json === undefined ? null : (JSON.parse(json) as S)
    },
    all,
    where: (match: (s: S) => boolean) => all().filter(match),
    put(key: string, snapshot: S) {
      rows.set(key, JSON.stringify(snapshot))
      store.notify()
    },
    remove(key: string) {
      rows.delete(key)
      store.notify()
    },
    dump: () => Object.fromEntries(rows),
  }
}

const ACCOUNT_KEY = 'account'
const orNull = <S, A>(snapshot: S | null, rehydrate: (s: S) => A): A | null =>
  snapshot === null ? null : rehydrate(snapshot)

function accountRepository(t: ReturnType<typeof table<AccountSnapshot>>): AccountRepository {
  return {
    get: async () => orNull(t.get(ACCOUNT_KEY), Account.fromSnapshot),
    save: async (account) => t.put(ACCOUNT_KEY, account.toSnapshot()),
  }
}

function splitRepository(t: ReturnType<typeof table<SplitSnapshot>>): SplitRepository {
  return {
    findById: async (id) => orNull(t.get(id), Split.fromSnapshot),
    listByChannel: async (channelId: ChannelId) => t.where((s) => s.channelId === channelId).map(Split.fromSnapshot),
    save: async (split) => t.put(split.id, split.toSnapshot()),
    delete: async (id) => t.remove(id),
  }
}

function collaboratorRepository(t: ReturnType<typeof table<CollaboratorSnapshot>>): CollaboratorRepository {
  return {
    findById: async (id) => orNull(t.get(id), Collaborator.fromSnapshot),
    listByChannel: async (channelId) => t.where((c) => c.channelId === channelId).map(Collaborator.fromSnapshot),
    save: async (c) => t.put(c.id, c.toSnapshot()),
  }
}

type ReportTable = ReturnType<typeof table<MonthlyReportSnapshot>>

const samePeriod = (r: MonthlyReportSnapshot, channelId: ChannelId, period: Period) =>
  r.channelId === channelId && r.period === period

const findReportByPeriod = (t: ReportTable, channelId: ChannelId, period: Period) =>
  orNull(t.where((r) => samePeriod(r, channelId, period))[0] ?? null, MonthlyReport.fromSnapshot)

/** REP-1 backstop: the use case checks first; a duplicate here is a programmer or concurrency error. */
function addReport(t: ReportTable, report: MonthlyReport) {
  if (findReportByPeriod(t, report.channelId, report.period)) {
    throw new Error(`REP-1: a report for ${report.period} already exists`)
  }
  t.put(report.id, report.toSnapshot())
}

function reportRepository(t: ReportTable): MonthlyReportRepository {
  return {
    findById: async (id) => orNull(t.get(id), MonthlyReport.fromSnapshot),
    findByPeriod: async (channelId, period) => findReportByPeriod(t, channelId, period),
    listByChannel: async (channelId) => t.where((r) => r.channelId === channelId).map(MonthlyReport.fromSnapshot),
    add: async (report) => addReport(t, report),
    save: async (report) => t.put(report.id, report.toSnapshot()),
  }
}

function ledgerRepository(t: ReturnType<typeof table<PaymentLedgerSnapshot>>): PaymentLedgerRepository {
  return {
    findById: async (id) => orNull(t.get(id), PaymentLedger.fromSnapshot),
    listByReport: async (reportId) => t.where((l) => l.reportId === reportId).map(PaymentLedger.fromSnapshot),
    save: async (ledger) => t.put(ledger.id, ledger.toSnapshot()),
  }
}

/** All five repositories over one store, plus `dump()`: every stored snapshot as JSON text. */
export function createMemoryRepositories(store: Store): { repos: Ports['repos']; dump: () => string } {
  const tables = {
    account: table<AccountSnapshot>(store),
    splits: table<SplitSnapshot>(store),
    collaborators: table<CollaboratorSnapshot>(store),
    reports: table<MonthlyReportSnapshot>(store),
    ledgers: table<PaymentLedgerSnapshot>(store),
  }
  return {
    repos: {
      account: accountRepository(tables.account),
      splits: splitRepository(tables.splits),
      collaborators: collaboratorRepository(tables.collaborators),
      reports: reportRepository(tables.reports),
      ledgers: ledgerRepository(tables.ledgers),
    },
    dump: () => JSON.stringify(Object.fromEntries(Object.entries(tables).map(([k, t]) => [k, t.dump()]))),
  }
}
