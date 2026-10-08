import { allocate } from './allocate'
import { FrozenRevenue } from './frozen-revenue'
import type { SplitSnapshot } from './snapshots'
import { OWNER_ID, type PartyId } from '../shared/ids'
import {
  ALEX,
  SAM,
  V1,
  V2,
  V3,
  V5,
  aFrozenRevenue,
  aPartySnapshot,
  aSplitSnapshot,
  defaultParties,
  dueOf,
  lineOf,
  sharesOf,
  splitId,
  totalOf,
  videoCentsOf,
} from './test-fixtures'

interface AllocationCase {
  readonly name: string
  readonly revenue: Readonly<Record<string, number>>
  readonly splits: readonly SplitSnapshot[]
  /** Exact cents per party. A party not listed must have no line or a 0¢ line. */
  readonly expected: Readonly<Record<string, number>>
}

const splitA = (shares: SplitSnapshot['shares'], videoIds = [V1, V2]) =>
  aSplitSnapshot({ splitId: splitId('split-a'), name: 'Split A', videoIds, shares })

const CASES: readonly AllocationCase[] = [
  {
    name: '1001¢ at 3333 bps (floor)',
    revenue: { v1: 1001 },
    splits: [splitA(sharesOf([OWNER_ID, 6667], [ALEX, 3333]), [V1])],
    expected: { [OWNER_ID]: 668, [ALEX]: 333 },
  },
  {
    name: 'owner at 0 bps gives away 100%',
    revenue: { v1: 999, v2: 1 },
    splits: [splitA(sharesOf([OWNER_ID, 0], [ALEX, 10000]))],
    expected: { [OWNER_ID]: 0, [ALEX]: 1000 },
  },
  {
    name: 'three-way 3334/3333/3333 on 1000¢',
    revenue: { v1: 1000 },
    splits: [splitA(sharesOf([OWNER_ID, 3334], [ALEX, 3333], [SAM, 3333]), [V1])],
    expected: { [OWNER_ID]: 334, [ALEX]: 333, [SAM]: 333 },
  },
  {
    name: 'three-way 3334/3333/3333 on 1¢ (owner absorbs the cent)',
    revenue: { v1: 1 },
    splits: [splitA(sharesOf([OWNER_ID, 3334], [ALEX, 3333], [SAM, 3333]), [V1])],
    expected: { [OWNER_ID]: 1, [ALEX]: 0, [SAM]: 0 },
  },
  {
    name: 'three-way 3334/3333/3333 on 2¢ (collaborators floor to 0, owner keeps both cents)',
    revenue: { v1: 2 },
    splits: [splitA(sharesOf([OWNER_ID, 3334], [ALEX, 3333], [SAM, 3333]), [V1])],
    expected: { [OWNER_ID]: 2, [ALEX]: 0, [SAM]: 0 },
  },
  {
    name: 'three-way with the owner at 0 bps (0/3334/6666 on 1001¢)',
    revenue: { v1: 1001 },
    splits: [splitA(sharesOf([OWNER_ID, 0], [ALEX, 3334], [SAM, 6666]), [V1])],
    expected: { [OWNER_ID]: 1, [ALEX]: 333, [SAM]: 667 },
  },
  {
    name: 'owner at 0 bps with 5000/5000 on 101¢ (owner keeps the odd cent, never negative)',
    revenue: { v1: 101 },
    splits: [splitA(sharesOf([OWNER_ID, 0], [ALEX, 5000], [SAM, 5000]), [V1])],
    expected: { [OWNER_ID]: 1, [ALEX]: 50, [SAM]: 50 },
  },
  {
    name: 'odd cents on three videos (101¢ × 3 at 5000 bps)',
    revenue: { v1: 101, v2: 101, v3: 101 },
    splits: [splitA(sharesOf([OWNER_ID, 5000], [ALEX, 5000]), [V1, V2, V3])],
    expected: { [OWNER_ID]: 153, [ALEX]: 150 },
  },
  {
    name: 'two splits plus an unsplit video',
    revenue: { v1: 1001, v2: 2999, v3: 101, v4: 500 },
    splits: [
      splitA(sharesOf([OWNER_ID, 7000], [ALEX, 3000]), [V1, V2]),
      aSplitSnapshot({
        splitId: splitId('split-b'),
        name: 'Split B',
        videoIds: [V3],
        shares: sharesOf([OWNER_ID, 5000], [SAM, 5000]),
      }),
    ],
    expected: { [OWNER_ID]: 3352, [ALEX]: 1199, [SAM]: 50 },
  },
]

