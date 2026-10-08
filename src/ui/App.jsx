import LinkedStatus from '@/ui/components/LinkedStatus.jsx'
import ProfileMenu from '@/ui/components/ProfileMenu.jsx'
import Sidebar from '@/ui/components/Sidebar.jsx'
import Toasts from '@/ui/components/Toasts.jsx'
import { useRoute } from '@/ui/lib/router.js'
import Collaborators from '@/ui/views/Collaborators.jsx'
import Dashboard from '@/ui/views/Dashboard.jsx'
import Reports from '@/ui/views/Reports.jsx'
import ReportView from '@/ui/views/ReportView.jsx'
import SignIn from '@/ui/views/SignIn.jsx'
import SplitComposer from '@/ui/views/SplitComposer.jsx'
import StatementView from '@/ui/views/StatementView.jsx'
import Splits from '@/ui/views/Splits.jsx'
import { useApp } from '@/ui/state/context.js'

function Page({ page, param, rest }) {
  switch (page) {
    case 'splits':
      return param ? <SplitComposer key={param} splitId={param} /> : <Splits />
    case 'collaborators':
      return <Collaborators />
    case 'reports':
      if (param && rest[0] === 'c' && rest[1]) {
        return <StatementView key={`${param}/${rest[1]}`} period={param} personId={rest[1]} />
      }
      return param ? <ReportView key={param} period={param} /> : <Reports />
    default:
      return <Dashboard />
  }
}

export default function App() {
  const { user, toasts, dismissToast } = useApp()
  const { page, param, rest } = useRoute()

  if (!user) return <SignIn />

  return (
    <div className="shell">
      <a href="#main" className="skip-link">Skip to content</a>
      <Sidebar page={page} />
      <div className="main">
        <div className="topbar no-print">
          <div className="topbar__crumb mono">
            Syncz / <strong>{page}</strong>
            {param && <> / {param}</>}
            {rest.length > 0 && <> / {rest.join(' / ')}</>}
          </div>
          <div className="topbar__right">
            <LinkedStatus compact />
            <ProfileMenu />
          </div>
        </div>
        <main id="main" className="content">
          <Page page={page} param={param} rest={rest} />
        </main>
      </div>
      <Toasts toasts={toasts} onDismiss={dismissToast} />
    </div>
  )
}
