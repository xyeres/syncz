/*
 * Syncz domain state — pure JS (no React), so it can be replayed and checked
 * outside the browser.
 *
 * - `check*` guards return { ok, reasons: [{ code, message }] }, where `code`
 *   is the invariant ID from docs/invariants.md. The reducer runs the guard
 *   for every action against the CURRENT state; on failure it records
 *   `rejections[]` instead of changing anything, and the toast layer renders
 *   those. Dispatch helpers also pre-check (for their return value).
 * - The reducer is pure: ids and timestamps arrive on the action as
 *   `meta: { id, at }`.
 */
import { COLLABORATORS, ME, PALETTE, REPORT_SEEDS, SPLITS, USER, VIDEOS } from '@/infrastructure/seed/mock.js'
import { validateCollaborator } from '@/ui/lib/collaborators.js'
import { money, periodLabel } from '@/ui/lib/format.js'
import { computeLedger, freezeRevenue, frozenVideos } from '@/ui/lib/ledger.js'
import { fromCents, ledgerStatus, openEntries, recordsFor, toCents } from '@/ui/lib/payments.js'
import { LATEST_REPORTABLE, hasEnded, isPeriodKey, isReportable } from '@/ui/lib/periods.js'
import { validateSplit } from '@/ui/lib/shares.js'

const OK = { ok: true, reasons: [] }
const fail = (code, message) => ({ ok: false, reasons: [{ code, message }] })
const all = (reasons) => (reasons.length ? { ok: false, reasons } : OK)

/** Person lookup over the state (soft-deleted collaborators still resolve). */
export const lookup = (state) => (id) => (id === ME.id ? ME : state.collaborators.find((c) => c.id === id))
const nameOf = (state, id) => {
  const p = lookup(state)(id)
  return p ? (p.id === ME.id ? p.fullName : p.name) : 'Removed collaborator'
}
const reportOf = (state, period) => state.reports.find((r) => r.period === period)

export function statusOf(state, period, personId) {
  const line = reportOf(state, period)?.lines.find((l) => l.personId === personId)
  return ledgerStatus(line?.amount ?? 0, recordsFor(state.payments, period, personId))
}

/** On the report: a snapshot line, or any ledger entries for the period. */
const onReport = (state, report, personId) =>
  report.lines.some((l) => l.personId === personId) ||
  state.payments.some((p) => p.period === report.period && p.collaboratorId === personId)

// ───────────────────────── Guards ─────────────────────────

export function checkSaveSplit(state, split) {
  const v = validateSplit(split, (id) => ({ name: nameOf(state, id) }))
  const reasons = [...v.reasons]
  for (const s of state.splits) {
    if (s.id === split.id) continue
    const clash = split.videoIds.filter((id) => s.videoIds.includes(id))
    if (clash.length) reasons.push({ code: 'SPL-7', message: `${clash.length} video(s) already belong to “${s.name}”` })
  }
  const unknownVideo = split.videoIds.find((id) => !VIDEOS.some((v) => v.id === id))
  if (unknownVideo) reasons.push({ code: 'SPL-8', message: `Video ${unknownVideo} isn’t on the linked channel` })
  for (const sh of split.shares) {
    if (sh.personId === ME.id) continue
    const c = state.collaborators.find((x) => x.id === sh.personId)
    if (!c || c.deleted) reasons.push({ code: 'SPL-8', message: `${c?.name ?? 'A collaborator'} is deleted and can’t be in a split` })
  }
  return all(reasons)
}

export function checkDeleteSplit(state, id) {
  if (!state.splits.some((s) => s.id === id)) return fail('SPL-11', 'That split doesn’t exist or was already deleted')
  return OK
}

export function checkAddCollaborator(state, fields) {
  return all(validateCollaborator(fields, state.collaborators).issues)
}

export function checkUpdateCollaborator(state, id, fields) {
  if (id === ME.id) return fail('COL-7', 'The owner can’t be edited here')
  const current = state.collaborators.find((c) => c.id === id)
  if (!current) return fail('COL-1', 'That collaborator doesn’t exist')
  if (current.deleted) return fail('COL-5', `${current.name} is deleted and can’t be edited`)
  return all(validateCollaborator({ ...current, ...fields }, state.collaborators, id).issues)
}

