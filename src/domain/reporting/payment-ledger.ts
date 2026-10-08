import { ledgerIdOf, type CollaboratorId, type EntryId, type LedgerId, type ReportId } from '../shared/ids'
import type { Meta } from '../shared/meta'
import type { Cents, IsoDateTime } from '../shared/numbers'
import { copyData, deepFreeze } from '../shared/plain-data'
import { fail, ok, type Result } from '../shared/result'

type EntryBase = Readonly<{ id: EntryId; at: IsoDateTime; note?: string }>

export type PaymentEntry = EntryBase & Readonly<{ kind: 'payment'; amountCents: Cents }>
export type SettlementEntry = EntryBase & Readonly<{ kind: 'settlement'; amountCents: Cents }>
export type ReversalEntry = EntryBase &
  Readonly<{ kind: 'reversal'; amountCents: Cents; reversesEntryId: EntryId }>

/** An append-only money entry (PAY-1/2/3/9). Only a reversal carries `reversesEntryId`. */
export type LedgerEntry = PaymentEntry | SettlementEntry | ReversalEntry
/** An entry that can be reversed ("Undo"). */
export type OpenEntry = PaymentEntry | SettlementEntry

export type PaymentLedgerSnapshot = Readonly<{
  id: LedgerId
  reportId: ReportId
  collaboratorId: CollaboratorId
  entries: readonly LedgerEntry[]
}>

/** `{ note }` when a note is given, otherwise no `note` key at all. */
const noteField = (note: string | undefined): { note?: string } => (note === undefined ? {} : { note })

const sumAmounts = (entries: readonly LedgerEntry[]): Cents =>
  entries.reduce((sum, e) => sum + e.amountCents, 0) as Cents

const reversedIds = (entries: readonly LedgerEntry[]): ReadonlySet<EntryId> =>
  new Set(entries.flatMap((e) => (e.kind === 'reversal' ? [e.reversesEntryId] : [])))

/** PAY-3: the target must exist, be a payment or settlement, and not be reversed yet. */
function findReversible(entries: readonly LedgerEntry[], targetId: EntryId): Result<OpenEntry> {
  const target = entries.find((e) => e.id === targetId)
  if (!target) return fail('PAY-3', `There is no entry ${targetId} to reverse`)
  if (target.kind === 'reversal') return fail('PAY-3', 'A reversal cannot itself be reversed')
  if (reversedIds(entries).has(targetId)) return fail('PAY-3', 'This entry has already been reversed')
  return ok(target)
}

/** PAY-9: a settlement needs an overpaid balance and must be exactly the overpaid amount. */
function checkSettlement(balance: Cents, amountCents: number): Result<void> {
  if (balance >= 0) return fail('PAY-9', 'Nothing is overpaid, so there is nothing to settle')
  if (amountCents !== -balance) {
    return fail('PAY-9', `A settlement must be exactly the overpaid amount (${-balance}¢)`)
  }
  return ok(undefined)
}

/**
 * Append-only money entries for one collaborator in one report (PAY-1…4, 6, 7, 9).
 * There is no edit or delete; corrections are reversals.
 */
export class PaymentLedger {
  private constructor(
    readonly id: LedgerId,
    readonly reportId: ReportId,
    readonly collaboratorId: CollaboratorId,
    readonly entries: readonly LedgerEntry[],
  ) {
    deepFreeze(entries)
    Object.freeze(this)
  }

  static open(reportId: ReportId, collaboratorId: CollaboratorId): PaymentLedger {
    return new PaymentLedger(ledgerIdOf(reportId, collaboratorId), reportId, collaboratorId, [])
  }

  static fromSnapshot(s: PaymentLedgerSnapshot): PaymentLedger {
    const c = copyData(s)
    return new PaymentLedger(c.id, c.reportId, c.collaboratorId, c.entries)
  }

  /** Net paid: payments, settlements and reversals together. */
  netPaidCents(): Cents {
    return sumAmounts(this.entries)
  }

  /** due − net paid: positive is still owed, negative is overpaid. */
  balanceCents(dueCents: Cents): Cents {
    return (dueCents - this.netPaidCents()) as Cents
  }

  /** Un-reversed payments and settlements, oldest first. "Undo" reverses the last one. */
  openEntries(): readonly OpenEntry[] {
    const reversed = reversedIds(this.entries)
    return this.entries.filter((e): e is OpenEntry => e.kind !== 'reversal' && !reversed.has(e.id))
  }

  /** PAY-2/6: pays exactly the outstanding balance, and only when it is positive. */
  markPaid(dueCents: Cents, meta: Meta): Result<PaymentLedger> {
    const balance = this.balanceCents(dueCents)
    if (balance <= 0) return fail('PAY-6', 'Nothing is owed, so there is nothing to pay')
    return this.append({ id: meta.id, at: meta.at, kind: 'payment', amountCents: balance })
  }

  /** PAY-9: records money returned by the collaborator, stored as a negative entry. */
  recordSettlement(dueCents: Cents, amountCents: number, meta: Meta, note?: string): Result<PaymentLedger> {
    const settlement = checkSettlement(this.balanceCents(dueCents), amountCents)
    if (!settlement.ok) return settlement
    return this.append({
      id: meta.id,
      at: meta.at,
      kind: 'settlement',
      amountCents: -amountCents as Cents,
      ...noteField(note),
    })
  }

  /** PAY-3: cancels one payment or settlement with an entry of the opposite amount. */
  reverse(targetId: EntryId, meta: Meta, note?: string): Result<PaymentLedger> {
    const target = findReversible(this.entries, targetId)
    if (!target.ok) return target
    return this.append({
      id: meta.id,
      at: meta.at,
      kind: 'reversal',
      amountCents: -target.value.amountCents as Cents,
      reversesEntryId: target.value.id,
      ...noteField(note),
    })
  }

  toSnapshot(): PaymentLedgerSnapshot {
    const { id, reportId, collaboratorId, entries } = this
    return { id, reportId, collaboratorId, entries }
  }

  /** PAY-1 append-only, PAY-4 net paid never goes below 0. */
  private append(entry: LedgerEntry): Result<PaymentLedger> {
    if (this.netPaidCents() + entry.amountCents < 0) {
      return fail('PAY-4', 'This would make the net amount paid negative')
    }
    return ok(new PaymentLedger(this.id, this.reportId, this.collaboratorId, [...this.entries, entry]))
  }
}
