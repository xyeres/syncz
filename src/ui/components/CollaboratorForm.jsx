import { useState } from 'react'
import { validateCollaborator } from '@/ui/lib/collaborators.js'
import { Swatch } from './Person.jsx'

const ROLES = ['Editor', 'Co-host', 'Thumbnail artist', 'Motion designer', 'Sound engineer', 'Writer & researcher', 'Producer']
const OTHER = '__other'

const initialsOf = (name) =>
  name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? '')
    .join('')

/**
 * Inline add/edit form. Role is a fixed list plus "Other", which reveals a
 * text input; the custom label is what gets stored and displayed.
 */
export default function CollaboratorForm({ initial, color, all, onSubmit, onCancel }) {
  const knownRole = initial && ROLES.includes(initial.role)
  const [form, setForm] = useState({
    name: initial?.name ?? '',
    email: initial?.email ?? '',
    role: initial ? (knownRole ? initial.role : OTHER) : '',
    customRole: initial && !knownRole ? initial.role : '',
  })
  const update = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }))
  const role = form.role === OTHER ? form.customRole.trim() : form.role
  const [touched, setTouched] = useState({})
  const { ok: valid, errors } = validateCollaborator({ name: form.name, email: form.email, role }, all, initial?.id ?? null)
  const touch = (k) => () => setTouched((t) => ({ ...t, [k]: true }))
  // Show format errors after leaving the field; a uniqueness clash as soon as it's typed.
  const emailError = errors.email && (touched.email || /already uses|deleted collaborator|your own email/.test(errors.email)) ? errors.email : null
  const isEdit = Boolean(initial)
  const idp = initial?.id ?? 'new'

  const submit = (e) => {
    e.preventDefault()
    if (!valid) return
    onSubmit({
      name: form.name.trim(),
      email: form.email.trim(),
      role,
      initials: initialsOf(form.name) || '?',
    })
  }

  return (
    <form className="addform grid12" onSubmit={submit} aria-label={isEdit ? `Edit ${initial.name}` : 'Add collaborator'}>
      <div className="span-12 addform__head">
        <Swatch person={{ color, initials: initialsOf(form.name) || '··' }} size="xl" />
        <div>
          <div className="label mono">{isEdit ? 'Edit collaborator' : 'New collaborator'}</div>
          <p className="muted">
            {isEdit
              ? 'Changes apply to future reports. Past reports and statements keep the details they were generated with.'
              : 'They get a color that follows them through every split and report.'}
          </p>
        </div>
      </div>
      <label className="field span-4">
        <span className="label mono">Name</span>
        <input className="input" value={form.name} onChange={update('name')} autoFocus placeholder="Alex Kim" />
      </label>
      <label className="field span-4">
        <span className="label mono">Email</span>
        <input
          className={`input${emailError ? ' input--error' : ''}`}
          type="email"
          value={form.email}
          onChange={update('email')}
          onBlur={touch('email')}
          placeholder="alex@studio.com"
          aria-invalid={emailError ? true : undefined}
          aria-describedby={emailError ? `email-err-${idp}` : undefined}
        />
        {emailError && (
          <span id={`email-err-${idp}`} className="field__error mono" role="alert">
            {emailError}
          </span>
        )}
      </label>
      <div className="span-4 role-field">
        <label className="field" htmlFor={`role-${idp}`}>
          <span className="label mono">Role</span>
          <span className="select">
            <select id={`role-${idp}`} className="input" value={form.role} onChange={update('role')}>
              <option value="" disabled>
                Choose a role
              </option>
              {ROLES.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
              <option value={OTHER}>Other…</option>
            </select>
          </span>
        </label>
        {form.role === OTHER && (
          <label className="field">
            <span className="label mono">Custom role</span>
            <input
              className="input"
              value={form.customRole}
              onChange={update('customRole')}
              placeholder="e.g. Colorist"
              autoFocus={!isEdit}
            />
          </label>
        )}
      </div>
      <div className="span-12 addform__actions">
        <button type="submit" className="btn btn--primary btn--lg" disabled={!valid}>
          {isEdit ? 'Save changes' : 'Add collaborator'}
        </button>
        <button type="button" className="btn btn--quiet" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </form>
  )
}
