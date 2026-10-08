import Icon from '@/ui/components/Icon.jsx'
import PeriodPicker from '@/ui/components/PeriodPicker.jsx'
import { Swatch } from '@/ui/components/Person.jsx'
import StatementDoc from '@/ui/components/StatementDoc.jsx'
import { useState } from 'react'
import { CHANNEL, ME, TODAY } from '@/infrastructure/seed/mock.js'
import { bpsLabel, dateLabel, dateTimeLabel, money, pct, periodLabel } from '@/ui/lib/format.js'
import { computeLedger, frozenVideos } from '@/ui/lib/ledger.js'
import { STATUS_LABEL, reportRows, reportTotals } from '@/ui/lib/payments.js'
import { LATEST_REPORTABLE, REPORTABLE_MONTHS, hasEnded, isPeriodKey, isReportable } from '@/ui/lib/periods.js'
import { navigate } from '@/ui/lib/router.js'
import { needsResend, printWithTitle, statementLines } from '@/ui/lib/statements.js'
import { useApp } from '@/ui/state/context.js'

const sameLedger = (a, b) =>
  a.gross === b.gross &&
  a.lines.length === b.lines.length &&
  a.lines.every((l) => b.lines.some((m) => m.personId === l.personId && m.amount === l.amount))

const statusText = ({ status, balance }) => {
  if (status === 'partial') return `${STATUS_LABEL.partial} · ${money(balance)} due`
  if (status === 'overpaid') return `${STATUS_LABEL.overpaid} · ${money(-balance)}`
  return STATUS_LABEL[status]
}

/** Status + actions for one collaborator row. */
function Settlement({ settle, name, onPay, onUndo, onSettle }) {
  const { status, due, paid, balance, lastOpen } = settle
  const [settling, setSettling] = useState(false)
  const [note, setNote] = useState('')
  const overpaid = -balance

  const submitSettlement = (e) => {
    e.preventDefault()
    if (onSettle(overpaid, note).ok) {
      setSettling(false)
      setNote('')
    }
  }

  return (
    <div className="settle">
      <span className={`tag mono settle__tag settle__tag--${status}`}>
        {(status === 'paid' || status === 'settled') && <Icon name="check" size={14} stroke={3} />}
        {statusText(settle)}
      </span>

      {(status === 'unpaid' || status === 'partial') && (
        <button type="button" className="btn btn--secondary btn--lg settle__pay no-print" onClick={onPay}>
          {status === 'unpaid' ? 'Mark paid' : `Pay ${money(balance)} difference`}
        </button>
      )}

      {status === 'overpaid' && (
        <>
          <p className="settle__over mono" role="note">
            Overpaid {money(overpaid)} — settle outside Syncz
          </p>
          {settling ? (
            <form className="settleform no-print" onSubmit={submitSettlement} aria-label={`Record settlement for ${name}`}>
              <div className="settleform__amount">
                <span className="label mono">Settlement amount</span>
                <output className="mono">{money(overpaid)}</output>
              </div>
              <label className="field">
                <span className="label mono">Note (optional)</span>
                <input
                  className="input"
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="e.g. Repaid via Venmo 10/12"
                  maxLength={120}
                  autoFocus
                />
              </label>
              <div className="settleform__actions">
                <button type="submit" className="btn btn--secondary btn--strong">
                  Record settlement
                </button>
                <button type="button" className="btn btn--quiet" onClick={() => setSettling(false)}>
                  Cancel
                </button>
              </div>
            </form>
          ) : (
            <button type="button" className="btn btn--secondary settle__pay no-print" onClick={() => setSettling(true)}>
              Record settlement
            </button>
          )}
        </>
      )}

      {paid !== 0 && (
        <span className="settle__meta mono">
          {settle.settled ? 'Net paid' : 'Paid'} {money(paid)} of {money(due)}
        </span>
      )}

      {lastOpen && (
        <button
          type="button"
          className="btn btn--quiet settle__undo no-print"
          onClick={onUndo}
          aria-label={`Undo last ${lastOpen.kind} of ${money(Math.abs(lastOpen.amount))} for ${name}`}
        >
          Undo last {lastOpen.kind} ({money(Math.abs(lastOpen.amount))})
        </button>
      )}
    </div>
  )
}

