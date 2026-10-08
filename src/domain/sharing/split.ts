import { isOwner, type ChannelId, type PartyId, type SplitId, type VideoId } from '../shared/ids'
import { FULL, MIN_SHARE } from '../shared/numbers'
import { failAll, ok, type Reason, type Result } from '../shared/result'
import { Share, type ShareInput } from './share'

/** The editable part of a split. Shares carry raw-number bps until validated. */
export type SplitFields = Readonly<{
  name: string
  videoIds: readonly VideoId[]
  shares: readonly ShareInput[]
}>

export type SplitInput = Readonly<{ id: SplitId; channelId: ChannelId }> & SplitFields

export type SplitSnapshot = Readonly<{
  id: SplitId
  channelId: ChannelId
  name: string
  videoIds: readonly VideoId[]
  shares: readonly Share[]
}>

type ValidFields = Pick<SplitSnapshot, 'name' | 'videoIds' | 'shares'>

const formatBps = (bps: number) => `${bps % 100 === 0 ? bps / 100 : (bps / 100).toFixed(2)}%`

/** SPL-1…6. Collects every reason so the UI can show all of them. */
function validate(fields: SplitFields): Result<ValidFields> {
  const reasons: Reason[] = []
  const name = fields.name.trim()
  if (!name) reasons.push({ code: 'SPL-6', message: 'Name this split' })
  if (fields.videoIds.length === 0) reasons.push({ code: 'SPL-6', message: 'Pick at least one video' })

  if (fields.shares.filter((s) => isOwner(s.partyId)).length !== 1) {
    reasons.push({ code: 'SPL-4', message: 'The split must include you exactly once' })
  }
  const collaboratorIds = fields.shares.map((s) => s.partyId).filter((id) => !isOwner(id))
  if (new Set(collaboratorIds).size !== collaboratorIds.length) {
    reasons.push({ code: 'SPL-5', message: 'Each collaborator can appear only once' })
  }

  const shares: Share[] = []
  for (const input of fields.shares) {
    const created = Share.create(input.partyId, input.bps)
    if (!created.ok) {
      reasons.push(...created.reasons)
      continue
    }
    const { bps } = created.value
    if (isOwner(input.partyId)) {
      if (bps > 0 && bps < MIN_SHARE) {
        reasons.push({ code: 'SPL-4', message: 'Your share must be 0% or at least 0.10%' })
      }
    } else if (bps < MIN_SHARE) {
      reasons.push({ code: 'SPL-3', message: `Give ${input.partyId} at least 0.10% or remove them` })
    }
    shares.push(created.value)
  }

  const total = fields.shares.reduce((sum, s) => sum + s.bps, 0)
  if (total < FULL) reasons.push({ code: 'SPL-1', message: `Allocate the remaining ${formatBps(FULL - total)}` })
  if (total > FULL) reasons.push({ code: 'SPL-1', message: `Shares exceed 100% by ${formatBps(total - FULL)}` })

  if (reasons.length > 0) return failAll(reasons)
  return ok({ name, videoIds: [...fields.videoIds], shares })
}

/** A named group of videos whose shares sum to 100% (SPL-1…6, 9, 11). */
export class Split {
  private constructor(
    readonly id: SplitId,
    readonly channelId: ChannelId,
    readonly name: string,
    readonly videoIds: readonly VideoId[],
    readonly shares: readonly Share[],
  ) {
    Object.freeze(videoIds)
    shares.forEach((share) => Object.freeze(share))
    Object.freeze(shares)
    Object.freeze(this)
  }

  static create(input: SplitInput): Result<Split> {
    const valid = validate(input)
    if (!valid.ok) return valid
    const { name, videoIds, shares } = valid.value
    return ok(new Split(input.id, input.channelId, name, videoIds, shares))
  }

  /** Same reasons `create` would reject with; empty for a valid draft. Drafts are never persisted. */
  static validateDraft(input: SplitInput): readonly Reason[] {
    const valid = validate(input)
    return valid.ok ? [] : valid.reasons
  }

  static fromSnapshot(s: SplitSnapshot): Split {
    return new Split(
      s.id,
      s.channelId,
      s.name,
      [...s.videoIds],
      s.shares.map((x) => ({ partyId: x.partyId, bps: x.bps })),
    )
  }

  revise(fields: SplitFields): Result<Split> {
    const valid = validate(fields)
    if (!valid.ok) return valid
    const { name, videoIds, shares } = valid.value
    return ok(new Split(this.id, this.channelId, name, videoIds, shares))
  }

  hasParty(partyId: PartyId): boolean {
    return this.shares.some((s) => s.partyId === partyId)
  }

  toSnapshot(): SplitSnapshot {
    return {
      id: this.id,
      channelId: this.channelId,
      name: this.name,
      videoIds: [...this.videoIds],
      shares: this.shares.map((s) => ({ partyId: s.partyId, bps: s.bps })),
    }
  }
}
