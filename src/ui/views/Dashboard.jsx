import Icon from '@/ui/components/Icon.jsx'
import { Swatch } from '@/ui/components/Person.jsx'
import { DEFAULT_PERIOD, ME, MONTHS } from '@/infrastructure/seed/mock.js'
import { money, moneyRound, monthName, periodLabel, periodShort } from '@/ui/lib/format.js'
import { computeLedger, revenueFor } from '@/ui/lib/ledger.js'
import { reportRows } from '@/ui/lib/payments.js'
import { navigate } from '@/ui/lib/router.js'
import { useApp } from '@/ui/state/context.js'

export default function Dashboard() {
  const { user, videos, splits, reports, payments, person, generateReport } = useApp()

  const current = reports.find((r) => r.period === DEFAULT_PERIOD)
  const preview = current ?? computeLedger(DEFAULT_PERIOD, videos, splits)
  const month = monthName(DEFAULT_PERIOD)
  const collaboratorLines = preview.lines.filter((l) => l.personId !== ME.id && l.amount > 0)

  // Balance-based: positive balances are owed, negative ones are overpaid.
  const owed = new Map()
  const over = new Map()
  for (const r of reports) {
    for (const row of reportRows(r, payments)) {
      if (!row.settle || row.settle.balance === 0) continue
      const bucket = row.settle.balance > 0 ? owed : over
      const entry = bucket.get(row.personId) ?? { personId: row.personId, cents: 0, periods: [] }
      entry.cents += Math.round(Math.abs(row.settle.balance) * 100)
      entry.periods.push(r.period)
      bucket.set(row.personId, entry)
    }
  }
  const toList = (m) => [...m.values()].map((e) => ({ ...e, amount: e.cents / 100 })).sort((a, b) => b.amount - a.amount)
  const owedList = toList(owed)
  const overList = toList(over)
  const outstanding = owedList.reduce((s, o) => s + o.cents, 0) / 100
  const overpaid = overList.reduce((s, o) => s + o.cents, 0) / 100

  const series = MONTHS.map((m) => ({ m, v: revenueFor(videos, m) }))
  const max = Math.max(...series.map((s) => s.v))
  const assignedCount = new Set(splits.flatMap((s) => s.videoIds)).size

  const primary = () => {
    if (!current) generateReport(DEFAULT_PERIOD)
    navigate(`reports/${DEFAULT_PERIOD}`)
  }

  return (
    <div className="page">
      <header className="page-head page-head--slim">
        <div className="page-head__meta mono">
          <span>01</span>
          <span>Overview</span>
        </div>
        <h1 className="page-head__title">Hi, {user.name.split(' ')[0]}.</h1>
      </header>

      <section className="grid12 ruled dash-top">
        <div className="cell span-8 hero">
          <div className="label mono">{current ? 'Ready' : 'Next up'} · {periodLabel(DEFAULT_PERIOD)}</div>
          <p className="hero__lede">
            {current ? (
              <>Your {month} statement is ready. </>
            ) : (
              <>{month} closed with </>
            )}
            <strong className="mono">{money(preview.gross)}</strong> in gross revenue
            {collaboratorLines.length > 0 && (
              <>
                {' '}— {collaboratorLines.length} collaborators are due{' '}
                <strong className="mono">{money(collaboratorLines.reduce((s, l) => s + l.amount, 0))}</strong>
              </>
            )}
            .
          </p>
          <button type="button" className="btn btn--primary btn--xl" onClick={primary}>
            {current ? `Open ${month} report` : `Generate ${month} report`}
            <Icon name="arrowRight" size={24} stroke={2.5} />
          </button>
        </div>

        <div className="cell span-4 owed">
          <div className="label mono">Outstanding to pay</div>
          <div className="owed__total mono">{money(outstanding)}</div>
          {owedList.length === 0 ? (
            <p className="muted">Everyone is paid up.</p>
          ) : (
            <ul className="owed__list">
              {owedList.map((o) => {
                const p = person(o.personId)
                return (
                  <li key={o.personId}>
                    <a href={`#/reports/${o.periods[o.periods.length - 1]}`} className="owed__row">
                      <Swatch person={p} />
                      <span className="owed__who">
                        <span>{p.name}</span>
                        <span className="mono muted small">{o.periods.map(periodShort).join(' · ')}</span>
                      </span>
                      <span className="mono owed__amt">{money(o.amount)}</span>
                    </a>
                  </li>
                )
              })}
            </ul>
          )}
          {overpaid > 0 && (
            <div className="owed__over">
              <div className="label mono">Overpaid · settle outside Syncz</div>
              <ul className="owed__list">
                {overList.map((o) => {
                  const p = person(o.personId)
                  return (
                    <li key={o.personId}>
                      <a href={`#/reports/${o.periods.at(-1)}`} className="owed__row">
                        <Swatch person={p} />
                        <span className="owed__who">
                          <span>{p.name}</span>
                          <span className="mono muted small">{o.periods.map(periodShort).join(' · ')}</span>
                        </span>
                        <span className="mono owed__amt overnote">{money(o.amount)}</span>
                      </a>
                    </li>
                  )
                })}
              </ul>
            </div>
          )}
        </div>
      </section>

      <section className="grid12 ruled dash-stats">
        <div className="cell span-3 stat">
          <div className="label mono">{periodShort(DEFAULT_PERIOD)} gross</div>
          <div className="stat__num mono">{moneyRound(preview.gross)}</div>
        </div>
        <div className="cell span-3 stat">
          <div className="label mono">Active splits</div>
          <div className="stat__num mono">{splits.length}</div>
        </div>
        <div className="cell span-3 stat">
          <div className="label mono">Videos in splits</div>
          <div className="stat__num mono">
            {assignedCount}
            <span className="muted">/{videos.length}</span>
          </div>
        </div>
        <div className="cell span-3 stat">
          <div className="label mono">Reports</div>
          <div className="stat__num mono">{reports.length}</div>
        </div>
      </section>

      <section className="grid12 ruled">
        <div className="cell span-12 chart-cell">
          <div className="cell__head">
            <div className="label mono">Gross revenue · last {MONTHS.length} months</div>
            <a href="#/reports" className="link-quiet mono">All reports →</a>
          </div>
          <ol className="chart" aria-label="Monthly gross revenue">
            {series.map(({ m, v }) => {
              const done = reports.some((r) => r.period === m)
              return (
                <li key={m} className={`chart__col${m === DEFAULT_PERIOD ? ' is-current' : ''}${done ? ' is-reported' : ''}`}>
                  <span className="chart__val mono">${(v / 1000).toFixed(1)}k</span>
                  <span className="chart__track">
                    <span className="chart__bar" style={{ height: `${(v / max) * 100}%` }} title={`${periodLabel(m)}: ${money(v)}`} />
                  </span>
                  <span className="chart__lbl mono">{periodShort(m)}</span>
                </li>
              )
            })}
          </ol>
          <div className="chart__legend mono small muted">
            <span><i className="lg lg--solid" /> Reported</span>
            <span><i className="lg lg--open" /> Not reported</span>
            <span><i className="lg lg--ready" /> Ready to report</span>
          </div>
        </div>
      </section>
    </div>
  )
}