function ActivityLog({ events, person }) {
  if (events.length === 0) return null
  return (
    <section className="activity no-print" aria-label="Activity">
      <div className="activity__head">
        <span className="label mono">Activity · {events.length}</span>
        <span className="mono small muted">Append-only — entries are never edited or removed</span>
      </div>
      <ol className="activity__list">
        {events.map((ev) => {
          const who = ev.personId ? (ev.name ?? person(ev.personId).name) : null
          let title
          let detail
          let amount = null
          if (ev.type === 'generated') {
            title = `Report generated · Revision ${ev.revision ?? 1}`
            detail = `Gross ${money(ev.gross)}`
            amount = ev.gross
          } else if (ev.type === 'recalculated') {
            title = `Recalculated → Revision ${ev.revision}`
            detail = (
              <>
                Gross {money(ev.oldGross)} → {money(ev.newGross)}
                {ev.changes.length === 0 ? (
                  <span className="activity__sub">No collaborator amounts changed</span>
                ) : (
                  ev.changes.map((c) => (
                    <span key={c.personId} className="activity__sub">
                      {c.name ?? person(c.personId).name}: {money(c.from)} → {money(c.to)}
                    </span>
                  ))
                )}
              </>
            )
            amount = Math.round((ev.newGross - ev.oldGross) * 100) / 100
          } else if (ev.type === 'payment') {
            title = 'Payment recorded'
            detail = (
              <>
                {who}
                {ev.note && <span className="activity__sub">“{ev.note}”</span>}
              </>
            )
            amount = ev.amount
          } else if (ev.type === 'settlement') {
            title = 'Settlement recorded'
            detail = (
              <>
                Settlement recorded for {who}: {money(ev.amount)}
                {ev.note && <span className="activity__sub">“{ev.note}”</span>}
              </>
            )
            amount = -ev.amount
          } else if (ev.type === 'sent') {
            title = 'Statement sent'
            detail = `Statement rev ${ev.revision} marked sent to ${who}`
          } else {
            title = ev.reversedKind === 'settlement' ? 'Settlement reversed' : 'Payment reversed'
            detail = (
              <>
                {who}
                {ev.note && <span className="activity__sub">“{ev.note}”</span>}
              </>
            )
            amount = ev.amount
          }
          const signed = ev.type === 'payment' || ev.type === 'reversal' || ev.type === 'recalculated' || ev.type === 'settlement'
          return (
            <li key={ev.id} className={`activity__row activity__row--${ev.type}`}>
              <span className="mono activity__at">{dateTimeLabel(ev.at)}</span>
              <span className="activity__title">{title}</span>
              <span className="activity__detail mono">{detail}</span>
              <span className="mono activity__amt">
                {amount === null
                  ? ''
                  : ev.type === 'recalculated' && amount === 0
                  ? 'No change'
                  : `${signed && amount > 0 ? '+' : ''}${amount < 0 ? '−' + money(-amount) : money(amount)}`}
              </span>
            </li>
          )
        })}
      </ol>
    </section>
  )
}

