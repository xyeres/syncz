import type { AccountId, ChannelId } from '../shared/ids'
import { fail, ok, type Result } from '../shared/result'
import type { Email } from '../sharing/email'

export type AccountInput = Readonly<{
  id: AccountId
  ownerName: string
  ownerEmail: Email
  channelId: ChannelId | null
}>

export type AccountSnapshot = AccountInput

/** Owner identity + the single linked channel (ACC-1). */
export class Account {
  private constructor(
    readonly id: AccountId,
    readonly ownerName: string,
    readonly ownerEmail: Email,
    readonly channelId: ChannelId | null,
  ) {
    Object.freeze(ownerEmail)
    Object.freeze(this)
  }

  static create(input: AccountInput): Result<Account> {
    const ownerName = input.ownerName.trim()
    if (!ownerName) return fail('INVALID_INPUT', 'Enter the owner’s name')
    return ok(new Account(input.id, ownerName, { ...input.ownerEmail }, input.channelId))
  }

  static fromSnapshot(s: AccountSnapshot): Account {
    return new Account(s.id, s.ownerName, { ...s.ownerEmail }, s.channelId)
  }

  /** ACC-1: one channel per account. Re-linking the same channel is a no-op. */
  linkChannel(channelId: ChannelId): Result<Account> {
    if (this.channelId === channelId) return ok(this)
    if (this.channelId !== null) {
      return fail('ACC-1', 'This account is already linked to another YouTube channel')
    }
    return ok(new Account(this.id, this.ownerName, this.ownerEmail, channelId))
  }

  toSnapshot(): AccountSnapshot {
    return {
      id: this.id,
      ownerName: this.ownerName,
      ownerEmail: { ...this.ownerEmail },
      channelId: this.channelId,
    }
  }
}
