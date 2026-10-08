import Icon from '@/ui/components/Icon.jsx'
import StatementDoc from '@/ui/components/StatementDoc.jsx'
import { periodLabel } from '@/ui/lib/format.js'
import { needsResend, printWithTitle, statementLines } from '@/ui/lib/statements.js'
import { useApp } from '@/ui/state/context.js'

export default function StatementView({ period, personId }) {
  const { reports, markSent } = useApp()
  const report = reports.find((r) => r.period === period)
  const back = (
    <a href={`#/reports/${period}`} className="link-quiet mono back">
      <Icon name="arrowLeft" size={16} /> {periodLabel(period)} report
    </a>
  )

  if (!report) {
    return (
      <div className="page statement-page">
        <div className="statement-page__bar no-print">{back}</div>
        <div className="empty">
          <p className="empty__title">{periodLabel(period)} hasn’t been generated yet.</p>
          <p className="muted">Statements are created from a generated report.</p>
        </div>
      </div>
    )
  }

  const lines = statementLines(report)
  const index = lines.findIndex((l) => l.personId === personId)
  const line = lines[index]

  if (!line) {
    return (
      <div className="page statement-page">
        <div className="statement-page__bar no-print">{back}</div>
        <div className="empty">
          <p className="empty__title">No statement for this person in {periodLabel(period)}.</p>
        </div>
      </div>
    )
  }

  const prev = lines[index - 1]
  const next = lines[index + 1]
  const resend = needsResend(report, personId)
  const sentRev = report.sent?.[personId]

  return (
    <div className="page statement-page">
      <div className="statement-page__bar no-print">
        {back}
        <nav className="statement-page__nav" aria-label="Other statements">
          {prev ? (
            <a className="btn btn--secondary" href={`#/reports/${period}/c/${prev.personId}`}>
              <Icon name="arrowLeft" size={18} /> {prev.name}
            </a>
          ) : (
            <span />
          )}
          <span className="mono small muted">
            {index + 1} / {lines.length}
          </span>
          {next ? (
            <a className="btn btn--secondary" href={`#/reports/${period}/c/${next.personId}`}>
              {next.name} <Icon name="arrowRight" size={18} />
            </a>
          ) : (
            <span />
          )}
        </nav>
        <button
          type="button"
          className="btn btn--primary btn--xl"
          onClick={() => printWithTitle(`Syncz – Statement – ${line.name} – ${period}`)}
        >
          <Icon name="download" size={24} stroke={2.5} /> Download PDF
        </button>
      </div>

      <div className="statement-page__status no-print">
        {resend ? (
          <>
            <span className="tag mono resend__tag">Statement changed — resend</span>
            <button type="button" className="btn btn--quiet" onClick={() => markSent(period, personId)}>
              Mark Revision {report.revision} as sent
            </button>
          </>
        ) : (
          <span className="mono small muted">
            {sentRev ? `Revision ${sentRev} marked sent` : report.revision === 1 ? 'Revision 1' : 'Up to date'}
          </span>
        )}
      </div>

      <StatementDoc report={report} line={line} />
    </div>
  )
}
