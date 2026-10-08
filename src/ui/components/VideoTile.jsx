import { compactNumber, dateLabel, money, monthName } from '@/ui/lib/format.js'
import Icon from './Icon.jsx'

export default function VideoTile({ video, period, selected, lockedBy, onToggle }) {
  const locked = Boolean(lockedBy)
  return (
    <button
      type="button"
      className={`vtile${selected ? ' is-selected' : ''}${locked ? ' is-locked' : ''}`}
      aria-pressed={selected}
      disabled={locked}
      onClick={onToggle}
      title={locked ? `Already in “${lockedBy}”` : undefined}
    >
      <span className="vtile__thumb">
        <img src={video.thumbnail} alt="" loading="lazy" width="480" height="270" />
        <span className="vtile__check" aria-hidden="true">
          {selected && <Icon name="check" size={24} stroke={3} />}
        </span>
        {locked && <span className="vtile__lock mono">In: {lockedBy}</span>}
      </span>
      <span className="vtile__body">
        <span className="vtile__title">{video.title}</span>
        <span className="vtile__meta mono">
          <span>{dateLabel(video.publishedAt)}</span>
          <span>{compactNumber(video.views)} views</span>
        </span>
        <span className="vtile__rev mono">
          {monthName(period).slice(0, 3)} {money(video.revenue[period] ?? 0)}
        </span>
      </span>
    </button>
  )
}
