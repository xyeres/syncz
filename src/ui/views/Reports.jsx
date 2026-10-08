import { useState } from 'react'
import Icon from '@/ui/components/Icon.jsx'
import PageHeader from '@/ui/components/PageHeader.jsx'
import PeriodPicker from '@/ui/components/PeriodPicker.jsx'
import { DEFAULT_PERIOD } from '@/infrastructure/seed/mock.js'
import { REPORTABLE_MONTHS } from '@/ui/lib/periods.js'
import { dateLabel, money, monthName, periodLabel } from '@/ui/lib/format.js'
import { reportTotals } from '@/ui/lib/payments.js'
import { navigate } from '@/ui/lib/router.js'
import { useApp } from '@/ui/state/context.js'

export default function Reports() {
  const { reports, payments, generateReport } = useApp()
  const [period, setPeriod] = useState(DEFAULT_PERIOD)
  const exists = reports.some((r) => r.period === period)
  const year = period.slice(0, 4)

  const go = () => {
    if (!exists) generateReport(period)
    navigate(`reports/${period}`)
  }

  return (
    <div className="page">
      <PageHeader
        index="04"
        eyebrow="Ledger"
        title="Reports"
        lede="One statement per month: gross revenue, each person’s share, and what you’ve paid."
      />

      <section className="generator" aria-label="Generate a report">
        <div className="generator__pick">
          <PeriodPicker value={period} onChange={setPeriod} months={REPORTABLE_MONTHS} idPrefix="gen" />
          {period !== DEFAULT_PERIOD && (
            <button type="button" className="btn btn--quiet mono small" onClick={() => setPeriod(DEFAULT_PERIOD)}>
              Reset to last month
            </button>
          )}
        </div>
        <button type="button" className="btn btn--primary btn--xl generator__go" onClick={go}>
          {exists ? 'Open' : 'Generate'} {monthName(period)} {year} report
          <Icon name="arrowRight" size={24} stroke={2.5} />
        </button>
      </section>

      <div className="label mono list-label">Generated · {reports.length}</div>
      {reports.length === 0 ? (
        <div className="empty">
          <p className="empty__title">No reports yet.</p>
        </div>
      ) : (
        <ul className="rlist">
          {reports.map((r) => {
            const { paid, outstanding, overpaid } = reportTotals(r, payments)
            const settled = outstanding === 0 && overpaid === 0
            return (
              <li key={r.id}>
                <a href={`#/reports/${r.period}`} className="rlist__row">
                  <span className="rlist__period">{periodLabel(r.period)}</span>
                  <span className="rlist__cell">
                    <span className="label mono">Gross</span>
                    <span className="mono">{money(r.gross)}</span>
                  </span>
                  <span className="rlist__cell">
                    <span className="label mono">Paid</span>
                    <span className="mono">{money(paid)}</span>
                  </span>
                  <span className="rlist__cell">
                    <span className="label mono">Generated</span>
                    <span className="mono">{dateLabel(r.generatedAt)}</span>
                  </span>
                  <span className="rlist__tags">
                    {settled && <span className="tag tag--ok mono">Settled</span>}
                    {outstanding > 0 && <span className="tag tag--due mono">{money(outstanding)} due</span>}
                    {overpaid > 0 && <span className="tag tag--over mono">Overpaid {money(overpaid)}</span>}
                  </span>
                  <Icon name="arrowRight" size={22} className="rlist__arrow" />
                </a>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
