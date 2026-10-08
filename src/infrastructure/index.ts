/** Composition of the in-memory app: memory repos + mock YouTube catalog + clock + seed. */
import { makeUseCases } from '../application/make-use-cases'
import type { Clock, Ports } from '../application/ports'
import { makeQueries } from '../application/queries'
import { fixedClock, switchableClock, systemClock, type FixedClock } from './clock'
import { sequentialIds } from './ids'
import { createMemoryRepositories } from './memory/repositories'
import { createStore, type Store } from './memory/store'
import { replaySeed } from './seed/replay'
import { createMockChannelCatalog } from './youtube/mock-channel-catalog'

export type InMemoryPorts = Readonly<{ ports: Ports; clock: FixedClock; store: Store; dump: () => string }>

function buildPorts(clock: Clock) {
  const store = createStore()
  const { repos, dump } = createMemoryRepositories(store)
  const ports: Ports = { repos, catalog: createMockChannelCatalog(), clock, ids: sequentialIds() }
  return { ports, store, dump }
}

/** Empty in-memory ports (no seed) on a fixed clock pinned to the seed's "today": deterministic, for tests. */
export function createInMemoryPorts(): InMemoryPorts {
  const clock = fixedClock()
  return { ...buildPorts(clock), clock }
}

export type InMemoryAppOptions = Readonly<{ runtimeClock?: Clock }>

/**
 * The seeded demo app: `{ useCases, queries, store }`. The seed replays on a fixed clock
 * (deterministic, ending at 2026-10-07 09:00); afterwards the ports switch to `runtimeClock`
 * (default: the system clock), so later actions get real `now()` and `today()`.
 */
export async function createInMemoryApp({ runtimeClock = systemClock }: InMemoryAppOptions = {}) {
  const seedClock = fixedClock()
  const clock = switchableClock(seedClock)
  const { ports, store } = buildPorts(clock)
  const useCases = makeUseCases(ports)
  await replaySeed(useCases, seedClock)
  clock.use(runtimeClock)
  return { useCases, queries: makeQueries(ports), store }
}

export type InMemoryApp = Awaited<ReturnType<typeof createInMemoryApp>>
