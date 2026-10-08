/**
 * Builds the demo state by replaying commands through the use cases (never by writing
 * repositories directly), with a fixed clock and deterministic ids. This also smoke-tests the
 * domain at startup. Demo states (see also the application seed test):
 *
 * - 2026-06: generated with the older shorts/tutorials splits, everyone paid, then the splits
 *   were corrected and June recalculated → Jonah overpaid, Leo partially paid, both need a resend.
 * - 2026-07: everyone paid; then Priya's tutorials share was corrected (20% → 19%), July was
 *   recalculated, Priya returned the overpayment (settlement, "Repaid via Venmo 8/20") and was
 *   sent the corrected statement → July shows paid + one settled.
 * - 2026-08: Sam paid, reversed ("Sent to the wrong account") and re-paid; Priya paid;
 *   Leo and Jonah unpaid.
 * - 2026-09: not generated, so the dashboard's next action is "Generate September report".
 */
import type { UseCases } from '../../application/make-use-cases'
import type { CollaboratorId, PartyId, ReportId, SplitId, VideoId } from '../../domain/shared/ids'
import { OWNER_ID } from '../../domain/shared/ids'
import type { IsoDateTime } from '../../domain/shared/numbers'
import type { Result } from '../../domain/shared/result'
import type { MonthlyReport } from '../../domain/reporting/monthly-report'
import type { PredefinedRole } from '../../domain/revenue-sharing/role'
import type { FixedClock } from '../clock'
import { SEED_NOW } from '../clock'
import { MOCK_CHANNEL_ID } from '../youtube/mock-channel-catalog'
import { COLLABORATORS, SPLITS, USER, type MockShare, type MockSplit } from './mock.js'

/** A seed command must succeed; a rejection means the seed (not the user) is wrong. */
function must<T>(result: Result<T>, what: string): T {
  if (!result.ok) throw new Error(`Seed step "${what}" was rejected: ${JSON.stringify(result.reasons)}`)
  return result.value
}

const at = (local: string) => `${local}.000Z` as IsoDateTime

/** How the shorts and tutorials splits looked when June was first generated (mock.js comment). */
const JUNE_ORIGINAL_SHARES: Readonly<Record<string, readonly MockShare[]>> = {
  's-shorts': [
    { personId: 'me', bps: 7000 },
    { personId: 'c-jonah', bps: 2000 },
    { personId: 'c-leo', bps: 1000 },
  ],
  's-tutorials': [
    { personId: 'me', bps: 7200 },
    { personId: 'c-priya', bps: 2000 },
    { personId: 'c-leo', bps: 800 },
  ],
}

/** The July correction: Priya 20% → 19% on the tutorial series (the owner takes the 1%). */
const TUTORIALS_CORRECTED: readonly MockShare[] = [
  { personId: 'me', bps: 7100 },
  { personId: 'c-priya', bps: 1900 },
  { personId: 'c-leo', bps: 1000 },
]

const partyFrom = (people: ReadonlyMap<string, CollaboratorId>, personId: string): PartyId =>
  personId === 'me' ? OWNER_ID : (people.get(personId) as CollaboratorId)

/** `{ id }` to revise an existing split, `{}` to create one. */
const idField = (existing: SplitId | undefined) => (existing ? { id: existing } : {})