export function checkDeleteCollaborator(state, id) {
  if (id === ME.id) return fail('COL-7', 'The owner can’t be deleted')
  const c = state.collaborators.find((x) => x.id === id)
  if (!c) return fail('COL-5', 'That collaborator doesn’t exist')
  if (c.deleted) return fail('COL-5', `${c.name} is already deleted`)
  const inSplits = state.splits.filter((s) => s.shares.some((x) => x.personId === id))
  if (inSplits.length) {
    return fail('COL-4', `Remove ${c.name} from ${inSplits.map((s) => `“${s.name}”`).join(', ')} first`)
  }
  return OK
}

export function checkGenerate(state, period) {
  if (!isPeriodKey(period)) return fail('REP-2', `“${period}” isn’t a calendar month`)
  if (!hasEnded(period)) {
    return fail('REP-2', `${periodLabel(period)} hasn’t ended yet. The latest reportable month is ${periodLabel(LATEST_REPORTABLE)}.`)
  }
  if (!isReportable(period)) return fail('REP-2', `There’s no revenue data for ${periodLabel(period)}`)
  if (reportOf(state, period)) return fail('REP-1', `${periodLabel(period)} already has a report — recalculate it instead`)
  return OK
}

export function checkRecalculate(state, period) {
  if (!reportOf(state, period)) return fail('REP-7', `${periodLabel(period)} has no report to recalculate`)
  return OK
}

function checkLedgerTarget(state, period, personId) {
  if (personId === ME.id) return fail('COL-7', 'The owner can’t be paid through Syncz')
  const report = reportOf(state, period)
  if (!report) return fail('PAY-5', `${periodLabel(period)} hasn’t been generated`)
  if (!onReport(state, report, personId)) return fail('PAY-5', `${nameOf(state, personId)} isn’t on the ${periodLabel(period)} report`)
  return OK
}

export function checkMarkPaid(state, period, personId) {
  const target = checkLedgerTarget(state, period, personId)
  if (!target.ok) return target
  const { balance } = statusOf(state, period, personId)
  if (toCents(balance) <= 0) return fail('PAY-6', `Nothing is owed to ${nameOf(state, personId)} for ${periodLabel(period)}`)
  return OK
}

export function checkUndo(state, period, personId) {
  const target = checkLedgerTarget(state, period, personId)
  if (!target.ok) return target
  if (!openEntries(recordsFor(state.payments, period, personId)).length) {
    return fail('PAY-3', `There’s no payment or settlement to undo for ${nameOf(state, personId)}`)
  }
  // PAY-4: undoing must never leave net paid negative.
  const last = openEntries(recordsFor(state.payments, period, personId)).at(-1)
  const { paid } = statusOf(state, period, personId)
  if (toCents(paid) - toCents(last.amount) < 0) return fail('PAY-4', 'Undoing this would make net paid negative')
  return OK
}

export function checkSettlement(state, period, personId, amount) {
  const target = checkLedgerTarget(state, period, personId)
  if (!target.ok) return target
  const { balance } = statusOf(state, period, personId)
  if (toCents(balance) >= 0) return fail('PAY-9', `${nameOf(state, personId)} isn’t overpaid for ${periodLabel(period)}`)
  if (toCents(amount) !== -toCents(balance)) {
    return fail('PAY-9', `A settlement must be exactly the overpaid ${money(-balance)}`)
  }
  return OK
}

export function checkMarkSent(state, period, personId) {
  const report = reportOf(state, period)
  if (!report) return fail('STM-3', `${periodLabel(period)} hasn’t been generated`)
  if (!report.lines.some((l) => l.personId === personId && l.personId !== ME.id)) {
    return fail('STM-3', `${nameOf(state, personId)} has no statement in Revision ${report.revision}`)
  }
  if ((report.sent?.[personId] ?? 0) >= report.revision) {
    return fail('STM-3', `Revision ${report.revision} is already marked sent to ${nameOf(state, personId)}`)
  }
  return OK
}

// ───────────────────────── Transitions ─────────────────────────

/** Collaborators whose due amount differs between two snapshots. */
function diffLines(before, after) {
  const ids = new Set([...before, ...after].map((l) => l.personId))
  const line = (lines, id) => lines.find((l) => l.personId === id)
  return [...ids]
    .filter((id) => id !== ME.id)
    .map((id) => {
      const a = line(before, id)
      const b = line(after, id)
      return { personId: id, name: b?.name ?? a?.name, from: a?.amount ?? 0, to: b?.amount ?? 0 }
    })
    .filter((c) => toCents(c.from) !== toCents(c.to))
}

