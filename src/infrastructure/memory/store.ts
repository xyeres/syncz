/** A tiny change-notification store for `useSyncExternalStore`: a version that bumps on every write. */
export interface Store {
  /** The current version; changes after every repository write. */
  getSnapshot(): number
  subscribe(listener: () => void): () => void
  /** Called by the repositories after a write. */
  notify(): void
}

export function createStore(): Store {
  let version = 0
  const listeners = new Set<() => void>()
  return {
    getSnapshot: () => version,
    subscribe(listener) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    notify() {
      version += 1
      listeners.forEach((l) => l())
    },
  }
}
