import Icon from '@/ui/components/Icon.jsx'
import PageHeader from '@/ui/components/PageHeader.jsx'
import { Swatch } from '@/ui/components/Person.jsx'
import SplitBar from '@/ui/components/SplitBar.jsx'
import { DEFAULT_PERIOD } from '@/infrastructure/seed/mock.js'
import { bpsLabel, money, periodShort } from '@/ui/lib/format.js'
import { revenueFor } from '@/ui/lib/ledger.js'
import { navigate } from '@/ui/lib/router.js'
import { useApp } from '@/ui/state/context.js'

export default function Splits() {
  const { splits, videos, person } = useApp()
  const assigned = new Set(splits.flatMap((s) => s.videoIds))
  const unsplit = videos.filter((v) => !assigned.has(v.id))

  return (
    <div className="page">
      <PageHeader
        index="02"
        eyebrow="Splits"
        title="Splits"
        lede="A split is a group of videos and the percentage each person earns from them."
        action={
          <button type="button" className="btn btn--primary btn--lg" onClick={() => navigate('splits/new')}>
            <Icon name="plus" size={24} stroke={2.5} /> New split
          </button>
        }
      />

      {splits.length === 0 ? (
        <div className="empty">
          <p className="empty__title">No splits yet.</p>
          <p className="muted">Create one to start sharing revenue with collaborators.</p>
        </div>
      ) : (
        <ul className="grid12 tiles">
          {splits.map((split, i) => {
            const vids = videos.filter((v) => split.videoIds.includes(v.id))
            return (
              <li key={split.id} className="span-6">
                <a href={`#/splits/${split.id}`} className="tile">
                  <div className="tile__top mono">
                    <span>S/{String(i + 1).padStart(2, '0')}</span>
                    <span>{vids.length} videos</span>
                    <span>
                      {periodShort(DEFAULT_PERIOD)} {money(revenueFor(vids, DEFAULT_PERIOD))}
                    </span>
                  </div>
                  <h2 className="tile__name">{split.name}</h2>
                  <SplitBar shares={split.shares} height="lg" />
                  <ul className="tile__legend">
                    {split.shares.map((s) => {
                      const p = person(s.personId)
                      return (
                        <li key={s.personId}>
                          <Swatch person={p} size="sm" />
                          <span>{p.name}</span>
                          <span className="mono">{bpsLabel(s.bps)}</span>
                        </li>
                      )
                    })}
                  </ul>
                  <div className="tile__thumbs" aria-hidden="true">
                    {vids.slice(0, 5).map((v) => (
                      <img key={v.id} src={v.thumbnail} alt="" loading="lazy" />
                    ))}
                    {vids.length > 5 && <span className="mono">+{vids.length - 5}</span>}
                  </div>
                  <span className="tile__edit mono">
                    Edit <Icon name="arrowRight" size={16} />
                  </span>
                </a>
              </li>
            )
          })}
        </ul>
      )}

      {unsplit.length > 0 && (
        <p className="note mono">
          <span className="note__box" aria-hidden="true" />
          {unsplit.length} video{unsplit.length > 1 ? 's are' : ' is'} not in any split — that revenue stays 100% with you.
        </p>
      )}
    </div>
  )
}
