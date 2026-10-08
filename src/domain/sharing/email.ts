import { fail, ok, type Result } from '../shared/result'

/** A trimmed, valid email. `normalized` is lower-cased for uniqueness (COL-1/2). */
export type Email = Readonly<{ value: string; normalized: string }>

// Simple and sane, not RFC-perfect: local@domain.tld, no spaces, one "@",
// a dot in the domain, a TLD of 2+ letters, no empty/doubled dots.
const EMAIL_RE = /^[^\s@]+@[^\s@.]+(\.[^\s@.]+)*\.[a-z]{2,}$/i

const create = (raw: string): Result<Email> => {
  const value = raw.trim()
  if (!value) return fail('COL-1', 'Enter an email address')
  if (!EMAIL_RE.test(value)) return fail('COL-1', 'Enter a valid email, like alex@studio.com')
  return ok({ value, normalized: value.toLowerCase() })
}

export const Email = { create }
