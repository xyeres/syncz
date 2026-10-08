import type { MonthlyRevenue, Video } from '../channel/video'
import type { ChannelId, CollaboratorId, PartyId, ReportId } from '../shared/ids'
import type { Meta } from '../shared/meta'
import type { Cents, IsoDate, IsoDateTime } from '../shared/numbers'
import { Period } from '../shared/period'
import { copyData, deepFreeze, invariantBroken } from '../shared/plain-data'
import { collect, fail, failAll, failIf, ok, type Result } from '../shared/result'
import { allocate } from './allocate'
import { FrozenRevenue } from './frozen-revenue'
import type { ActivityEntry, AllocationLine, DueChange, PartySnapshot, SplitSnapshot } from './snapshots'

/** Revision `number` of a report: created once, never changed (REP-7). */
export type Revision = Readonly<{
  number: number
  createdAt: IsoDateTime
  grossCents: Cents
  splits: readonly SplitSnapshot[]
  lines: readonly AllocationLine[]
}>

export type GenerateInput = Readonly<{
  id: ReportId
  channelId: ChannelId
  period: Period
  revenue: MonthlyRevenue
  videos: readonly Video[]
  splits: readonly SplitSnapshot[]
  parties: readonly PartySnapshot[]
}>

/** Collaborator → the revision number last sent to them (STM-2/3). */
export type SentMarkers = Readonly<Record<CollaboratorId, number>>

export type MonthlyReportSnapshot = Readonly<{
  id: ReportId
  channelId: ChannelId
  period: Period
  frozenRevenue: FrozenRevenue
  revisions: readonly Revision[]
  sent: SentMarkers
  activity: readonly ActivityEntry[]
}>

// ── pure helpers ────────────────────────────────────────────────────────────

const lineFor = (lines: readonly AllocationLine[], partyId: PartyId) =>
  lines.find((l) => l.party.partyId === partyId)

const dueIn = (lines: readonly AllocationLine[], partyId: PartyId): Cents =>
  lineFor(lines, partyId)?.dueCents ?? (0 as Cents)

/** REP-2: a valid YYYY-MM month that has already ended. */
function checkPeriod(period: Period, today: IsoDate): Result<void> {
  const parsed = Period.parse(period)
  if (!parsed.ok) return parsed
  return failIf(
    !Period.isEndedBy(parsed.value, today),
    'REP-2',
    `${period} has not ended yet; the latest month you can report is ${Period.latestReportable(today)}`,
  )
}

/** Allocates a revision from copies of the inputs, with the REP-4 defensive check. */
function buildRevision(
  number: number,
  createdAt: IsoDateTime,
  frozen: FrozenRevenue,
  splits: readonly SplitSnapshot[],
  parties: readonly PartySnapshot[],
): Result<Revision> {
  const own = copyData({ splits, parties })
  const lines = allocate(frozen, own.splits, own.parties)
  const grossCents = FrozenRevenue.grossOf(frozen)
  const total = lines.reduce((sum, l) => sum + l.dueCents, 0)
  const balanced = failIf(total !== grossCents, 'REP-4', `Allocated ${total}¢ but gross revenue is ${grossCents}¢`)
  if (!balanced.ok) return balanced
  return ok({ number, createdAt, grossCents, splits: own.splits, lines })
}

/** What REP-11 compares for one line: the party's details (name, email), due and video lines. */
const outcomeOfLine = ({ party, dueCents, videos }: AllocationLine) => ({
  partyId: party.partyId,
  name: party.name,
  email: party.email,
  dueCents,
  videos,
})

/** A comparable fingerprint of a revision's outcome, independent of line order. */
const outcomeOf = (lines: readonly AllocationLine[]): string =>
  JSON.stringify(lines.map(outcomeOfLine).sort((a, b) => a.partyId.localeCompare(b.partyId)))

function changeFor(partyId: PartyId, before: readonly AllocationLine[], after: readonly AllocationLine[]): DueChange {
  const line = lineFor(after, partyId) ?? lineFor(before, partyId)
  return {
    partyId,
    name: line?.party.name ?? partyId,
    fromCents: dueIn(before, partyId),
    toCents: dueIn(after, partyId),
  }
}

/** Every party (owner included) whose due changed; a dropped party goes to 0. */
function dueChanges(before: readonly AllocationLine[], after: readonly AllocationLine[]): DueChange[] {
  const partyIds = new Set([...before, ...after].map((l) => l.party.partyId))
  return [...partyIds].map((id) => changeFor(id, before, after)).filter((c) => c.fromCents !== c.toCents)
}

// ── aggregate ───────────────────────────────────────────────────────────────

/**
 * One month of one channel: frozen revenue, immutable revisions, sent markers and an
 * append-only activity log (REP-2…11, STM-3). There is no delete (REP-10).
 */
