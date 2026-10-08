import type { Clock } from '../application/ports'
import type { IsoDate, IsoDateTime } from '../domain/shared/numbers'

const todayOf = (at: IsoDateTime) => at.slice(0, 10) as IsoDate

/** Real time, for production. */
export const systemClock: Clock = {
  now: () => new Date().toISOString() as IsoDateTime,
  today: () => todayOf(new Date().toISOString() as IsoDateTime),
}

/** The seed's "today" (mock.js TODAY): the latest reportable month is 2026-09. */
export const SEED_NOW = '2026-10-07T09:00:00.000Z' as IsoDateTime

export type FixedClock = Clock & { set(at: IsoDateTime): void }

/** A clock that only moves when told to; the seed replay sets it before each command. */
export function fixedClock(at: IsoDateTime = SEED_NOW): FixedClock {
  let current = at
  return {
    now: () => current,
    today: () => todayOf(current),
    set(next) {
      current = next
    },
  }
}

export type SwitchableClock = Clock & { use(next: Clock): void }

/** Delegates to another clock that can be swapped, e.g. seed on a fixed clock, then run on real time. */
export function switchableClock(initial: Clock): SwitchableClock {
  let current = initial
  return {
    now: () => current.now(),
    today: () => current.today(),
    use(next) {
      current = next
    },
  }
}
