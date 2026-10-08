import { CHANNEL } from '@/infrastructure/seed/mock.js'
import { YouTubeMark } from './Icon.jsx'

/** Persistent "this account is linked to YouTube" block. */
export default function LinkedStatus({ compact = false }) {
  if (compact) {
    return (
      <div className="linked-pill" title={`${CHANNEL.name} is linked to YouTube`}>
        <img src={CHANNEL.avatar} alt="" width="28" height="28" />
        <YouTubeMark size={18} />
        <span className="mono">Linked</span>
      </div>
    )
  }
  return (
    <section className="linked" aria-label="YouTube connection">
      <div className="linked__head mono">
        <YouTubeMark size={20} />
        <span>YouTube</span>
        <span className="linked__state">
          <span className="linked__dot" aria-hidden="true" /> Linked
        </span>
      </div>
      <div className="linked__channel">
        <img src={CHANNEL.avatar} alt="" width="44" height="44" />
        <div>
          <div className="linked__name">{CHANNEL.name}</div>
          <div className="linked__handle mono">
            {CHANNEL.handle} · {CHANNEL.subscribers}
          </div>
        </div>
      </div>
    </section>
  )
}
