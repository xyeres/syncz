import { checkPayable } from './policies'
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

  it('PAY-5 accepts a collaborator on the current revision and returns the narrowed CollaboratorId', () => {
    const id: CollaboratorId = expectOk(checkPayable(aReport(), ALEX))
    expect(id).toBe(ALEX)
  })

  it('PAY-5 accepts a collaborator who dropped off in revision 2', () => {
    const r2 = recalc(aReport(), alexDropped(), 2)
    expect(r2.dueFor(ALEX)).toBe(0)
    expect(expectOk(checkPayable(r2, ALEX))).toBe(ALEX)
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
