import type { MonthlyRevenue, Video } from '../channel/video'
import type { VideoId } from '../shared/ids'
import type { Cents } from '../shared/numbers'
import { deepFreeze } from '../shared/plain-data'
import { collect, failAll, failIf, ok, type Result } from '../shared/result'

export type FrozenVideo = Readonly<{ cents: Cents; title: string }>

/** Revenue captured once, at Revision 1 (REP-3), with the video titles of that moment. */
export type FrozenRevenue = Readonly<{ byVideo: Readonly<Record<VideoId, FrozenVideo>> }>

const entriesOf = <T>(record: Readonly<Record<VideoId, T>>) => Object.entries(record) as [VideoId, T][]

/** ACC-2: revenue must be whole, non-negative cents. */
const checkCents = (videoId: VideoId, cents: number): Result<void> =>
  failIf(
    !(Number.isInteger(cents) && cents >= 0),
    'ACC-2',
    `Revenue for video ${videoId} must be whole, non-negative cents`,
  )

/**
 * Copies and deep-freezes the period's revenue. Videos without revenue are left out.
 * A revenue entry for a video missing from `videos` keeps its id as the title.
 */
function freeze(revenue: MonthlyRevenue, videos: readonly Video[]): Result<FrozenRevenue> {
  const entries = entriesOf(revenue.byVideo)
  const reasons = collect(...entries.map(([videoId, cents]) => checkCents(videoId, cents)))
  if (reasons.length > 0) return failAll(reasons)
  const titles = new Map(videos.map((v) => [v.id, v.title]))
  const byVideo = Object.fromEntries(
    entries.map(([videoId, cents]) => [videoId, { cents, title: titles.get(videoId) ?? videoId }]),
  )
  return ok(deepFreeze({ byVideo }))
}

/** The frozen videos as `[videoId, video]` pairs, in capture order. */
export const frozenVideosOf = (frozen: FrozenRevenue) => entriesOf(frozen.byVideo)

/** Gross revenue: the sum of every frozen video. */
const grossOf = (frozen: FrozenRevenue): Cents =>
  frozenVideosOf(frozen).reduce((sum, [, video]) => sum + video.cents, 0) as Cents

export const FrozenRevenue = { freeze, grossOf }
