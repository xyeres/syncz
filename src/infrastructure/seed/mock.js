// All mock data for Syncz lives here. Nothing is persisted.

/** The app treats this as "now" so the mock revenue lines up. */
export const TODAY = new Date(2026, 9, 7) // 7 Oct 2026

const pad = (n) => String(n).padStart(2, '0')
export const monthKey = (date) => `${date.getFullYear()}-${pad(date.getMonth() + 1)}`

/** Last 14 complete months, oldest first: 2025-08 … 2026-09. */
export const MONTHS = Array.from({ length: 14 }, (_, i) =>
  monthKey(new Date(TODAY.getFullYear(), TODAY.getMonth() - 14 + i, 1)),
)

/** Previous month relative to TODAY — the default report period. */
export const DEFAULT_PERIOD = MONTHS[MONTHS.length - 1]

export const USER = {
  name: 'Maya Ortiz',
  email: 'maya@mayabuilds.studio',
  initials: 'MO',
}

export const CHANNEL = {
  id: 'UC7mB2xQe9kLr4Ws',
  name: 'Maya Builds',
  handle: '@mayabuilds',
  subscribers: '284K',
  avatar: 'https://picsum.photos/seed/mayabuilds/96/96',
}

/** Flat pastel blocks — one per person, used everywhere they appear. */
export const PALETTE = [
  '#C9B8FF', // lilac
  '#A8E6CF', // mint
  '#FFE58A', // butter
  '#FF9B85', // coral
  '#9FD3FF', // sky
  '#FFC8A2', // peach
  '#F5B8E0', // pink
  '#C7E07A', // pistachio
]

/** The creator's own line in every split. */
export const ME = {
  id: 'me',
  name: 'You',
  fullName: USER.name,
  role: 'Channel owner',
  email: USER.email,
  initials: USER.initials,
  color: '#E6E3D8', // stone — neutral so collaborators pop
}

export const COLLABORATORS = [
  { id: 'c-sam', name: 'Sam Reyes', role: 'Co-host', email: 'sam@reyes.fm', initials: 'SR', color: PALETTE[0] },
  { id: 'c-priya', name: 'Priya Nair', role: 'Editor', email: 'priya.nair@cutroom.co', initials: 'PN', color: PALETTE[1] },
  { id: 'c-leo', name: 'Leo Park', role: 'Thumbnail artist', email: 'leo@parkdraws.com', initials: 'LP', color: PALETTE[2] },
  { id: 'c-jonah', name: 'Jonah Fields', role: 'Motion designer', email: 'jonah@fields.studio', initials: 'JF', color: PALETTE[3] },
  { id: 'c-ines', name: 'Inês Duarte', role: 'Sound engineer', email: 'ines@duarte.audio', initials: 'ID', color: PALETTE[4] },
  { id: 'c-theo', name: 'Theo Grant', role: 'Writer & researcher', email: 'theo.grant@hey.com', initials: 'TG', color: PALETTE[5] },
]

