import { Account } from '../../domain/channel/account'
import type { AccountId, ChannelId } from '../../domain/shared/ids'
import { Email } from '../../domain/shared/email'
import { ok, type Result } from '../../domain/shared/result'
import type { Ports } from '../ports'
import { andThen, saved } from './support'

export type SignInCommand = Readonly<{ ownerName: string; ownerEmail: string; channelId: ChannelId }>

/** The existing account, or a new one on first sign-in. */
async function loadOrCreateAccount({ repos, ids }: Ports, cmd: SignInCommand): Promise<Result<Account>> {
  const existing = await repos.account.get()
  if (existing) return ok(existing)
  return andThen(Email.create(cmd.ownerEmail), (ownerEmail) =>
    Account.create({ id: ids.next('acc') as AccountId, ownerName: cmd.ownerName, ownerEmail, channelId: null }),
  )
}

/** Signs in and links the channel (ACC-1: re-linking the same channel is fine, another is rejected). */
export const signIn =
  (ports: Ports) =>
  (cmd: SignInCommand): Promise<Result<Account>> =>
    andThen(loadOrCreateAccount(ports, cmd), (account) =>
      andThen(account.linkChannel(cmd.channelId), (linked) => saved((a: Account) => ports.repos.account.save(a), linked)),
    )
