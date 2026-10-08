/** Small helpers shared by the use cases. */
import type { Account } from '../../domain/channel/account'
import type { ChannelId, EntryId } from '../../domain/shared/ids'
import type { Meta } from '../../domain/shared/meta'
import { fail, ok, type Result } from '../../domain/shared/result'
import type { Ports } from '../ports'

export type Awaitable<T> = T | Promise<T>

/** Runs `next` with the value of a successful result; passes a rejection through unchanged. */
export async function andThen<A, B>(
  result: Awaitable<Result<A>>,
  next: (value: A) => Awaitable<Result<B>>,
): Promise<Result<B>> {
  const r = await result
  return r.ok ? next(r.value) : r
}

/** Saves the aggregate and returns it as the use case's result. */
export async function saved<T>(save: (value: T) => Promise<void>, value: T): Promise<Result<T>> {
  await save(value)
  return ok(value)
}

/** NOT_FOUND when the repository returned null. */
export const found = <T>(value: T | null, what: string): Result<T> =>
  value === null ? fail('NOT_FOUND', `${what} was not found`) : ok(value)

/** Injected time + id for a command (docs/domain-design.md §0). */
export const metaOf = ({ ids, clock }: Ports, prefix: string): Meta => ({
  id: ids.next(prefix) as EntryId,
  at: clock.now(),
})

export type ChannelContext = Readonly<{ account: Account; channelId: ChannelId }>

/** The signed-in account and its linked channel; every channel-scoped use case starts here (ACC-1). */
export async function requireChannel({ repos }: Ports): Promise<Result<ChannelContext>> {
  const account = await repos.account.get()
  if (!account || account.channelId === null) {
    return fail('NOT_FOUND', 'Sign in and link your YouTube channel first')
  }
  return ok({ account, channelId: account.channelId })
}
