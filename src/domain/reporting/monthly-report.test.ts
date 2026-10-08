import { MonthlyReport } from './monthly-report'
import { allocate } from './allocate'
import { FrozenRevenue } from './frozen-revenue'
import type { PartySnapshot, SplitSnapshot } from './snapshots'
import { OWNER_ID, type PartyId, type VideoId } from '../shared/ids'
import type { Cents } from '../shared/numbers'
import {
  ALEX,
  SAM,
  TODAY,
  V1,
  V3,
  aGenerateInput,
  aMonthlyRevenue,
  aPartySnapshot,
  aReport,
  aSplitSnapshot,
  defaultParties,
  dueOf,
  expectOk,
  expectRejected,
  isoDate,
  jsonClone,
  meta,
  period,
  sharesOf,
  splitId,
  totalOf,
} from './test-fixtures'

// Default report (see test-fixtures): v1 1001¢ + v2 2999¢ in "Intro series" (owner 7000 / Alex 3000),
// v3 101¢ unsplit. Revision 1 (floor): Alex 300 + 899 = 1199¢, owner 2902¢, gross 4101¢.
const GROSS = 4101

const introWith = (...pairs: (readonly [PartyId, number])[]) => aSplitSnapshot({ shares: sharesOf(...pairs) })
/** Alex 4000 → 400 + 1199 = 1599¢; owner 2502¢. */
const alexUp = () => [introWith([OWNER_ID, 6000], [ALEX, 4000])]
/** Alex 5000 → 500 + 1499 = 1999¢. */
const alexUpMore = () => [introWith([OWNER_ID, 5000], [ALEX, 5000])]
/** Alex removed from every split (dropped to $0). */
const alexDropped = () => [introWith([OWNER_ID, 10000])]

const recalc = (report: MonthlyReport, splits: readonly SplitSnapshot[], n: number, parties = defaultParties()) =>
  expectOk(report.recalculate(splits, parties, meta(n)))

