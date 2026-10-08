import { buildStatement, ledgerStatus, needsResend, reportActivity, reportTotals } from './projections'
import { PaymentLedger } from './payment-ledger'
import { OWNER_ID } from '../shared/ids'
import type { Cents } from '../shared/numbers'
import {
  ALEX,
  ALEX_DUE_R1,
  SAM,
  V1,
  aLedger,
  aPartySnapshot,
  aReport,
  aSplitSnapshot,
  alexDown,
  alexDropped,
  alexUp,
  defaultParties,
  expectOk,
  jsonClone,
  meta,
  paidLedger,
  recalc,
  reportId,
  settledLedger,
  sharesOf,
} from './payment-test-fixtures'

const c = (n: number) => n as Cents

/** Owner 5000 / Alex 3000 / Sam 2000: Alex 1199¢, Sam 799¢, owner 2103¢ (gross 4101¢). */
const withSam = () => [aSplitSnapshot({ shares: sharesOf([OWNER_ID, 5000], [ALEX, 3000], [SAM, 2000]) })]
const renameAlex = () =>
  defaultParties().map((p) => (p.partyId === ALEX ? { ...p, name: 'Alexandra Rivera' } : p))

describe('reporting projections', () => {
  describe('buildStatement', () => {
    it('STM-1 renders one revision for one collaborator', () => {
      const report = aReport()
      const rev1 = report.currentRevision()
      const line = rev1.lines.find((l) => l.party.partyId === ALEX)
      expect(buildStatement(report, ALEX, 1)).toEqual({
        reportId: report.id,
        period: report.period,
        revision: 1,
        issuedAt: rev1.createdAt,
        party: aPartySnapshot(ALEX),
        videos: line?.videos,
        totalCents: ALEX_DUE_R1,
      })
    })

    it('STM-1 total equals dueFor(c, n) and the sum of its video amounts', () => {
      const r2 = recalc(aReport(), alexUp(), 2)
      for (const n of [1, 2]) {
        const statement = buildStatement(r2, ALEX, n)
        expect(statement?.totalCents).toBe(r2.dueFor(ALEX, n))
        expect(statement?.videos.reduce((s, v) => s + v.cents, 0)).toBe(r2.dueFor(ALEX, n))
      }
    })

    it('STM-1 lists only revision n’s videos', () => {
      const onlyV1 = [aSplitSnapshot({ videoIds: [V1], shares: sharesOf([OWNER_ID, 6000], [ALEX, 4000]) })]
      const r2 = recalc(aReport(), onlyV1, 2)
      expect(buildStatement(r2, ALEX, 1)?.videos.map((v) => v.videoId)).toEqual(['v1', 'v2'])
      expect(buildStatement(r2, ALEX, 2)?.videos.map((v) => v.videoId)).toEqual(['v1'])
      expect(buildStatement(r2, ALEX, 2)?.totalCents).toBe(400)
      expect(buildStatement(r2, ALEX, 2)?.revision).toBe(2)
      expect(buildStatement(r2, ALEX, 2)?.issuedAt).toBe(meta(2).at)
    })

    it('STM-1 each revision keeps the party details it was issued with', () => {
      const r2 = recalc(aReport(), alexUp(), 2, renameAlex())
      expect(buildStatement(r2, ALEX, 1)?.party.name).toBe('Alex Rivera')
      expect(buildStatement(r2, ALEX, 2)?.party.name).toBe('Alexandra Rivera')
    })

    it('STM-1 a collaborator dropped from revision n gets a $0 statement with their details as of revision n', () => {
      const r2 = recalc(aReport(), alexDropped(), 2)
      expect(buildStatement(r2, ALEX, 2)).toEqual({
        reportId: r2.id,
        period: r2.period,
        revision: 2,
        issuedAt: meta(2).at,
        party: aPartySnapshot(ALEX),
        videos: [],
        totalCents: 0,
      })
    })

    it('STM-1 / REP-8 a dropped collaborator’s $0 statement uses their details as of revision n, not a later revision’s', () => {
      const partiesWith = (name: string, email: string) =>
        defaultParties().map((p) => (p.partyId === ALEX ? { ...p, name, email } : p))
      const r1 = aReport({ parties: partiesWith('Alex Old', 'old@x.com') })
      const r2 = recalc(r1, alexDropped(), 2, partiesWith('Alex Old', 'old@x.com'))
      const r3 = recalc(r2, [aSplitSnapshot()], 3, partiesWith('Alex New', 'new@x.com'))

      expect(buildStatement(r3, ALEX, 2)).toEqual({
        reportId: r3.id,
        period: r3.period,
        revision: 2,
        issuedAt: meta(2).at,
        party: { ...aPartySnapshot(ALEX), name: 'Alex Old', email: 'old@x.com' },
        videos: [],
        totalCents: 0,
      })
      const atR3 = buildStatement(r3, ALEX, 3)
      expect(atR3?.party).toEqual({ ...aPartySnapshot(ALEX), name: 'Alex New', email: 'new@x.com' })
      expect(atR3?.totalCents).toBe(ALEX_DUE_R1)
    })

    it('STM-1 / REP-8 returns null for a revision before the collaborator first appears', () => {
      const r2 = recalc(aReport(), withSam(), 2)
      expect(buildStatement(r2, SAM, 1)).toBeNull()
      expect(buildStatement(r2, SAM, 2)?.party).toEqual(aPartySnapshot(SAM))
    })

    it('STM-1 returns null for a collaborator never on the report, or an unknown revision', () => {
      const report = aReport()
      expect(buildStatement(report, SAM, 1)).toBeNull()
      expect(buildStatement(report, ALEX, 2)).toBeNull()
      expect(buildStatement(report, ALEX, 0)).toBeNull()
    })

    it('COL-7 there is no statement for the owner (compile time)', () => {
      const compileOnly = () =>
        // @ts-expect-error COL-7: statements are for collaborators only
        buildStatement(aReport(), OWNER_ID, 1)
      expect(typeof compileOnly).toBe('function')
    })
  })

  describe('needsResend', () => {
    it('STM-2 is false on revision 1', () => {
      expect(needsResend(aReport(), ALEX)).toBe(false)
    })

    it('STM-2 is true when the due changed and nothing was sent', () => {
      expect(needsResend(recalc(aReport(), alexUp(), 2), ALEX)).toBe(true)
    })

    it('STM-2 is false after markSent at the current revision', () => {
      const r2 = recalc(aReport(), alexUp(), 2)
      const sent = expectOk(r2.markSent(ALEX, meta(3)))
      expect(needsResend(sent, ALEX)).toBe(false)
    })

    it('STM-2 is true for 0 → X (a collaborator who joins on a later revision)', () => {
      const r2 = recalc(aReport(), withSam(), 2)
      expect(needsResend(r2, SAM)).toBe(true)
    })

    it('STM-2 is true for X → 0 (a collaborator dropped to $0)', () => {
      expect(needsResend(recalc(aReport(), alexDropped(), 2), ALEX)).toBe(true)
    })

    it('STM-2 markSent clears the flag for a collaborator dropped to $0', () => {
      const r2 = recalc(aReport(), alexDropped(), 2)
      expect(needsResend(expectOk(r2.markSent(ALEX, meta(3))), ALEX)).toBe(false)
    })

    it('STM-2 is false for a name-only change (amounts only)', () => {
      const r2 = recalc(aReport(), [aSplitSnapshot()], 2, renameAlex())
      expect(r2.revisions).toHaveLength(2)
      expect(needsResend(r2, ALEX)).toBe(false)
    })

    it('STM-2 is false when the due is unchanged for that collaborator', () => {
      const r2 = recalc(aReport(), withSam(), 2)
      expect(r2.dueFor(ALEX)).toBe(ALEX_DUE_R1)
      expect(needsResend(r2, ALEX)).toBe(false)
    })

    it('STM-2 compares with Revision 1 when nothing was sent (back to the baseline → false)', () => {
      const r3 = recalc(recalc(aReport(), alexUp(), 2), [aSplitSnapshot()], 3)
      expect(r3.dueFor(ALEX)).toBe(ALEX_DUE_R1)
      expect(needsResend(r3, ALEX)).toBe(false)
    })

    it('STM-2 compares with the last revision marked sent', () => {
      const sent2 = expectOk(recalc(aReport(), alexUp(), 2).markSent(ALEX, meta(3)))
      expect(needsResend(recalc(sent2, alexUp(), 4, renameAlex()), ALEX)).toBe(false)
      expect(needsResend(recalc(sent2, alexDown(), 4), ALEX)).toBe(true)
    })

    it('STM-2 is false for a collaborator never listed', () => {
      expect(needsResend(recalc(aReport(), alexUp(), 2), SAM)).toBe(false)
    })
  })

  describe('ledgerStatus', () => {
    it('PAY-7 none: nothing due and nothing paid (full shape)', () => {
      expect(ledgerStatus(c(0), null)).toEqual({
        status: 'none',
        dueCents: 0,
        paidCents: 0,
        balanceCents: 0,
        settled: false,
        lastOpen: null,
      })
    })

    it('PAY-7 unpaid: a due with no ledger or an empty ledger', () => {
      expect(ledgerStatus(c(1199), null)).toMatchObject({ status: 'unpaid', dueCents: 1199, paidCents: 0, balanceCents: 1199 })
      expect(ledgerStatus(c(1199), aLedger()).status).toBe('unpaid')
    })

    it('PAY-7 unpaid again after the only payment is reversed', () => {
      const paid = paidLedger(1199)
      const reversed = expectOk(paid.reverse(paid.entries[0]!.id, meta(60)))
      expect(ledgerStatus(c(1199), reversed)).toMatchObject({ status: 'unpaid', paidCents: 0, lastOpen: null })
    })

    it('PAY-7 paid: net paid equals the due (full shape)', () => {
      const ledger = paidLedger(1199)
      expect(ledgerStatus(c(1199), ledger)).toEqual({
        status: 'paid',
        dueCents: 1199,
        paidCents: 1199,
        balanceCents: 0,
        settled: false,
        lastOpen: ledger.entries[0],
      })
    })

    it('PAY-7 partial: a recalculation raised the due after a full payment', () => {
      expect(ledgerStatus(c(1599), paidLedger(1199))).toMatchObject({ status: 'partial', balanceCents: 400 })
    })

    it('PAY-7 overpaid: a recalculation lowered the due after a full payment', () => {
      expect(ledgerStatus(c(799), paidLedger(1199))).toMatchObject({ status: 'overpaid', balanceCents: -400 })
    })

    it('PAY-7 overpaid: a collaborator dropped to $0 after being paid', () => {
      expect(ledgerStatus(c(0), paidLedger(1199))).toMatchObject({ status: 'overpaid', balanceCents: -1199 })
    })

    it('PAY-9 settled: the overpayment was settled and the balance is 0 (full shape)', () => {
      const ledger = settledLedger(1199, 799)
      expect(ledgerStatus(c(799), ledger)).toEqual({
        status: 'settled',
        dueCents: 799,
        paidCents: 799,
        balanceCents: 0,
        settled: true,
        lastOpen: ledger.entries[1],
      })
    })

    it('PAY-9 a reversed settlement is no longer settled', () => {
      const ledger = settledLedger(1199, 799)
      const undone = expectOk(ledger.reverse(ledger.entries[1]!.id, meta(60)))
      expect(ledgerStatus(c(799), undone)).toMatchObject({ status: 'overpaid', settled: false })
    })

    it('PAY-3 lastOpen is the entry “Undo” would reverse (openEntries().at(-1))', () => {
      const ledger = expectOk(paidLedger(1199).markPaid(c(1599), meta(60)))
      expect(ledgerStatus(c(1599), ledger).lastOpen).toEqual(ledger.openEntries().at(-1))
    })
  })

  describe('reportTotals', () => {
    it('PAY-7 totals for an unpaid report: due, outstanding and the owner’s retained amount', () => {
      const report = recalc(aReport(), withSam(), 2)
      expect(reportTotals(report, [])).toEqual({
        dueCents: 1998,
        paidCents: 0,
        outstandingCents: 1998,
        overpaidCents: 0,
        retainedCents: 2103,
      })
    })

    it('PAY-7 totals with one collaborator paid and one unpaid', () => {
      const report = recalc(aReport(), withSam(), 2)
      expect(reportTotals(report, [paidLedger(1199)])).toEqual({
        dueCents: 1998,
        paidCents: 1199,
        outstandingCents: 799,
        overpaidCents: 0,
        retainedCents: 2103,
      })
    })

    it('PAY-7 an overpayment after a lower due is surfaced, not netted against what others are owed', () => {
      const report = recalc(recalc(aReport(), withSam(), 2), [aSplitSnapshot({ shares: sharesOf([OWNER_ID, 6000], [ALEX, 2000], [SAM, 2000]) })], 3)
      // Alex 799¢ (paid 1199¢), Sam 799¢ (unpaid), owner 2503¢.
      expect(reportTotals(report, [paidLedger(1199)])).toEqual({
        dueCents: 1598,
        paidCents: 1199,
        outstandingCents: 799,
        overpaidCents: 400,
        retainedCents: 2503,
      })
    })

    it('PAY-7 a collaborator dropped to $0 but paid still counts (overpaid)', () => {
      const report = recalc(aReport(), alexDropped(), 2)
      expect(reportTotals(report, [paidLedger(1199)])).toEqual({
        dueCents: 0,
        paidCents: 1199,
        outstandingCents: 0,
        overpaidCents: 1199,
        retainedCents: 4101,
      })
    })

    it('PAY-9 a settled overpayment leaves nothing overpaid', () => {
      const report = recalc(aReport(), alexDown(), 2)
      expect(reportTotals(report, [settledLedger(1199, 799)])).toMatchObject({
        dueCents: 799,
        paidCents: 799,
        outstandingCents: 0,
        overpaidCents: 0,
      })
    })

    it('PAY-5 ignores ledgers that belong to another report', () => {
      const report = aReport()
      const other = expectOk(PaymentLedger.open(reportId('rep-2026-08'), ALEX).markPaid(c(1199), meta(60)))
      expect(reportTotals(report, [other])).toMatchObject({ paidCents: 0, outstandingCents: ALEX_DUE_R1 })
    })
  })

  describe('reportActivity', () => {
    // Timeline: m1 generated, m2 Alex paid, m3 recalculated (Sam joins), m4 Sam paid,
    // m5 sent to Alex, m6 Alex's payment reversed.
    const scenario = () => {
      const generated = aReport()
      const alexPaid = expectOk(aLedger(ALEX).markPaid(c(1199), meta(2)))
      const r2 = recalc(generated, withSam(), 3)
      const samPaid = expectOk(aLedger(SAM).markPaid(c(799), meta(4)))
      const sent = expectOk(r2.markSent(ALEX, meta(5)))
      const alexReversed = expectOk(alexPaid.reverse(alexPaid.entries[0]!.id, meta(6), 'Wrong account'))
      return { report: sent, ledgers: [samPaid, alexReversed] }
    }

    it('REP-9 merges report activity and ledger entries by `at`, oldest first', () => {
      const { report, ledgers } = scenario()
      const rows = reportActivity(report, ledgers)
      expect(rows.map((r) => r.id)).toEqual([1, 2, 3, 4, 5, 6].map((n) => meta(n).id))
      expect(rows.map((r) => r.source)).toEqual(['report', 'ledger', 'report', 'ledger', 'report', 'ledger'])
    })

    it('REP-9 report rows carry the activity entry; ledger rows carry the entry, collaborator and name', () => {
      const { report, ledgers } = scenario()
      const rows = reportActivity(report, ledgers)
      expect(rows[0]).toEqual({ source: 'report', id: meta(1).id, at: meta(1).at, entry: report.activity[0] })
      expect(rows[5]).toEqual({
        source: 'ledger',
        id: meta(6).id,
        at: meta(6).at,
        collaboratorId: ALEX,
        name: 'Alex Rivera',
        entry: ledgers[1]?.entries[1],
      })
    })

    it('REP-9 does not mutate either input', () => {
      const { report, ledgers } = scenario()
      const before = jsonClone({ report: report.toSnapshot(), ledgers: ledgers.map((l) => l.toSnapshot()) })
      reportActivity(report, ledgers)
      expect(jsonClone({ report: report.toSnapshot(), ledgers: ledgers.map((l) => l.toSnapshot()) })).toEqual(before)
      expect(ledgers.map((l) => l.collaboratorId)).toEqual([SAM, ALEX])
    })

    it('REP-9 ledger rows use the collaborator’s latest snapshot name', () => {
      const report = recalc(aReport(), alexUp(), 3, renameAlex())
      const rows = reportActivity(report, [expectOk(aLedger(ALEX).markPaid(c(1599), meta(4)))])
      const row = rows.find((r) => r.source === 'ledger')
      expect(row?.source === 'ledger' ? row.name : undefined).toBe('Alexandra Rivera')
    })

    it('REP-9 ignores ledgers that belong to another report', () => {
      const report = aReport()
      const other = expectOk(PaymentLedger.open(reportId('rep-2026-08'), ALEX).markPaid(c(1199), meta(60)))
      expect(reportActivity(report, [other]).map((r) => r.source)).toEqual(['report'])
    })

    it('REP-9 with no ledgers, the feed is the report activity', () => {
      const report = recalc(aReport(), alexUp(), 2)
      expect(reportActivity(report, []).map((r) => r.id)).toEqual(report.activity.map((e) => e.id))
    })
  })
})
