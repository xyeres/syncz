/**
 * Anti-corruption layer over the mock YouTube data (seed/mock.js): translates its videos and
 * per-month dollar revenue into the domain's `Video` and `MonthlyRevenue` (integer cents).
 * A real YouTube adapter replaces this file; no YouTube type crosses into the domain.
 */
import type { ChannelCatalog } from '../../application/ports'
import type { MonthlyRevenue, Video } from '../../domain/channel/video'
import type { ChannelId, VideoId } from '../../domain/shared/ids'
import type { Cents, IsoDate } from '../../domain/shared/numbers'
import type { Period } from '../../domain/shared/period'
import { CHANNEL, VIDEOS, type MockVideo } from '../seed/mock.js'

export const MOCK_CHANNEL_ID = CHANNEL.id as ChannelId

const toVideo = (v: MockVideo): Video => ({
  id: v.id as VideoId,
  channelId: MOCK_CHANNEL_ID,
  title: v.title,
  publishedAt: v.publishedAt as IsoDate,
})

const toCents = (dollars: number) => Math.round(dollars * 100) as Cents

/** `[videoId, cents]` for every video with revenue in the month. */
const revenueEntries = (period: Period) =>
  VIDEOS.flatMap((v) => {
    const dollars = v.revenue[period]
    return dollars === undefined ? [] : [[v.id as VideoId, toCents(dollars)] as const]
  })

const listVideos = (channelId: ChannelId): Video[] => (channelId === MOCK_CHANNEL_ID ? VIDEOS.map(toVideo) : [])

/** Null when the channel is unknown or has no revenue data for the month. */
function monthlyRevenue(channelId: ChannelId, period: Period): MonthlyRevenue | null {
  const entries = channelId === MOCK_CHANNEL_ID ? revenueEntries(period) : []
  if (entries.length === 0) return null
  return { channelId, period, byVideo: Object.fromEntries(entries) as Record<VideoId, Cents> }
}

export function createMockChannelCatalog(): ChannelCatalog {
  return {
    listVideos: async (channelId) => listVideos(channelId),
    monthlyRevenue: async (channelId, period) => monthlyRevenue(channelId, period),
  }
}