// Deterministic PRNG so revenue is stable between reloads.
function mulberry32(seed) {
  let a = seed
  return () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const monthsBetween = (fromKey, toKey) => {
  const [fy, fm] = fromKey.split('-').map(Number)
  const [ty, tm] = toKey.split('-').map(Number)
  return (ty - fy) * 12 + (tm - fm)
}

// [title, publishedAt, base monthly revenue at peak (USD), views]
const RAW_VIDEOS = [
  ['Shop Talk Ep. 18 — Pricing your first commission', '2026-02-11', 1850, 214000],
  ['Shop Talk Ep. 19 — We tried every Japanese saw', '2026-04-08', 2240, 287000],
  ['Shop Talk Ep. 20 — Burnout, sawdust & saying no', '2026-06-03', 1720, 168000],
  ['Shop Talk Ep. 21 — Live from the timber yard', '2026-08-12', 2610, 241000],
  ['Dovetails by hand: the complete guide', '2025-03-19', 3120, 1240000],
  ['Building a walnut desk in 5 days', '2025-09-24', 2780, 812000],
  ['Sharpening chisels — beginner to razor', '2025-11-05', 1960, 603000],
  ['Japanese joinery without fancy tools', '2026-01-21', 2450, 731000],
  ['Epoxy river table, honestly', '2026-05-14', 2090, 498000],
  ['60-second finishes: Danish oil vs. wax', '2026-03-02', 640, 1830000],
  ['60-second fix: tear-out on figured maple', '2026-05-27', 580, 1410000],
  ['60-second jig: perfect 45° every time', '2026-07-15', 710, 2050000],
  ['My shop tour (2025 edition)', '2025-06-30', 1480, 392000],
  ['I restored a 1920s Stanley No. 4', '2025-12-17', 1690, 455000],
  ['What I wish I knew before buying a table saw', '2026-07-01', 1910, 377000],
  ['Building a kid-sized workbench with my nephew', '2026-09-09', 1350, 142000],
]

const rand = mulberry32(20261007)

export const VIDEOS = RAW_VIDEOS.map(([title, publishedAt, base, views], i) => {
  const id = `v${pad(i + 1)}`
  const pubMonth = publishedAt.slice(0, 7)
  const revenue = {}
  for (const m of MONTHS) {
    const age = monthsBetween(pubMonth, m)
    if (age < 0) continue
    const curve = age === 0 ? 0.55 : age === 1 ? 1 : Math.max(0.22, 1 - 0.11 * (age - 1))
    const noise = 0.85 + rand() * 0.3
    revenue[m] = Math.round(base * curve * noise * 100) / 100
  }
  return {
    id,
    title,
    thumbnail: `https://picsum.photos/seed/${id}/480/270`,
    publishedAt,
    views,
    revenue,
  }
})

/**
 * Pre-existing splits so reports aren't empty.
 * Shares are stored as integer hundredths of a percent (bps): 10000 = 100%.
 */
export const SPLITS = [
  {
    id: 's-podcast',
    name: 'Shop Talk S2 w/ Sam',
    videoIds: ['v01', 'v02', 'v03', 'v04'],
    shares: [
      { personId: 'me', bps: 5000 },
      { personId: 'c-sam', bps: 3500 },
      { personId: 'c-priya', bps: 1500 },
    ],
  },
  {
    id: 's-tutorials',
    name: 'Tutorial series',
    videoIds: ['v05', 'v06', 'v07', 'v08', 'v09'],
    shares: [
      { personId: 'me', bps: 7000 },
      { personId: 'c-priya', bps: 2000 },
      { personId: 'c-leo', bps: 1000 },
    ],
  },
  {
    id: 's-shorts',
    name: '60-second shorts',
    videoIds: ['v10', 'v11', 'v12'],
    shares: [
      { personId: 'me', bps: 7500 },
      { personId: 'c-jonah', bps: 1500 },
      { personId: 'c-leo', bps: 1000 },
    ],
  },
]

/**
 * How the shorts + tutorial splits looked when June was first generated.
 * They were corrected afterwards, and June was recalculated — which leaves
 * Jonah overpaid and Leo with a difference to pay (see REPORT_SEEDS).
 */
const JUNE_ORIGINAL_SPLITS = SPLITS.map((split) => {
  if (split.id === 's-shorts')
    return { ...split, shares: [{ personId: 'me', bps: 7000 }, { personId: 'c-jonah', bps: 2000 }, { personId: 'c-leo', bps: 1000 }] }
  if (split.id === 's-tutorials')
    return { ...split, shares: [{ personId: 'me', bps: 7200 }, { personId: 'c-priya', bps: 2000 }, { personId: 'c-leo', bps: 800 }] }
  return split
})

/**
 * Reports generated before "today", replayed at app start (state/AppContext).
 * Payment `amount: 'due'` means "the full balance at that moment";
 * `reverse: true` undoes the last entry; `settle: true` records a settlement.
 * Each report is snapshotted from `splits` (default: current SPLITS); if
 * `recalculatedAt` is set it is then re-snapshotted against current SPLITS.
 */
export const REPORT_SEEDS = [
  {
    period: '2026-06',
    generatedAt: '2026-07-02T09:12:00',
    splits: JUNE_ORIGINAL_SPLITS,
    payments: [
      { personId: 'c-sam', amount: 'due', at: '2026-07-06T11:20:00' },
      { personId: 'c-priya', amount: 'due', at: '2026-07-06T11:22:00' },
      { personId: 'c-leo', amount: 'due', at: '2026-07-06T11:25:00' },
      { personId: 'c-jonah', amount: 'due', at: '2026-07-06T11:27:00' },
    ],
    recalculatedAt: '2026-07-21T16:40:00',
  },
  {
    period: '2026-07',
    generatedAt: '2026-08-03T10:02:00',
    payments: [
      { personId: 'c-sam', amount: 'due', at: '2026-08-05T14:10:00' },
      { personId: 'c-priya', amount: 'due', at: '2026-08-05T14:12:00' },
      { personId: 'c-priya', amount: 100, at: '2026-08-05T14:13:00', note: 'Duplicate transfer' },
      { personId: 'c-priya', settle: true, at: '2026-08-20T09:40:00', note: 'Repaid via Venmo 8/20' },
      { personId: 'c-leo', amount: 'due', at: '2026-08-05T14:15:00' },
      { personId: 'c-jonah', amount: 'due', at: '2026-08-05T14:16:00' },
    ],
  },
  {
    period: '2026-08',
    generatedAt: '2026-09-02T09:30:00',
    payments: [
      { personId: 'c-sam', amount: 'due', at: '2026-09-04T10:05:00' },
      { personId: 'c-sam', reverse: true, at: '2026-09-04T10:31:00', note: 'Sent to the wrong account' },
      { personId: 'c-sam', amount: 'due', at: '2026-09-04T10:44:00' },
      { personId: 'c-priya', amount: 'due', at: '2026-09-04T10:50:00' },
      { personId: 'c-leo', amount: 250, at: '2026-09-12T17:03:00', note: 'First half' },
    ],
  },
]
