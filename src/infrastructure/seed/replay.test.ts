/**
 * The seed replay as an end-to-end property test: every invariant holds across the whole demo,
 * and the documented demo states appear through the queries.
 */
import { createInMemoryApp, type InMemoryApp } from '../index'
import { fixedClock } from '../clock'
import type { IsoDateTime } from '../../domain/shared/numbers'
import type { CollaboratorListItem, ReportViewModel } from '../../application/queries'
import { OWNER_ID } from '../../domain/shared/ids'

/** Stands in for the system clock after seeding: the day after the seed's "today". */
const RUNTIME_NOW = '2026-10-08T12:00:00.000Z' as IsoDateTime

let app: InMemoryApp
beforeAll(async () => {
  app = await createInMemoryApp({ runtimeClock: fixedClock(RUNTIME_NOW) })
})

const view = async (period: string): Promise<ReportViewModel> => {
  const v = await app.queries.reportView(period)
  if (!v) throw new Error(`no report for ${period}`)
  return v
}
const rowOf = (v: ReportViewModel, name: string) => {
  const row = v.rows.find((r) => r.name.startsWith(name))
  if (!row) throw new Error(`no row for ${name}`)
  return row
}
const statusesOf = (v: ReportViewModel) => Object.fromEntries(v.rows.map((r) => [r.name.split(' ')[0], r.ledger.status]))

const PERIODS = ['2026-06', '2026-07', '2026-08']

