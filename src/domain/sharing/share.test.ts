import { Share } from './share'
import { OWNER_ID } from '../shared/ids'
import { FULL, MIN_SHARE, type Bps } from '../shared/numbers'
import { ALEX, expectOk, expectRejected } from '../test-fixtures'

describe('Share', () => {
  it('SPL-2 FULL is 10000 bps and MIN_SHARE is 10 bps', () => {
    expect(FULL).toBe(10000)
    expect(MIN_SHARE).toBe(10)
  })

  it('SPL-2 creates a share from a non-negative integer', () => {
    expect(expectOk(Share.create(ALEX, 3333))).toEqual({ partyId: ALEX, bps: 3333 })
  })

  it.each([0, 10, 10000])('SPL-2 accepts the integer %p', (bps) => {
    expect(expectOk(Share.create(OWNER_ID, bps)).bps).toBe(bps)
  })

  it('SPL-2 rejects a fractional value (33.5)', () => {
    expectRejected(Share.create(ALEX, 33.5), 'SPL-2')
  })

  it('SPL-2 rejects NaN', () => {
    expectRejected(Share.create(ALEX, Number.NaN), 'SPL-2')
  })

  it('SPL-2 rejects a negative value (-10)', () => {
    expectRejected(Share.create(ALEX, -10), 'SPL-2')
  })

  it('SPL-2 rejects Infinity', () => {
    expectRejected(Share.create(ALEX, Number.POSITIVE_INFINITY), 'SPL-2')
  })

  it('SPL-2 a raw number cannot be assigned to Bps without the factory', () => {
    // @ts-expect-error SPL-2: a raw number is not a Bps
    const raw: Bps = 3333
    const viaFactory: Bps = expectOk(Share.create(ALEX, 3333)).bps
    expect(raw).toBe(viaFactory)
  })
})
