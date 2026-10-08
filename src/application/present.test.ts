import { OWNER_ID } from '../domain/shared/ids'
import { fail } from '../domain/shared/result'
import { nameLookup, presentReasons } from './present'
import { ALEX, SAM } from './test-fixtures'

const reasonsOf = (...results: ReturnType<typeof fail>[]) => results.flatMap((r) => (r.ok ? [] : r.reasons))
const nameOf = nameLookup([
  { id: ALEX, name: 'Alex Rivera' },
  { id: SAM, name: 'Sam Chen' },
])

describe('presentReasons', () => {
  it('replaces the party id with the display name; the owner is "You"; others are untouched', () => {
    const reasons = reasonsOf(
      fail('SPL-3', `Give ${ALEX} at least 0.10% or remove them`, ALEX),
      fail('SPL-8', `Collaborator ${SAM} does not exist`, SAM),
      fail('SPL-4', `${OWNER_ID}: your share must be 0% or at least 0.10%`, OWNER_ID),
      fail('SPL-1', 'Allocate the remaining 1%'),
    )
    expect(presentReasons(reasons, nameOf)).toEqual([
      { code: 'SPL-3', message: 'Give Alex Rivera at least 0.10% or remove them' },
      { code: 'SPL-8', message: 'Collaborator Sam Chen does not exist' },
      { code: 'SPL-4', message: 'You: your share must be 0% or at least 0.10%' },
      { code: 'SPL-1', message: 'Allocate the remaining 1%' },
    ])
  })

  it('falls back to the id for an unknown party', () => {
    const reasons = reasonsOf(fail('SPL-8', 'Collaborator c-ghost does not exist', 'c-ghost' as typeof ALEX))
    expect(presentReasons(reasons, nameOf)[0]?.message).toBe('Collaborator c-ghost does not exist')
  })
})
