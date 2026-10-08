import { OWNER_ID, isOwner, type PartyId, type SplitId, type VideoId } from '../shared/ids'
import { FULL, type Bps, type Cents } from '../shared/numbers'
import { invariantBroken } from '../shared/plain-data'
import { frozenVideosOf, type FrozenRevenue, type FrozenVideo } from './frozen-revenue'
import type { AllocationLine, PartySnapshot, SplitPart, SplitSnapshot, VideoAmount } from './snapshots'

export const UNSPLIT_VIDEOS = 'Unsplit videos'

/** One party's amount for one video, before grouping into lines. */
type Piece = Readonly<{ partyId: PartyId; amount: VideoAmount }>
/** Where a video's money comes from: the video plus the split (or "unsplit") it belongs to. */
type Source = Omit<VideoAmount, 'bps' | 'cents'>

const sumCents = (items: readonly Readonly<{ cents: Cents }>[]): Cents =>
  items.reduce((sum, item) => sum + item.cents, 0) as Cents

const sourceOf = (videoId: VideoId, video: FrozenVideo, splitId: SplitId | null, splitName: string): Source => ({
  videoId,
  title: video.title,
  revenueCents: video.cents,
  splitId,
  splitName,
})

const pieceOf = (partyId: PartyId, source: Source, bps: Bps, cents: number): Piece => ({
  partyId,
  amount: { ...source, bps, cents: cents as Cents },
})

/** REP-5: a collaborator's per-video amount always rounds down. */
const floorShare = (revenueCents: Cents, bps: Bps): number => Math.floor((revenueCents * bps) / FULL)

const ownerBpsOf = (split: SplitSnapshot): Bps =>
  split.shares.find((s) => isOwner(s.partyId))?.bps ?? (0 as Bps)

/** One split video: collaborators get their floored share; the owner absorbs the remainder (never negative). */
function piecesForVideo(source: Source, split: SplitSnapshot): Piece[] {
  const collaborators = split.shares
    .filter((s) => !isOwner(s.partyId))
    .map((s) => pieceOf(s.partyId, source, s.bps, floorShare(source.revenueCents, s.bps)))
  const remainder = source.revenueCents - sumCents(collaborators.map((p) => p.amount))
  return [pieceOf(OWNER_ID, source, ownerBpsOf(split), remainder), ...collaborators]
}

/** Every video of the split that has frozen revenue, in the split's video order. */
function piecesForSplit(frozen: FrozenRevenue, split: SplitSnapshot): Piece[] {
  return split.videoIds.flatMap((videoId) => {
    const video = frozen.byVideo[videoId]
    return video ? piecesForVideo(sourceOf(videoId, video, split.splitId, split.name), split) : []
  })
}

/** REP-4: videos in no split go 100% to the owner. */
function unsplitPieces(frozen: FrozenRevenue, splits: readonly SplitSnapshot[]): Piece[] {
  const inSplits = new Set(splits.flatMap((s) => s.videoIds))
  return frozenVideosOf(frozen)
    .filter(([videoId]) => !inSplits.has(videoId))
    .map(([videoId, video]) => pieceOf(OWNER_ID, sourceOf(videoId, video, null, UNSPLIT_VIDEOS), FULL, video.cents))
}

/** Per party per split: one SplitPart summing that party's video amounts in the split. */
function partsOf(videos: readonly VideoAmount[]): SplitPart[] {
  const parts = new Map<SplitId | null, SplitPart>()
  for (const v of videos) {
    const cents = (parts.get(v.splitId)?.cents ?? 0) + v.cents
    parts.set(v.splitId, { splitId: v.splitId, splitName: v.splitName, bps: v.bps, cents: cents as Cents })
  }
  return [...parts.values()]
}

const partyOf = (parties: readonly PartySnapshot[], partyId: PartyId): PartySnapshot =>
  parties.find((p) => p.partyId === partyId) ?? invariantBroken(`no PartySnapshot for ${partyId}`)

const lineOf = (party: PartySnapshot, videos: readonly VideoAmount[]): AllocationLine => ({
  party,
  dueCents: sumCents(videos),
  parts: partsOf(videos),
  videos,
})

/**
 * Allocation math (REP-4/5/6). The owner always has a line (first); every other party that holds
 * a share of a video with revenue gets one, in order of first appearance.
 */
export function allocate(
  frozen: FrozenRevenue,
  splits: readonly SplitSnapshot[],
  parties: readonly PartySnapshot[],
): readonly AllocationLine[] {
  const pieces = [...splits.flatMap((split) => piecesForSplit(frozen, split)), ...unsplitPieces(frozen, splits)]
  const partyIds = [...new Set<PartyId>([OWNER_ID, ...pieces.map((p) => p.partyId)])]
  return partyIds.map((partyId) =>
    lineOf(
      partyOf(parties, partyId),
      pieces.filter((p) => p.partyId === partyId).map((p) => p.amount),
    ),
  )
}