/** Replays commands at given times, remembering the ids the use cases hand out. */
function createSeeder(useCases: UseCases, clock: FixedClock) {
  const people = new Map<string, CollaboratorId>()
  const splits = new Map<string, SplitId>()
  const reports = new Map<string, MonthlyReport>()

  const party = (personId: string): PartyId => partyFrom(people, personId)
  const reportId = (period: string) => (reports.get(period) as MonthlyReport).id as ReportId
  const target = (period: string, personId: string) => ({ reportId: reportId(period), partyId: party(personId) })

  return {
    at: (local: string) => clock.set(at(local)),
    report: (period: string) => reports.get(period) as MonthlyReport,
    party,

    async signIn() {
      must(await useCases.signIn({ ownerName: USER.name, ownerEmail: USER.email, channelId: MOCK_CHANNEL_ID }), 'sign in')
    },
    async addCollaborators() {
      for (const p of COLLABORATORS) {
        const role = { kind: p.role as PredefinedRole }
        const c = must(await useCases.addCollaborator({ name: p.name, email: p.email, role }), `add ${p.id}`)
        people.set(p.id, c.id)
      }
    },
    /** Creates the mock split, or revises it once it exists, with the given shares. */
    async saveSplit(split: MockSplit, shares: readonly MockShare[] = split.shares) {
      const existing = splits.get(split.id)
      const saved = must(
        await useCases.saveSplit({
          ...idField(existing),
          name: split.name,
          videoIds: split.videoIds as VideoId[],
          shares: shares.map((s) => ({ partyId: party(s.personId), bps: s.bps })),
        }),
        `save split ${split.id}`,
      )
      splits.set(split.id, saved.id)
    },
    async generate(period: string) {
      reports.set(period, must(await useCases.generateReport({ period }), `generate ${period}`))
    },
    async recalculate(period: string) {
      reports.set(period, must(await useCases.recalculateReport({ reportId: reportId(period) }), `recalculate ${period}`))
    },
    async pay(period: string, personId: string) {
      return must(await useCases.markPaid(target(period, personId)), `pay ${personId} for ${period}`)
    },
    async undo(period: string, personId: string, note: string) {
      must(await useCases.undoLastEntry({ ...target(period, personId), note }), `undo ${personId} for ${period}`)
    },
    async settle(period: string, personId: string, amountCents: number, note: string) {
      must(await useCases.recordSettlement({ ...target(period, personId), amountCents, note }), `settle ${personId}`)
    },
    async markSent(period: string, personId: string) {
      must(await useCases.markStatementSent(target(period, personId)), `send ${personId} ${period}`)
    },
  }
}

type Seeder = ReturnType<typeof createSeeder>

const mockSplit = (id: string) => SPLITS.find((s) => s.id === id) as MockSplit

async function seedChannel(seed: Seeder) {
  seed.at('2026-07-01T08:00:00')
  await seed.signIn()
  await seed.addCollaborators()
  for (const split of SPLITS) await seed.saveSplit(split, JUNE_ORIGINAL_SHARES[split.id] ?? split.shares)
}

/** Paid in full on Revision 1, then corrected splits → Jonah overpaid, Leo partial. */
async function seedJune(seed: Seeder) {
  seed.at('2026-07-02T09:12:00')
  await seed.generate('2026-06')
  seed.at('2026-07-06T11:20:00')
  for (const person of ['c-sam', 'c-priya', 'c-leo', 'c-jonah']) await seed.pay('2026-06', person)
  seed.at('2026-07-21T16:40:00')
  await seed.saveSplit(mockSplit('s-shorts'))
  await seed.saveSplit(mockSplit('s-tutorials'))
  await seed.recalculate('2026-06')
}

/** Everyone paid; Priya's share corrected downwards, July recalculated and her overpayment settled. */
async function seedJuly(seed: Seeder) {
  seed.at('2026-08-03T10:02:00')
  await seed.generate('2026-07')
  seed.at('2026-08-05T14:10:00')
  const priyaLedger = await seed.pay('2026-07', 'c-priya')
  for (const person of ['c-sam', 'c-leo', 'c-jonah']) await seed.pay('2026-07', person)
  seed.at('2026-08-18T12:00:00')
  await seed.saveSplit(mockSplit('s-tutorials'), TUTORIALS_CORRECTED)
  await seed.recalculate('2026-07')
  seed.at('2026-08-20T09:40:00')
  const overpaid = priyaLedger.netPaidCents() - seed.report('2026-07').dueFor(seed.party('c-priya'))
  await seed.settle('2026-07', 'c-priya', overpaid, 'Repaid via Venmo 8/20')
  await seed.markSent('2026-07', 'c-priya')
}

/** Sam paid, reversed and re-paid; Priya paid; Leo and Jonah still unpaid. */
async function seedAugust(seed: Seeder) {
  seed.at('2026-09-02T09:30:00')
  await seed.generate('2026-08')
  seed.at('2026-09-04T10:05:00')
  await seed.pay('2026-08', 'c-sam')
  seed.at('2026-09-04T10:31:00')
  await seed.undo('2026-08', 'c-sam', 'Sent to the wrong account')
  seed.at('2026-09-04T10:44:00')
  await seed.pay('2026-08', 'c-sam')
  seed.at('2026-09-04T10:50:00')
  await seed.pay('2026-08', 'c-priya')
}

/** Replays the whole demo, then leaves the clock at the seed's "today" (2026-10-07). */
export async function replaySeed(useCases: UseCases, clock: FixedClock): Promise<void> {
  const seed = createSeeder(useCases, clock)
  await seedChannel(seed)
  await seedJune(seed)
  await seedJuly(seed)
  await seedAugust(seed)
  clock.set(SEED_NOW)
}
