/**
 * Cross-aggregate rules ([X] in docs/domain-design.md §4) at the use-case boundary, isolation
 * (PAY-8, SPL-10) and atomicity, all on real use cases over in-memory ports.
 */
import { OWNER_ID, type PartyId, type ReportId, type VideoId } from '../../domain/shared/ids'
import { aChannel, collaboratorId, expectOk, expectRejected, tableOf, v } from '../test-fixtures'

type Channel = Awaited<ReturnType<typeof aChannel>>

const owner70 = (c: Channel, party: PartyId = c.alex.id) => [
  { partyId: OWNER_ID, bps: 7000 },
  { partyId: party, bps: 3000 },
]
const aSplit = async (c: Channel, videoIds = [v(1), v(2)], party: PartyId = c.alex.id, name = 'Podcast') =>
  expectOk(await c.uc.saveSplit({ name, videoIds, shares: owner70(c, party) }))
const aReport = async (c: Channel, period = '2026-09') => expectOk(await c.uc.generateReport({ period }))

describe('cross-aggregate rules', () => {
  it('SPL-7 rejects a video already in another split, naming that split', async () => {
    const c = await aChannel()
    await aSplit(c, [v(1), v(2)])
    const reasons = expectRejected(await c.uc.saveSplit({ name: 'B', videoIds: [v(2)], shares: owner70(c) }), 'SPL-7')
    expect(reasons[0]?.message).toContain('Podcast')
  })

  it('SPL-8 rejects a soft-deleted collaborator and a video that is not on the channel', async () => {
    const c = await aChannel()
    expectOk(await c.uc.deleteCollaborator({ id: c.sam.id }))
    const result = await c.uc.saveSplit({ name: 'X', videoIds: [v(1), 'v-foreign' as VideoId], shares: owner70(c, c.sam.id) })
    const reasons = expectRejected(result, 'SPL-8')
    expect(reasons.map((r) => r.partyId)).toEqual([undefined, c.sam.id])
  })

  it.each([
    ['another collaborator’s email (any case)', '  ALEX@studio.com '],
    ['the owner’s email', 'Maya@MayaBuilds.studio'],
  ])('COL-2 rejects adding with %s', async (_label, email) => {
    const c = await aChannel()
    expectRejected(await c.uc.addCollaborator({ name: 'New', email, role: { kind: 'Editor' } }), 'COL-2')
  })

  it('COL-2 a soft-deleted collaborator keeps their email; editing may keep your own', async () => {
    const c = await aChannel()
    expectOk(await c.uc.deleteCollaborator({ id: c.sam.id }))
    expectRejected(await c.uc.addCollaborator({ name: 'Sam 2', email: 'sam@studio.com', role: { kind: 'Editor' } }), 'COL-2')
    expectOk(await c.uc.editCollaborator({ id: c.alex.id, fields: { name: 'Alexandra', email: 'Alex@Studio.com' } }))
    expectRejected(await c.uc.editCollaborator({ id: c.alex.id, fields: { email: 'sam@studio.com' } }), 'COL-2')
  })

  it('COL-4 rejects deleting a collaborator who is in a split; allowed once the split is gone', async () => {
    const c = await aChannel()
    const split = await aSplit(c)
    expectRejected(await c.uc.deleteCollaborator({ id: c.alex.id }), 'COL-4')
    expectOk(await c.uc.deleteSplit({ id: split.id }))
    expect(expectOk(await c.uc.deleteCollaborator({ id: c.alex.id })).isDeleted()).toBe(true)
  })

  it('COL-7 collaborator and statement commands reject the owner at the untyped boundary', async () => {
    const c = await aChannel()
    expectRejected(await c.uc.editCollaborator({ id: OWNER_ID, fields: { name: 'Me' } }), 'COL-7')
    expectRejected(await c.uc.deleteCollaborator({ id: OWNER_ID }), 'COL-7')
    const report = await aReport(c)
    expectRejected(await c.uc.markStatementSent({ reportId: report.id, partyId: OWNER_ID }), 'COL-7')
  })

  it('REP-1 rejects a second report for the same month', async () => {
    const c = await aChannel()
    await aReport(c)
    expectRejected(await c.uc.generateReport({ period: '2026-09' }), 'REP-1')
  })

  it.each([
    ['the current month', '2026-10'],
    ['a month with no revenue data', '2024-01'],
    ['a malformed month', '2026-13'],
  ])('REP-2 rejects %s', async (_label, period) => {
    const c = await aChannel()
    expectRejected(await c.uc.generateReport({ period }), 'REP-2')
  })

  it('PAY-5 / COL-7 rejects paying someone not on the report, the owner, or for a missing report', async () => {
    const c = await aChannel()
    await aSplit(c)
    const report = await aReport(c)
    expectRejected(await c.uc.markPaid({ reportId: report.id, partyId: c.sam.id }), 'PAY-5')
    expectRejected(await c.uc.markPaid({ reportId: report.id, partyId: OWNER_ID }), 'COL-7')
    expectRejected(await c.uc.markPaid({ reportId: 'rep-missing' as ReportId, partyId: c.alex.id }), 'PAY-5')
    expect(expectOk(await c.uc.markPaid({ reportId: report.id, partyId: c.alex.id })).netPaidCents()).toBe(
      report.dueFor(c.alex.id),
    )
  })
})

