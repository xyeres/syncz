import { ME } from '@/infrastructure/seed/mock.js'

/**
 * Payments are an append-only log: { id, collaboratorId, period, amount,
 * kind: 'payment' | 'reversal' | 'settlement', at, note? }.
 * - payment: > 0 (PAY-2)
 * - settlement: < 0, exactly the overpaid amount (PAY-9)
 * - reversal: cancels the latest un-reversed payment/settlement (PAY-3)
 * Everything else (net paid, balance, status) is derived — money math in cents.
 */
export const toCents = (n) => Math.round(n * 100)
export const fromCents = (c) => c / 100

export const recordsFor = (payments, period, personId) =>
  payments.filter((p) => p.period === period && p.collaboratorId === personId)

/** Payments and settlements that haven't been reversed, oldest first (undo pops the last). */
export function openEntries(records) {
  const stack = []
  for (const r of records) {
    if (r.kind === 'payment' || r.kind === 'settlement') stack.push(r)
    else stack.pop()
  }
  return stack
}

/** due / net paid / balance / status for one collaborator in one report. */
export function ledgerStatus(dueAmount, records) {
  const due = toCents(dueAmount)
  const paid = records.reduce((s, r) => s + toCents(r.amount), 0) // net of reversals + settlements
  const balance = due - paid
  const open = openEntries(records)
  const settled = open.some((r) => r.kind === 'settlement')
  let status
  if (balance === 0 && settled) status = 'settled'
  else if (paid === 0) status = due === 0 ? 'none' : 'unpaid'
  else if (balance === 0) status = 'paid'
  else if (balance > 0) status = 'partial'
  else status = 'overpaid'
  return {
    due: fromCents(due),
    paid: fromCents(paid),
    balance: fromCents(balance),
    status,
    settled,
    lastOpen: open.at(-1) ?? null,
  }
}

/**
 * Ledger rows for a report, with settlement attached to collaborator rows.
 * People with payments but no longer on the snapshot (removed from a split
 * before a recalculation) still appear with due = 0 so overpayment is visible.
 */
export function reportRows(report, payments) {
  const rows = report.lines.map((l) => ({ ...l }))
  const ensure = (personId) => {
    if (personId !== ME.id && !rows.some((r) => r.personId === personId)) {
      rows.push({ personId, amount: 0, parts: [], videos: [], share: 0 })
    }
  }
  for (const p of payments) if (p.period === report.period) ensure(p.collaboratorId)
  // People on the previous revision who dropped off (now $0) stay visible.
  for (const id of Object.keys(report.history?.at(-1)?.totals ?? {})) ensure(id)
  return rows.map((row) =>
    row.personId === ME.id
      ? row
      : { ...row, settle: ledgerStatus(row.amount, recordsFor(payments, report.period, row.personId)) },
  )
}

/** Balance-based totals for a report. */
export function reportTotals(report, payments) {
  let paid = 0
  let outstanding = 0
  let overpaid = 0
  let due = 0
  let retained = 0
  for (const row of reportRows(report, payments)) {
    if (!row.settle) {
      retained += toCents(row.amount)
      continue
    }
    const { settle } = row
    due += toCents(settle.due)
    paid += toCents(settle.paid)
    const bal = toCents(settle.balance)
    if (bal > 0) outstanding += bal
    if (bal < 0) overpaid -= bal
  }
  return {
    due: fromCents(due),
    paid: fromCents(paid),
    outstanding: fromCents(outstanding),
    overpaid: fromCents(overpaid),
    retained: fromCents(retained),
  }
}

export const STATUS_LABEL = {
  none: 'Nothing due',
  unpaid: 'Unpaid',
  paid: 'Paid',
  settled: 'Paid · settled',
  partial: 'Partially paid',
  overpaid: 'Overpaid',
}