describe('allocate', () => {
  describe.each(CASES)('$name', ({ revenue, splits, expected }) => {
    const frozen = aFrozenRevenue(revenue)
    const lines = allocate(frozen, splits, defaultParties())

    it('REP-5 gives each party the exact expected cents', () => {
      for (const [partyId, cents] of Object.entries(expected)) {
        expect([partyId, dueOf(lines, partyId as PartyId)]).toEqual([partyId, cents])
      }
      for (const line of lines) {
        expect([line.party.partyId, line.dueCents]).toEqual([
          line.party.partyId,
          expected[line.party.partyId as string] ?? 0,
        ])
      }
    })

    it('REP-5 the owner line is never negative', () => {
      for (const line of lines) {
        if (line.party.partyId === OWNER_ID) expect(line.dueCents).toBeGreaterThanOrEqual(0)
        for (const v of line.videos) expect(v.cents).toBeGreaterThanOrEqual(0)
      }
    })

    it('REP-4 lines sum exactly to the frozen gross', () => {
      expect(totalOf(lines)).toBe(FrozenRevenue.grossOf(frozen))
    })

    it('REP-6 every line’s dueCents equals the sum of its video cents', () => {
      for (const line of lines) expect(line.dueCents).toBe(videoCentsOf(line))
    })

    it('REP-6 every line’s dueCents equals the sum of its split parts', () => {
      for (const line of lines) {
        expect(line.dueCents).toBe(line.parts.reduce((sum, p) => sum + p.cents, 0))
      }
    })

    it('REP-5 amounts are integer cents', () => {
      for (const line of lines) {
        expect(Number.isInteger(line.dueCents)).toBe(true)
        for (const v of line.videos) expect(Number.isInteger(v.cents)).toBe(true)
      }
    })
  })

  it('REP-5 1001¢ at 3333 bps → collaborator 333¢ (floor); the owner absorbs the rest', () => {
    const frozen = aFrozenRevenue({ v1: 1001 })
    const split = splitA(sharesOf([OWNER_ID, 6667], [ALEX, 3333]), [V1])
    const lines = allocate(frozen, [split], defaultParties())

    const alex = lineOf(lines, ALEX)
    expect(alex?.dueCents).toBe(333)
    expect(alex?.videos).toEqual([
      {
        videoId: V1,
        title: `Video ${V1}`,
        revenueCents: 1001,
        bps: 3333,
        cents: 333,
        splitId: split.splitId,
        splitName: 'Split A',
      },
    ])
    expect(alex?.parts).toEqual([{ splitId: split.splitId, splitName: 'Split A', bps: 3333, cents: 333 }])
    expect(dueOf(lines, OWNER_ID)).toBe(668)
  })

  it('REP-5 collaborators round down: owner 0 / 5000 / 5000 on 101¢ → 50 / 50, owner 1¢', () => {
    const frozen = aFrozenRevenue({ v1: 101 })
    const split = splitA(sharesOf([OWNER_ID, 0], [ALEX, 5000], [SAM, 5000]), [V1])
    const lines = allocate(frozen, [split], defaultParties())
    expect(dueOf(lines, ALEX)).toBe(50)
    expect(dueOf(lines, SAM)).toBe(50)
    expect(dueOf(lines, OWNER_ID)).toBe(1)
    expect(lineOf(lines, OWNER_ID)?.videos).toEqual([
      expect.objectContaining({ videoId: V1, bps: 0, cents: 1, revenueCents: 101 }),
    ])
  })

  it('REP-5 the remainder is absorbed per video, not per total', () => {
    // Per video: floor(50.5) = 50 three times → 150. Per total would be floor(151.5) = 151.
    const frozen = aFrozenRevenue({ v1: 101, v2: 101, v3: 101 })
    const split = splitA(sharesOf([OWNER_ID, 5000], [ALEX, 5000]), [V1, V2, V3])
    const lines = allocate(frozen, [split], defaultParties())

    expect(lineOf(lines, ALEX)?.videos.map((v) => v.cents)).toEqual([50, 50, 50])
    expect(lineOf(lines, OWNER_ID)?.videos.map((v) => v.cents)).toEqual([51, 51, 51])
    expect(dueOf(lines, ALEX)).toBe(150)
    expect(dueOf(lines, OWNER_ID)).toBe(153)
  })

  it('REP-6 a SplitPart aggregates the party’s cents for that split', () => {
    const frozen = aFrozenRevenue({ v1: 1001, v2: 2999 })
    const split = splitA(sharesOf([OWNER_ID, 7000], [ALEX, 3000]), [V1, V2])
    const lines = allocate(frozen, [split], defaultParties())
    expect(lineOf(lines, ALEX)?.parts).toEqual([
      { splitId: split.splitId, splitName: 'Split A', bps: 3000, cents: 1199 },
    ])
    expect(lineOf(lines, OWNER_ID)?.parts).toEqual([
      { splitId: split.splitId, splitName: 'Split A', bps: 7000, cents: 2801 },
    ])
  })

  it('REP-8 each line carries the given PartySnapshot', () => {
    const lines = allocate(aFrozenRevenue({ v1: 1000 }), [splitA(sharesOf([OWNER_ID, 7000], [ALEX, 3000]), [V1])], defaultParties())
    expect(lineOf(lines, ALEX)?.party).toEqual(aPartySnapshot(ALEX))
    expect(lineOf(lines, OWNER_ID)?.party).toEqual(aPartySnapshot(OWNER_ID))
  })

  it('REP-4 unsplit videos with revenue go 100% to the owner ("Unsplit videos", splitId null)', () => {
    const frozen = aFrozenRevenue({ v1: 1000, v3: 101, v4: 50 })
    const split = splitA(sharesOf([OWNER_ID, 7000], [ALEX, 3000]), [V1])
    const lines = allocate(frozen, [split], defaultParties())

    const owner = lineOf(lines, OWNER_ID)
    expect(owner?.dueCents).toBe(700 + 101 + 50)
    expect(owner?.parts).toContainEqual({ splitId: null, splitName: 'Unsplit videos', bps: 10000, cents: 151 })
    expect(owner?.videos).toContainEqual({
      videoId: V3,
      title: `Video ${V3}`,
      revenueCents: 101,
      bps: 10000,
      cents: 101,
      splitId: null,
      splitName: 'Unsplit videos',
    })
    expect(lineOf(lines, ALEX)?.videos.map((v) => v.videoId)).toEqual([V1])
  })

  it('REP-4 with no splits, everything goes to the owner', () => {
    const frozen = aFrozenRevenue({ v1: 1000, v2: 1 })
    const lines = allocate(frozen, [], defaultParties())
    expect(lines.map((l) => l.party.partyId)).toEqual([OWNER_ID])
    expect(dueOf(lines, OWNER_ID)).toBe(1001)
  })

  it('REP-4 videos in a split without frozen revenue are skipped', () => {
    const frozen = aFrozenRevenue({ v1: 1000 })
    const split = splitA(sharesOf([OWNER_ID, 5000], [ALEX, 5000]), [V1, V5])
    const lines = allocate(frozen, [split], defaultParties())

    for (const line of lines) expect(line.videos.map((v) => v.videoId)).not.toContain(V5)
    expect(dueOf(lines, ALEX)).toBe(500)
    expect(totalOf(lines)).toBe(1000)
  })

  it('REP-4 a split whose videos have no frozen revenue yields no collaborator money', () => {
    const frozen = aFrozenRevenue({ v1: 1000 })
    const split = splitA(sharesOf([OWNER_ID, 5000], [SAM, 5000]), [V5])
    const lines = allocate(frozen, [split], defaultParties())
    expect(dueOf(lines, SAM)).toBe(0)
    expect(dueOf(lines, OWNER_ID)).toBe(1000)
  })

  it('REP-4 a month with no revenue allocates nothing', () => {
    const lines = allocate(aFrozenRevenue({}), [aSplitSnapshot()], defaultParties())
    expect(totalOf(lines)).toBe(0)
  })

  it('SPL-10 does not mutate its inputs', () => {
    const frozen = aFrozenRevenue({ v1: 1001, v2: 2999 })
    const splits = [aSplitSnapshot()]
    const parties = defaultParties()
    const before = JSON.stringify({ splits, parties })
    allocate(frozen, splits, parties)
    expect(JSON.stringify({ splits, parties })).toBe(before)
  })
})
