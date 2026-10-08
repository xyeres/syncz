import { useSyncExternalStore } from 'react'

const subscribe = (cb) => {
  window.addEventListener('hashchange', cb)
  return () => window.removeEventListener('hashchange', cb)
}
const getHash = () => window.location.hash.replace(/^#\/?/, '') || 'dashboard'

/**
 * Tiny hash router.
 * "#/reports/2026-09"            → { page: 'reports', param: '2026-09', rest: [] }
 * "#/reports/2026-09/c/c-priya"  → { page: 'reports', param: '2026-09', rest: ['c', 'c-priya'] }
 */
export function useRoute() {
  const hash = useSyncExternalStore(subscribe, getHash, () => 'dashboard')
  const [page, param = null, ...rest] = hash.split('/')
  return { page, param, rest }
}

export function navigate(path) {
  window.location.hash = `/${path}`
  window.scrollTo({ top: 0 })
}
