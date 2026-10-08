import { Split } from './split'
import { OWNER_ID } from '../shared/ids'
import {
  ALEX,
  CHANNEL,
  SAM,
  V1,
  V2,
  V3,
  aSplit,
  aSplitInput,
  codesOf,
  expectOk,
  expectRejected,
  share,
} from '../test-fixtures'

const fieldsOf = (split: Split) => ({ name: split.name, videoIds: split.videoIds, shares: split.shares })

describe('Split', () => {
  describe('create', () => {
    it('SPL-1 accepts shares totalling exactly 10000 bps', () => {
      const split = expectOk(Split.create(aSplitInput()))
      expect(split.channelId).toBe(CHANNEL)
      expect(split.name).toBe('Intro series')
      expect(split.videoIds).toEqual([V1, V2])
      expect(split.shares).toEqual([
        { partyId: OWNER_ID, bps: 7000 },
        { partyId: ALEX, bps: 3000 },
      ])
    })

    it('SPL-1 rejects a total of 9990 bps', () => {
      expectRejected(
        Split.create(aSplitInput({ shares: [share(OWNER_ID, 6990), share(ALEX, 3000)] })),
        'SPL-1',
      )
    })

    it('SPL-1 rejects a total of 10010 bps', () => {
      expectRejected(
        Split.create(aSplitInput({ shares: [share(OWNER_ID, 7010), share(ALEX, 3000)] })),
        'SPL-1',
      )
    })

    it('SPL-1 under- and over-allocation give distinct messages', () => {
      const under = expectRejected(
        Split.create(aSplitInput({ shares: [share(OWNER_ID, 6990), share(ALEX, 3000)] })),
        'SPL-1',
      )
      const over = expectRejected(
        Split.create(aSplitInput({ shares: [share(OWNER_ID, 7010), share(ALEX, 3000)] })),
        'SPL-1',
      )
      const msg = (reasons: typeof under) => reasons.find((r) => r.code === 'SPL-1')?.message
      expect(msg(under)).not.toEqual(msg(over))
    })

    it('SPL-2 rejects a fractional share', () => {
      expectRejected(
        Split.create(aSplitInput({ shares: [share(OWNER_ID, 6966.5), share(ALEX, 3033.5)] })),
        'SPL-2',
      )
    })

    it('SPL-3 rejects a collaborator share below 0.10% (9 bps)', () => {
      expectRejected(
        Split.create(aSplitInput({ shares: [share(OWNER_ID, 9991), share(ALEX, 9)] })),
        'SPL-3',
      )
    })

    it('SPL-3 rejects a collaborator share of 0 bps', () => {
      expectRejected(
        Split.create(aSplitInput({ shares: [share(OWNER_ID, 10000), share(ALEX, 0)] })),
        'SPL-3',
      )
    })

    it('SPL-3 accepts a collaborator share of exactly 0.10% (10 bps)', () => {
      const split = expectOk(
        Split.create(aSplitInput({ shares: [share(OWNER_ID, 9990), share(ALEX, 10)] })),
      )
      expect(split.shares).toContainEqual({ partyId: ALEX, bps: 10 })
    })

    it('SPL-4 rejects a split with no owner share', () => {
      expectRejected(Split.create(aSplitInput({ shares: [share(ALEX, 10000)] })), 'SPL-4')
    })

    it('SPL-4 rejects a duplicated owner share', () => {
      expectRejected(
        Split.create(aSplitInput({ shares: [share(OWNER_ID, 5000), share(OWNER_ID, 5000)] })),
        'SPL-4',
      )
    })

    it('SPL-4 accepts an owner at 0 bps (owner gives away 100%)', () => {
      const split = expectOk(
        Split.create(aSplitInput({ shares: [share(OWNER_ID, 0), share(ALEX, 10000)] })),
      )
      expect(split.shares).toContainEqual({ partyId: OWNER_ID, bps: 0 })
    })

    it('SPL-4 rejects an owner at 5 bps (non-zero owner share below 0.10%)', () => {
      const result = Split.create(aSplitInput({ shares: [share(OWNER_ID, 5), share(ALEX, 9995)] }))
      expectRejected(result, 'SPL-4')
      expect(codesOf(result)).toEqual(['SPL-4'])
    })

    it('SPL-5 rejects a duplicate collaborator', () => {
      expectRejected(
        Split.create(
          aSplitInput({ shares: [share(OWNER_ID, 4000), share(ALEX, 3000), share(ALEX, 3000)] }),
        ),
        'SPL-5',
      )
    })

    it('SPL-5 accepts several distinct collaborators', () => {
      const split = expectOk(
        Split.create(
          aSplitInput({ shares: [share(OWNER_ID, 4000), share(ALEX, 3000), share(SAM, 3000)] }),
        ),
      )
      expect(split.shares).toHaveLength(3)
    })

    it('SPL-6 rejects a blank name', () => {
      expectRejected(Split.create(aSplitInput({ name: '' })), 'SPL-6')
    })

    it('SPL-6 rejects a whitespace-only name', () => {
      expectRejected(Split.create(aSplitInput({ name: '   \t ' })), 'SPL-6')
    })

    it('SPL-6 rejects an empty videoIds list', () => {
      expectRejected(Split.create(aSplitInput({ videoIds: [] })), 'SPL-6')
    })

    it('SPL-1/3/6 collects all reasons: blank name + 0-bps share + total ≠ 100% → three codes', () => {
      const result = Split.create(
        aSplitInput({ name: ' ', shares: [share(OWNER_ID, 7000), share(ALEX, 0)] }),
      )
      expectRejected(result, 'SPL-6')
      expectRejected(result, 'SPL-3')
      expectRejected(result, 'SPL-1')
      expect([...codesOf(result)].sort()).toEqual(['SPL-1', 'SPL-3', 'SPL-6'])
    })
  })

  describe('validateDraft', () => {
    it('SPL-1 returns reasons for an incomplete total without failing hard', () => {
      const draft = aSplitInput({ shares: [share(OWNER_ID, 5000), share(ALEX, 3000)] })
      let reasons: ReturnType<typeof Split.validateDraft> = []
      expect(() => {
        reasons = Split.validateDraft(draft)
      }).not.toThrow()
      expect(reasons.map((r) => r.code)).toEqual(['SPL-1'])
    })

    it('SPL-1 returns no reasons for a valid draft', () => {
      expect(Split.validateDraft(aSplitInput())).toEqual([])
    })

    it('SPL-1 gives the same reasons as create for the same input', () => {
      const draft = aSplitInput({ name: '', videoIds: [], shares: [share(ALEX, 9)] })
      const created = Split.create(draft)
      expect(created.ok).toBe(false)
      if (!created.ok) expect(Split.validateDraft(draft)).toEqual(created.reasons)
    })
  })

  describe('revise', () => {
    it('SPL-1 revises name, videos and shares into a new instance', () => {
      const split = aSplit()
      const before = split.toSnapshot()
      const revised = expectOk(
        split.revise({
          name: 'Renamed',
          videoIds: [V3],
          shares: [share(OWNER_ID, 5000), share(ALEX, 2500), share(SAM, 2500)],
        }),
      )
      expect(revised.id).toBe(split.id)
      expect(revised.channelId).toBe(split.channelId)
      expect(revised.name).toBe('Renamed')
      expect(revised.videoIds).toEqual([V3])
      expect(revised.shares).toHaveLength(3)
      expect(split.toSnapshot()).toEqual(before)
    })

    it('SPL-1 revise rejects a total that is not 100% and leaves the split unchanged', () => {
      const split = aSplit()
      const before = split.toSnapshot()
      expectRejected(
        split.revise({ ...fieldsOf(split), shares: [share(OWNER_ID, 7000), share(ALEX, 2000)] }),
        'SPL-1',
      )
      expect(split.toSnapshot()).toEqual(before)
    })

    it('SPL-3 revise rejects a collaborator below 0.10% and leaves the split unchanged', () => {
      const split = aSplit()
      const before = split.toSnapshot()
      expectRejected(
        split.revise({ ...fieldsOf(split), shares: [share(OWNER_ID, 9991), share(ALEX, 9)] }),
        'SPL-3',
      )
      expect(split.toSnapshot()).toEqual(before)
    })

    it('SPL-4 revise cannot remove the owner, and the split is unchanged', () => {
      const split = aSplit()
      const before = split.toSnapshot()
      expectRejected(split.revise({ ...fieldsOf(split), shares: [share(ALEX, 10000)] }), 'SPL-4')
      expect(split.toSnapshot()).toEqual(before)
    })

    it('SPL-5 revise rejects a duplicate collaborator and leaves the split unchanged', () => {
      const split = aSplit()
      const before = split.toSnapshot()
      expectRejected(
        split.revise({
          ...fieldsOf(split),
          shares: [share(OWNER_ID, 4000), share(ALEX, 3000), share(ALEX, 3000)],
        }),
        'SPL-5',
      )
      expect(split.toSnapshot()).toEqual(before)
    })

    it('SPL-6 revise rejects a blank name and empty videos, collecting both, split unchanged', () => {
      const split = aSplit()
      const before = split.toSnapshot()
      const result = split.revise({ ...fieldsOf(split), name: '  ', videoIds: [] })
      const reasons = expectRejected(result, 'SPL-6')
      expect(reasons.filter((r) => r.code === 'SPL-6')).toHaveLength(2)
      expect(split.toSnapshot()).toEqual(before)
    })
  })

  describe('hasParty', () => {
    it('COL-4 reports whether a party holds a share in the split', () => {
      const split = aSplit()
      expect(split.hasParty(OWNER_ID)).toBe(true)
      expect(split.hasParty(ALEX)).toBe(true)
      expect(split.hasParty(SAM)).toBe(false)
    })
  })

  describe('snapshot', () => {
    it('SPL-9 toSnapshot keys are exactly id, channelId, name, videoIds, shares (no effective dating)', () => {
      expect(Object.keys(aSplit().toSnapshot()).sort()).toEqual(
        ['channelId', 'id', 'name', 'shares', 'videoIds'],
      )
    })

    it('SPL-9 round-trips through toSnapshot/fromSnapshot', () => {
      const split = aSplit()
      expect(Split.fromSnapshot(split.toSnapshot()).toSnapshot()).toEqual(split.toSnapshot())
    })

    it('SPL-9 snapshots are plain JSON-serializable data', () => {
      const snapshot = aSplit().toSnapshot()
      expect(JSON.parse(JSON.stringify(snapshot))).toEqual(snapshot)
    })

    it('SPL-1 instances are frozen', () => {
      expect(Object.isFrozen(aSplit())).toBe(true)
    })
  })
})
