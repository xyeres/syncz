import { useState } from 'react'
import Icon from './Icon.jsx'

/**
 * "Actions" dropdown for a collaborator, built on the native popover API
 * (light-dismiss + Esc for free). Delete confirms inline — never window.confirm.
 */
export default function RowActions({ person, blockingSplits, onEdit, onDelete }) {
  const [confirming, setConfirming] = useState(false)
  const [pos, setPos] = useState(null)
  const id = `actions-${person.id}`
  const first = person.name.split(' ')[0]

  const open = (e) => {
    const r = e.currentTarget.getBoundingClientRect()
    setPos({ top: r.bottom + 8, right: Math.max(8, window.innerWidth - r.right) })
    setConfirming(false)
  }

  return (
    <>
      <button
        type="button"
        className="btn btn--secondary actions-btn"
        popoverTarget={id}
        aria-haspopup="true"
        aria-label={`Actions for ${person.name}`}
        onClick={open}
      >
        Actions <Icon name="chevronDown" size={18} />
      </button>
      <div id={id} popover="auto" className="menu" style={pos ?? undefined}>
        {!confirming ? (
          <div className="menu__items">
            <button type="button" className="menu__item" popoverTarget={id} popoverTargetAction="hide" onClick={onEdit}>
              <Icon name="edit" size={20} /> Edit
            </button>
            <button type="button" className="menu__item menu__item--danger" onClick={() => setConfirming(true)}>
              <Icon name="trash" size={20} /> Delete…
            </button>
          </div>
        ) : blockingSplits.length > 0 ? (
          <div className="menu__confirm" role="alert">
            <p>
              Remove {first} from:{' '}
              {blockingSplits.map((s, i) => (
                <span key={s.id}>
                  {i > 0 && ', '}
                  <a href={`#/splits/${s.id}`}>{s.name}</a>
                </span>
              ))}{' '}
              first.
            </p>
            <div className="menu__row">
              <button type="button" className="btn btn--secondary" onClick={() => setConfirming(false)} autoFocus>
                Back
              </button>
            </div>
          </div>
        ) : (
          <div className="menu__confirm" role="alertdialog" aria-label={`Delete ${person.name}?`}>
            <p>
              <strong>Delete {first}?</strong> Past reports, statements and payments keep their name.
            </p>
            <div className="menu__row">
              <button type="button" className="btn btn--danger-solid" onClick={onDelete}>
                Delete
              </button>
              <button type="button" className="btn btn--secondary" onClick={() => setConfirming(false)} autoFocus>
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>
    </>
  )
}
