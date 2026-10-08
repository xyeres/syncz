import { useTransition } from 'react'
import { YouTubeMark } from '@/ui/components/Icon.jsx'
import { useApp } from '@/ui/state/context.js'

const wait = (ms) => new Promise((r) => setTimeout(r, ms))

const STEPS = [
  ['01', 'Link your channel', 'Read-only access to video revenue. Nothing is posted.'],
  ['02', 'Group videos into splits', 'Assign collaborators and percentages that total 100%.'],
  ['03', 'Close the month', 'A ledger of who earned what — mark each payout as paid.'],
]

export default function SignIn() {
  const { signIn } = useApp()
  const [isPending, startTransition] = useTransition()

  const connect = () =>
    startTransition(async () => {
      await wait(700) // pretend OAuth round-trip
      startTransition(() => signIn())
    })

  return (
    <div className="signin">
      <header className="signin__top mono">
        <span>Syncz</span>
        <span>Revenue splits for YouTube creators</span>
        <span>Ed. 2026</span>
      </header>

      <div className="signin__grid">
        <section className="signin__hero">
          <h1 className="signin__word">
            Sync<span>z</span>
          </h1>
          <p className="signin__tag">
            Split YouTube revenue with the people who make the videos with you. Clear numbers, every month.
          </p>
        </section>

        <section className="signin__panel">
          <ol className="signin__steps">
            {STEPS.map(([n, title, body]) => (
              <li key={n}>
                <span className="mono">{n}</span>
                <div>
                  <strong>{title}</strong>
                  <p>{body}</p>
                </div>
              </li>
            ))}
          </ol>
          <div className="signin__cta">
            <button type="button" className="btn btn--primary btn--xl btn--block" onClick={connect} disabled={isPending}>
              <span className="btn__yt">
                <YouTubeMark size={30} />
              </span>
              {isPending ? 'Linking your channel…' : 'Sign in with YouTube'}
            </button>
            <p className="signin__fine mono">Demo — signs you in with mock data.</p>
          </div>
        </section>
      </div>

      <div className="signin__bar" aria-hidden="true">
        <i style={{ '--c': '#E6E3D8', flexBasis: '46%' }} />
        <i style={{ '--c': '#C9B8FF', flexBasis: '22%' }} />
        <i style={{ '--c': '#A8E6CF', flexBasis: '14%' }} />
        <i style={{ '--c': '#FFE58A', flexBasis: '10%' }} />
        <i style={{ '--c': '#FF9B85', flexBasis: '8%' }} />
      </div>
    </div>
  )
}
