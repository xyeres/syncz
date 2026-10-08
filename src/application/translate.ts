/**
 * Revenue Sharing (and the Account owner) → Reporting snapshots. The only place the two
 * contexts meet (docs/domain-design.md §1): Reporting never imports Split or Collaborator.
 */
import type { Account } from '../domain/channel/account'
import { OWNER_ID } from '../domain/shared/ids'
import type { PartySnapshot, SplitSnapshot } from '../domain/reporting/snapshots'
import type { Collaborator } from '../domain/revenue-sharing/collaborator'
import type { Role } from '../domain/revenue-sharing/role'
import type { Split } from '../domain/revenue-sharing/split'

export const OWNER_ROLE = 'Channel owner'

export const splitSnapshotOf = (split: Split): SplitSnapshot => ({
  splitId: split.id,
  name: split.name,
  videoIds: [...split.videoIds],
  shares: split.shares.map((s) => ({ partyId: s.partyId, bps: s.bps })),
})

export const roleLabel = (role: Role): string => ('label' in role ? role.label : role.kind)

export const ownerSnapshotOf = (account: Account): PartySnapshot => ({
  partyId: OWNER_ID,
  name: account.ownerName,
  email: account.ownerEmail.value,
  role: OWNER_ROLE,
})

export const collaboratorSnapshotOf = (c: Collaborator): PartySnapshot => ({
  partyId: c.id,
  name: c.name,
  email: c.email.value,
  role: roleLabel(c.role),
})

/**
 * Everyone who may appear on a revision: the owner plus every collaborator, including
 * soft-deleted ones (they keep their identity for history; SPL-8 keeps them out of new splits).
 */
export const partySnapshotsOf = (account: Account, collaborators: readonly Collaborator[]): PartySnapshot[] => [
  ownerSnapshotOf(account),
  ...collaborators.map(collaboratorSnapshotOf),
]
