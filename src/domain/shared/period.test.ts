import { Period } from './period'
import { expectOk, expectRejected, isoDate, period } from '../test-fixtures'

describe('Period', () => {
  describe('parse', () => {
    it('REP-2 accepts a valid YYYY-MM month', () => {
      expect(expectOk(Period.parse('2026-09'))).toBe('2026-09')
    })

    it.each(['2026-01', '2026-12'])('REP-2 accepts the month boundary %s', (raw) => {
      expect(expectOk(Period.parse(raw))).toBe(raw)
    })

    it('REP-2 rejects month 13 (2026-13)', () => {
      expectRejected(Period.parse('2026-13'), 'REP-2')
    })

    it('REP-2 rejects a two-digit year (26-09)', () => {
      expectRejected(Period.parse('26-09'), 'REP-2')
    })

    it.each(['2026-00', '2026-9', '2026-09-01', '', 'September 2026'])(
      'REP-2 rejects the malformed period "%s"',
      (raw) => {
        expectRejected(Period.parse(raw), 'REP-2')
      },
    )
  })

  describe('isEndedBy', () => {
    const today = isoDate('2026-10-07')

    it('REP-2 last month (2026-09) has ended by 2026-10-07', () => {
      expect(Period.isEndedBy(period('2026-09'), today)).toBe(true)
    })

    it('REP-2 the current month (2026-10) has not ended by 2026-10-07', () => {
      expect(Period.isEndedBy(period('2026-10'), today)).toBe(false)
    })

    it('REP-2 a future month (2026-11) has not ended by 2026-10-07', () => {
      expect(Period.isEndedBy(period('2026-11'), today)).toBe(false)
    })

    it('REP-2 the current month has not ended on its last day', () => {
      expect(Period.isEndedBy(period('2026-10'), isoDate('2026-10-31'))).toBe(false)
    })

    it('REP-2 handles the Jan → Dec rollover (2026-12 has ended by 2027-01-01)', () => {
      expect(Period.isEndedBy(period('2026-12'), isoDate('2027-01-01'))).toBe(true)
      expect(Period.isEndedBy(period('2027-01'), isoDate('2027-01-01'))).toBe(false)
    })
  })

  describe('latestReportable', () => {
    it('REP-2 latest reportable month on 2026-10-07 is 2026-09', () => {
      expect(Period.latestReportable(isoDate('2026-10-07'))).toBe('2026-09')
    })

    it('REP-2 latest reportable month in January rolls back to December of the previous year', () => {
      expect(Period.latestReportable(isoDate('2027-01-15'))).toBe('2026-12')
    })

    it('REP-2 the latest reportable month has always ended by today', () => {
      const today = isoDate('2027-01-15')
      expect(Period.isEndedBy(Period.latestReportable(today), today)).toBe(true)
    })
  })
})