export default function ReportView({ period }) {
  const {
    reports,
    payments,
    activity,
    videos,
    splits,
    person,
    generateReport,
    recalculateReport,
    markPaid,
    markSent,
    undoEntry,
    recordSettlement,
  } = useApp()

  // REP-2: only fully-ended months with data can have a report.
  if (!isReportable(period)) {
    const notEnded = isPeriodKey(period) && !hasEnded(period)
    return (
      <div className="page">
        <div className="report__back no-print">
          <a href="#/reports" className="link-quiet mono back">
            <Icon name="arrowLeft" size={16} /> All reports
          </a>
        </div>
        <div className="empty empty--notice">
          <p className="empty__title">
            {!isPeriodKey(period)
              ? 'That isn’t a valid month.'
              : notEnded
                ? `${periodLabel(period)} hasn’t ended yet.`
                : `There’s no revenue data for ${periodLabel(period)}.`}
          </p>
          <p className="empty__body">
            The latest reportable month is <strong>{periodLabel(LATEST_REPORTABLE)}</strong>.
          </p>
          <a href={`#/reports/${LATEST_REPORTABLE}`} className="btn btn--secondary btn--lg">
            Go to {periodLabel(LATEST_REPORTABLE)} <Icon name="arrowRight" size={18} />
          </a>
        </div>
      </div>
    )
  }

  const report = reports.find((r) => r.period === period)
  // Generated reports compare against their frozen revenue (REP-3); drafts use live revenue.
  const live = computeLedger(period, report ? frozenVideos(videos, period, report.frozenRevenue) : videos, splits)
  const ledger = report ?? live
  const generated = Boolean(report)
  const stale = generated && !sameLedger(report, live)

  const rows = generated ? reportRows(report, payments) : live.lines
  const totals = generated ? reportTotals(report, payments) : null
  const settledRatio = totals && totals.due > 0 ? (totals.due - totals.outstanding) / totals.due : 1
  const earningVideos = report
    ? Object.values(report.frozenRevenue).filter((c) => c > 0).length
    : videos.filter((v) => (v.revenue[period] ?? 0) > 0).length
  const events = activity.filter((e) => e.period === period)

  return (
    <div className="page report">
      <div className="report__back no-print">
        <a href="#/reports" className="link-quiet mono back">
          <Icon name="arrowLeft" size={16} /> All reports
        </a>
      </div>

      {/* Print-only statement masthead */}
      <header className="print-only print-mast">
        <div>
          <strong>SYNCZ — Revenue split statement</strong>
          <div>
            {CHANNEL.name} ({CHANNEL.handle}) · Channel ID {CHANNEL.id}
          </div>
        </div>
        <div className="print-mast__right">
          <div>Period: {periodLabel(period)}</div>
          <div>Generated: {generated ? dateLabel(report.generatedAt.slice(0, 10)) : 'Draft'}</div>
          {report && (
            <div>
              Revision {report.revision} · Issued {dateLabel(report.issuedAt.slice(0, 10))}
            </div>
          )}
          <div>Printed: {dateLabel(TODAY.toISOString().slice(0, 10))}</div>
        </div>
      </header>

      <section className="report-head">
        <div className="report-head__period">
          <div className="label mono no-print">Period</div>
          <div className="no-print">
            <PeriodPicker value={period} onChange={(p) => navigate(`reports/${p}`)} months={REPORTABLE_MONTHS} idPrefix="rep" />
          </div>
          <h1 className="print-only print-title">{periodLabel(period)}</h1>
        </div>
        <div className="report-head__action no-print">
          {generated ? (
            <button
              type="button"
              className="btn btn--primary btn--xl"
              onClick={() => printWithTitle(`Syncz – Report – ${CHANNEL.name} – ${period}`)}
            >
              <Icon name="download" size={24} stroke={2.5} /> Download PDF
            </button>
          ) : (
            <button type="button" className="btn btn--primary btn--xl" onClick={() => generateReport(period)}>
              Generate report <Icon name="arrowRight" size={24} stroke={2.5} />
            </button>
          )}
          <span className="mono small muted">
            {generated
              ? `Revision ${report.revision} · Issued ${dateLabel(report.issuedAt.slice(0, 10))}${
                  report.revision > 1 ? ` · first generated ${dateLabel(report.generatedAt.slice(0, 10))}` : ''
                }`
              : 'Draft preview — not saved yet'}
          </span>
          {generated && statementLines(report).length > 0 && (
            <button
              type="button"
              className="btn btn--quiet mono small"
              onClick={() => printWithTitle(`Syncz – Statements – ${CHANNEL.name} – ${period}`, 'statements')}
            >
              Download all statements ({statementLines(report).length})
            </button>
          )}
        </div>
      </section>

      {stale && (
        <div className="notice no-print" role="status">
          <span>Splits changed since this report was generated. Recalculating updates what’s due; payments stay as recorded.</span>
          <button type="button" className="btn btn--secondary" onClick={() => recalculateReport(period)}>
            <Icon name="refresh" size={18} /> Recalculate
          </button>
        </div>
      )}

      <section className="gross">
        <div className="label mono">Gross revenue · {periodLabel(period)}</div>
        <div className="gross__num mono">{money(ledger.gross)}</div>
        <div className="gross__meta mono">
          <span>{earningVideos} earning videos</span>
          <span>{splits.length} splits</span>
          <span>{ledger.lines.length} payees</span>
        </div>
      </section>

      {totals && (
        <section className={`paysum${totals.overpaid > 0 ? ' paysum--4' : ''}`} aria-label="Payout progress">
          <div className="paysum__cell">
            <span className="label mono">Paid</span>
            <span className="mono paysum__num">{money(totals.paid)}</span>
          </div>
          <div className="paysum__cell">
            <span className="label mono">Outstanding</span>
            <span className={`mono paysum__num${totals.outstanding > 0 ? ' is-owed' : ''}`}>{money(totals.outstanding)}</span>
          </div>
          {totals.overpaid > 0 && (
            <div className="paysum__cell">
              <span className="label mono">Overpaid</span>
              <span className="mono paysum__num is-over">{money(totals.overpaid)}</span>
            </div>
          )}
          <div className="paysum__cell">
            <span className="label mono">Retained by you</span>
            <span className="mono paysum__num">{money(totals.retained)}</span>
          </div>
          <div className="paysum__progress no-print" aria-hidden="true">
            <span style={{ width: `${settledRatio * 100}%` }} />
          </div>
        </section>
      )}

      <section className="ledger" aria-label="Ledger">
        <div className="ledger__row ledger__row--head mono">
          <span>Payee</span>
          <span>Split</span>
          <span className="num">Earned</span>
          <span className="num">Status</span>
        </div>
        {rows.map((line) => {
          // Prefer the identity frozen in the snapshot; fall back to live data (drafts).
          const current = person(line.personId)
          const p = line.name ? { ...current, ...line } : { ...current, name: line.personId === ME.id ? current.fullName : current.name }
          const isMe = line.personId === ME.id
          const hasStatement = generated && !isMe && (line.videos?.length ?? 0) > 0
          const resend = generated && needsResend(report, line.personId)
          const settle = line.settle
          const isPaid = settle?.status === 'paid' || settle?.status === 'settled'
          return (
            <div
              key={line.personId}
              className={`ledger__row${isPaid ? ' is-paid' : ''}${settle?.status === 'overpaid' ? ' is-over' : ''}`}
              style={{ '--c': p.color }}
            >
              <span className="ledger__who">
                <Swatch person={p} size="xl" />
                <span>
                  <strong>{isMe ? `${p.name} (you)` : p.name}</strong>
                  <span className="mono muted small">{p.role}</span>
                  {hasStatement && (
                    <a className="btn btn--secondary btn--sm ledger__stmt no-print" href={`#/reports/${period}/c/${line.personId}`}>
                      Statement <Icon name="arrowRight" size={16} />
                    </a>
                  )}
                  {resend && (
                    <span className="resend no-print">
                      <span className="tag mono resend__tag">Statement changed — resend</span>
                      <button type="button" className="btn btn--quiet resend__btn" onClick={() => markSent(period, line.personId)}>
                        Mark sent (rev {report.revision})
                      </button>
                    </span>
                  )}
                </span>
              </span>
              <span className="ledger__split">
                <span className="ledger__pct mono">{pct(Math.round(line.share * 10) / 10)}</span>
                <span className="ledger__parts">
                  {line.parts.length === 0 && <span className="mono muted">No longer in a split</span>}
                  {line.parts.map((part) => (
                    <span key={part.splitId ?? 'unsplit'} className="ledger__part mono">
                      <span className="ledger__part-name">{part.splitName}</span>
                      <span>{bpsLabel(part.bps)}</span>
                      <span>{money(part.amount)}</span>
                    </span>
                  ))}
                </span>
              </span>
              <span className="ledger__amt mono num">{money(line.amount)}</span>
              <span className="ledger__status num">
                {isMe ? (
                  <span className="mono small muted">Retained</span>
                ) : settle ? (
                  <Settlement
                    settle={settle}
                    name={p.name}
                    onPay={() => markPaid(period, line.personId)}
                    onUndo={() => undoEntry(period, line.personId)}
                    onSettle={(amount, note) => recordSettlement(period, line.personId, amount, note)}
                  />
                ) : (
                  <span className="mono small muted">Generate to track</span>
                )}
              </span>
            </div>
          )
        })}
        <div className="ledger__row ledger__row--total mono">
          <span>Total</span>
          <span>100%</span>
          <span className="num">{money(ledger.lines.reduce((s, l) => s + l.amount, 0))}</span>
          <span />
        </div>
      </section>

      <p className="report__fine mono small muted">
        Syncz tracks payouts only — no money moves through Syncz. Revenue for videos outside any split is retained by the
        channel owner. Overpayments are not carried into later months.
      </p>

      <ActivityLog events={events} person={person} />

      {generated && (
        <div className="print-bundle" aria-hidden="true">
          {statementLines(report).map((line) => (
            <StatementDoc key={line.personId} report={report} line={line} />
          ))}
        </div>
      )}
    </div>
  )
}
