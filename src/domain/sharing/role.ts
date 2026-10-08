import { fail, ok, type Result } from '../shared/result'

export const ROLES = [
  'Editor',
  'Co-host',
  'Thumbnail artist',
  'Motion designer',
  'Sound engineer',
  'Writer & researcher',
  'Producer',
] as const

export type PredefinedRole = (typeof ROLES)[number]

/** A predefined role, or "other" with a non-blank label (COL-3). */
export type Role = Readonly<{ kind: PredefinedRole }> | Readonly<{ kind: 'other'; label: string }>

/** Untrusted role input, as it arrives from a form. */
export type RoleInput = Readonly<{ kind: PredefinedRole | 'other'; label?: string }>

const isPredefined = (kind: string): kind is PredefinedRole =>
  (ROLES as readonly string[]).includes(kind)

const create = (kind: PredefinedRole | 'other', label?: string): Result<Role> => {
  if (kind === 'other') {
    const trimmed = (label ?? '').trim()
    return trimmed ? ok({ kind, label: trimmed }) : fail('COL-3', 'Describe the role')
  }
  return isPredefined(kind) ? ok({ kind }) : fail('COL-3', 'Choose a role')
}

export const Role = { create }
