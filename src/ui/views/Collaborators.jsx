import { useState } from 'react'
import CollaboratorForm from '@/ui/components/CollaboratorForm.jsx'
import Icon from '@/ui/components/Icon.jsx'
import PageHeader from '@/ui/components/PageHeader.jsx'
import { Swatch } from '@/ui/components/Person.jsx'
import RowActions from '@/ui/components/RowActions.jsx'
import { ME, PALETTE } from '@/infrastructure/seed/mock.js'
import { bpsLabel, money } from '@/ui/lib/format.js'
import { reportRows } from '@/ui/lib/payments.js'
import { useApp } from '@/ui/state/context.js'

export default function Collaborators() {
  const { collaborators, allCollaborators, splits, reports, payments, addCollaborator, updateCollaborator, deleteCollaborator } = useApp()
  // null | 'new' | collaborator id — only one form open at a time.
  const [editing, setEditing] = useState(null)
  const adding = editing === 'new'

  const people = [ME, ...collaborators]
  const statsFor = (id) => {
    const inSplits = splits.filter((s) => s.shares.some((x) => x.personId === id && x.bps > 0))
    let paid = 0
    let owed = 0
    let over = 0
    for (const r of reports) {
      const row = reportRows(r, payments).find((x) => x.personId === id)
      if (!row?.settle) continue
      paid += row.settle.paid
      if (row.settle.balance > 0) owed += row.settle.balance
      if (row.settle.balance < 0) over -= row.settle.balance
    }
    return { inSplits, paid, owed, over }
  }

  return (
    <div className="page">
      <PageHeader
        index="03"
        eyebrow="People"
        title="Collaborators"
        lede="Everyone who can be assigned a share. Their color is their mark across Syncz."
        action={
          !editing && (
            <button type="button" className="btn btn--primary btn--lg" onClick={() => setEditing('new')}>
              <Icon name="plus" size={24} stroke={2.5} /> Add collaborator
            </button>
          )
        }
      />

      {adding && (
        <CollaboratorForm
          all={allCollaborators}
          color={PALETTE[collaborators.length % PALETTE.length]}
          onSubmit={(fields) => {
            if (addCollaborator({ id: `c-${Date.now().toString(36)}`, ...fields }).ok) setEditing(null)
          }}
          onCancel={() => setEditing(null)}
        />
      )}

      <div className="ptable" role="table" aria-label="Collaborators">
        <div className="ptable__row ptable__row--head mono" role="row">
          <span role="columnheader">Person</span>
          <span role="columnheader">Email</span>
          <span role="columnheader">Splits</span>
          <span role="columnheader" className="num">Paid to date</span>
          <span role="columnheader" className="num">Outstanding</span>
          <span role="columnheader">
            <span className="sr-only">Actions</span>
          </span>
        </div>
        {people.map((p) => {
          const isMe = p.id === ME.id
          const { inSplits, paid, owed, over } = statsFor(p.id)
          if (editing === p.id) {
            return (
              <div key={p.id} className="ptable__edit">
                <CollaboratorForm
                  all={allCollaborators}
                  initial={p}
                  color={p.color}
                  onSubmit={(fields) => {
                    if (updateCollaborator(p.id, fields).ok) setEditing(null)
                  }}
                  onCancel={() => setEditing(null)}
                />
              </div>
            )
          }
          const blocking = splits.filter((s) => s.shares.some((x) => x.personId === p.id))
          return (
            <div key={p.id} className="ptable__row" role="row" style={{ '--c': p.color }}>
              <span role="cell" className="ptable__who">
                <Swatch person={p} size="lg" />
                <span>
                  <strong>{isMe ? `${p.fullName} (you)` : p.name}</strong>
                  <span className="mono muted small">{p.role}</span>
                </span>
              </span>
              <span role="cell" className="mono small ptable__email">{p.email}</span>
              <span role="cell" className="ptable__splits">
                {inSplits.length === 0 ? (
                  <span className="muted small">—</span>
                ) : (
                  inSplits.map((s) => (
                    <a key={s.id} href={`#/splits/${s.id}`} className="minitag">
                      {s.name} <span className="mono">{bpsLabel(s.shares.find((x) => x.personId === p.id).bps)}</span>
                    </a>
                  ))
                )}
              </span>
              <span role="cell" className="mono num">{isMe ? '—' : money(paid)}</span>
              <span role="cell" className={`mono num${owed > 0 && !isMe ? ' is-owed' : ''}`}>
                {isMe ? 'Owner' : money(owed)}
                {!isMe && over > 0 && <span className="overnote mono">+{money(over)} over</span>}
              </span>
              <span role="cell" className="ptable__actions">
                {!isMe && (
                  <RowActions
                    person={p}
                    blockingSplits={blocking}
                    onEdit={() => setEditing(p.id)}
                    onDelete={() => deleteCollaborator(p.id)}
                  />
                )}
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}
