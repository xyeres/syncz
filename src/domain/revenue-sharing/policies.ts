import { isOwner, type CollaboratorId, type PartyId, type VideoId } from '../shared/ids'
import { OK, collect, fail, failAll, failIf, type Reason, type Result } from '../shared/result'
import type { Collaborator } from './collaborator'
import type { Email } from '../shared/email'
import type { Split } from './split'

const done = (reasons: readonly Reason[]): Result<void> => (reasons.length > 0 ? failAll(reasons) : OK)
const quoted = (names: readonly string[]) => names.map((n) => `“${n}”`).join(', ')

/** SPL-7: a video belongs to at most one split. `others` may include the split itself (ignored). */
export function checkVideoExclusivity(split: Split, others: readonly Split[]): Result<void> {
  const reasons: Reason[] = []
  for (const other of others) {
    if (other.id === split.id) continue
    const clashing = split.videoIds.filter((v) => other.videoIds.includes(v))
    if (clashing.length > 0) {
      reasons.push({
        code: 'SPL-7',
        message: `${clashing.length === 1 ? 'A video is' : `${clashing.length} videos are`} already in the split “${other.name}”`,
      })
    }
  }
  return done(reasons)
}

/** SPL-8 for one video: it must be on the linked channel. */
const checkVideoOnChannel = (videoId: VideoId, channelVideoIds: ReadonlySet<VideoId>): Result<void> =>
  failIf(!channelVideoIds.has(videoId), 'SPL-8', `Video ${videoId} is not on your channel`)

/** SPL-8 for one party: the owner always qualifies; a collaborator must exist and not be deleted. */
function checkPartyReference(partyId: PartyId, collaborators: readonly Collaborator[]): Result<void> {
  if (isOwner(partyId)) return OK
  const collaborator = collaborators.find((c) => c.id === partyId)
  if (!collaborator) return fail('SPL-8', `Collaborator ${partyId} does not exist`)
  return failIf(
    collaborator.isDeleted(),
    'SPL-8',
    `${collaborator.name} has been deleted; remove them from this split`,
  )
}

/** SPL-8: only videos from the linked channel and collaborators that exist and are not deleted. */
export function checkSplitReferences(
  split: Split,
  ctx: Readonly<{ channelVideoIds: ReadonlySet<VideoId>; collaborators: readonly Collaborator[] }>,
): Result<void> {
  return done(
    collect(
      ...split.videoIds.map((videoId) => checkVideoOnChannel(videoId, ctx.channelVideoIds)),
      ...split.shares.map((share) => checkPartyReference(share.partyId, ctx.collaborators)),
    ),
  )
}

/**
 * COL-2: emails are unique per channel (compared by `normalized`). `all` includes soft-deleted
 * collaborators, who still hold their email. Nobody may use the owner's email.
 * `selfId` is the collaborator being edited, who may keep their own email.
 */
export function checkEmailAvailable(
  email: Email,
  all: readonly Collaborator[],
  ownerEmail: Email,
  selfId?: CollaboratorId,
): Result<void> {
  if (email.normalized === ownerEmail.normalized) {
    return fail('COL-2', 'That’s your own email; collaborators need their own')
  }
  const holder = all.find((c) => c.id !== selfId && c.email.normalized === email.normalized)
  if (!holder) return OK
  const message = holder.isDeleted()
    ? `That email belongs to a deleted collaborator (${holder.name})`
    : `${holder.name} already uses this email`
  return fail('COL-2', message)
}

/** COL-4: a collaborator cannot be deleted while any split references them. */
export function checkCollaboratorRemovable(id: CollaboratorId, splits: readonly Split[]): Result<void> {
  const blocking = splits.filter((s) => s.hasParty(id)).map((s) => s.name)
  if (blocking.length === 0) return OK
  return fail('COL-4', `Remove this collaborator from ${quoted(blocking)} before deleting them`)
}
