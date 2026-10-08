import { MONTH_LABELS, parsePeriod, toPeriod } from '@/ui/lib/format.js'
import Icon from './Icon.jsx'

/**
 * Two large joined dropdowns (Month | Year). Only `months` (reportable: ended,
 * with data — REP-2) are selectable; the current and future months show as
 * disabled. Years without any eligible month aren't offered at all, and
 * switching year clamps to that year's latest eligible month.
 */
export default function PeriodPicker({ value, onChange, months, size = 'lg', idPrefix = 'period' }) {
  const { year, month } = parsePeriod(value)
  const available = new Set(months)
  const years = [...new Set(months.map((m) => parsePeriod(m).year))].sort((a, b) => b - a)

  const changeYear = (y) => {
    if (available.has(toPeriod(y, month))) return onChange(toPeriod(y, month))
    const inYear = months.filter((m) => parsePeriod(m).year === y)
    if (inYear.length) onChange(inYear[inYear.length - 1])
  }

  return (
    <div className={`period period--${size}`} role="group" aria-label="Report period">
      <label className="period__cell period__cell--month" htmlFor={`${idPrefix}-month`}>
        <span className="label mono">Month</span>
        <select id={`${idPrefix}-month`} value={month} onChange={(e) => onChange(toPeriod(year, Number(e.target.value)))}>
          {MONTH_LABELS.map((name, i) => (
            <option key={name} value={i + 1} disabled={!available.has(toPeriod(year, i + 1))}>
              {name}
            </option>
          ))}
        </select>
        <Icon name="chevronDown" className="period__chev" size={22} />
      </label>
      <label className="period__cell period__cell--year" htmlFor={`${idPrefix}-year`}>
        <span className="label mono">Year</span>
        <select id={`${idPrefix}-year`} value={year} onChange={(e) => changeYear(Number(e.target.value))}>
          {years.map((y) => (
            <option key={y} value={y}>
              {y}
            </option>
          ))}
        </select>
        <Icon name="chevronDown" className="period__chev" size={22} />
      </label>
    </div>
  )
}
