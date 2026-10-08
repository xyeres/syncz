import type { Ports } from './ports'
import { signIn } from './use-cases/channel'
import { addCollaborator, deleteCollaborator, editCollaborator } from './use-cases/collaborators'
import { markPaid, recordSettlement, reversePayment, undoLastEntry } from './use-cases/payments'
import { generateReport, markStatementSent, recalculateReport } from './use-cases/reports'
import { deleteSplit, saveSplit } from './use-cases/splits'

/** The composition of every use case over one set of ports. A plain factory, no DI container. */
export const makeUseCases = (ports: Ports) => ({
  signIn: signIn(ports),
  saveSplit: saveSplit(ports),
  deleteSplit: deleteSplit(ports),
  addCollaborator: addCollaborator(ports),
  editCollaborator: editCollaborator(ports),
  deleteCollaborator: deleteCollaborator(ports),
  generateReport: generateReport(ports),
  recalculateReport: recalculateReport(ports),
  markStatementSent: markStatementSent(ports),
  markPaid: markPaid(ports),
  recordSettlement: recordSettlement(ports),
  reversePayment: reversePayment(ports),
  undoLastEntry: undoLastEntry(ports),
})

export type UseCases = ReturnType<typeof makeUseCases>
