import type { PartyId } from '../shared/ids'
import type { Bps } from '../shared/numbers'
import { fail, ok, type Result } from '../shared/result'

/** One party's percentage of a split, in integer bps (SPL-2). */
export type Share = Readonly<{ partyId: PartyId; bps: Bps }>

/** Untrusted share input: bps is a raw number until `Share.create` checks it. */
export type ShareInput = Readonly<{ partyId: PartyId; bps: number }>

const create = (partyId: PartyId, bps: number): Result<Share> =>
  Number.isInteger(bps) && bps >= 0
    ? ok({ partyId, bps: bps as Bps })
    : fail('SPL-2', 'Shares must be whole hundredths of a percent')

export const Share = { create }
