import { FrozenRevenue } from './frozen-revenue'
import type { VideoId } from '../shared/ids'
import type { Cents } from '../shared/numbers'
import {
  V1,
  V2,
  V3,
  aFrozenRevenue,
  aMonthlyRevenue,
  aVideo,
  expectOk,
  expectRejected,
  videosFor,
} from './test-fixtures'

describe('FrozenRevenue', () => {
  describe('freeze', () => {
    it('REP-3 captures per-video cents and the video title', () => {
      const frozen = expectOk(
        FrozenRevenue.freeze(aMonthlyRevenue({ v1: 1001, v2: 0 }), [
          aVideo(V1, 'Launch day'),
          aVideo(V2, 'Behind the scenes'),
        ]),
      )
      expect(frozen.byVideo).toEqual({
        [V1]: { cents: 1001, title: 'Launch day' },
        [V2]: { cents: 0, title: 'Behind the scenes' },
      })
    })

    it('REP-3 leaves out videos with no revenue in the period', () => {
      const frozen = expectOk(
        FrozenRevenue.freeze(aMonthlyRevenue({ v1: 500 }), [aVideo(V1), aVideo(V2), aVideo(V3)]),
      )
      expect(Object.keys(frozen.byVideo)).toEqual([V1])
    })

    it('ACC-2 / REP-3 rejects non-integer cents', () => {
      expectRejected(
        FrozenRevenue.freeze(aMonthlyRevenue({ v1: 100.5 }), videosFor({ v1: 0 })),
        'ACC-2',
      )
    })

    it('ACC-2 / REP-3 rejects negative cents', () => {
      expectRejected(
        FrozenRevenue.freeze(aMonthlyRevenue({ v1: 100, v2: -1 }), videosFor({ v1: 0, v2: 0 })),
        'ACC-2',
      )
    })

    it('ACC-2 / REP-3 rejects NaN cents', () => {
      expectRejected(
        FrozenRevenue.freeze(aMonthlyRevenue({ v1: Number.NaN }), videosFor({ v1: 0 })),
        'ACC-2',
      )
    })

    it('ACC-2 / REP-3 collects a reason for every bad video', () => {
      const reasons = expectRejected(
        FrozenRevenue.freeze(aMonthlyRevenue({ v1: 1.5, v2: -3, v3: 10 }), videosFor({ v1: 0, v2: 0, v3: 0 })),
        'ACC-2',
      )
      expect(reasons.filter((r) => r.code === 'ACC-2')).toHaveLength(2)
    })

    it('REP-3 the result is deeply frozen', () => {
      const frozen = aFrozenRevenue({ v1: 1001, v2: 2999 })
      expect(Object.isFrozen(frozen)).toBe(true)
      expect(Object.isFrozen(frozen.byVideo)).toBe(true)
      for (const entry of Object.values(frozen.byVideo)) expect(Object.isFrozen(entry)).toBe(true)
    })

    it('REP-3 later changes to the input revenue or videos do not reach the frozen copy', () => {
      const revenue = aMonthlyRevenue({ v1: 1001 })
      const videos = [aVideo(V1, 'Original title')]
      const frozen = expectOk(FrozenRevenue.freeze(revenue, videos))
      ;(revenue.byVideo as Record<VideoId, Cents>)[V1] = 5 as Cents
      ;(videos[0] as { title: string }).title = 'Renamed'
      expect(frozen.byVideo[V1]).toEqual({ cents: 1001, title: 'Original title' })
    })
  })

  describe('grossOf', () => {
    it('REP-4 sums every frozen video', () => {
      expect(FrozenRevenue.grossOf(aFrozenRevenue({ v1: 1001, v2: 2999, v3: 101 }))).toBe(4101)
    })

    it('REP-4 is 0 for a month with no revenue', () => {
      expect(FrozenRevenue.grossOf(aFrozenRevenue({}))).toBe(0)
    })
  })
})
