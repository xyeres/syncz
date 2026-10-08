/** Composition of the in-memory app: memory repos + mock YouTube catalog + fixed clock + seed. */
import { makeUseCases } from '../application/make-use-cases'
import type { Ports } from '../application/ports'
import { makeQueries } from '../application/queries'
import { fixedClock, type FixedClock } from './clock'
import { sequentialIds } from './ids'
import { createMemoryRepositories } from './memory/repositories'
import { createStore, type Store } from './memory/store'
import { replaySeed } from './seed/replay'
import { createMockChannelCatalog } from './youtube/mock-channel-catalog'

export type InMemoryPorts = Readonly<{ ports: Ports; clock: FixedClock; store: Store; dump: () => string }>

/** Empty in-memory ports (no seed), pinned to the seed's "today". */
export function createInMemoryPorts(): InMemoryPorts {
  const store = createStore()
  const { repos, dump } = createMemoryRepositories(store)
  const clock = fixedClock()
  return { ports: { repos, catalog: createMockChannelCatalog(), clock, ids: sequentialIds() }, clock, store, dump }
}

/** The seeded demo app: `{ useCases, queries, store }`. */
export async function createInMemoryApp() {
  const { ports, clock, store } = createInMemoryPorts()
  const useCases = makeUseCases(ports)
  await replaySeed(useCases, clock)
  return { useCases, queries: makeQueries(ports), store }
}

export type InMemoryApp = Awaited<ReturnType<typeof createInMemoryApp>>
