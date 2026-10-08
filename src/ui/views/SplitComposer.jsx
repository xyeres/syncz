import { useState } from 'react'
import AllocationBar from '@/ui/components/AllocationBar.jsx'
import AllocationRow from '@/ui/components/AllocationRow.jsx'
import Icon from '@/ui/components/Icon.jsx'
import VideoTile from '@/ui/components/VideoTile.jsx'
import { DEFAULT_PERIOD, ME } from '@/infrastructure/seed/mock.js'
import { bpsLabel, bpsNumber, money, monthName } from '@/ui/lib/format.js'
import { revenueFor } from '@/ui/lib/ledger.js'
import { navigate } from '@/ui/lib/router.js'
import { FULL, STEP, setShare, splitEvenly, totalOf, validateSplit } from '@/ui/lib/shares.js'
import { useApp } from '@/ui/state/context.js'

const FILTERS = [
  ['all', 'All'],
  ['selected', 'Selected'],
  ['available', 'Available'],
]

export default function SplitComposer({ splitId }) {
  const { splits, videos, collaborators, person, saveSplit, deleteSplit } = useApp()
  const existing = splits.find((s) => s.id === splitId)
  const isNew = !existing

  // Local draft, initialised once (the route keys this component by id).
  const [name, setName] = useState(existing?.name ?? '')
  const [selected, setSelected] = useState(() => new Set(existing?.videoIds ?? []))
  const [shares, setShares] = useState(existing?.shares ?? [{ personId: ME.id, bps: FULL }])
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState('all')

  // Videos already owned by another split can't be double-assigned.
  const lockedBy = new Map()
  for (const s of splits) if (s.id !== splitId) s.videoIds.forEach((id) => lockedBy.set(id, s.name))

  const q = query.trim().toLowerCase()
  const visible = videos
    .filter((v) => {
      if (q && !v.title.toLowerCase().includes(q)) return false
      if (filter === 'selected') return selected.has(v.id)
      if (filter === 'available') return !lockedBy.has(v.id)
      return true
    })
    // Available videos first; ones owned by other splits sink to the end.
    .toSorted((a, b) => Number(lockedBy.has(a.id)) - Number(lockedBy.has(b.id)))

  const selectedVideos = videos.filter((v) => selected.has(v.id))
  const splitRevenue = revenueFor(selectedVideos, DEFAULT_PERIOD)
  const total = totalOf(shares)
  const remaining = FULL - total
  const available = collaborators.filter((c) => !shares.some((s) => s.personId === c.id))

  const validation = validateSplit({ name, videoIds: [...selected], shares }, person)
  const canSave = validation.ok

  const toggleVideo = (id) =>
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

  const save = (e) => {
    e.preventDefault()
    if (!canSave) return
    const result = saveSplit({
      id: existing?.id ?? `s-${Date.now().toString(36)}`,
      name: name.trim(),
      videoIds: videos.filter((v) => selected.has(v.id)).map((v) => v.id),
      shares,
    })
    if (result.ok) navigate('splits')
  }

  const [confirmingDelete, setConfirmingDelete] = useState(false)
  const remove = () => {
    if (deleteSplit(existing.id).ok) navigate('splits')
  }

  return (
    <div className="page page--composer">
      <div className="composer">
        {/* LEFT — video picker */}
        <section className="composer__pick" aria-label="Choose videos">
          <header className="composer__head">
            <a href="#/splits" className="link-quiet mono back">
              <Icon name="arrowLeft" size={16} /> All splits
            </a>
            <h1 className="page-head__title">{isNew ? 'New split' : 'Edit split'}</h1>
            <p className="page-head__lede">Pick the videos on the left, divide their revenue on the right.</p>
          </header>
          <div className="pick-bar">
            <label className="search">
              <Icon name="search" size={22} />
              <span className="sr-only">Search videos</span>
              <input type="search" placeholder="Search videos" value={query} onChange={(e) => setQuery(e.target.value)} />
            </label>
            <div className="seg" role="radiogroup" aria-label="Filter videos">
              {FILTERS.map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  role="radio"
                  aria-checked={filter === id}
                  className="seg__btn"
                  onClick={() => setFilter(id)}
                >
                  {label}
                  {id === 'selected' && <span className="mono"> {selected.size}</span>}
                </button>
              ))}
            </div>
          </div>
          <div className="pick-count mono">
            <span>
              {selected.size} selected · {money(splitRevenue)} in {monthName(DEFAULT_PERIOD)}
            </span>
            <span className="muted">Click a tile to toggle</span>
          </div>
          {visible.length === 0 ? (
            <div className="empty empty--small">
              <p className="empty__title">No videos match.</p>
            </div>
          ) : (
            <div className="vgrid">
              {visible.map((v) => (
                <VideoTile
                  key={v.id}
                  video={v}
                  period={DEFAULT_PERIOD}
                  selected={selected.has(v.id)}
                  lockedBy={lockedBy.get(v.id)}
                  onToggle={() => toggleVideo(v.id)}
                />
              ))}
            </div>
          )}
        </section>

        {/* RIGHT — sticky allocation panel */}
        <form className="composer__alloc" onSubmit={save} aria-label="Allocation">
          <div className="alloc__section">
            <label className="field">
              <span className="label mono">Split name</span>
              <input
                className="input input--xl"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Podcast S2 w/ Sam"
                autoFocus={isNew}
              />
            </label>
          </div>

          <div className="alloc__section">
            <div className="alloc__head">
              <span className="label mono">Allocation</span>
              <span className={`alloc__total mono${remaining === 0 ? ' is-ok' : ''}`}>
                {bpsNumber(total)}
                <small>/100%</small>
              </span>
            </div>
            <AllocationBar shares={shares} onChange={setShares} />
            <p className="hint mono">
              {remaining > 0 ? (
                <>
                  <span className="hatch-key" aria-hidden="true" /> {bpsLabel(remaining)} unallocated
                </>
              ) : (
                <>
                  <Icon name="check" size={14} stroke={3} /> Fully allocated
                </>
              )}
              <span className="hint__aside muted">Drag dividers (0.5% snap) · steppers ±1%, Shift ±5% · type decimals</span>
            </p>
          </div>

          <div className="alloc__section alloc__rows">
            {shares.map((s) => (
              <AllocationRow
                key={s.personId}
                person={person(s.personId)}
                bps={s.bps}
                invalid={validation.offenders.has(s.personId)}
                estimate={(splitRevenue * s.bps) / FULL}
                onSet={(v) => setShares((prev) => setShare(prev, s.personId, v))}
                onNudge={(d) =>
                  setShares((prev) => setShare(prev, s.personId, prev.find((x) => x.personId === s.personId).bps + d * STEP))
                }
                onRemove={() => setShares((prev) => prev.filter((x) => x.personId !== s.personId))}
              />
            ))}
            {shares.length > 1 && (
              <button type="button" className="btn btn--quiet" onClick={() => setShares(splitEvenly)}>
                Split evenly
              </button>
            )}
          </div>

          {available.length > 0 && (
            <div className="alloc__section">
              <span className="label mono">Add collaborator</span>
              <div className="addchips">
                {available.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    className="addchip"
                    style={{ '--c': c.color }}
                    onClick={() => setShares((prev) => [...prev, { personId: c.id, bps: 0 }])}
                  >
                    <span className="addchip__dot" aria-hidden="true" />
                    {c.name}
                    <span className="mono muted small">{c.role}</span>
                    <Icon name="plus" size={16} stroke={2.5} />
                  </button>
                ))}
              </div>
              <a href="#/collaborators" className="link-quiet mono small">Manage collaborators →</a>
            </div>
          )}

          <div className="alloc__foot">
            <button type="submit" className="btn btn--primary btn--xl btn--block" disabled={!canSave} aria-describedby="save-hint">
              {isNew ? 'Save split' : 'Save changes'}
            </button>
            {canSave ? (
              <p id="save-hint" className="save-hint mono is-ok">
                Ready — {selected.size} videos, {shares.length} people, 100%
              </p>
            ) : (
              <ul id="save-hint" className="save-hint save-hint--list mono" aria-live="polite">
                {validation.reasons.map((r) => (
                  <li key={r.message}>{r.message}</li>
                ))}
              </ul>
            )}
            {!isNew &&
              (confirmingDelete ? (
                <div className="delconfirm" role="alertdialog" aria-label={`Delete ${existing.name}?`}>
                  <p>
                    <strong>Delete “{existing.name}”?</strong> Its {existing.videoIds.length} video
                    {existing.videoIds.length === 1 ? ' becomes' : 's become'} available for other splits. Existing
                    reports are not changed.
                  </p>
                  <div className="delconfirm__row">
                    <button type="button" className="btn btn--danger-solid" onClick={remove}>
                      Delete split
                    </button>
                    <button type="button" className="btn btn--secondary" onClick={() => setConfirmingDelete(false)} autoFocus>
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <button type="button" className="btn btn--quiet btn--danger" onClick={() => setConfirmingDelete(true)}>
                  <Icon name="trash" size={18} /> Delete split
                </button>
              ))}
          </div>
        </form>
      </div>
    </div>
  )
}
