import { isOwner, type CollaboratorId, type PartyId } from '../shared/ids'
import { fail, ok, type Result } from '../shared/result'
import type { MonthlyReport } from './monthly-report'

/**
 * PAY-5 + COL-7: payments need a generated report that lists the collaborator on any revision
 * (including one who later dropped off). The owner is never paid through the app.
 * On success, returns the (non-null) report and the narrowed CollaboratorId.
 */
export type Payable = Readonly<{ report: MonthlyReport; collaboratorId: CollaboratorId }>

export function checkPayable(report: MonthlyReport | null, partyId: PartyId): Result<Payable> {
  if (isOwner(partyId)) return fail('COL-7', 'The owner is not paid through the app')
  if (report === null) return fail('PAY-5', 'Generate the report for this month before recording payments')
  if (!report.everListed(partyId)) return fail('PAY-5', `${partyId} is not on any revision of this report`)
  return ok({ report, collaboratorId: partyId })
}