describe('seed replay', () => {
  it('REP-4/REP-6 every revision of every report: lines sum to gross; each due = Σ video cents', async () => {
    for (const period of PERIODS) {
      const { report } = await view(period)
      for (const rev of report.revisions) {
        expect(rev.lines.reduce((s, l) => s + l.dueCents, 0)).toBe(rev.grossCents)
        for (const line of rev.lines) {
          expect(line.dueCents).toBe(line.videos.reduce((s, v) => s + v.cents, 0))
        }
      }
    }
  })

  it('PAY-4 every ledger’s net paid is ≥ 0', async () => {
    for (const period of PERIODS) {
      for (const row of (await view(period)).rows) expect(row.ledger.paidCents).toBeGreaterThanOrEqual(0)
    }
  })

  it('June: Jonah overpaid and Leo partial after the recalculation, both flagged for resend', async () => {
    const june = await view('2026-06')
    expect(june.report.revisions).toHaveLength(2)
    expect(statusesOf(june)).toEqual({ Sam: 'paid', Priya: 'paid', Leo: 'partial', Jonah: 'overpaid' })
    expect(rowOf(june, 'Jonah').needsResend).toBe(true)
    expect(rowOf(june, 'Leo').needsResend).toBe(true)
    expect(rowOf(june, 'Sam').needsResend).toBe(false)
  })

  it('July: fully paid, with Priya’s overpayment settled (with a note)', async () => {
    const july = await view('2026-07')
    expect(statusesOf(july)).toEqual({ Sam: 'paid', Priya: 'settled', Leo: 'paid', Jonah: 'paid' })
    expect(july.totals).toMatchObject({ outstandingCents: 0, overpaidCents: 0 })
    const settlement = july.activity.find((r) => r.source === 'ledger' && r.entry.kind === 'settlement')
    expect(settlement?.source === 'ledger' && settlement.entry.note).toBe('Repaid via Venmo 8/20')
    expect(july.rows.every((r) => !r.needsResend)).toBe(true)
  })

  it('August: Sam paid, reversed and re-paid; Priya paid; Leo and Jonah unpaid', async () => {
    const august = await view('2026-08')
    expect(statusesOf(august)).toEqual({ Sam: 'paid', Priya: 'paid', Leo: 'unpaid', Jonah: 'unpaid' })
    const samKinds = august.activity.flatMap((r) => (r.source === 'ledger' && r.name.startsWith('Sam') ? [r.entry.kind] : []))
    expect(samKinds).toEqual(['payment', 'reversal', 'payment'])
  })

  it('September is not generated: the dashboard’s next action is to generate it', async () => {
    const dashboard = await app.queries.dashboard()
    expect(dashboard).toMatchObject({ latestReportablePeriod: '2026-09', latestReportGenerated: false })
    expect(await app.queries.reportView('2026-09')).toBeNull()
  })

  it('the dashboard lists who is owed and who is overpaid, never netted', async () => {
    const dashboard = await app.queries.dashboard()
    const owed = Object.fromEntries((dashboard?.owed ?? []).map((o) => [o.name.split(' ')[0], o.periods]))
    expect(owed).toEqual({ Leo: ['2026-06', '2026-08'], Jonah: ['2026-08'] })
    expect(dashboard?.overpaid.map((o) => [o.name.split(' ')[0], o.periods])).toEqual([['Jonah', ['2026-06']]])
    expect(dashboard?.outstandingCents).toBe((dashboard?.owed ?? []).reduce((s, o) => s + o.cents, 0))
  })

  it('the reports list tags each month', async () => {
    const tags = Object.fromEntries((await app.queries.reportsList()).map((r) => [r.period, r.tags]))
    expect(tags['2026-07']).toMatchObject({ settled: true, needsResend: 0 })
    expect(tags['2026-06']).toMatchObject({ settled: false, needsResend: 2 })
    expect(tags['2026-06']?.overpaidCents).toBeGreaterThan(0)
    expect(tags['2026-08']?.dueCents).toBeGreaterThan(0)
  })

  it('the splits list shows the July correction and the owner as "You"', async () => {
    const splits = await app.queries.splitsList()
    expect(splits.map((s) => s.name)).toEqual(['Shop Talk S2 w/ Sam', 'Tutorial series', '60-second shorts'])
    const tutorials = splits.find((s) => s.name === 'Tutorial series')
    expect(tutorials?.shares.map((x) => [x.name, x.bps])).toEqual([
      ['You', 7100],
      ['Priya Nair', 1900],
      ['Leo Park', 1000],
    ])
  })

  it('the collaborators list shows splits and paid-to-date (net of reversals and settlements)', async () => {
    const list = Object.fromEntries(
      (await app.queries.collaboratorsList()).map((c): [string, CollaboratorListItem] => [c.name.split(' ')[0] ?? '', c]),
    )
    expect(list['Theo']).toMatchObject({ deleted: false, splits: [], paidToDateCents: 0 })
    expect(list['Priya']?.splits.map((s) => s.name)).toEqual(['Shop Talk S2 w/ Sam', 'Tutorial series'])
    const june = await view('2026-06')
    const july = await view('2026-07')
    const august = await view('2026-08')
    const samPaid = [june, july, august].reduce((sum, v) => sum + rowOf(v, 'Sam').ledger.paidCents, 0)
    expect(list['Sam']?.paidToDateCents).toBe(samPaid)
  })

  it('STM-1 the statement view renders one revision with the current payment status', async () => {
    const june = await view('2026-06')
    const jonah = rowOf(june, 'Jonah').collaboratorId
    const rev1 = await app.queries.statementView('2026-06', jonah, 1)
    const current = await app.queries.statementView('2026-06', jonah)
    expect(rev1?.statement.totalCents).toBe(june.report.dueFor(jonah, 1))
    expect(current?.statement.revision).toBe(2)
    expect(current?.statement.totalCents).toBeLessThan(rev1?.statement.totalCents ?? 0)
    expect(current?.ledger.status).toBe('overpaid')
    expect(await app.queries.statementView('2026-09', jonah)).toBeNull()
  })

  it('presentReasons turns a real rejection into display names', async () => {
    const leo = rowOf(await view('2026-06'), 'Leo').collaboratorId
    const result = await app.useCases.saveSplit({
      name: 'Tiny',
      videoIds: [],
      shares: [
        { partyId: OWNER_ID, bps: 9995 },
        { partyId: leo, bps: 5 },
      ],
    })
    expect(result.ok).toBe(false)
    const messages = result.ok ? [] : (await app.queries.presentReasons(result.reasons)).map((r) => r.message)
    expect(messages).toContain('Give Leo Park at least 0.10% or remove them')
  })

  it('after seeding, the app runs on the runtime clock: a new action is stamped later than the seed', async () => {
    const seedTimes = (await view('2026-08')).activity.map((r) => r.at)
    const september = await app.useCases.generateReport({ period: '2026-09' })
    expect(september.ok && september.value.activity[0]?.at).toBe(RUNTIME_NOW)
    for (const at of seedTimes) expect(at < RUNTIME_NOW).toBe(true)
  })
})
