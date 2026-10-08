import { isOwner, type ChannelId, type PartyId, type SplitId, type VideoId } from '../shared/ids'
import { FULL, MIN_SHARE } from '../shared/numbers'
import { OK, collect, fail, failAll, failIf, ok, valuesOf, type Reason, type Result } from '../shared/result'
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

const checkName = (name: string): Result<void> => failIf(!name.trim(), 'SPL-6', 'Name this split')

const checkVideos = (videoIds: readonly VideoId[]): Result<void> =>
  failIf(videoIds.length === 0, 'SPL-6', 'Pick at least one video')

/** SPL-4: exactly one owner share. */
const checkOwner = (shares: readonly ShareInput[]): Result<void> =>
  failIf(
    shares.filter((s) => isOwner(s.partyId)).length !== 1,
    'SPL-4',
    'The split must include you exactly once',
  )

/** SPL-5: each collaborator at most once (a duplicated owner is SPL-4's concern). */
const checkDuplicates = (shares: readonly ShareInput[]): Result<void> => {
  const collaboratorIds = shares.map((s) => s.partyId).filter((id) => !isOwner(id))
  return failIf(
    new Set(collaboratorIds).size !== collaboratorIds.length,
    'SPL-5',
    'Each collaborator can appear only once',
  )
}

/** SPL-4: the owner may hold 0%, but a non-zero owner share follows the minimum. */
const checkOwnerMinimum = (share: Share): Result<void> =>
  failIf(share.bps > 0 && share.bps < MIN_SHARE, 'SPL-4', 'Your share must be 0% or at least 0.10%')

/** SPL-3: every collaborator share is at least MIN_SHARE. */
const checkCollaboratorMinimum = (share: Share): Result<void> =>
  failIf(share.bps < MIN_SHARE, 'SPL-3', `Give ${share.partyId} at least 0.10% or remove them`)

const checkMinimum = (share: Share): Result<void> =>
  isOwner(share.partyId) ? checkOwnerMinimum(share) : checkCollaboratorMinimum(share)

/** SPL-2, then SPL-3/4 minimums for one share. */
const checkShare = (input: ShareInput): Result<Share> => {
  const created = Share.create(input.partyId, input.bps)
  if (!created.ok) return created
  const minimum = checkMinimum(created.value)
  return minimum.ok ? created : minimum
}

/** SPL-1: shares total exactly FULL, with distinct messages for under and over. */
const checkTotal = (shares: readonly ShareInput[]): Result<void> => {
  const total = shares.reduce((sum, s) => sum + s.bps, 0)
  if (total < FULL) return fail('SPL-1', `Allocate the remaining ${formatBps(FULL - total)}`)
  if (total > FULL) return fail('SPL-1', `Shares exceed 100% by ${formatBps(total - FULL)}`)
  return OK
}

/** SPL-1…6. Collects every reason so the UI can show all of them. */
function validate(fields: SplitFields): Result<ValidFields> {
  const shareChecks = fields.shares.map(checkShare)
  const reasons = collect(
    checkName(fields.name),
    checkVideos(fields.videoIds),
    checkOwner(fields.shares),
    checkDuplicates(fields.shares),
    ...shareChecks,
    checkTotal(fields.shares),
  )
  if (reasons.length > 0) return failAll(reasons)
  return ok({ name: fields.name.trim(), videoIds: [...fields.videoIds], shares: valuesOf(shareChecks) })
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
