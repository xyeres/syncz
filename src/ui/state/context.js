import { createContext, use } from 'react'

export const AppContext = createContext(null)

export function useApp() {
  const ctx = use(AppContext)
  if (!ctx) throw new Error('useApp must be used inside <AppProvider>')
  return ctx
}
