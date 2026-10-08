/**
 * Presentation of rejection reasons (docs/domain-design.md §0 "Reason messages").
 *
 * The domain names parties by id in `message` and sets `Reason.partyId`. Use cases return
 * Results unchanged; the queries/UI boundary calls `presentReasons` (wired as
 * `queries.presentReasons`, which looks up the current collaborator names) before showing a toast.
 */
import { isOwner, type PartyId } from '../domain/shared/ids'
import type { Reason, ReasonCode } from '../domain/shared/result'

export type PresentedReason = Readonly<{ code: ReasonCode; message: string }>

export const OWNER_DISPLAY_NAME = 'You'

const displayName = (partyId: PartyId, nameOf: (id: PartyId) => string): string =>
  isOwner(partyId) ? OWNER_DISPLAY_NAME : nameOf(partyId)

const presentReason = (reason: Reason, nameOf: (id: PartyId) => string): PresentedReason => ({
  code: reason.code,
  message:
    reason.partyId === undefined
      ? reason.message
      : reason.message.split(reason.partyId).join(displayName(reason.partyId, nameOf)),
})

/** Replaces party ids in messages with display names (the owner is "You"). */
export const presentReasons = (
  reasons: readonly Reason[],
  nameOf: (id: PartyId) => string,
): PresentedReason[] => reasons.map((r) => presentReason(r, nameOf))

/** A `nameOf` over a list of named parties; unknown ids fall back to the id itself. */
export const nameLookup =
  (parties: readonly Readonly<{ id: PartyId; name: string }>[]) =>
  (id: PartyId): string =>
    parties.find((p) => p.id === id)?.name ?? id