/** Revision 1: freeze revenue (REP-3) and snapshot. */
function generate(state, period, splits, meta) {
  const frozenRevenue = freezeRevenue(VIDEOS, period)
  const { gross, lines } = computeLedger(period, frozenVideos(VIDEOS, period, frozenRevenue), splits, lookup(state))
  const report = {
    id: period,
    period,
    revision: 1,
    issuedAt: meta.at,
    generatedAt: meta.at,
    recalculatedAt: null,
    frozenRevenue, // { videoId: cents } — never re-read after Revision 1
    gross,
    lines,
    history: [], // totals of prior revisions, oldest first
    sent: {}, // personId → revision whose statement was marked sent
  }
  return {
    ...state,
    reports: [...state.reports, report],
    activity: [...state.activity, { id: `ev-${meta.id}`, period, type: 'generated', at: meta.at, revision: 1, gross }],
  }
}

/** Next revision: current splits over the frozen revenue. Ledger entries untouched (PAY-8). */
function recalculate(state, period, splits, meta) {
  const existing = reportOf(state, period)
  const { gross, lines } = computeLedger(period, frozenVideos(VIDEOS, period, existing.frozenRevenue), splits, lookup(state))
  const revision = existing.revision + 1
  const prior = {
    revision: existing.revision,
    issuedAt: existing.issuedAt,
    gross: existing.gross,
    totals: Object.fromEntries(existing.lines.map((l) => [l.personId, l.amount])),
  }
  return {
    ...state,
    reports: state.reports.map((r) =>
      r.period === period
        ? { ...r, gross, lines, revision, issuedAt: meta.at, recalculatedAt: meta.at, history: [...r.history, prior] }
        : r,
    ),
    activity: [
      ...state.activity,
      {
        id: `ev-${meta.id}`,
        period,
        type: 'recalculated',
        at: meta.at,
        revision,
        oldGross: existing.gross,
        newGross: gross,
        changes: diffLines(existing.lines, lines),
      },
    ],
  }
}

function appendEntry(state, record, event) {
  return {
    ...state,
    payments: [...state.payments, record],
    activity: [...state.activity, { id: `ev-${record.id}`, period: record.period, at: record.at, ...event }],
  }
}

/** Pay exactly the current balance (PAY-6), or a fixed amount for seed history. */
function pay(state, period, personId, meta, amount = null, note) {
  const value = amount ?? statusOf(state, period, personId).balance
  const record = { id: meta.id, collaboratorId: personId, period, amount: fromCents(toCents(value)), kind: 'payment', at: meta.at }
  if (note) record.note = note
  return appendEntry(state, record, { type: 'payment', personId, name: nameOf(state, personId), amount: record.amount, note })
}

/** PAY-9: a negative entry for exactly the overpaid amount. */
function settle(state, period, personId, meta, note) {
  const { balance } = statusOf(state, period, personId)
  const record = { id: meta.id, collaboratorId: personId, period, amount: balance, kind: 'settlement', at: meta.at }
  if (note) record.note = note
  return appendEntry(state, record, { type: 'settlement', personId, name: nameOf(state, personId), amount: -balance, note })
}

/** Undo = a reversal of the last un-reversed payment or settlement (PAY-3). */
function reverse(state, period, personId, meta, note = 'Undone') {
  const last = openEntries(recordsFor(state.payments, period, personId)).at(-1)
  const record = {
    id: meta.id,
    collaboratorId: personId,
    period,
    amount: -last.amount,
    kind: 'reversal',
    at: meta.at,
    note: `${note} — reverses ${last.id}`,
  }
  return appendEntry(state, record, {
    type: 'reversal',
    reversedKind: last.kind,
    personId,
    name: nameOf(state, personId),
    amount: record.amount,
    note,
  })
}

function markSent(state, period, personId, meta) {
  const report = reportOf(state, period)
  return {
    ...state,
    reports: state.reports.map((r) => (r === report ? { ...r, sent: { ...r.sent, [personId]: r.revision } } : r)),
    activity: [
      ...state.activity,
      {
        id: `ev-${meta.id}`,
        period,
        type: 'sent',
        at: meta.at,
        revision: report.revision,
        personId,
        name: report.lines.find((l) => l.personId === personId)?.name ?? nameOf(state, personId),
      },
    ],
  }
}

// ───────────────────────── Seed replay + reducer ─────────────────────────

