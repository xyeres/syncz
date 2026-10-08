import { bpsLabel } from '@/ui/lib/format.js'
import { FULL, totalOf } from '@/ui/lib/shares.js'
import { useApp } from '@/ui/state/context.js'

/** Read-only stacked allocation bar. */
export default function SplitBar({ shares, height = 'md' }) {
  const { person } = useApp()
  const remaining = Math.max(0, FULL - totalOf(shares))
  return (
    <div
      className={`bar bar--${height}`}
      role="img"
      aria-label={shares.map((s) => `${person(s.personId).name} ${bpsLabel(s.bps)}`).join(', ')}
    >
      {shares.filter((s) => s.bps > 0).map((s) => (
        <span key={s.personId} className="bar__seg" style={{ flexBasis: `${s.bps / 100}%`, '--c': person(s.personId).color }}>
          {s.bps >= 900 && <span className="bar__label">{bpsLabel(s.bps).replace('%', '')}</span>}
        </span>
      ))}
      {remaining > 0 && <span className="bar__seg bar__seg--empty" style={{ flexBasis: `${remaining / 100}%` }} />}
    </div>
  )
}
