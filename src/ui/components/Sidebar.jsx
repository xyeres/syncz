import Icon from './Icon.jsx'
import LinkedStatus from './LinkedStatus.jsx'

const NAV = [
  { id: 'dashboard', label: 'Dashboard', icon: 'dashboard' },
  { id: 'splits', label: 'Splits', icon: 'splits' },
  { id: 'collaborators', label: 'Collaborators', icon: 'people' },
  { id: 'reports', label: 'Reports', icon: 'report' },
]

export default function Sidebar({ page }) {
  return (
    <aside className="sidebar no-print">
      <a href="#/dashboard" className="wordmark" aria-label="Syncz home">
        <span className="wordmark__blocks" aria-hidden="true">
          <i style={{ '--c': '#C9B8FF' }} />
          <i style={{ '--c': '#A8E6CF' }} />
          <i style={{ '--c': '#FFE58A' }} />
        </span>
        Syncz
      </a>
      <nav className="nav" aria-label="Main">
        {NAV.map((item, i) => (
          <a
            key={item.id}
            href={`#/${item.id}`}
            className="nav__item"
            aria-current={page === item.id ? 'page' : undefined}
          >
            <span className="nav__num mono">0{i + 1}</span>
            <Icon name={item.icon} size={22} />
            <span>{item.label}</span>
          </a>
        ))}
      </nav>
      <div className="sidebar__foot">
        <LinkedStatus />
      </div>
    </aside>
  )
}
