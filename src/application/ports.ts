/** Port interfaces (docs/domain-design.md §2), implemented in infrastructure. */
import type { Account } from '../domain/channel/account'
import type { MonthlyRevenue, Video } from '../domain/channel/video'
import type { ChannelId, CollaboratorId, LedgerId, ReportId, SplitId } from '../domain/shared/ids'
import type { IsoDate, IsoDateTime } from '../domain/shared/numbers'
import type { Period } from '../domain/shared/period'
import type { MonthlyReport } from '../domain/reporting/monthly-report'
import type { PaymentLedger } from '../domain/reporting/payment-ledger'
import type { Collaborator } from '../domain/revenue-sharing/collaborator'
import type { Split } from '../domain/revenue-sharing/split'

export interface AccountRepository {
  get(): Promise<Account | null>
  save(account: Account): Promise<void>
}
export interface SplitRepository {
  findById(id: SplitId): Promise<Split | null>
  listByChannel(channelId: ChannelId): Promise<readonly Split[]>
  save(split: Split): Promise<void>
  delete(id: SplitId): Promise<void> // hard delete is fine (SPL-11)
}
export interface CollaboratorRepository {
  findById(id: CollaboratorId): Promise<Collaborator | null>
  listByChannel(channelId: ChannelId): Promise<readonly Collaborator[]> // includes soft-deleted
  save(c: Collaborator): Promise<void> // no delete (COL-5)
}
export interface MonthlyReportRepository {
  findById(id: ReportId): Promise<MonthlyReport | null>
  findByPeriod(channelId: ChannelId, period: Period): Promise<MonthlyReport | null>
  listByChannel(channelId: ChannelId): Promise<readonly MonthlyReport[]>
  add(report: MonthlyReport): Promise<void> // rejects duplicate period (REP-1 backstop)
  save(report: MonthlyReport): Promise<void> // no delete (REP-10)
}
export interface PaymentLedgerRepository {
  findById(id: LedgerId): Promise<PaymentLedger | null>
  listByReport(reportId: ReportId): Promise<readonly PaymentLedger[]>
  save(ledger: PaymentLedger): Promise<void> // no delete (PAY-1)
}
export interface ChannelCatalog {
  // YouTube ACL; read-only (ACC-2)
  listVideos(channelId: ChannelId): Promise<readonly Video[]>
  monthlyRevenue(channelId: ChannelId, period: Period): Promise<MonthlyRevenue | null>
}
export interface Clock {
  now(): IsoDateTime
  today(): IsoDate
}
export interface IdGenerator {
  next(prefix: string): string // use cases brand it: as SplitId, etc.
}
export interface Ports {
  repos: {
    account: AccountRepository
    splits: SplitRepository
    collaborators: CollaboratorRepository
    reports: MonthlyReportRepository
    ledgers: PaymentLedgerRepository
  }
  catalog: ChannelCatalog
  clock: Clock
  ids: IdGenerator
}
