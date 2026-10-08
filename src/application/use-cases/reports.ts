import type { MonthlyRevenue } from '../../domain/channel/video'
import { isOwner, type ChannelId, type PartyId, type ReportId } from '../../domain/shared/ids'
import { Period } from '../../domain/shared/period'
import { fail, failIf, ok, type Result } from '../../domain/shared/result'
import { MonthlyReport } from '../../domain/reporting/monthly-report'
import type { PartySnapshot, SplitSnapshot } from '../../domain/reporting/snapshots'
import type { Ports } from '../ports'
import { partySnapshotsOf, splitSnapshotOf } from '../translate'
import { andThen, found, metaOf, requireChannel, saved, type ChannelContext } from './support'

const saveReport = (ports: Ports) => (r: MonthlyReport) => saved((x: MonthlyReport) => ports.repos.reports.save(x), r)

type Agreements = Readonly<{ splits: SplitSnapshot[]; parties: PartySnapshot[] }>

/** The splits and parties in force now, translated into Reporting snapshots. */
async function currentAgreements(ports: Ports, { account, channelId }: ChannelContext): Promise<Agreements> {
  const [splits, collaborators] = await Promise.all([
    ports.repos.splits.listByChannel(channelId),
    ports.repos.collaborators.listByChannel(channelId),
  ])
  return { splits: splits.map(splitSnapshotOf), parties: partySnapshotsOf(account, collaborators) }
}

/** REP-1: at most one report per channel per month. */
async function checkNoReport(ports: Ports, channelId: ChannelId, period: Period): Promise<Result<void>> {
  const existing = await ports.repos.reports.findByPeriod(channelId, period)
  return failIf(existing !== null, 'REP-1', `The report for ${period} has already been generated`)
}

/** The catalog's answer must be for the channel and month that were asked for. */
const checkRevenueFor = (revenue: MonthlyRevenue, channelId: ChannelId, period: Period): Result<void> =>
  failIf(
    !(revenue.channelId === channelId && revenue.period === period),
    'INVALID_INPUT',
    'The catalog returned revenue for the wrong channel or month',
  )

/** REP-2: the catalog must have revenue data for the month ("no revenue data" is REP-2). */
async function loadRevenue(ports: Ports, channelId: ChannelId, period: Period): Promise<Result<MonthlyRevenue>> {
  const revenue = await ports.catalog.monthlyRevenue(channelId, period)
  if (revenue === null) return fail('REP-2', `There is no revenue data for ${period} yet`)
  return andThen(checkRevenueFor(revenue, channelId, period), () => ok(revenue))
}

async function generate(ports: Ports, ctx: ChannelContext, period: Period): Promise<Result<MonthlyReport>> {
  const [revenue, videos, agreements] = await Promise.all([
    loadRevenue(ports, ctx.channelId, period),
    ports.catalog.listVideos(ctx.channelId),
    currentAgreements(ports, ctx),
  ])
  const input = { id: ports.ids.next('rep') as ReportId, channelId: ctx.channelId, period, videos, ...agreements }
  return andThen(revenue, (r) =>
    MonthlyReport.generate({ ...input, revenue: r }, metaOf(ports, 'evt'), ports.clock.today()),
  )
}

/** Revision 1 for a month (REP-1, REP-2, REP-3). */
export const generateReport =
  (ports: Ports) =>
  (cmd: Readonly<{ period: string }>): Promise<Result<MonthlyReport>> =>
    andThen(requireChannel(ports), (ctx) =>
      andThen(Period.parse(cmd.period), (period) =>
        andThen(checkNoReport(ports, ctx.channelId, period), () =>
          andThen(generate(ports, ctx, period), async (report) => {
            await ports.repos.reports.add(report)
            return ok(report)
          }),
        ),
      ),
    )

const findReport = async ({ repos }: Ports, id: ReportId) => found(await repos.reports.findById(id), 'Report')

/** Revision n+1 from the current splits and parties. Touches only the reports repo (PAY-8, SPL-10). */
export const recalculateReport =
  (ports: Ports) =>
  (cmd: Readonly<{ reportId: ReportId }>): Promise<Result<MonthlyReport>> =>
    andThen(requireChannel(ports), (ctx) =>
      andThen(findReport(ports, cmd.reportId), async (report) => {
        const { splits, parties } = await currentAgreements(ports, ctx)
        return andThen(report.recalculate(splits, parties, metaOf(ports, 'evt')), saveReport(ports))
      }),
    )

/** STM-3. COL-7 at the untyped boundary: the owner gets no statement. */
export const markStatementSent =
  (ports: Ports) =>
  (cmd: Readonly<{ reportId: ReportId; partyId: PartyId }>): Promise<Result<MonthlyReport>> => {
    const { partyId } = cmd
    if (isOwner(partyId)) return Promise.resolve(fail('COL-7', 'The channel owner gets no statement'))
    return andThen(findReport(ports, cmd.reportId), (report) =>
      andThen(report.markSent(partyId, metaOf(ports, 'evt')), saveReport(ports)),
    )
  }
