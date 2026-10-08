import { ME } from '@/infrastructure/seed/mock.js'

/** Collaborators (master order) who have a statement in this report snapshot. */
export const statementLines = (report) =>
  report.lines.filter((l) => l.personId !== ME.id && (l.videos?.length ?? 0) > 0)

/** Print with a temporary document.title so "Save as PDF" gets a sensible filename. */
export function printWithTitle(title, mode) {
  const prev = document.title
  document.title = title
  if (mode) document.body.dataset.print = mode
  window.print()
  document.title = prev
  if (mode) delete document.body.dataset.print
}

const cents = (n) => Math.round((n ?? 0) * 100)

/** A person's due total as of a given revision of this report. */
export function totalAtRevision(report, personId, revision) {
  if (revision === report.revision) return report.lines.find((l) => l.personId === personId)?.amount ?? 0
  return report.history.find((h) => h.revision === revision)?.totals[personId] ?? 0
}

/**
 * "Statement changed — resend": the statement they last received (the one
 * marked sent, or Revision 1 implicitly) no longer matches the current total.
 * Covers changed totals, people who joined on a later revision (0 → X) and
 * people dropped to $0 (X → 0). Revision 1 never needs a resend.
 */
export function needsResend(report, personId) {
  if (personId === ME.id || report.revision <= 1) return false
  const baseline = report.sent?.[personId] ?? 1
  if (baseline >= report.revision) return false
  return cents(totalAtRevision(report, personId, baseline)) !== cents(totalAtRevision(report, personId, report.revision))
}
