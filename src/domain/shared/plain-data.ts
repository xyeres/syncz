/** Helpers for the plain, JSON-shaped data that aggregates hold (snapshots, revisions, entries). */

/** A deep copy of plain JSON data, so later changes to the caller's objects never reach the domain. */
export const copyData = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T

/** Freezes the value and everything reachable from it. Returns the same value. */
export function deepFreeze<T>(value: T): T {
  if (typeof value !== 'object' || value === null) return value
  Object.values(value).forEach((child) => deepFreeze(child))
  Object.freeze(value)
  return value
}

/** Signals a broken internal assertion (a programmer error, never a business rule). */
export function invariantBroken(message: string): never {
  throw new Error(`Domain invariant broken: ${message}`)
}
