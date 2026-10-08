import type { ChannelId, VideoId } from '../shared/ids'
import type { Cents, IsoDate } from '../shared/numbers'
import type { Period } from '../shared/period'

/** Read-only, produced by the ChannelCatalog ACL. */
export type Video = Readonly<{ id: VideoId; channelId: ChannelId; title: string; publishedAt: IsoDate }>

/** Read-only revenue from YouTube; the app never creates or edits it (ACC-2). */
export type MonthlyRevenue = Readonly<{
  channelId: ChannelId
  period: Period
  byVideo: Readonly<Record<VideoId, Cents>>
}>
