import { checkPayable } from './policies'
import type { MonthlyReport } from './monthly-report'
import { OWNER_ID, type CollaboratorId } from '../shared/ids'
import {
  ALEX,
  SAM,
  aReport,
  alexDropped,
  expectOk,
  expectRejected,
  recalc,
} from './payment-test-fixtures'

describe('checkPayable', () => {
  it('PAY-5 rejects a null report (no generated report)', () => {
    expectRejected(checkPayable(null, ALEX), 'PAY-5')
  })

  it('PAY-5 rejects a collaborator never on any revision; the report is unchanged', () => {
    const report = aReport()
    const before = report.toSnapshot()
    expectRejected(checkPayable(report, SAM), 'PAY-5')
    expect(report.toSnapshot()).toEqual(before)
  })

  it('PAY-5 accepts a collaborator on the current revision and returns the report and narrowed CollaboratorId', () => {
    const report = aReport()
    const value = expectOk(checkPayable(report, ALEX))
    const id: CollaboratorId = value.collaboratorId
    expect(id).toBe(ALEX)
    expect(Object.keys(value).sort()).toEqual(['collaboratorId', 'report'])
  })

  it('PAY-5 accepts a collaborator who dropped off in revision 2', () => {
    const r2 = recalc(aReport(), alexDropped(), 2)
    expect(r2.dueFor(ALEX)).toBe(0)
    const value = expectOk(checkPayable(r2, ALEX))
    expect(value.collaboratorId).toBe(ALEX)
    expect(value.report).toBe(r2)
  })

  it('PAY-5 on success returns the same report instance that was passed in', () => {
    const report = aReport()
    const before = report.toSnapshot()
    expect(expectOk(checkPayable(report, ALEX)).report).toBe(report)
    expect(report.toSnapshot()).toEqual(before)
  })

  it('PAY-5 value.report is typed MonthlyReport, never null (compile time)', () => {
    const value = expectOk(checkPayable(aReport(), ALEX))
    const report: MonthlyReport = value.report
    // @ts-expect-error PAY-5: value.report is not nullable, so null is not assignable to its type
    const widened: typeof value.report = null
    expect(report.dueFor(ALEX)).toBeGreaterThan(0)
    expect(widened).toBeNull()
  })

  it('COL-7 rejects OWNER_ID at runtime (the owner is never paid through the app)', () => {
    const report = aReport()
    const before = report.toSnapshot()
    expectRejected(checkPayable(report, OWNER_ID), 'COL-7')
    expect(report.toSnapshot()).toEqual(before)
  })

  it('COL-7 rejects OWNER_ID even when there is no report', () => {
    expectRejected(checkPayable(null, OWNER_ID), 'COL-7')
  })
})
