import { ME } from '@/infrastructure/seed/mock.js'

/**
 * Collaborator rules (COL-1, COL-2, COL-3). One function the form, the
 * dispatch helpers and the reducer all read from.
 */

// COL-1: simple and sane, not RFC-perfect — local@domain.tld, no spaces,
// one "@", a dot in the domain, a TLD of 2+ letters, no empty/doubled dots.
const EMAIL_RE = /^[^\s@]+@[^\s@.]+(\.[^\s@.]+)*\.[a-z]{2,}$/i

export const normalizeEmail = (email) => (email ?? '').trim().toLowerCase()
export const isValidEmail = (email) => EMAIL_RE.test((email ?? '').trim())

/**
 * COL-2: email is unique per channel (trimmed, case-insensitive). Soft-deleted
 * collaborators still hold their email, and nobody may use the owner's email.
 * Returns { kind: 'owner' | 'deleted' | 'active', who } or null.
 */
export function emailConflict(email, all, selfId = null) {
  const key = normalizeEmail(email)
  if (!key) return null
  if (key === normalizeEmail(ME.email)) return { kind: 'owner', who: ME }
  const who = all.find((c) => c.id !== selfId && normalizeEmail(c.email) === key)
  if (!who) return null
  return { kind: who.deleted ? 'deleted' : 'active', who }
}

/**
 * @param {{ name: string, email: string, role: string }} fields
 * @param {object[]} all  every collaborator, including soft-deleted ones
 * @param {string|null} selfId  the collaborator being edited (keeps own email)
 * @returns {{ ok, errors: { name?, email?, role? }, issues: { field, code, message }[] }}
 */
export function validateCollaborator({ name, email, role }, all, selfId = null) {
  const issues = []
  const fail = (field, code, message) => issues.push({ field, code, message })
  if (!name?.trim()) fail('name', 'COL-1', 'Enter a name')
  if (!email?.trim()) fail('email', 'COL-1', 'Enter an email address')
  else if (!isValidEmail(email)) fail('email', 'COL-1', 'Enter a valid email, like alex@studio.com')
  else {
    const clash = emailConflict(email, all, selfId)
    if (clash?.kind === 'owner') fail('email', 'COL-2', 'That’s your own email — collaborators need their own')
    else if (clash?.kind === 'deleted') fail('email', 'COL-2', `That email belongs to a deleted collaborator (${clash.who.name})`)
    else if (clash) fail('email', 'COL-2', `${clash.who.name} already uses this email`)
  }
  if (!role?.trim()) fail('role', 'COL-3', 'Choose a role')
  const errors = Object.fromEntries(issues.map((i) => [i.field, i.message]))
  return { ok: issues.length === 0, errors, issues }
}
