import { ME } from '@/infrastructure/seed/mock.js'

/**
 * Shares are integer hundredths of a percent ("bps"): 10000 = 100%.
 * Integers avoid float drift (33.33 + 33.33 + 33.34 is exactly 10000).
 */
export const FULL = 10000
export const STEP = 100 // ±1%
export const STEP_BIG = 500 // ±5% with Shift
export const DRAG_SNAP = 50 // dividers snap to 0.5%

export const totalOf = (shares) => shares.reduce((s, x) => s + x.bps, 0)

const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n))

/** "30.33" → 3033; null when the string isn't a usable number. */
export function parsePercent(text) {
  if (!/^\d{0,3}(\.\d{0,2})?$/.test(text) || text === '' || text === '.') return null
  return Math.round(Number(text) * 100)
}

/**
 * Set one person's share while keeping the total ≤ 100%.
 * Increases draw from Remaining first, then from "You" — so with a fresh
 * split (You = 100%) bumping a collaborator just works.
 */
export function setShare(shares, personId, desiredBps) {
  const target = shares.find((s) => s.personId === personId)
  if (!target) return shares
  const want = clamp(Math.round(Number(desiredBps) || 0), 0, FULL)
  const delta = want - target.bps
  if (delta <= 0) return shares.map((s) => (s.personId === personId ? { ...s, bps: want } : s))

  let need = delta
  const fromRemaining = Math.min(need, FULL - totalOf(shares))
  need -= fromRemaining

  const me = shares.find((s) => s.personId === ME.id)
  const fromMe = personId !== ME.id && me ? Math.min(need, me.bps) : 0
  const granted = fromRemaining + fromMe

  return shares.map((s) => {
    if (s.personId === personId) return { ...s, bps: s.bps + granted }
    if (s.personId === ME.id && fromMe) return { ...s, bps: s.bps - fromMe }
    return s
  })
}

/** Move the boundary after index i so that shares[i] becomes `left` bps. */
export function moveDivider(shares, i, left) {
  const rightIsRemaining = i === shares.length - 1
  const pair = shares[i].bps + (rightIsRemaining ? FULL - totalOf(shares) : shares[i + 1].bps)
  const nextLeft = clamp(Math.round(left), 0, pair)
  return shares.map((s, idx) => {
    if (idx === i) return { ...s, bps: nextLeft }
    if (idx === i + 1 && !rightIsRemaining) return { ...s, bps: pair - nextLeft }
    return s
  })
}

/**
 * Even split in hundredths; "You" (or the first line) absorbs the remainder.
 * Each share is floor(10000 / n) ≥ MIN_SHARE for any n ≤ 1000 people, so this
 * never produces a sub-minimum share (SPL-3).
 */
export function splitEvenly(shares) {
  const n = shares.length
  const base = Math.floor(FULL / n)
  const extra = FULL - base * n
  const meIdx = Math.max(0, shares.findIndex((s) => s.personId === ME.id))
  return shares.map((s, i) => ({ ...s, bps: base + (i === meIdx ? extra : 0) }))
}

/** SPL-3: smallest allowed non-zero share — 0.10%. */
export const MIN_SHARE = 10

/**
 * The single source of truth for "can this split be saved?" (SPL-1/3/4/5/6).
 * Drafts may be invalid; this only gates Save.
 *
 * @param {{ name: string, videoIds: string[], shares: {personId, bps}[] }} split
 * @param {(id: string) => { name: string }} [nameOf]  for human-readable reasons
 * @returns {{ ok: boolean, reasons: { code: string, message: string }[], offenders: Set<string> }}
 *   `offenders` = personIds whose rows should be highlighted.
 */
export function validateSplit({ name, videoIds, shares }, nameOf = (id) => ({ name: id })) {
  const reasons = []
  const offenders = new Set()
  const fail = (code, message) => reasons.push({ code, message })

  if (!name?.trim()) fail('SPL-6', 'Name this split')
  if (!videoIds?.length) fail('SPL-6', 'Pick at least one video')

  const owners = shares.filter((s) => s.personId === ME.id)
  if (owners.length !== 1) fail('SPL-4', 'The split must include you exactly once')
  const ids = shares.map((s) => s.personId)
  if (new Set(ids).size !== ids.length) fail('SPL-5', 'Each collaborator can appear only once')

  for (const s of shares) {
    if (!Number.isInteger(s.bps) || s.bps < 0) {
      fail('SPL-2', 'Shares must be whole hundredths of a percent')
      offenders.add(s.personId)
    } else if (s.personId === ME.id) {
      if (s.bps > 0 && s.bps < MIN_SHARE) {
        fail('SPL-4', 'Your share must be 0% or at least 0.10%')
        offenders.add(s.personId)
      }
    } else if (s.bps < MIN_SHARE) {
      fail('SPL-3', `Give ${nameOf(s.personId).name} at least 0.10% or remove them`)
      offenders.add(s.personId)
    }
  }

  const total = totalOf(shares)
  if (total < FULL) fail('SPL-1', `Allocate the remaining ${formatBps(FULL - total)}`)
  if (total > FULL) fail('SPL-1', `Shares exceed 100% by ${formatBps(total - FULL)}`)

  return { ok: reasons.length === 0, reasons, offenders }
}

const formatBps = (bps) => `${bps % 100 === 0 ? bps / 100 : (bps / 100).toFixed(2)}%`
