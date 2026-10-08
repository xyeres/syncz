import { useRef } from 'react'
import { bpsLabel } from '@/ui/lib/format.js'
import { DRAG_SNAP, FULL, STEP, STEP_BIG, moveDivider, totalOf } from '@/ui/lib/shares.js'
import { useApp } from '@/ui/state/context.js'

/**
 * Big segmented bar. Each person is a pastel segment; the unallocated rest is
 * a hatched segment. Dividers can be dragged (snaps to 0.5%) or nudged with
 * arrow keys (1%, Shift = 5%).
 */
export default function AllocationBar({ shares, onChange }) {
  const { person } = useApp()
  const barRef = useRef(null)
  const remaining = FULL - totalOf(shares)

  const startOf = (i) => shares.slice(0, i).reduce((sum, x) => sum + x.bps, 0)
  const dividers = shares.map((_, i) => ({ i, at: startOf(i + 1) }))

  const bpsFromPointer = (clientX) => {
    const rect = barRef.current.getBoundingClientRect()
    const raw = ((clientX - rect.left) / rect.width) * FULL
    return Math.round(raw / DRAG_SNAP) * DRAG_SNAP
  }

  const onPointerDown = (e) => {
    e.currentTarget.setPointerCapture(e.pointerId)
    e.currentTarget.focus()
  }
  const onPointerMove = (e, i) => {
    if (!e.currentTarget.hasPointerCapture(e.pointerId)) return
    onChange(moveDivider(shares, i, bpsFromPointer(e.clientX) - startOf(i)))
  }
  const onKeyDown = (e, i) => {
    const step = e.shiftKey ? STEP_BIG : STEP
    if (e.key === 'ArrowLeft') onChange(moveDivider(shares, i, shares[i].bps - step))
    else if (e.key === 'ArrowRight') onChange(moveDivider(shares, i, shares[i].bps + step))
    else return
    e.preventDefault()
  }

  return (
    <div className="abar" ref={barRef}>
      {shares.map((s) => {
        const p = person(s.personId)
        return (
          <div
            key={s.personId}
            className="abar__seg"
            style={{ flexBasis: `${s.bps / 100}%`, '--c': p.color }}
            title={`${p.name} ${bpsLabel(s.bps)}`}
          >
            {s.bps >= (s.bps % 100 ? 1600 : 1000) && (
              <>
                <span className="abar__pct mono">{bpsLabel(s.bps)}</span>
                {s.bps >= 1600 && <span className="abar__who">{p.name}</span>}
              </>
            )}
          </div>
        )
      })}
      {remaining > 0 && (
        <div className="abar__seg abar__seg--empty" style={{ flexBasis: `${remaining / 100}%` }}>
          {remaining >= (remaining % 100 ? 1800 : 1300) && <span className="abar__pct mono">{bpsLabel(remaining)}</span>}
        </div>
      )}
      {dividers.map(({ i, at }) => {
        const left = person(shares[i].personId).name
        const right = i === shares.length - 1 ? 'Remaining' : person(shares[i + 1].personId).name
        if (i === shares.length - 1 && remaining === 0) return null
        return (
          <span
            key={shares[i].personId}
            className="abar__divider"
            style={{ left: `${at / 100}%`, zIndex: shares.length - i + 1 }}
            role="separator"
            aria-orientation="vertical"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={shares[i].bps / 100}
            aria-valuetext={`${left} ${bpsLabel(shares[i].bps)}`}
            aria-label={`Boundary between ${left} and ${right}`}
            tabIndex={0}
            onPointerDown={onPointerDown}
            onPointerMove={(e) => onPointerMove(e, i)}
            onKeyDown={(e) => onKeyDown(e, i)}
          >
            <span className="abar__grip" aria-hidden="true" />
          </span>
        )
      })}
    </div>
  )
}
