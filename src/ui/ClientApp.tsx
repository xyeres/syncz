'use client'

import dynamic from 'next/dynamic'
import { AppProvider } from '@/ui/state/AppContext.jsx'

// The prototype reads window/location/document during render (hash router,
// print helpers, popovers), so the app shell is rendered in the browser only.
const App = dynamic(() => import('@/ui/App.jsx'), { ssr: false })

export default function ClientApp() {
  return (
    <AppProvider>
      <App />
    </AppProvider>
  )
}
