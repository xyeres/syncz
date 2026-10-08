import { ME } from '@/infrastructure/seed/mock.js'

const round2 = (n) => Math.round(n * 100) / 100
const cents = (n) => Math.round(n * 100)

/** Revenue of a set of videos in one month. */
export function revenueFor(videos, period) {
  return round2(videos.reduce((sum, v) => sum + (v.revenue[period] ?? 0), 0))
}

/** The identity fields frozen into a snapshot so documents survive edits/deletes. */
export const identityOf = (p) => ({
  name: p.id === ME.id ? p.fullName : p.name,
  email: p.email,
  role: p.role,
  color: p.color,
  initials: p.initials,
})

/**
 * Build the ledger snapshot for a month, in integer cents.
 *
 * Per video: each collaborator gets round(revenue × bps / 10000) cents and
 * "You" gets the rest of that video's revenue — so rounding is absorbed by
 * the creator at the row level. A collaborator's due is exactly the sum of
 * their per-video cents, and all lines sum exactly to gross.
 *
 * Videos outside every split go 100% to the creator.
 * `people` (optional) is a lookup used to freeze names/emails on each line.
 */
export function computeLedger(period, videos, splits, people) {
  const byId = new Map(videos.map((v) => [v.id, v]))
  const lines = new Map()
  const lineFor = (personId) => {
    if (!lines.has(personId)) lines.set(personId, { personId, cents: 0, parts: new Map(), videos: [] })
    return lines.get(personId)
  }
  const add = (personId, split, video, revC, bps, c) => {
    const line = lineFor(personId)
    line.cents += c
    const key = split?.id ?? 'unsplit'
    const part = line.parts.get(key) ?? { splitId: split?.id ?? null, splitName: split?.name ?? 'Unsplit videos', bps, cents: 0 }
    part.cents += c
    line.parts.set(key, part)
    if (split) {
      line.videos.push({
        videoId: video.id,
        title: video.title,
        videoRevenue: revC / 100,
        bps,
        amount: c / 100,
        splitId: split.id,
        splitName: split.name,
      })
    }
  }

  const assigned = new Set()
  for (const split of splits) {
    const meShare = split.shares.find((s) => s.personId === ME.id)?.bps ?? 0
    for (const id of split.videoIds) {
      const video = byId.get(id)
      if (!video) continue
      assigned.add(id)
      const rev = video.revenue[period]
      if (rev === undefined) continue // not published yet in this period
      const revC = cents(rev)
      let othersC = 0
      for (const share of split.shares) {
        if (share.personId === ME.id || share.bps <= 0) continue
        const c = Math.round((revC * share.bps) / 10000)
        othersC += c
        add(share.personId, split, video, revC, share.bps, c)
      }
      add(ME.id, split, video, revC, meShare, revC - othersC)
    }
  }

  const unassignedC = cents(revenueFor(videos.filter((v) => !assigned.has(v.id)), period))
  if (unassignedC > 0) add(ME.id, null, null, unassignedC, 10000, unassignedC)

  const grossC = [...lines.values()].reduce((s, l) => s + l.cents, 0)
  const gross = grossC / 100

  const sorted = [...lines.values()]
    .map(({ cents: c, parts, ...l }) => {
      const p = people?.(l.personId)
      return {
        ...l,
        ...(p ? identityOf(p) : {}),
        amount: c / 100,
        share: grossC ? (c / grossC) * 100 : 0,
        parts: [...parts.values()].map(({ cents: pc, ...part }) => ({ ...part, amount: pc / 100 })),
      }
    })
    .sort((a, b) => (a.personId === ME.id ? -1 : b.personId === ME.id ? 1 : b.amount - a.amount))

  return { period, gross, lines: sorted }
}

/**
 * REP-3: freeze per-video revenue (cents) for a period at Revision 1.
 * Videos without revenue in the period (not yet published) are left out.
 */
export function freezeRevenue(videos, period) {
  const frozen = {}
  for (const v of videos) if (v.revenue[period] !== undefined) frozen[v.id] = cents(v.revenue[period])
  return frozen
}

/** Video list whose only revenue is the frozen figure — feed to computeLedger. */
export function frozenVideos(videos, period, frozen) {
  return videos
    .filter((v) => frozen[v.id] !== undefined)
    .map((v) => ({ ...v, revenue: { [period]: frozen[v.id] / 100 } }))
}
