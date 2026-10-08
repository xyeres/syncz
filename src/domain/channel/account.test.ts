import { Account } from './account'
import {
  CHANNEL,
  OTHER_CHANNEL,
  OWNER_EMAIL,
  anAccount,
  anAccountInput,
  expectOk,
  expectRejected,
} from '../test-fixtures'

describe('Account', () => {
  it('ACC-1 creates a fresh account with no linked channel', () => {
    const account = expectOk(Account.create(anAccountInput()))
    expect(account.channelId).toBeNull()
    expect(account.ownerName).toBe('Morgan Lee')
    expect(account.ownerEmail.normalized).toBe(OWNER_EMAIL)
  })

  it('ACC-1 links a channel on a fresh account', () => {
    const account = anAccount()
    const linked = expectOk(account.linkChannel(CHANNEL))
    expect(linked.channelId).toBe(CHANNEL)
    expect(linked.id).toBe(account.id)
  })

  it('ACC-1 linking returns a new instance and never mutates the original', () => {
    const account = anAccount()
    const before = account.toSnapshot()
    expectOk(account.linkChannel(CHANNEL))
    expect(account.toSnapshot()).toEqual(before)
    expect(account.channelId).toBeNull()
  })

  it('ACC-1 rejects linking a different channel when one is already linked', () => {
    const account = anAccount({ channelId: CHANNEL })
    const before = account.toSnapshot()
    expectRejected(account.linkChannel(OTHER_CHANNEL), 'ACC-1')
    expect(account.toSnapshot()).toEqual(before)
  })

  it('ACC-1 re-linking the same channel returns ok unchanged', () => {
    const account = anAccount({ channelId: CHANNEL })
    const before = account.toSnapshot()
    const relinked = expectOk(account.linkChannel(CHANNEL))
    expect(relinked.toSnapshot()).toEqual(before)
    expect(account.toSnapshot()).toEqual(before)
  })

  it('ACC-1 round-trips through toSnapshot/fromSnapshot', () => {
    const account = expectOk(anAccount().linkChannel(CHANNEL))
    const restored = Account.fromSnapshot(account.toSnapshot())
    expect(restored.toSnapshot()).toEqual(account.toSnapshot())
  })

  it('ACC-1 instances are frozen', () => {
    expect(Object.isFrozen(anAccount())).toBe(true)
  })
})
