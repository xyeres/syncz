import { ledgerIdOf, type CollaboratorId, type EntryId, type PartyId, type ReportId } from '../../domain/shared/ids'
import type { Cents } from '../../domain/shared/numbers'
import { fail, ok, type Result } from '../../domain/shared/result'
import type { MonthlyReport } from '../../domain/reporting/monthly-report'
import { PaymentLedger } from '../../domain/reporting/payment-ledger'
import { checkPayable } from '../../domain/reporting/policies'
import type { Ports } from '../ports'
import { andThen, metaOf, saved } from './support'

export type PaymentTarget = Readonly<{ reportId: ReportId; partyId: PartyId }>

type Payable = Readonly<{ report: MonthlyReport; collaboratorId: CollaboratorId; ledger: PaymentLedger }>

/** PAY-5 + COL-7 via checkPayable, then the collaborator's ledger for the report (opened on first use). */
async function payable({ repos }: Ports, { reportId, partyId }: PaymentTarget): Promise<Result<Payable>> {
  const report = await repos.reports.findById(reportId)
  return andThen(checkPayable(report, partyId), async (collaboratorId) => {
    const ledger = await repos.ledgers.findById(ledgerIdOf(reportId, collaboratorId))
    return ok({
      report: report as MonthlyReport, // checkPayable rejected a null report
      collaboratorId,
      ledger: ledger ?? PaymentLedger.open(reportId, collaboratorId),
    })
  })
}

/** Runs one ledger command for a payable collaborator and saves the ledger on success. */
const withLedger =
  <C extends PaymentTarget>(command: (p: Payable, cmd: C, ports: Ports) => Result<PaymentLedger>) =>
  (ports: Ports) =>
  (cmd: C): Promise<Result<PaymentLedger>> =>
    andThen(payable(ports, cmd), (p) =>
      andThen(command(p, cmd, ports), (l) => saved((x: PaymentLedger) => ports.repos.ledgers.save(x), l)),
    )

const dueOf = ({ report, collaboratorId }: Payable): Cents => report.dueFor(collaboratorId)

/** PAY-6: pays exactly the outstanding balance of the current revision. */
export const markPaid = withLedger<PaymentTarget>((p, _cmd, ports) => p.ledger.markPaid(dueOf(p), metaOf(ports, 'pay')))

export type SettlementCommand = PaymentTarget & Readonly<{ amountCents: number; note?: string }>

/** PAY-9: records an overpayment returned by the collaborator. */
export const recordSettlement = withLedger<SettlementCommand>((p, cmd, ports) =>
  p.ledger.recordSettlement(dueOf(p), cmd.amountCents, metaOf(ports, 'set'), cmd.note),
)

export type ReverseCommand = PaymentTarget & Readonly<{ entryId: EntryId; note?: string }>

/** PAY-3: reverses one payment or settlement. */
export const reversePayment = withLedger<ReverseCommand>((p, cmd, ports) =>
  p.ledger.reverse(cmd.entryId, metaOf(ports, 'rev'), cmd.note),
)

export type UndoCommand = PaymentTarget & Readonly<{ note?: string }>

/** Convenience: reverses the latest open entry ("Undo"). */
export const undoLastEntry = withLedger<UndoCommand>((p, cmd, ports) => {
  const last = p.ledger.openEntries().at(-1)
  if (!last) return fail('PAY-3', 'There is no payment or settlement to undo')
  return p.ledger.reverse(last.id, metaOf(ports, 'rev'), cmd.note)
})
