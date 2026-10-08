import { useEffect } from 'react'
import Icon from './Icon.jsx'

const AUTO_HIDE_MS = 6000

function Toast({ toast, onDismiss }) {
  useEffect(() => {
    const t = setTimeout(() => onDismiss(toast.id), AUTO_HIDE_MS)
    return () => clearTimeout(t)
  }, [toast.id, onDismiss])

  return (
    <div className="toast" role="status">
      <div className="toast__body">
        <span className="label mono toast__title">Couldn’t do that</span>
        <ul className="toast__reasons">
          {toast.reasons.map((r) => (
            <li key={`${r.code}-${r.message}`}>
              <span>{r.message}</span>
              <span className="toast__code mono">{r.code}</span>
            </li>
          ))}
        </ul>
      </div>
      <button type="button" className="toast__x" onClick={() => onDismiss(toast.id)} aria-label="Dismiss">
        <Icon name="close" size={18} />
      </button>
    </div>
  )
}

/** Non-blocking rejection banners (safety net behind the UI pre-checks). */
export default function Toasts({ toasts, onDismiss }) {
  return (
    <div className="toasts no-print" aria-live="polite">
      {toasts.map((t) => (
        <Toast key={t.id} toast={t} onDismiss={onDismiss} />
      ))}
    </div>
  )
}
