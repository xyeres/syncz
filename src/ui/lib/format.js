const usd = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' })
const usd0 = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 })
const compact = new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 })

export const money = (n) => usd.format(n)
export const moneyRound = (n) => usd0.format(n)
export const compactNumber = (n) => compact.format(n)

const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
export const MONTH_LABELS = MONTH_NAMES

export const parsePeriod = (key) => {
  const [y, m] = key.split('-').map(Number)
  return { year: y, month: m }
}
export const toPeriod = (year, month) => `${year}-${String(month).padStart(2, '0')}`

/** "2026-09" → "September 2026" */
export const periodLabel = (key) => {
  const { year, month } = parsePeriod(key)
  return `${MONTH_NAMES[month - 1]} ${year}`
}
/** "2026-09" → "September" */
export const monthName = (key) => MONTH_NAMES[parsePeriod(key).month - 1]
/** "2026-09" → "SEP 26" */
export const periodShort = (key) => {
  const { year, month } = parsePeriod(key)
  return `${MONTH_NAMES[month - 1].slice(0, 3).toUpperCase()} ${String(year).slice(2)}`
}

export const dateLabel = (iso) =>
  new Date(`${iso}T12:00:00`).toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' })

export const pct = (n) => `${Number.isInteger(n) ? n : n.toFixed(1)}%`

/** 3033 → "30.33", 3000 → "30", 3050 → "30.50" (2 decimals only when not whole). */
export const bpsNumber = (bps) => (bps % 100 === 0 ? String(bps / 100) : (bps / 100).toFixed(2))
/** 3033 → "30.33%", 3000 → "30%" */
export const bpsLabel = (bps) => `${bpsNumber(bps)}%`

/** "2026-09-04T10:05:00" → "Sep 4, 2026 · 10:05" */
export const dateTimeLabel = (iso) => {
  const d = new Date(iso)
  const date = d.toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' })
  const time = d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
  return `${date} · ${time}`
}
