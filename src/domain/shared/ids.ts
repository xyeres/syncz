/** Branded (nominal) ids. Zero runtime cost; constructed only by the cast helpers below. */
export type Brand<T, B extends string> = T & { readonly __brand: B }

export type AccountId = Brand<string, 'AccountId'>
export type ChannelId = Brand<string, 'ChannelId'>
export type VideoId = Brand<string, 'VideoId'>
export type SplitId = Brand<string, 'SplitId'>
export type CollaboratorId = Brand<string, 'CollaboratorId'>
export type ReportId = Brand<string, 'ReportId'>
export type LedgerId = Brand<string, 'LedgerId'> // `${ReportId}:${CollaboratorId}`
export type EntryId = Brand<string, 'EntryId'> // ledger + activity entries

/** The channel owner is a party, never a Collaborator (COL-7). */
export const OWNER_ID = 'owner' as Brand<'owner', 'OwnerId'>
export type OwnerId = typeof OWNER_ID
/** Anyone who can hold a share. */
export type PartyId = OwnerId | CollaboratorId

export const isOwner = (partyId: PartyId): partyId is OwnerId => partyId === OWNER_ID

// One cast helper per id; used by infrastructure/application only.
export const asAccountId = (s: string) => s as AccountId
export const asChannelId = (s: string) => s as ChannelId
export const asVideoId = (s: string) => s as VideoId
export const asSplitId = (s: string) => s as SplitId
export const asCollaboratorId = (s: string) => s as CollaboratorId
export const asReportId = (s: string) => s as ReportId
export const asEntryId = (s: string) => s as EntryId
export const ledgerIdOf = (r: ReportId, c: CollaboratorId) => `${r}:${c}` as LedgerId
