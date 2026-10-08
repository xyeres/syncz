import type { IdGenerator } from '../application/ports'

/** Deterministic ids: `<prefix>-1`, `<prefix>-2`, … with one counter per prefix. */
export function sequentialIds(): IdGenerator {
  const counters = new Map<string, number>()
  return {
    next(prefix) {
      const n = (counters.get(prefix) ?? 0) + 1
      counters.set(prefix, n)
      return `${prefix}-${n}`
    },
  }
}
