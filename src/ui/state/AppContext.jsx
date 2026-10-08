import { useCallback, useEffect, useMemo, useReducer } from 'react'
import { ME, TODAY, VIDEOS } from '@/infrastructure/seed/mock.js'
import { AppContext } from './context.js'
import { checkAction, initState, reducer, toastsFrom } from './domain.js'

/*
 * React wiring for the pure domain in ./domain.js.
 * Dispatch helpers create ids/timestamps and always dispatch; the reducer
 * guards against the latest state and records rejections, which the toast
 * layer renders. Helpers return { ok, reasons } from a pre-check.
 */

const pad = (n) => String(n).padStart(2, '0')

/** "Now" on the mock calendar: TODAY's date with the real time of day. */
function nowIso() {
  const t = new Date()
  return `${TODAY.getFullYear()}-${pad(TODAY.getMonth() + 1)}-${pad(TODAY.getDate())}T${pad(t.getHours())}:${pad(t.getMinutes())}:${pad(t.getSeconds())}`
}

let seq = 0
const freshMeta = (prefix) => ({ id: `${prefix}-${Date.now().toString(36)}-${(seq++).toString(36)}`, at: nowIso() })

export function AppProvider({ children }) {
  const [state, dispatch] = useReducer(reducer, undefined, initState)
  // Stable, so each toast's auto-hide timer isn't reset by unrelated renders.
  const dismissToast = useCallback((id) => dispatch({ type: 'dismissRejection', id }), [])

  const value = useMemo(() => {
    const people = new Map([[ME.id, ME], ...state.collaborators.map((c) => [c.id, c])])

    /**
     * Always dispatch: the reducer re-checks against the latest state and
     * records any rejection (→ toast), so even a stale pre-check can't fail
     * silently. The return value is the pre-check against this render's state.
     */
    const run = (action, prefix = 'act') => {
      const full = { ...action, meta: freshMeta(prefix) }
      dispatch(full)
      return checkAction(state, full)
    }

    return {
      ...state,
      collaborators: state.collaborators.filter((c) => !c.deleted),
      allCollaborators: state.collaborators, // incl. soft-deleted (COL-2 uniqueness)
      videos: VIDEOS,
      reports: [...state.reports].sort((a, b) => b.period.localeCompare(a.period)),
      person: (id) => people.get(id) ?? { id, name: 'Removed', initials: '?', color: '#ddd', role: '' },
      toasts: toastsFrom(state),
      dismissToast,
      signIn: () => dispatch({ type: 'signIn' }),
      signOut: () => dispatch({ type: 'signOut' }),
      saveSplit: (split) => run({ type: 'saveSplit', split }),
      deleteSplit: (id) => run({ type: 'deleteSplit', id }),
      addCollaborator: (collaborator) => run({ type: 'addCollaborator', collaborator }),
      updateCollaborator: (id, fields) => run({ type: 'updateCollaborator', id, fields }),
      deleteCollaborator: (id) => run({ type: 'deleteCollaborator', id }),
      generateReport: (period) => run({ type: 'generateReport', period }, 'rep'),
      recalculateReport: (period) => run({ type: 'recalculateReport', period }, 'rev'),
      markSent: (period, personId) => run({ type: 'markSent', period, personId }, 'sent'),
      markPaid: (period, personId) => run({ type: 'markPaid', period, personId }, 'pay'),
      recordSettlement: (period, personId, amount, note) =>
        run({ type: 'recordSettlement', period, personId, amount, note: note?.trim() || undefined }, 'set'),
      undoEntry: (period, personId) => run({ type: 'undoEntry', period, personId }, 'undo'),
    }
  }, [state, dismissToast])

  // Dev-only console handle, e.g. `__syncz.markPaid('2026-06', 'c-jonah')` to force a rejection.
  useEffect(() => {
    if (process.env.NODE_ENV === 'development') window.__syncz = value
  }, [value])

  return <AppContext value={value}>{children}</AppContext>
}
