import { PaymentLedger, type LedgerEntry } from './payment-ledger'
import { ledgerStatus } from './projections'
import { OWNER_ID, ledgerIdOf } from '../shared/ids'
import type { Cents } from '../shared/numbers'
import {
  ALEX,
  ALEX_DUE_R1,
  REPORT_ID,
  aLedger,
  aReport,
  alexDown,
  alexUp,
  entryId,
  expectOk,
  expectRejected,
  jsonClone,
  meta,
  paidLedger,
  recalc,
  settledLedger,
} from './payment-test-fixtures'

const c = (n: number) => n as Cents
const entriesOf = (l: PaymentLedger) => jsonClone(l.entries)
const idOf = (e: LedgerEntry | undefined) => e?.id ?? entryId('missing')

describe('PaymentLedger', () => {
  describe('open', () => {
    it('PAY-1 opens an empty ledger for one collaborator in one report', () => {
      const ledger = PaymentLedger.open(REPORT_ID, ALEX)
      expect(ledger.id).toBe(ledgerIdOf(REPORT_ID, ALEX))
      expect(ledger.reportId).toBe(REPORT_ID)
      expect(ledger.collaboratorId).toBe(ALEX)
      expect(ledger.entries).toEqual([])
      expect(ledger.netPaidCents()).toBe(0)
      expect(ledger.openEntries()).toEqual([])
    })

    it('COL-7 the owner cannot have a ledger (compile time)', () => {
      const compileOnly = () =>
        // @ts-expect-error COL-7: OWNER_ID is not a CollaboratorId
        PaymentLedger.open(REPORT_ID, OWNER_ID)
      expect(typeof compileOnly).toBe('function')
    })
  })

  describe('markPaid', () => {
    it('PAY-6 markPaid(5000) on an empty ledger records exactly 5000', () => {
      const ledger = expectOk(aLedger().markPaid(c(5000), meta(2)))
      expect(ledger.entries).toEqual([{ id: meta(2).id, at: meta(2).at, kind: 'payment', amountCents: 5000 }])
      expect(ledger.netPaidCents()).toBe(5000)
      expect(ledger.balanceCents(c(5000))).toBe(0)
    })

    it('PAY-6 after a 2000 payment, a due of 5000 records exactly 3000', () => {
      const ledger = expectOk(paidLedger(2000).markPaid(c(5000), meta(60)))
      expect(ledger.entries.map((e) => e.amountCents)).toEqual([2000, 3000])
      expect(ledger.netPaidCents()).toBe(5000)
    })

    it('PAY-6 rejects when the balance is 0; the ledger is unchanged', () => {
      const ledger = paidLedger(5000)
      const before = ledger.toSnapshot()
      expectRejected(ledger.markPaid(c(5000), meta(60)), 'PAY-6')
      expect(ledger.toSnapshot()).toEqual(before)
    })

    it('PAY-6 rejects when the balance is negative (overpaid); the ledger is unchanged', () => {
      const ledger = paidLedger(5000)
      const before = ledger.toSnapshot()
      expectRejected(ledger.markPaid(c(3000), meta(60)), 'PAY-6')
      expect(ledger.toSnapshot()).toEqual(before)
    })

    it('PAY-6 rejects a zero due on an empty ledger (nothing to pay)', () => {
      const ledger = aLedger()
      expectRejected(ledger.markPaid(c(0), meta(2)), 'PAY-6')
      expect(ledger.entries).toEqual([])
    })

    it('PAY-2 every payment entry written by markPaid has a positive integer amount', () => {
      let ledger = aLedger()
      for (const [due, n] of [[1, 2], [1199, 3], [1599, 4], [99999, 5]] as const) {
        ledger = expectOk(ledger.markPaid(c(due), meta(n)))
      }
      const payments = ledger.entries.filter((e) => e.kind === 'payment')
      expect(payments).toHaveLength(4)
      for (const p of payments) {
        expect(Number.isInteger(p.amountCents)).toBe(true)
        expect(p.amountCents).toBeGreaterThan(0)
      }
    })

    it('PAY-2 there is no arbitrary-amount payment command (compile time)', () => {
      const ledger = aLedger()
      // @ts-expect-error PAY-2: no recordPayment; markPaid is the only way to pay
      expect(ledger.recordPayment).toBeUndefined()
      const compileOnly = () =>
        // @ts-expect-error PAY-6: markPaid takes no amount, only the due
        ledger.markPaid(c(5000), meta(2), 1000)
      expect(typeof compileOnly).toBe('function')
    })
  })

  describe('PAY-7 overpayment', () => {
    it('PAY-7 a payment above the (now lower) due is allowed and the status is overpaid', () => {
      const report = aReport()
      const ledger = expectOk(aLedger().markPaid(report.dueFor(ALEX), meta(2)))
      const lower = recalc(report, alexDown(), 3)
      expect(lower.dueFor(ALEX)).toBe(799)
      expect(ledger.balanceCents(lower.dueFor(ALEX))).toBe(-400)
      expect(ledgerStatus(lower.dueFor(ALEX), ledger).status).toBe('overpaid')
    })
  })

  describe('PAY-8', () => {
    it('PAY-8 with a lower due, the same ledger shows overpaid and its entries are unchanged', () => {
      const report = aReport()
      const ledger = expectOk(aLedger().markPaid(report.dueFor(ALEX), meta(2)))
      const before = ledger.toSnapshot()
      const lower = recalc(report, alexDown(), 3)
      expect(ledger.toSnapshot()).toEqual(before)
      expect(ledger.entries.map((e) => e.amountCents)).toEqual([ALEX_DUE_R1])
      expect(ledgerStatus(lower.dueFor(ALEX), ledger).status).toBe('overpaid')
    })

    it('PAY-8 with a higher due, the ledger is unchanged and the status is partial', () => {
      const report = aReport()
      const ledger = expectOk(aLedger().markPaid(report.dueFor(ALEX), meta(2)))
      const before = ledger.toSnapshot()
      const higher = recalc(report, alexUp(), 3)
      expect(ledger.toSnapshot()).toEqual(before)
      expect(ledgerStatus(higher.dueFor(ALEX), ledger).status).toBe('partial')
      const topUp = expectOk(ledger.markPaid(higher.dueFor(ALEX), meta(4)))
      expect(topUp.entries.at(-1)?.amountCents).toBe(400)
    })
  })

  describe('recordSettlement', () => {
    it('PAY-9 records exactly the overpaid amount as a negative entry; balance returns to 0, status settled', () => {
      const ledger = expectOk(paidLedger(5000).recordSettlement(c(3000), 2000, meta(60)))
      expect(ledger.entries.at(-1)).toEqual({ id: meta(60).id, at: meta(60).at, kind: 'settlement', amountCents: -2000 })
      expect(ledger.netPaidCents()).toBe(3000)
      expect(ledger.balanceCents(c(3000))).toBe(0)
      expect(ledgerStatus(c(3000), ledger).status).toBe('settled')
    })

    it('PAY-9 the note is optional and stored when given', () => {
      const withNote = expectOk(paidLedger(5000).recordSettlement(c(3000), 2000, meta(60), 'Refunded by bank transfer'))
      expect(withNote.entries.at(-1)?.note).toBe('Refunded by bank transfer')
      const without = expectOk(paidLedger(5000).recordSettlement(c(3000), 2000, meta(60)))
      expect(without.entries.at(-1)).not.toHaveProperty('note')
    })

    it('PAY-9 rejects when the balance is 0; the ledger is unchanged', () => {
      const ledger = paidLedger(5000)
      const before = ledger.toSnapshot()
      expectRejected(ledger.recordSettlement(c(5000), 0, meta(60)), 'PAY-9')
      expectRejected(ledger.recordSettlement(c(5000), 100, meta(60)), 'PAY-9')
      expect(ledger.toSnapshot()).toEqual(before)
    })

    it('PAY-9 rejects when the balance is positive (still owed); the ledger is unchanged', () => {
      const ledger = aLedger()
      expectRejected(ledger.recordSettlement(c(5000), 5000, meta(2)), 'PAY-9')
      expect(ledger.entries).toEqual([])
    })

    it.each([1999, 2001, -2000, 1999.5, 0])(
      'PAY-9 rejects an amount (%p) that is not exactly the overpaid amount; the ledger is unchanged',
      (amount) => {
        const ledger = paidLedger(5000)
        const before = ledger.toSnapshot()
        expectRejected(ledger.recordSettlement(c(3000), amount, meta(60)), 'PAY-9')
        expect(ledger.toSnapshot()).toEqual(before)
      },
    )

    it('PAY-9 a later higher due moves a settled ledger off $0 (partial)', () => {
      const ledger = settledLedger(5000, 3000)
      expect(ledgerStatus(c(3000), ledger).status).toBe('settled')
      expect(ledger.balanceCents(c(3500))).toBe(500)
      expect(ledgerStatus(c(3500), ledger).status).toBe('partial')
    })

    it('PAY-9 a later lower due moves a settled ledger off $0 (overpaid)', () => {
      const ledger = settledLedger(5000, 3000)
      expect(ledger.balanceCents(c(2500))).toBe(-500)
      expect(ledgerStatus(c(2500), ledger).status).toBe('overpaid')
    })
  })

  describe('reverse', () => {
    it('PAY-3 reversing a payment creates −amount with reversesEntryId; net returns to 0', () => {
      const paid = paidLedger(5000)
      const target = idOf(paid.entries[0])
      const reversed = expectOk(paid.reverse(target, meta(60), 'Sent to the wrong account'))
      expect(reversed.entries.at(-1)).toEqual({
        id: meta(60).id,
        at: meta(60).at,
        kind: 'reversal',
        amountCents: -5000,
        reversesEntryId: target,
        note: 'Sent to the wrong account',
      })
      expect(reversed.netPaidCents()).toBe(0)
      expect(reversed.openEntries()).toEqual([])
    })

    it('PAY-3 the note on a reversal is optional', () => {
      const paid = paidLedger(5000)
      const reversed = expectOk(paid.reverse(idOf(paid.entries[0]), meta(60)))
      expect(reversed.entries.at(-1)).not.toHaveProperty('note')
    })

    it('PAY-3 after a reversal the collaborator can be paid again', () => {
      const paid = paidLedger(5000)
      const reversed = expectOk(paid.reverse(idOf(paid.entries[0]), meta(60)))
      const repaid = expectOk(reversed.markPaid(c(5000), meta(61)))
      expect(repaid.netPaidCents()).toBe(5000)
    })

    it('PAY-3 rejects an unknown target; the ledger is unchanged', () => {
      const ledger = paidLedger(5000)
      const before = ledger.toSnapshot()
      expectRejected(ledger.reverse(entryId('nope'), meta(60)), 'PAY-3')
      expect(ledger.toSnapshot()).toEqual(before)
    })

    it('PAY-3 rejects a reversal as the target; the ledger is unchanged', () => {
      const paid = paidLedger(5000)
      const reversed = expectOk(paid.reverse(idOf(paid.entries[0]), meta(60)))
      const before = reversed.toSnapshot()
      expectRejected(reversed.reverse(idOf(reversed.entries[1]), meta(61)), 'PAY-3')
      expect(reversed.toSnapshot()).toEqual(before)
    })

    it('PAY-3 rejects an already-reversed target; the ledger is unchanged', () => {
      const paid = paidLedger(5000)
      const reversed = expectOk(paid.reverse(idOf(paid.entries[0]), meta(60)))
      const before = reversed.toSnapshot()
      expectRejected(reversed.reverse(idOf(paid.entries[0]), meta(61)), 'PAY-3')
      expect(reversed.toSnapshot()).toEqual(before)
    })

    it('PAY-3 reversing a settlement brings back the negative balance', () => {
      const settled = settledLedger(5000, 3000)
      const settlement = settled.entries[1]
      expect(settlement?.kind).toBe('settlement')
      const undone = expectOk(settled.reverse(idOf(settlement), meta(60)))
      expect(undone.entries.at(-1)).toMatchObject({ kind: 'reversal', amountCents: 2000, reversesEntryId: idOf(settlement) })
      expect(undone.balanceCents(c(3000))).toBe(-2000)
      expect(ledgerStatus(c(3000), undone).status).toBe('overpaid')
    })

    it('PAY-4 rejects reversing a payment while a settlement still stands; the ledger is unchanged', () => {
      const settled = settledLedger(5000, 3000)
      const before = settled.toSnapshot()
      expectRejected(settled.reverse(idOf(settled.entries[0]), meta(60)), 'PAY-4')
      expect(settled.toSnapshot()).toEqual(before)
    })

    it('PAY-4 after reversing the settlement, the payment can be reversed', () => {
      const settled = settledLedger(5000, 3000)
      const undone = expectOk(settled.reverse(idOf(settled.entries[1]), meta(60)))
      const zero = expectOk(undone.reverse(idOf(settled.entries[0]), meta(61)))
      expect(zero.netPaidCents()).toBe(0)
    })

    it('PAY-3 only a reversal carries reversesEntryId (compile time)', () => {
      const compileOnly = (): LedgerEntry => ({
        id: meta(2).id,
        at: meta(2).at,
        kind: 'payment',
        amountCents: c(100),
        // @ts-expect-error PAY-3: a payment has no reversesEntryId
        reversesEntryId: meta(1).id,
      })
      expect(typeof compileOnly).toBe('function')
    })
  })

  describe('queries', () => {
    it('PAY-4 netPaidCents sums payments, settlements and reversals; balanceCents = due − net', () => {
      const settled = settledLedger(5000, 3000)
      expect(settled.netPaidCents()).toBe(3000)
      expect(settled.balanceCents(c(3000))).toBe(0)
      expect(settled.balanceCents(c(4000))).toBe(1000)
    })

    it('PAY-3 openEntries lists un-reversed payments and settlements, oldest first (Undo = last)', () => {
      const settled = settledLedger(5000, 3000)
      expect(settled.openEntries().map((e) => e.kind)).toEqual(['payment', 'settlement'])
      const undone = expectOk(settled.reverse(idOf(settled.openEntries().at(-1)), meta(60)))
      expect(undone.openEntries().map((e) => e.kind)).toEqual(['payment'])
      expect(undone.openEntries()[0]).toEqual(settled.entries[0])
    })
  })

  describe('PAY-1 append-only', () => {
    it('PAY-1 every command’s result has the old entries as an unchanged prefix', () => {
      const steps: ((l: PaymentLedger) => PaymentLedger)[] = [
        (l) => expectOk(l.markPaid(c(5000), meta(2))),
        (l) => expectOk(l.recordSettlement(c(3000), 2000, meta(3))),
        (l) => expectOk(l.reverse(idOf(l.entries[1]), meta(4), 'Undo settlement')),
        (l) => expectOk(l.recordSettlement(c(3000), 2000, meta(5))),
      ]
      let ledger = aLedger()
      for (const step of steps) {
        const before = entriesOf(ledger)
        const next = step(ledger)
        expect(next.entries).toHaveLength(before.length + 1)
        expect(jsonClone(next.entries.slice(0, before.length))).toEqual(before)
        expect(entriesOf(ledger)).toEqual(before)
        ledger = next
      }
    })

    it('PAY-1 entries are readonly (compile time) and frozen (runtime)', () => {
      const ledger = paidLedger(5000)
      expect(Object.isFrozen(ledger)).toBe(true)
      expect(Object.isFrozen(ledger.entries)).toBe(true)
      for (const e of ledger.entries) expect(Object.isFrozen(e)).toBe(true)
      expect(() => {
        // @ts-expect-error PAY-1: entries only grow through commands
        ledger.entries.push(ledger.entries[0]!)
      }).toThrow(TypeError)
      expect(ledger.entries).toHaveLength(1)
    })

    it('PAY-1 the ledger has no delete/edit member', () => {
      const ledger = paidLedger(5000)
      // @ts-expect-error PAY-1: entries cannot be deleted
      expect(ledger.delete).toBeUndefined()
      // @ts-expect-error PAY-1: entries cannot be edited
      expect(ledger.editEntry).toBeUndefined()
    })

    it('PAY-1 toSnapshot keys are exactly id, reportId, collaboratorId, entries', () => {
      expect(Object.keys(paidLedger(5000).toSnapshot()).sort()).toEqual(['collaboratorId', 'entries', 'id', 'reportId'])
    })

    it('PAY-1 round-trips through toSnapshot/fromSnapshot, including JSON', () => {
      const ledger = expectOk(settledLedger(5000, 3000).reverse(entryId('entry-51'), meta(60), 'oops'))
      const restored = PaymentLedger.fromSnapshot(jsonClone(ledger.toSnapshot()))
      expect(restored.toSnapshot()).toEqual(ledger.toSnapshot())
      expect(restored.netPaidCents()).toBe(5000)
      expect(Object.isFrozen(restored.entries)).toBe(true)
    })
  })
})
