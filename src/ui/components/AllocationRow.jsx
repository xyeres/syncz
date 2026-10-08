import { useState } from 'react'
import { ME } from '@/infrastructure/seed/mock.js'
import { bpsNumber, money } from '@/ui/lib/format.js'
import { parsePercent } from '@/ui/lib/shares.js'
import Icon from './Icon.jsx'
import { Swatch } from './Person.jsx'

/**
 * One person's line in the composer: identity, big −/+ stepper (1%, Shift 5%)
 * and a decimal input (up to 2 places). While typing, the raw text is kept
 * locally so "30." isn't reformatted mid-keystroke.
 */
export default function AllocationRow({ person, bps, invalid = false, estimate, onSet, onNudge, onRemove }) {
  const [draft, setDraft] = useState(null)
  const isMe = person.id === ME.id

  const change = (text) => {
    const clean = text.replace(',', '.')
    if (!/^\d{0,3}(\.\d{0,2})?$/.test(clean)) return
    setDraft(clean)
    const parsed = parsePercent(clean)
    if (parsed !== null) onSet(parsed)
    else if (clean === '') onSet(0)
  }

  return (
    <div className={`arow${invalid ? ' arow--invalid' : ''}`} style={{ '--c': person.color }}>
      <Swatch person={person} size="lg" />
      <div className="arow__who">
        <div className="arow__name" title={`${isMe ? person.fullName : person.name} — ${person.role}`}>
          {person.name}
        </div>
        <div className="arow__role mono">
          {invalid ? (isMe ? '0% or ≥ 0.10%' : 'Min 0.10%') : `≈ ${money(estimate)}`}
        </div>
      </div>
      <div className="stepper">
        <button
          type="button"
          className="stepper__btn"
          onClick={(e) => onNudge(e.shiftKey ? -5 : -1)}
          aria-label={`Decrease ${person.name} by 1% (Shift: 5%)`}
          disabled={bps <= 0}
        >
          <Icon name="minus" size={22} stroke={2.5} />
        </button>
        <label className="stepper__field">
          <span className="sr-only">{person.name} percentage</span>
          <input
            type="text"
            inputMode="decimal"
            className="mono"
            aria-invalid={invalid || undefined}
            value={draft ?? bpsNumber(bps)}
            onFocus={(e) => e.target.select()}
            onChange={(e) => change(e.target.value)}
            onBlur={() => setDraft(null)}
            onKeyDown={(e) => {
              if (e.key !== 'Enter') return
              e.preventDefault()
              e.currentTarget.blur()
            }}
          />
          <span className="stepper__unit mono" aria-hidden="true">%</span>
        </label>
        <button
          type="button"
          className="stepper__btn"
          onClick={(e) => onNudge(e.shiftKey ? 5 : 1)}
          aria-label={`Increase ${person.name} by 1% (Shift: 5%)`}
        >
          <Icon name="plus" size={22} stroke={2.5} />
        </button>
      </div>
      {isMe ? (
        <span className="arow__x arow__x--placeholder" aria-hidden="true" />
      ) : (
        <button type="button" className="arow__x" onClick={onRemove} aria-label={`Remove ${person.name}`}>
          <Icon name="close" size={18} />
        </button>
      )}
    </div>
  )
}
