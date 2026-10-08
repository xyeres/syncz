import { Collaborator } from './collaborator'
import { ROLES } from './role'
import { OWNER_ID, type CollaboratorId } from '../shared/ids'
import {
  ALEX,
  CHANNEL,
  aCollaborator,
  aCollaboratorInput,
  codesOf,
  expectOk,
  expectRejected,
  meta,
} from '../test-fixtures'

describe('Collaborator', () => {
  describe('register', () => {
    it('COL-1 registers a collaborator with a trimmed email and a valid role', () => {
      const c = expectOk(
        Collaborator.register(aCollaboratorInput({ email: ' Alex@Studio.com ', role: { kind: ROLES[1] } })),
      )
      expect(c.id).toBe(ALEX)
      expect(c.channelId).toBe(CHANNEL)
      expect(c.name).toBe('Alex Rivera')
      expect(c.email).toEqual({ value: 'Alex@Studio.com', normalized: 'alex@studio.com' })
      expect(c.role).toEqual({ kind: ROLES[1] })
      expect(c.deletedAt).toBeNull()
      expect(c.isDeleted()).toBe(false)
    })

    it('COL-1 rejects a blank name', () => {
      expectRejected(Collaborator.register(aCollaboratorInput({ name: '' })), 'COL-1')
    })

    it('COL-1 rejects a whitespace-only name', () => {
      expectRejected(Collaborator.register(aCollaboratorInput({ name: '   ' })), 'COL-1')
    })

    it('COL-1 rejects a blank email', () => {
      expectRejected(Collaborator.register(aCollaboratorInput({ email: '' })), 'COL-1')
    })

    it('COL-1 rejects an invalid email', () => {
      expectRejected(Collaborator.register(aCollaboratorInput({ email: 'alex@studio' })), 'COL-1')
    })

    it('COL-3 accepts "other" with a label', () => {
      const c = expectOk(
        Collaborator.register(aCollaboratorInput({ role: { kind: 'other', label: 'Colorist' } })),
      )
      expect(c.role).toEqual({ kind: 'other', label: 'Colorist' })
    })

    it('COL-3 rejects "other" with a blank label', () => {
      expectRejected(
        Collaborator.register(aCollaboratorInput({ role: { kind: 'other', label: ' ' } })),
        'COL-3',
      )
    })

    it('COL-1/COL-3 collects all reasons: blank name + invalid email + blank other label', () => {
      const result = Collaborator.register(
        aCollaboratorInput({ name: '', email: 'a@@x.com', role: { kind: 'other', label: '' } }),
      )
      expect([...codesOf(result)].sort()).toEqual(['COL-1', 'COL-3'])
      const reasons = expectRejected(result, 'COL-1')
      expect(reasons.filter((r) => r.code === 'COL-1')).toHaveLength(2)
    })
  })

  describe('edit', () => {
    it('COL-1 edit applies the merged fields to a new instance', () => {
      const c = aCollaborator()
      const before = c.toSnapshot()
      const edited = expectOk(c.edit({ name: 'Alex R.', email: 'alex.r@studio.com' }))
      expect(edited.id).toBe(c.id)
      expect(edited.name).toBe('Alex R.')
      expect(edited.email.normalized).toBe('alex.r@studio.com')
      expect(edited.role).toEqual(c.role)
      expect(c.toSnapshot()).toEqual(before)
    })

    it('COL-1 edit re-validates the merged name and leaves the collaborator unchanged', () => {
      const c = aCollaborator()
      const before = c.toSnapshot()
      expectRejected(c.edit({ name: '  ' }), 'COL-1')
      expect(c.toSnapshot()).toEqual(before)
    })

    it('COL-1 edit re-validates the merged email and leaves the collaborator unchanged', () => {
      const c = aCollaborator()
      const before = c.toSnapshot()
      expectRejected(c.edit({ email: 'a b@x.com' }), 'COL-1')
      expect(c.toSnapshot()).toEqual(before)
    })

    it('COL-3 edit re-validates the merged role and leaves the collaborator unchanged', () => {
      const c = aCollaborator()
      const before = c.toSnapshot()
      expectRejected(c.edit({ role: { kind: 'other', label: '' } }), 'COL-3')
      expect(c.toSnapshot()).toEqual(before)
    })

    it('COL-3 edit can switch to "other" with a label', () => {
      const edited = expectOk(aCollaborator().edit({ role: { kind: 'other', label: 'Colorist' } }))
      expect(edited.role).toEqual({ kind: 'other', label: 'Colorist' })
    })

    it('COL-5 edit on a deleted collaborator is rejected and leaves it unchanged', () => {
      const deleted = expectOk(aCollaborator().softDelete(meta(1)))
      const before = deleted.toSnapshot()
      expectRejected(deleted.edit({ name: 'New name' }), 'COL-5')
      expect(deleted.toSnapshot()).toEqual(before)
    })
  })

  describe('softDelete', () => {
    it('COL-5 sets deletedAt = meta.at and keeps id and email', () => {
      const c = aCollaborator()
      const m = meta(3)
      const deleted = expectOk(c.softDelete(m))
      expect(deleted.deletedAt).toBe(m.at)
      expect(deleted.isDeleted()).toBe(true)
      expect(deleted.id).toBe(c.id)
      expect(deleted.email).toEqual(c.email)
      expect(deleted.name).toBe(c.name)
      expect(c.isDeleted()).toBe(false)
      expect(c.deletedAt).toBeNull()
    })

    it('COL-5 a second delete is rejected and leaves the collaborator unchanged', () => {
      const deleted = expectOk(aCollaborator().softDelete(meta(1)))
      const before = deleted.toSnapshot()
      expectRejected(deleted.softDelete(meta(2)), 'COL-5')
      expect(deleted.toSnapshot()).toEqual(before)
    })
  })

  describe('snapshot', () => {
    it('COL-5 round-trips a deleted collaborator through toSnapshot/fromSnapshot', () => {
      const deleted = expectOk(aCollaborator().softDelete(meta(1)))
      const restored = Collaborator.fromSnapshot(deleted.toSnapshot())
      expect(restored.toSnapshot()).toEqual(deleted.toSnapshot())
      expect(restored.isDeleted()).toBe(true)
    })

    it('COL-5 snapshots are plain JSON-serializable data', () => {
      const snapshot = aCollaborator().toSnapshot()
      expect(JSON.parse(JSON.stringify(snapshot))).toEqual(snapshot)
    })

    it('COL-1 instances are frozen', () => {
      expect(Object.isFrozen(aCollaborator())).toBe(true)
    })
  })

  describe('compile-time guarantees', () => {
    it('COL-7 OWNER_ID is not assignable where a CollaboratorId is expected', () => {
      // Type-level only: never invoked, so no runtime behaviour is pinned here.
      const compileOnly = () => {
        // @ts-expect-error COL-7: the owner is not a collaborator
        const id: CollaboratorId = OWNER_ID
        // @ts-expect-error COL-7: a collaborator cannot be registered with the owner's id
        return [id, Collaborator.register({ ...aCollaboratorInput(), id: OWNER_ID })]
      }
      expect(typeof compileOnly).toBe('function')
    })

    it('COL-3 role kind must be a predefined role or "other"', () => {
      const compileOnly = () =>
        // @ts-expect-error COL-3: unknown role kind
        Collaborator.register(aCollaboratorInput({ role: { kind: 'Janitor' } }))
      expect(typeof compileOnly).toBe('function')
    })
  })
})