describe('isolation', () => {
  it('PAY-8 recalculating a report leaves every ledger byte-identical', async () => {
    const c = await aChannel()
    const split = await aSplit(c)
    const report = await aReport(c)
    expectOk(await c.uc.markPaid({ reportId: report.id, partyId: c.alex.id }))
    const ledgers = tableOf(c.dump(), 'ledgers')
    expectOk(await c.uc.saveSplit({ id: split.id, name: 'Podcast', videoIds: [v(1), v(2)], shares: owner70(c, c.sam.id) }))
    expectOk(await c.uc.recalculateReport({ reportId: report.id }))
    expect(tableOf(c.dump(), 'ledgers')).toBe(ledgers)
  })

  it('SPL-10 / COL-6 editing or deleting splits and collaborators leaves existing reports byte-identical', async () => {
    const c = await aChannel()
    const split = await aSplit(c)
    await aReport(c)
    const reports = tableOf(c.dump(), 'reports')
    expectOk(await c.uc.editCollaborator({ id: c.alex.id, fields: { name: 'Alexandra Rivera' } }))
    expectOk(await c.uc.saveSplit({ id: split.id, name: 'Renamed', videoIds: [v(3)], shares: owner70(c) }))
    expectOk(await c.uc.deleteSplit({ id: split.id }))
    expectOk(await c.uc.deleteCollaborator({ id: c.alex.id }))
    expect(tableOf(c.dump(), 'reports')).toBe(reports)
  })
})

describe('atomicity', () => {
  it('a rejected use case leaves every repository unchanged', async () => {
    const c = await aChannel()
    const split = await aSplit(c)
    const report = await aReport(c)
    expectOk(await c.uc.markPaid({ reportId: report.id, partyId: c.alex.id }))
    const rejected = [
      () => c.uc.saveSplit({ name: 'B', videoIds: [v(2)], shares: owner70(c) }),
      () => c.uc.saveSplit({ id: split.id, name: '', videoIds: [v(1)], shares: owner70(c) }),
      () => c.uc.addCollaborator({ name: 'X', email: 'alex@studio.com', role: { kind: 'Editor' } }),
      () => c.uc.deleteCollaborator({ id: c.alex.id }),
      () => c.uc.deleteCollaborator({ id: collaboratorId('c-missing') }),
      () => c.uc.generateReport({ period: '2026-09' }),
      () => c.uc.recalculateReport({ reportId: report.id }),
      () => c.uc.markPaid({ reportId: report.id, partyId: c.alex.id }),
      () => c.uc.markPaid({ reportId: report.id, partyId: c.sam.id }),
      () => c.uc.recordSettlement({ reportId: report.id, partyId: c.alex.id, amountCents: 1 }),
      () => c.uc.markStatementSent({ reportId: report.id, partyId: c.sam.id }),
    ]
    for (const run of rejected) {
      const before = c.dump()
      expect((await run()).ok).toBe(false)
      expect(c.dump()).toBe(before)
    }
  })
})
