import type { Brand } from './ids'
import type { IsoDate } from './numbers'
import { fail, ok, type Result } from './result'

/** A calendar month, "YYYY-MM" (REP-2). */
export type Period = Brand<string, 'Period'>

const PERIOD_RE = /^\d{4}-(0[1-9]|1[0-2])$/

const parse = (raw: string): Result<Period> =>
  PERIOD_RE.test(raw)
    ? ok(raw as Period)
    : fail('REP-2', `"${raw}" is not a valid month; use YYYY-MM`)

const monthOf = (today: IsoDate): string => today.slice(0, 7)

/** The month has fully ended: it is strictly before the month containing `today`. */
const isEndedBy = (period: Period, today: IsoDate): boolean => period < monthOf(today)

/** Always last month relative to `today`. */
const latestReportable = (today: IsoDate): Period => {
  const year = Number(today.slice(0, 4))
  const month = Number(today.slice(5, 7))
  const [y, m] = month === 1 ? [year - 1, 12] : [year, month - 1]
  return `${String(y).padStart(4, '0')}-${String(m).padStart(2, '0')}` as Period
}

export const Period = { parse, isEndedBy, latestReportable }
