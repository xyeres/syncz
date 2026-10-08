/**
 * Test builders and assertion helpers for the domain layer.
 * Imports only from src/domain (it runs under the DOM-free domain tsconfig).
 */
import type {
  AccountId,
  ChannelId,
  CollaboratorId,
  EntryId,
  PartyId,
  SplitId,
  VideoId,
} from './shared/ids'
import { OWNER_ID } from './shared/ids'
import type { IsoDate, IsoDateTime } from './shared/numbers'
import type { Meta } from './shared/meta'
import type { Period } from './shared/period'
import type { Reason, ReasonCode, Result } from './shared/result'
import { Account, type AccountInput } from './channel/account'
import { Email } from './shared/email'
import { ROLES } from './revenue-sharing/role'
import { Split, type SplitInput } from './revenue-sharing/split'
import { Collaborator, type CollaboratorInput } from './revenue-sharing/collaborator'

// ── ids (as-casts live only in tests and at the edges) ──────────────────────
export const accountId = (s: string) => s as AccountId
export const channelId = (s: string) => s as ChannelId
export const videoId = (s: string) => s as VideoId
export const splitId = (s: string) => s as SplitId
export const collaboratorId = (s: string) => s as CollaboratorId
export const entryId = (s: string) => s as EntryId
export const isoDate = (s: string) => s as IsoDate
export const isoDateTime = (s: string) => s as IsoDateTime
export const period = (s: string) => s as Period

export const CHANNEL = channelId('UC-main')
export const OTHER_CHANNEL = channelId('UC-other')
export const ALEX = collaboratorId('c-alex')
export const SAM = collaboratorId('c-sam')
export const JO = collaboratorId('c-jo')
export const V1 = videoId('v1')
export const V2 = videoId('v2')
export const V3 = videoId('v3')

/** Injected time + id. `meta(1)` and `meta(2)` are distinct and ordered. */
export const meta = (n: number): Meta => ({
  id: entryId(`entry-${n}`),
  at: isoDateTime(`2026-10-07T10:${String(n % 60).padStart(2, '0')}:00.000Z`),
})

// ── result helpers ──────────────────────────────────────────────────────────
/** Asserts the result is ok and returns its value (fails with the reasons otherwise). */
export function expectOk<T>(result: Result<T>): T {
  if (!result.ok) {
    throw new Error(
      `Expected ok, got rejected: ${result.reasons.map((r) => `${r.code} ${r.message}`).join('; ')}`,
    )
  }
  expect(result.ok).toBe(true)
  return result.value
}

/** Asserts the result is rejected and that some reason carries `code`. Returns all reasons. */
export function expectRejected<T>(result: Result<T>, code: ReasonCode): readonly Reason[] {
  expect(result.ok).toBe(false)
  if (result.ok) throw new Error(`Expected rejection with ${code}, got ok`)
  expect(result.reasons.map((r) => r.code)).toContain(code)
  for (const r of result.reasons) {
    expect(typeof r.message).toBe('string')
    expect(r.message.trim()).not.toBe('')
  }
  return result.reasons
}

/** The distinct codes of a rejected result, in order of first appearance. */
export function codesOf<T>(result: Result<T>): readonly ReasonCode[] {
  if (result.ok) return []
  return [...new Set(result.reasons.map((r) => r.code))]
}

// ── builders ────────────────────────────────────────────────────────────────
export const share = (partyId: PartyId, bps: number) => ({ partyId, bps })

export const aSplitInput = (overrides: Partial<SplitInput> = {}): SplitInput => ({
  id: splitId('split-1'),
  channelId: CHANNEL,
  name: 'Intro series',
  videoIds: [V1, V2],
  shares: [share(OWNER_ID, 7000), share(ALEX, 3000)],
  ...overrides,
})

export const aSplit = (overrides: Partial<SplitInput> = {}): Split =>
  expectOk(Split.create(aSplitInput(overrides)))

export const anEmail = (raw: string): Email => expectOk(Email.create(raw))

export const aCollaboratorInput = (overrides: Partial<CollaboratorInput> = {}): CollaboratorInput => ({
  id: ALEX,
  channelId: CHANNEL,
  name: 'Alex Rivera',
  email: 'alex@studio.com',
  role: { kind: ROLES[0] },
  ...overrides,
})

export const aCollaborator = (overrides: Partial<CollaboratorInput> = {}): Collaborator =>
  expectOk(Collaborator.register(aCollaboratorInput(overrides)))

export const OWNER_EMAIL = 'owner@syncz.com'

export const anAccountInput = (overrides: Partial<AccountInput> = {}): AccountInput => ({
  id: accountId('acc-1'),
  ownerName: 'Morgan Lee',
  ownerEmail: anEmail(OWNER_EMAIL),
  channelId: null,
  ...overrides,
})

export const anAccount = (overrides: Partial<AccountInput> = {}): Account =>
  expectOk(Account.create(anAccountInput(overrides)))
