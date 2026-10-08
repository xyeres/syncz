/**
 * Reporting test builders. Imports only from shared/, channel/ and reporting/:
 * the Reporting context never imports revenue-sharing/ (docs/domain-design.md §1, §5),
 * so SplitSnapshots and PartySnapshots are built here as plain data.
 */
import { OWNER_ID, type PartyId, type VideoId } from '../shared/ids'
import type { Cents } from '../shared/numbers'
import type { MonthlyRevenue, Video } from '../channel/video'
import { FrozenRevenue } from './frozen-revenue'
import { MonthlyReport, type GenerateInput } from './monthly-report'
import type { AllocationLine, PartySnapshot, SplitSnapshot } from './snapshots'
import {
  ALEX,
  CHANNEL,
  JO,
  SAM,
  V1,
  V2,
  bps,
  expectOk,
  isoDate,
  meta,
  period,
  reportId,
  splitId,
  videoId,
} from '../shared/test-fixtures'

export * from '../shared/test-fixtures'

export const V4 = videoId('v4')
export const V5 = videoId('v5')

/** "Today" for every reporting test: the latest reportable month is 2026-09. */
export const TODAY = isoDate('2026-10-07')
export const REPORT_PERIOD = period('2026-09')

// ── channel data (read-only VOs from the ACL) ───────────────────────────────
export const aVideo = (id: VideoId, title = `Video ${id}`): Video => ({
  id,
  channelId: CHANNEL,
  title,
  publishedAt: isoDate('2026-01-15'),
})

/** Default revenue: v1 1001¢, v2 2999¢ (in the default split), v3 101¢ (unsplit). */
export const DEFAULT_REVENUE: Readonly<Record<string, number>> = { v1: 1001, v2: 2999, v3: 101 }

export const aMonthlyRevenue = (
  centsByVideo: Readonly<Record<string, number>> = DEFAULT_REVENUE,
  p = REPORT_PERIOD,
): MonthlyRevenue => ({
  channelId: CHANNEL,
  period: p,
  byVideo: { ...centsByVideo } as Record<VideoId, Cents>,
})

export const videosFor = (centsByVideo: Readonly<Record<string, number>>): Video[] =>
  Object.keys(centsByVideo).map((id) => aVideo(videoId(id)))

export const aFrozenRevenue = (
  centsByVideo: Readonly<Record<string, number>> = DEFAULT_REVENUE,
): FrozenRevenue =>
  expectOk(FrozenRevenue.freeze(aMonthlyRevenue(centsByVideo), videosFor(centsByVideo)))

// ── reporting snapshots (plain data, translated by the application layer) ───
export const sharesOf = (...pairs: readonly (readonly [PartyId, number])[]) =>
  pairs.map(([partyId, n]) => ({ partyId, bps: bps(n) }))

export const aSplitSnapshot = (overrides: Partial<SplitSnapshot> = {}): SplitSnapshot => ({
  splitId: splitId('split-1'),
  name: 'Intro series',
  videoIds: [V1, V2],
  shares: sharesOf([OWNER_ID, 7000], [ALEX, 3000]),
  ...overrides,
})

const PEOPLE: Readonly<Record<string, Omit<PartySnapshot, 'partyId'>>> = {
  [OWNER_ID]: { name: 'Morgan Lee', email: 'owner@syncz.com', role: 'Owner' },
  [ALEX]: { name: 'Alex Rivera', email: 'alex@studio.com', role: 'Editor' },
  [SAM]: { name: 'Sam Chen', email: 'sam@studio.com', role: 'Co-host' },
  [JO]: { name: 'Jo Park', email: 'jo@studio.com', role: 'Producer' },
}

export const aPartySnapshot = (
  partyId: PartyId,
  overrides: Partial<Omit<PartySnapshot, 'partyId'>> = {},
): PartySnapshot => ({
  partyId,
  ...(PEOPLE[partyId] ?? { name: partyId, email: `${partyId}@studio.com`, role: 'Editor' }),
  ...overrides,
})

export const defaultParties = (): PartySnapshot[] => [
  aPartySnapshot(OWNER_ID),
  aPartySnapshot(ALEX),
  aPartySnapshot(SAM),
  aPartySnapshot(JO),
]

// ── MonthlyReport ───────────────────────────────────────────────────────────
export const aGenerateInput = (overrides: Partial<GenerateInput> = {}): GenerateInput => ({
  id: reportId('rep-2026-09'),
  channelId: CHANNEL,
  period: REPORT_PERIOD,
  revenue: aMonthlyRevenue(),
  videos: videosFor(DEFAULT_REVENUE),
  splits: [aSplitSnapshot()],
  parties: defaultParties(),
  ...overrides,
})

/** A generated report (Revision 1) at meta(1), today = 2026-10-07. */
export const aReport = (overrides: Partial<GenerateInput> = {}): MonthlyReport =>
  expectOk(MonthlyReport.generate(aGenerateInput(overrides), meta(1), TODAY))

// ── allocation helpers ──────────────────────────────────────────────────────
export const lineOf = (lines: readonly AllocationLine[], partyId: PartyId) =>
  lines.find((l) => l.party.partyId === partyId)

/** A party's due in the given lines; 0 when the party has no line. */
export const dueOf = (lines: readonly AllocationLine[], partyId: PartyId): number =>
  lineOf(lines, partyId)?.dueCents ?? 0

export const totalOf = (lines: readonly AllocationLine[]): number =>
  lines.reduce((sum, l) => sum + l.dueCents, 0)

export const videoCentsOf = (line: AllocationLine): number =>
  line.videos.reduce((sum, v) => sum + v.cents, 0)

/** Deep copy of plain JSON data, used to compare "before" and "after" a command. */
export const jsonClone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T
