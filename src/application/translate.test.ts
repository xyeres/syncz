import { Account } from '../domain/channel/account'
import { Email } from '../domain/shared/email'
import { OWNER_ID } from '../domain/shared/ids'
import { Collaborator } from '../domain/revenue-sharing/collaborator'
import { partySnapshotsOf, splitSnapshotOf } from './translate'
import { aChannel, accountId, ALEX, CHANNEL, expectOk, expectRejected, meta, SAM, v } from './test-fixtures'

const account = () =>
  expectOk(
    Account.create({ id: accountId('acc-1'), ownerName: 'Maya Ortiz', ownerEmail: expectOk(Email.create('Maya@Studio.com')), channelId: CHANNEL }),
  )
const collaborator = (id = ALEX, name = 'Alex Rivera') =>
  expectOk(Collaborator.register({ id, channelId: CHANNEL, name, email: `${id}@studio.com`, role: { kind: 'other', label: 'Colorist' } }))

describe('translate', () => {
  it('REP-8 the owner snapshot carries the account’s owner name and email', () => {
    expect(partySnapshotsOf(account(), [])[0]).toEqual({
      partyId: OWNER_ID,
      name: 'Maya Ortiz',
      email: 'Maya@Studio.com',
      role: 'Channel owner',
    })
  })

  it('REP-8 collaborators keep identity and role label; soft-deleted ones are kept for existing parties', () => {
    const deleted = expectOk(collaborator(SAM, 'Sam Chen').softDelete(meta(1)))
    const parties = partySnapshotsOf(account(), [collaborator(), deleted])
    expect(parties.map((p) => [p.partyId, p.name, p.role])).toEqual([
      [OWNER_ID, 'Maya Ortiz', 'Channel owner'],
      [ALEX, 'Alex Rivera', 'Colorist'],
      [SAM, 'Sam Chen', 'Colorist'],
    ])
  })

  it('SPL-8 a deleted collaborator cannot join a new split, but stays on earlier revisions', async () => {
    const c = await aChannel()
    const split = expectOk(
      await c.uc.saveSplit({ name: 'P', videoIds: [v(1)], shares: [{ partyId: OWNER_ID, bps: 7000 }, { partyId: c.sam.id, bps: 3000 }] }),
    )
    const report = expectOk(await c.uc.generateReport({ period: '2026-09' }))
    expectOk(await c.uc.saveSplit({ id: split.id, name: 'P', videoIds: [v(1)], shares: [{ partyId: OWNER_ID, bps: 10000 }] }))
    expectOk(await c.uc.deleteCollaborator({ id: c.sam.id }))
    expectRejected(
      await c.uc.saveSplit({ name: 'Q', videoIds: [v(2)], shares: [{ partyId: OWNER_ID, bps: 5000 }, { partyId: c.sam.id, bps: 5000 }] }),
      'SPL-8',
    )
    const recalculated = expectOk(await c.uc.recalculateReport({ reportId: report.id }))
    expect(recalculated.latestPartySnapshot(c.sam.id, 1)?.name).toBe('Sam Chen')
    expect(recalculated.dueFor(c.sam.id)).toBe(0)
  })

  it('SPL-9 a split snapshot is a copy of the split’s fields', async () => {
    const c = await aChannel()
    const split = expectOk(
      await c.uc.saveSplit({ name: 'P', videoIds: [v(1)], shares: [{ partyId: OWNER_ID, bps: 7000 }, { partyId: c.alex.id, bps: 3000 }] }),
    )
    expect(splitSnapshotOf(split)).toEqual({ splitId: split.id, name: 'P', videoIds: [v(1)], shares: split.shares })
  })
})
