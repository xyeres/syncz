import { ROLES, Role, type PredefinedRole } from './role'
import { expectOk, expectRejected } from '../test-fixtures'

describe('Role', () => {
  it('COL-3 ROLES is a non-empty list of distinct, non-blank labels that excludes "other"', () => {
    expect(ROLES.length).toBeGreaterThan(0)
    expect(new Set(ROLES).size).toBe(ROLES.length)
    for (const r of ROLES) expect(r.trim()).not.toBe('')
    expect(ROLES).not.toContain('other')
  })

  it.each([...ROLES])('COL-3 accepts the predefined role "%s"', (kind) => {
    expect(expectOk(Role.create(kind))).toEqual({ kind })
  })

  it('COL-3 accepts "other" with a non-blank label', () => {
    expect(expectOk(Role.create('other', 'Colorist'))).toEqual({ kind: 'other', label: 'Colorist' })
  })

  it('COL-3 rejects "other" with a blank label', () => {
    expectRejected(Role.create('other', ''), 'COL-3')
  })

  it('COL-3 rejects "other" with a whitespace-only label', () => {
    expectRejected(Role.create('other', '   '), 'COL-3')
  })

  it('COL-3 rejects "other" with no label', () => {
    expectRejected(Role.create('other'), 'COL-3')
  })

  it('COL-3 rejects an unknown role string at runtime (untyped boundary)', () => {
    // @ts-expect-error COL-3: an unknown string is not a PredefinedRole
    expectRejected(Role.create('Janitor'), 'COL-3')
  })

  it('COL-3 rejects a blank role string at runtime', () => {
    expectRejected(Role.create('' as PredefinedRole), 'COL-3')
  })

  it('COL-3 PredefinedRole is a literal union, not string', () => {
    const first: PredefinedRole = ROLES[0]
    // @ts-expect-error COL-3: an arbitrary string is not assignable to PredefinedRole
    const arbitrary: PredefinedRole = 'Janitor'
    expect(ROLES).toContain(first)
    expect(ROLES).not.toContain(arbitrary)
  })
})
