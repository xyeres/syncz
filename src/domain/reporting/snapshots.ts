import type { CollaboratorId, EntryId, PartyId, SplitId, VideoId } from '../shared/ids'
import type { Bps, Cents, IsoDateTime } from '../shared/numbers'

/**
 * Reporting-owned copies of upstream data. The application layer translates Revenue Sharing's
 * Split/Collaborator (and the Account owner) into these, so a revision never references live
 * aggregates (SPL-10, COL-6).
 */

/** A split as it was at revision time (SPL-9/10/11). */
export type SplitSnapshot = Readonly<{
  splitId: SplitId
  name: string
  videoIds: readonly VideoId[]
  shares: readonly Readonly<{ partyId: PartyId; bps: Bps }>[]
}>

/** A payee as they were at revision time (REP-8, COL-6). */
export type PartySnapshot = Readonly<{ partyId: PartyId; name: string; email: string; role: string }>

/** One party's total for one split. `splitId: null` means "Unsplit videos". */
export type SplitPart = Readonly<{ splitId: SplitId | null; splitName: string; bps: Bps; cents: Cents }>

/** One party's amount for one video. */
export type VideoAmount = Readonly<{
  videoId: VideoId
  title: string
  revenueCents: Cents
  bps: Bps
  cents: Cents
  splitId: SplitId | null
  splitName: string
}>

/** One party in a revision (REP-4/5/6): `dueCents = Σ videos[].cents = Σ parts[].cents`. */
export type AllocationLine = Readonly<{
  party: PartySnapshot
  dueCents: Cents
  parts: readonly SplitPart[]
  videos: readonly VideoAmount[]
}>

/** A party whose due changed in a recalculation. A dropped party goes to 0. */
export type DueChange = Readonly<{ partyId: PartyId; name: string; fromCents: Cents; toCents: Cents }>

type EntryBase = Readonly<{ id: EntryId; at: IsoDateTime }>

/** The report's own append-only activity (REP-9). */
export type ActivityEntry = EntryBase &
  (
    | Readonly<{ type: 'generated'; revision: 1; grossCents: Cents }>
    | Readonly<{
        type: 'recalculated'
        revision: number
        oldGrossCents: Cents
        newGrossCents: Cents
        changes: readonly DueChange[]
      }>
    | Readonly<{ type: 'sent'; revision: number; collaboratorId: CollaboratorId; name: string }>
  )
