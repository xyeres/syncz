import { DEFAULT_PERIOD, MONTHS, TODAY, monthKey } from '@/infrastructure/seed/mock.js'

/** REP-2 helpers. A period key is "YYYY-MM". */
export const CURRENT_MONTH = monthKey(TODAY)
/** Always last month relative to TODAY (Sep 2026). */
export const LATEST_REPORTABLE = DEFAULT_PERIOD

export const isPeriodKey = (key) => /^\d{4}-(0[1-9]|1[0-2])$/.test(key ?? '')
/** The calendar month has fully ended (strictly before the current month). */
export const hasEnded = (key) => isPeriodKey(key) && key < CURRENT_MONTH
/** Ended AND we have revenue data for it. */
export const isReportable = (key) => hasEnded(key) && MONTHS.includes(key)
export const REPORTABLE_MONTHS = MONTHS.filter(isReportable)
