import type { EntryId } from './ids'
import type { IsoDateTime } from './numbers'

/** Injected time + id: never generated inside the domain. */
export interface Meta {
  readonly id: EntryId
  readonly at: IsoDateTime
}