describe('MonthlyReport', () => {
  describe('generate', () => {
    it('REP-2 accepts 2026-09 with today = 2026-10-07', () => {
      const report = expectOk(MonthlyReport.generate(aGenerateInput(), meta(1), TODAY))
      expect(report.period).toBe('2026-09')
      expect(report.id).toBe(aGenerateInput().id)
      expect(report.channelId).toBe(aGenerateInput().channelId)
    })

    it('REP-2 rejects the current month', () => {
      const p = period('2026-10')
      expectRejected(
        MonthlyReport.generate(aGenerateInput({ period: p, revenue: aMonthlyRevenue(undefined, p) }), meta(1), TODAY),
        'REP-2',
      )
    })

    it('REP-2 rejects a future month', () => {
      const p = period('2026-11')
      expectRejected(
        MonthlyReport.generate(aGenerateInput({ period: p, revenue: aMonthlyRevenue(undefined, p) }), meta(1), TODAY),
        'REP-2',
      )
    })

    it.each(['2026-9', '2026-13', '26-09', ''])('REP-2 rejects the malformed period "%s"', (raw) => {
      expectRejected(MonthlyReport.generate(aGenerateInput({ period: period(raw) }), meta(1), TODAY), 'REP-2')
    })

    it('REP-2 handles the Jan → Dec rollover (2026-12 is reportable on 2027-01-01)', () => {
      const p = period('2026-12')
      expectOk(
        MonthlyReport.generate(
          aGenerateInput({ period: p, revenue: aMonthlyRevenue(undefined, p) }),
          meta(1),
          isoDate('2027-01-01'),
        ),
      )
    })

    it('REP-3 freezes the revenue at Revision 1', () => {
      const report = aReport()
      expect(FrozenRevenue.grossOf(report.frozenRevenue)).toBe(GROSS)
      expect(report.frozenRevenue.byVideo[V1]).toEqual({ cents: 1001, title: `Video ${V1}` })
    })

    it('ACC-2 rejects revenue with negative or fractional cents', () => {
      const revenue = aMonthlyRevenue({ v1: -1, v2: 2999, v3: 101 })
      expectRejected(MonthlyReport.generate(aGenerateInput({ revenue }), meta(1), TODAY), 'ACC-2')
    })

    it('REP-7 creates Revision 1 from the given splits and parties', () => {
      const input = aGenerateInput()
      const report = expectOk(MonthlyReport.generate(input, meta(1), TODAY))
      const r1 = report.currentRevision()
      expect(report.revisions).toHaveLength(1)
      expect(r1.number).toBe(1)
      expect(r1.createdAt).toBe(meta(1).at)
      expect(r1.grossCents).toBe(GROSS)
      expect(r1.splits).toEqual(input.splits)
      expect(r1.lines).toEqual(allocate(report.frozenRevenue, input.splits, input.parties))
      expect(report.sent).toEqual({})
    })

    it('REP-4 lines sum to grossOf(frozenRevenue) after generate', () => {
      const report = aReport()
      expect(totalOf(report.currentRevision().lines)).toBe(FrozenRevenue.grossOf(report.frozenRevenue))
      expect(dueOf(report.currentRevision().lines, ALEX)).toBe(1199)
      expect(dueOf(report.currentRevision().lines, OWNER_ID)).toBe(2902)
    })

    it('REP-9 generate writes exactly one "generated" activity entry', () => {
      expect(aReport().activity).toEqual([
        { id: meta(1).id, at: meta(1).at, type: 'generated', revision: 1, grossCents: GROSS },
      ])
    })

    it('SPL-10 / COL-6 mutating the input arrays after generate does not change Revision 1', () => {
      const input = aGenerateInput()
      const report = expectOk(MonthlyReport.generate(input, meta(1), TODAY))
      const before = jsonClone(report.toSnapshot())

      ;(input.splits as SplitSnapshot[]).push(aSplitSnapshot({ splitId: splitId('late'), videoIds: [V3] }))
      ;(input.splits[0] as { name: string }).name = 'Renamed split'
      ;(input.splits[0]?.videoIds as VideoId[]).push(V3)
      ;(input.splits[0]?.shares as unknown as { bps: number }[])[0]!.bps = 1
      ;(input.parties as PartySnapshot[]).push(aPartySnapshot(SAM))
      ;(input.parties[1] as { name: string; email: string }).name = 'Changed name'
      ;(input.parties[1] as { name: string; email: string }).email = 'changed@studio.com'
      ;(input.videos[0] as { title: string }).title = 'Changed title'
      ;(input.revenue.byVideo as Record<VideoId, Cents>)[V1] = 1 as Cents

      expect(jsonClone(report.toSnapshot())).toEqual(before)
    })
  })

  describe('recalculate', () => {
    it('REP-3 reuses frozenRevenue (gross unchanged)', () => {
      const report = aReport()
      const frozen = jsonClone(report.frozenRevenue)
      const next = recalc(report, alexUp(), 2)
      expect(next.frozenRevenue).toEqual(frozen)
      expect(next.currentRevision().grossCents).toBe(GROSS)
    })

    it('REP-3 recalculate takes no revenue argument (compile time)', () => {
      const compileOnly = (report: MonthlyReport) =>
        // @ts-expect-error REP-3: recalculate has no revenue parameter
        report.recalculate(alexUp(), defaultParties(), meta(2), aMonthlyRevenue({ v1: 1 }))
      expect(typeof compileOnly).toBe('function')
    })

    it('REP-4 lines sum to grossOf(frozenRevenue) after recalculate', () => {
      const next = recalc(aReport(), alexUp(), 2)
      expect(totalOf(next.currentRevision().lines)).toBe(FrozenRevenue.grossOf(next.frozenRevenue))
      expect(dueOf(next.currentRevision().lines, ALEX)).toBe(1599)
      expect(dueOf(next.currentRevision().lines, OWNER_ID)).toBe(2502)
    })

    it('REP-7 revision numbers go 1, 2, 3', () => {
      const r1 = aReport()
      const r2 = recalc(r1, alexUp(), 2)
      const r3 = recalc(r2, alexUpMore(), 3)
      expect(r3.revisions.map((r) => r.number)).toEqual([1, 2, 3])
      expect(r3.currentRevision().number).toBe(3)
      expect(r3.currentRevision().createdAt).toBe(meta(3).at)
    })

    it('REP-7 Revision 1 is deep-equal before and after recalculate', () => {
      const report = aReport()
      const rev1 = jsonClone(report.currentRevision())
      const next = recalc(report, alexUp(), 2)
      expect(next.revisions[0]).toEqual(rev1)
      expect(report.revisions).toHaveLength(1)
      expect(report.currentRevision()).toEqual(rev1)
    })

    it('REP-8 Revision 1 keeps the old party name/email after a recalculate with a renamed party', () => {
      const renamed = defaultParties().map((p) =>
        p.partyId === ALEX ? { ...p, name: 'Alexandra Rivera', email: 'alexandra@studio.com' } : p,
      )
      const next = recalc(aReport(), alexUp(), 2, renamed)
      const alexIn = (n: number) =>
        next.revisions[n - 1]?.lines.find((l) => l.party.partyId === ALEX)?.party
      expect(alexIn(1)).toEqual(aPartySnapshot(ALEX))
      expect(alexIn(2)).toEqual({ ...aPartySnapshot(ALEX), name: 'Alexandra Rivera', email: 'alexandra@studio.com' })
    })

    it('SPL-11 recalculating without a split: Revision 1 keeps splitName, Revision 2 gives its videos to the owner', () => {
      const podcast = aSplitSnapshot({
        splitId: splitId('split-podcast'),
        name: 'Podcast clips',
        videoIds: [V3],
        shares: sharesOf([OWNER_ID, 5000], [SAM, 5000]),
      })
      const report = aReport({ splits: [aSplitSnapshot(), podcast] })
      const next = recalc(report, [aSplitSnapshot()], 2)

      const [rev1, rev2] = next.revisions
      const samV3 = rev1?.lines.find((l) => l.party.partyId === SAM)?.videos.find((v) => v.videoId === V3)
      expect(samV3?.splitName).toBe('Podcast clips')
      expect(rev1?.splits.map((s) => s.name)).toEqual(['Intro series', 'Podcast clips'])

      expect(rev2?.lines.find((l) => l.party.partyId === SAM)).toBeUndefined()
      const ownerV3 = rev2?.lines.find((l) => l.party.partyId === OWNER_ID)?.videos.find((v) => v.videoId === V3)
      expect(ownerV3).toMatchObject({ splitId: null, splitName: 'Unsplit videos', cents: 101 })
    })

    it('REP-11 rejects a recalculate whose lines are identical; the report is unchanged', () => {
      const report = aReport()
      const before = report.toSnapshot()
      expectRejected(report.recalculate([aSplitSnapshot()], defaultParties(), meta(2)), 'REP-11')
      expect(report.toSnapshot()).toEqual(before)
      expect(report.revisions).toHaveLength(1)
      expect(report.activity).toHaveLength(1)
    })

    it('REP-11 rejects identical lines after earlier revisions too (compares with the current revision)', () => {
      const r2 = recalc(aReport(), alexUp(), 2)
      const before = r2.toSnapshot()
      expectRejected(r2.recalculate(alexUp(), defaultParties(), meta(3)), 'REP-11')
      expect(r2.toSnapshot()).toEqual(before)
    })

    it('REP-11 a name-only change (same amounts) is accepted: new revision with the updated PartySnapshot', () => {
      const report = aReport()
      const renamed = defaultParties().map((p) => (p.partyId === ALEX ? { ...p, name: 'Alexandra Rivera' } : p))
      const next = recalc(report, [aSplitSnapshot()], 2, renamed)

      expect(next.revisions).toHaveLength(2)
      const alexIn = (n: number) => next.revisions[n - 1]?.lines.find((l) => l.party.partyId === ALEX)
      expect(alexIn(2)?.party).toEqual({ ...aPartySnapshot(ALEX), name: 'Alexandra Rivera' })
      expect(alexIn(1)?.party).toEqual(aPartySnapshot(ALEX))
      expect(alexIn(2)?.dueCents).toBe(alexIn(1)?.dueCents)
      expect(report.revisions).toHaveLength(1)
    })

    it('REP-11 a name-only change appends a "recalculated" entry whose changes are [] (amounts only)', () => {
      const renamed = defaultParties().map((p) => (p.partyId === ALEX ? { ...p, name: 'Alexandra Rivera' } : p))
      const next = recalc(aReport(), [aSplitSnapshot()], 2, renamed)
      expect(next.activity).toHaveLength(2)
      expect(next.activity[1]).toEqual({
        id: meta(2).id,
        at: meta(2).at,
        type: 'recalculated',
        revision: 2,
        oldGrossCents: GROSS,
        newGrossCents: GROSS,
        changes: [],
      })
    })

    it('REP-11 an email-only change (same amounts) is accepted', () => {
      const changed = defaultParties().map((p) => (p.partyId === ALEX ? { ...p, email: 'alex.r@studio.com' } : p))
      const next = recalc(aReport(), [aSplitSnapshot()], 2, changed)
      expect(next.currentRevision().number).toBe(2)
      expect(next.currentRevision().lines.find((l) => l.party.partyId === ALEX)?.party.email).toBe('alex.r@studio.com')
    })

    it('REP-11 an owner name change (same amounts) is accepted', () => {
      const changed = defaultParties().map((p) => (p.partyId === OWNER_ID ? { ...p, name: 'Morgan Lee-Hart' } : p))
      const next = recalc(aReport(), [aSplitSnapshot()], 2, changed)
      expect(next.currentRevision().lines.find((l) => l.party.partyId === OWNER_ID)?.party.name).toBe('Morgan Lee-Hart')
    })

    it('REP-11 a details change for a party not on any line is not a change and is rejected', () => {
      const report = aReport()
      const before = report.toSnapshot()
      const changed = defaultParties().map((p) => (p.partyId === SAM ? { ...p, name: 'Samuel Chen' } : p))
      expectRejected(report.recalculate([aSplitSnapshot()], changed, meta(2)), 'REP-11')
      expect(report.toSnapshot()).toEqual(before)
    })

    it('REP-11 a change to a line is accepted', () => {
      const next = recalc(aReport(), alexUp(), 2)
      expect(next.revisions).toHaveLength(2)
    })

    it('REP-9 recalculate appends exactly one "recalculated" entry with the due changes', () => {
      const report = aReport()
      const earlier = jsonClone(report.activity)
      const next = recalc(report, alexUp(), 2)

      expect(next.activity).toHaveLength(2)
      expect(next.activity.slice(0, 1)).toEqual(earlier)
      const entry = next.activity[1]
      expect(entry).toMatchObject({
        id: meta(2).id,
        at: meta(2).at,
        type: 'recalculated',
        revision: 2,
        oldGrossCents: GROSS,
        newGrossCents: GROSS,
      })
      const changes = entry?.type === 'recalculated' ? entry.changes : []
      expect(changes).toContainEqual({ partyId: ALEX, name: 'Alex Rivera', fromCents: 1199, toCents: 1599 })
      for (const c of changes) expect(c.fromCents).not.toBe(c.toCents)
    })

    it('REP-9 a dropped collaborator appears in changes going to 0', () => {
      const next = recalc(aReport(), alexDropped(), 2)
      const entry = next.activity[1]
      const changes = entry?.type === 'recalculated' ? entry.changes : []
      expect(changes).toContainEqual({ partyId: ALEX, name: 'Alex Rivera', fromCents: 1199, toCents: 0 })
    })
  })

  describe('markSent', () => {
    it('STM-3 records the current revision for the collaborator', () => {
      const sent = expectOk(aReport().markSent(ALEX, meta(2)))
      expect(sent.sent[ALEX]).toBe(1)
    })

    it('REP-9 markSent appends exactly one "sent" entry; earlier entries unchanged', () => {
      const report = aReport()
      const earlier = jsonClone(report.activity)
      const sent = expectOk(report.markSent(ALEX, meta(2)))
      expect(sent.activity).toHaveLength(2)
      expect(sent.activity.slice(0, 1)).toEqual(earlier)
      expect(sent.activity[1]).toEqual({
        id: meta(2).id,
        at: meta(2).at,
        type: 'sent',
        revision: 1,
        collaboratorId: ALEX,
        name: 'Alex Rivera',
      })
    })

    it('STM-3 rejects a repeat at the same revision; the report is unchanged', () => {
      const sent = expectOk(aReport().markSent(ALEX, meta(2)))
      const before = sent.toSnapshot()
      expectRejected(sent.markSent(ALEX, meta(3)), 'STM-3')
      expect(sent.toSnapshot()).toEqual(before)
    })

    it('STM-3 rejects a collaborator never listed on any revision; the report is unchanged', () => {
      const report = aReport()
      const before = report.toSnapshot()
      expectRejected(report.markSent(SAM, meta(2)), 'STM-3')
      expect(report.toSnapshot()).toEqual(before)
    })

    it('STM-3 accepts a collaborator who dropped to $0 on the current revision', () => {
      const r2 = recalc(aReport(), alexDropped(), 2)
      expect(dueOf(r2.currentRevision().lines, ALEX)).toBe(0)
      const sent = expectOk(r2.markSent(ALEX, meta(3)))
      expect(sent.sent[ALEX]).toBe(2)
      expect(sent.activity.at(-1)).toMatchObject({ type: 'sent', revision: 2, collaboratorId: ALEX, name: 'Alex Rivera' })
    })

    it('STM-3 after recalculate it moves 1 → 2 and never back', () => {
      const sent1 = expectOk(aReport().markSent(ALEX, meta(2)))
      const r2 = recalc(sent1, alexUp(), 3)
      expect(r2.sent[ALEX]).toBe(1)
      const sent2 = expectOk(r2.markSent(ALEX, meta(4)))
      expect(sent2.sent[ALEX]).toBe(2)
      const r3 = recalc(sent2, alexUpMore(), 5)
      expect(r3.sent[ALEX]).toBe(2)
      expectRejected(sent2.markSent(ALEX, meta(6)), 'STM-3')
      expect(sent2.sent[ALEX]).toBe(2)
    })

    it('COL-7 markSent cannot receive the owner (compile time)', () => {
      const compileOnly = (report: MonthlyReport) =>
        // @ts-expect-error COL-7: OWNER_ID is not a CollaboratorId
        report.markSent(OWNER_ID, meta(2))
      expect(typeof compileOnly).toBe('function')
    })
  })

  describe('queries', () => {
    it('REP-6 dueFor returns the current revision’s due by default', () => {
      const r2 = recalc(aReport(), alexUp(), 2)
      expect(r2.dueFor(ALEX)).toBe(1599)
      expect(r2.dueFor(OWNER_ID)).toBe(2502)
    })

    it('REP-7 dueFor reads an earlier revision when asked', () => {
      const r2 = recalc(aReport(), alexUp(), 2)
      expect(r2.dueFor(ALEX, 1)).toBe(1199)
      expect(r2.dueFor(ALEX, 2)).toBe(1599)
    })

    it('REP-6 dueFor returns 0 for an absent party', () => {
      const report = aReport()
      expect(report.dueFor(SAM)).toBe(0)
      expect(recalc(report, alexDropped(), 2).dueFor(ALEX)).toBe(0)
    })

    it('STM-3 everListed is true if the party is on any revision', () => {
      const r2 = recalc(aReport(), alexDropped(), 2)
      expect(r2.everListed(ALEX)).toBe(true)
      expect(r2.everListed(OWNER_ID)).toBe(true)
      expect(r2.everListed(SAM)).toBe(false)
    })

    it('REP-7 currentRevision is the last revision', () => {
      const r2 = recalc(aReport(), alexUp(), 2)
      expect(r2.currentRevision()).toBe(r2.revisions[1])
    })
  })

  describe('immutability and persistence', () => {
    it('REP-7 the report, its revisions and their lines are frozen', () => {
      const report = recalc(aReport(), alexUp(), 2)
      expect(Object.isFrozen(report)).toBe(true)
      expect(Object.isFrozen(report.revisions)).toBe(true)
      for (const rev of report.revisions) {
        expect(Object.isFrozen(rev)).toBe(true)
        expect(Object.isFrozen(rev.lines)).toBe(true)
        expect(Object.isFrozen(rev.splits)).toBe(true)
        for (const line of rev.lines) expect(Object.isFrozen(line)).toBe(true)
      }
    })

    it('REP-7 revisions are readonly (compile time) and frozen (runtime)', () => {
      const report = aReport()
      const rev = report.currentRevision()
      expect(() => {
        // @ts-expect-error REP-7: revision fields are readonly
        rev.number = 2
      }).toThrow(TypeError)
      expect(() => {
        // @ts-expect-error REP-7: the revisions array is readonly
        report.revisions.push(rev)
      }).toThrow(TypeError)
      expect(report.revisions).toHaveLength(1)
      expect(rev.number).toBe(1)
    })

    it('REP-9 activity is readonly (compile time) and frozen (runtime)', () => {
      const report = aReport()
      expect(Object.isFrozen(report.activity)).toBe(true)
      expect(() => {
        // @ts-expect-error REP-9: the activity log only grows through commands
        report.activity.push(report.activity[0]!)
      }).toThrow(TypeError)
      expect(report.activity).toHaveLength(1)
    })

    it('REP-10 the report has no delete/remove member', () => {
      const report = aReport()
      // @ts-expect-error REP-10: reports cannot be deleted
      expect(report.delete).toBeUndefined()
      // @ts-expect-error REP-10: reports cannot be removed
      expect(report.remove).toBeUndefined()
    })

    it('REP-7 toSnapshot keys are exactly the aggregate fields', () => {
      expect(Object.keys(aReport().toSnapshot()).sort()).toEqual(
        ['activity', 'channelId', 'frozenRevenue', 'id', 'period', 'revisions', 'sent'],
      )
    })

    it('REP-7 round-trips through toSnapshot/fromSnapshot, including JSON', () => {
      const report = expectOk(recalc(aReport(), alexUp(), 2).markSent(ALEX, meta(3)))
      const restored = MonthlyReport.fromSnapshot(jsonClone(report.toSnapshot()))
      expect(restored.toSnapshot()).toEqual(report.toSnapshot())
      expect(restored.dueFor(ALEX, 1)).toBe(1199)
      expect(restored.sent[ALEX]).toBe(2)
      expect(restored.everListed(ALEX)).toBe(true)
    })

    it('REP-7 commands never mutate the original report', () => {
      const report = aReport()
      const before = jsonClone(report.toSnapshot())
      recalc(report, alexUp(), 2)
      expectOk(report.markSent(ALEX, meta(3)))
      expect(jsonClone(report.toSnapshot())).toEqual(before)
    })
  })
})

