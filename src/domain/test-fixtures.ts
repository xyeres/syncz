/**
 * Test builders and assertion helpers for the domain layer.
 * Imports only from src/domain (it runs under the DOM-free domain tsconfig).
 * Context-neutral helpers live in ./shared/test-fixtures and are re-exported here;
 * reporting builders live in ./reporting/test-fixtures (reporting must not import revenue-sharing).
 */
import type { PartyId } from './shared/ids'
import { OWNER_ID } from './shared/ids'
import { Account, type AccountInput } from './channel/account'
import { Email } from './shared/email'
import { ROLES } from './revenue-sharing/role'
import { Split, type SplitInput } from './revenue-sharing/split'
import { Collaborator, type CollaboratorInput } from './revenue-sharing/collaborator'
import { ALEX, CHANNEL, V1, V2, accountId, expectOk, splitId } from './shared/test-fixtures'

export * from './shared/test-fixtures'

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
