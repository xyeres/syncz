/** Flat pastel block with initials — a collaborator's identity everywhere. */
export function Swatch({ person, size = 'md' }) {
  return (
    <span className={`swatch swatch--${size}`} style={{ '--c': person.color }} aria-hidden="true">
      {person.initials}
    </span>
  )
}

export function PersonChip({ person, children, onRemove }) {
  return (
    <span className="chip" style={{ '--c': person.color }}>
      <span className="chip__dot" aria-hidden="true" />
      <span className="chip__name">{person.name}</span>
      {children}
      {onRemove && (
        <button type="button" className="chip__x" onClick={onRemove} aria-label={`Remove ${person.name}`}>
          ×
        </button>
      )}
    </span>
  )
}
