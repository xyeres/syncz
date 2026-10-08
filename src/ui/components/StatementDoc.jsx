import { CHANNEL } from '@/infrastructure/seed/mock.js'
import { bpsLabel, dateLabel, money, periodLabel } from '@/ui/lib/format.js'

/**
 * A single collaborator statement — the document emailed to them.
 * Everything comes from the report snapshot line (frozen name/email and
 * per-video amounts), so it always matches what was due.
 */
export default function StatementDoc({ report, line }) {
  const { period, revision, issuedAt } = report
  return (
    <article className="statement" style={{ '--c': line.color ?? '#ddd' }} aria-label={`Statement for ${line.name}`}>
      <header className="statement__head">
        <div className="statement__brand">
          <span className="wordmark__blocks" aria-hidden="true">
            <i style={{ '--c': '#C9B8FF' }} />
            <i style={{ '--c': '#A8E6CF' }} />
            <i style={{ '--c': '#FFE58A' }} />
          </span>
          Syncz
        </div>
        <div className="statement__channel">
          <span className="label mono">Channel</span>
          <strong>{CHANNEL.name}</strong>
        </div>
        <div className="statement__period">
          <span className="label mono">Statement period</span>
          <strong>{periodLabel(period)}</strong>
          <span className="mono statement__rev">
            Revision {revision} · Issued {dateLabel(issuedAt.slice(0, 10))}
          </span>
          {revision > 1 && <span className="mono statement__replaces">Replaces Revision {revision - 1}</span>}
        </div>
      </header>

      <section className="statement__to">
        <span className="statement__swatch" aria-hidden="true">{line.initials}</span>
        <div>
          <span className="label mono">Statement for</span>
          <h2 className="statement__name">{line.name}</h2>
          <span className="mono statement__email">{line.email}</span>
        </div>
      </section>

      <table className="statement__table">
        <thead>
          <tr className="mono">
            <th scope="col">Video</th>
            <th scope="col" className="num">Video revenue</th>
            <th scope="col" className="num">Split %</th>
            <th scope="col" className="num">Earnings</th>
          </tr>
        </thead>
        <tbody>
          {line.videos.map((v) => (
            <tr key={`${v.splitId}-${v.videoId}`}>
              <td>{v.title}</td>
              <td className="mono num">{money(v.videoRevenue)}</td>
              <td className="mono num">{bpsLabel(v.bps)}</td>
              <td className="mono num">{money(v.amount)}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr>
            <th scope="row" colSpan={3}>
              Total earnings · {periodLabel(period)}
            </th>
            <td className="mono num statement__total">{money(line.amount)}</td>
          </tr>
        </tfoot>
      </table>
    </article>
  )
}