export function initState() {
  let state = {
    user: null,
    collaborators: COLLABORATORS,
    splits: SPLITS,
    reports: [],
    payments: [],
    activity: [],
    rejections: [], // UI-facing: guard failures the toast layer shows
  }
  let n = 0
  const seedMeta = (at) => ({ id: `seed-${String(++n).padStart(3, '0')}`, at })
  for (const seed of REPORT_SEEDS) {
    state = generate(state, seed.period, seed.splits ?? SPLITS, seedMeta(seed.generatedAt))
    for (const p of seed.payments ?? []) {
      if (p.reverse) state = reverse(state, seed.period, p.personId, seedMeta(p.at), p.note)
      else if (p.settle) state = settle(state, seed.period, p.personId, seedMeta(p.at), p.note)
      else state = pay(state, seed.period, p.personId, seedMeta(p.at), p.amount === 'due' ? null : p.amount, p.note)
    }
    if (seed.recalculatedAt) state = recalculate(state, seed.period, SPLITS, seedMeta(seed.recalculatedAt))
  }
  return state
}

/** Most recent rejections, newest last — what the toast layer renders. */
export const toastsFrom = (state) => state.rejections.slice(-3)

export function reducer(state, action) {
  // Single guard point. If the guard fails (including when the helper's
  // pre-check passed against a stale render — e.g. a rapid double click),
  // the rejection is recorded in state so it always reaches the toast layer.
  const check = checkAction(state, action)
  if (!check.ok) {
    const id = action.meta?.id ?? `rej-${state.rejections.length}`
    if (state.rejections.some((r) => r.id === id)) return state
    return { ...state, rejections: [...state.rejections, { id, type: action.type, reasons: check.reasons }] }
  }

  switch (action.type) {
    case 'signIn':
      return { ...state, user: USER }
    case 'signOut':
      return initState()
    case 'dismissRejection':
      return { ...state, rejections: state.rejections.filter((r) => r.id !== action.id) }
    case 'saveSplit': {
      const exists = state.splits.some((s) => s.id === action.split.id)
      return {
        ...state,
        splits: exists
          ? state.splits.map((s) => (s.id === action.split.id ? action.split : s))
          : [...state.splits, action.split],
      }
    }
    case 'deleteSplit':
      // SPL-11: frees its videos; report snapshots keep the split name.
      return { ...state, splits: state.splits.filter((s) => s.id !== action.id) }
    case 'addCollaborator': {
      const color = PALETTE[state.collaborators.length % PALETTE.length]
      return { ...state, collaborators: [...state.collaborators, { ...action.collaborator, color }] }
    }
    case 'updateCollaborator':
      return {
        ...state,
        collaborators: state.collaborators.map((c) => (c.id === action.id ? { ...c, ...action.fields } : c)),
      }
    case 'deleteCollaborator':
      // Soft delete (COL-5): kept so history still resolves their identity.
      return {
        ...state,
        collaborators: state.collaborators.map((c) => (c.id === action.id ? { ...c, deleted: true } : c)),
      }
    case 'generateReport':
      return generate(state, action.period, state.splits, action.meta)
    case 'recalculateReport':
      return recalculate(state, action.period, state.splits, action.meta)
    case 'markSent':
      return markSent(state, action.period, action.personId, action.meta)
    case 'markPaid':
      return pay(state, action.period, action.personId, action.meta)
    case 'recordSettlement':
      return settle(state, action.period, action.personId, action.meta, action.note)
    case 'undoEntry':
      return reverse(state, action.period, action.personId, action.meta)
    default:
      throw new Error(`Unknown action ${action.type}`)
  }
}

/** Which guard to run for an action — used by the dispatch helpers. */
export function checkAction(state, action) {
  switch (action.type) {
    case 'saveSplit':
      return checkSaveSplit(state, action.split)
    case 'deleteSplit':
      return checkDeleteSplit(state, action.id)
    case 'addCollaborator':
      return checkAddCollaborator(state, action.collaborator)
    case 'updateCollaborator':
      return checkUpdateCollaborator(state, action.id, action.fields)
    case 'deleteCollaborator':
      return checkDeleteCollaborator(state, action.id)
    case 'generateReport':
      return checkGenerate(state, action.period)
    case 'recalculateReport':
      return checkRecalculate(state, action.period)
    case 'markSent':
      return checkMarkSent(state, action.period, action.personId)
    case 'markPaid':
      return checkMarkPaid(state, action.period, action.personId)
    case 'recordSettlement':
      return checkSettlement(state, action.period, action.personId, action.amount)
    case 'undoEntry':
      return checkUndo(state, action.period, action.personId)
    default:
      return OK
  }
}