export class MonthlyReport {
  private constructor(
    readonly id: ReportId,
    readonly channelId: ChannelId,
    readonly period: Period,
    readonly frozenRevenue: FrozenRevenue,
    readonly revisions: readonly Revision[],
    readonly sent: SentMarkers,
    readonly activity: readonly ActivityEntry[],
  ) {
    deepFreeze([frozenRevenue, revisions, sent, activity])
    Object.freeze(this)
  }

  /** Revision 1: validates the period (REP-2), freezes revenue (REP-3, ACC-2) and allocates. */
  static generate(input: GenerateInput, meta: Meta, today: IsoDate): Result<MonthlyReport> {
    const period = checkPeriod(input.period, today)
    const frozen = FrozenRevenue.freeze(input.revenue, input.videos)
    if (!period.ok || !frozen.ok) return failAll(collect(period, frozen))
    const revision = buildRevision(1, meta.at, frozen.value, input.splits, input.parties)
    if (!revision.ok) return revision
    const entry: ActivityEntry = {
      id: meta.id,
      at: meta.at,
      type: 'generated',
      revision: 1,
      grossCents: revision.value.grossCents,
    }
    return ok(new MonthlyReport(input.id, input.channelId, input.period, frozen.value, [revision.value], {}, [entry]))
  }

  static fromSnapshot(s: MonthlyReportSnapshot): MonthlyReport {
    const c = copyData(s)
    return new MonthlyReport(c.id, c.channelId, c.period, c.frozenRevenue, c.revisions, c.sent, c.activity)
  }

  /** Appends Revision n+1 from the current splits and parties; revenue stays frozen (REP-3, REP-7, REP-11). */
  recalculate(splits: readonly SplitSnapshot[], parties: readonly PartySnapshot[], meta: Meta): Result<MonthlyReport> {
    const current = this.currentRevision()
    const revision = buildRevision(current.number + 1, meta.at, this.frozenRevenue, splits, parties)
    if (!revision.ok) return revision
    const next = revision.value
    if (outcomeOf(next.lines) === outcomeOf(current.lines)) {
      return fail('REP-11', `Nothing would change: Revision ${next.number} would be identical to Revision ${current.number}`)
    }
    const entry: ActivityEntry = {
      id: meta.id,
      at: meta.at,
      type: 'recalculated',
      revision: next.number,
      oldGrossCents: current.grossCents,
      newGrossCents: next.grossCents,
      changes: dueChanges(current.lines, next.lines),
    }
    return ok(this.with({ revisions: [...this.revisions, next], activity: [...this.activity, entry] }))
  }

  /** STM-3: records the current revision as sent to a collaborator listed on any revision. */
  markSent(collaboratorId: CollaboratorId, meta: Meta): Result<MonthlyReport> {
    const revision = this.currentRevision().number
    const name = this.latestPartySnapshot(collaboratorId)?.name
    if (name === undefined) return fail('STM-3', `${collaboratorId} is not on any revision of this report`)
    if ((this.sent[collaboratorId] ?? 0) >= revision) {
      return fail('STM-3', `Revision ${revision} has already been sent to ${name}`)
    }
    const entry: ActivityEntry = { id: meta.id, at: meta.at, type: 'sent', revision, collaboratorId, name }
    return ok(this.with({ sent: { ...this.sent, [collaboratorId]: revision }, activity: [...this.activity, entry] }))
  }

  currentRevision(): Revision {
    return this.revisions.at(-1) ?? invariantBroken('a report always has at least one revision')
  }

  /** The party's due in the given revision (default: current); 0 when the party has no line. */
  dueFor(partyId: PartyId, revisionNo?: number): Cents {
    const revision = revisionNo === undefined ? this.currentRevision() : this.revision(revisionNo)
    return dueIn(revision?.lines ?? [], partyId)
  }

  /** True if the party has a line on any revision. */
  everListed(partyId: PartyId): boolean {
    return this.revisions.some((r) => lineFor(r.lines, partyId) !== undefined)
  }

  toSnapshot(): MonthlyReportSnapshot {
    const { id, channelId, period, frozenRevenue, revisions, sent, activity } = this
    return { id, channelId, period, frozenRevenue, revisions, sent, activity }
  }

  /**
   * The party's details on the latest revision that lists them, considering only revisions up to
   * `upToRevision` (default: all). Undefined if no such revision lists them.
   */
  latestPartySnapshot(partyId: PartyId, upToRevision = Infinity): PartySnapshot | undefined {
    return this.revisions
      .filter((r) => r.number <= upToRevision)
      .reverse()
      .map((r) => lineFor(r.lines, partyId))
      .find((l) => l !== undefined)?.party
  }

  /** Revision `number`, or undefined when there is no such revision. */
  revision(number: number): Revision | undefined {
    return this.revisions.find((r) => r.number === number)
  }

  private with(changes: Partial<Pick<MonthlyReportSnapshot, 'revisions' | 'sent' | 'activity'>>): MonthlyReport {
    return new MonthlyReport(
      this.id,
      this.channelId,
      this.period,
      this.frozenRevenue,
      changes.revisions ?? this.revisions,
      changes.sent ?? this.sent,
      changes.activity ?? this.activity,
    )
  }
}
