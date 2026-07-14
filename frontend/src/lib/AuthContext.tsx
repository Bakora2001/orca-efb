/**
 * AuthContext.tsx — context definition, types, and useAuth hook only.
 * No component exports here so Vite Fast Refresh stays happy.
 * The AuthProvider component lives in AuthProvider.tsx.
 */

import { createContext, useContext } from 'react'

export interface SessionUser {
  id: string
  username: string
  role: 'admin' | 'dispatcher'
  full_name?: string | null
}

export interface AuthState {
  /** true while the initial refresh check is in flight */
  loading: boolean
  /** null = not authenticated */
  user: SessionUser | null
  /** Call after a successful login to update context state */
  onLogin: (token: string, user: SessionUser) => void
  /** Call on logout to clear state */
  onLogout: () => void
}

export const AuthContext = createContext<AuthState>({
  loading: true,
  user: null,
  onLogin: () => {},
  onLogout: () => {},
})

export function useAuth(): AuthState {
  return useContext(AuthContext)
}
