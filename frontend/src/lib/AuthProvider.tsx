/**
 * AuthProvider.tsx — the component that bootstraps the session.
 * Kept separate from AuthContext.tsx so Vite Fast Refresh works correctly:
 * a file with component exports must not also export hooks/values.
 */

import { useEffect, useState, useCallback, type ReactNode } from 'react'
import { AuthContext, type SessionUser } from './AuthContext'
import { setSession, clearSession } from './api'

const BASE_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:4000'

export function AuthProvider({ children }: { children: ReactNode }) {
  const [loading, setLoading] = useState(true)
  const [user, setUser] = useState<SessionUser | null>(null)

  // On every mount/refresh — try to restore session from the httpOnly cookie.
  useEffect(() => {
    let cancelled = false

    async function restoreSession() {
      try {
        const res = await fetch(`${BASE_URL}/api/auth/refresh`, {
          method:      'POST',
          credentials: 'include',
        })

        if (!cancelled && res.ok) {
          const body = await res.json()
          const data = body.data || body
          if (data.token && data.user) {
            setSession(data.token, data.user)
            setUser(data.user)
          }
        }
      } catch {
        // Network error or server down — stay unauthenticated
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    restoreSession()
    return () => { cancelled = true }
  }, [])

  const onLogin = useCallback((token: string, sessionUser: SessionUser) => {
    setSession(token, sessionUser)
    setUser(sessionUser)
  }, [])

  const onLogout = useCallback(() => {
    clearSession()
    setUser(null)
  }, [])

  return (
    <AuthContext.Provider value={{ loading, user, onLogin, onLogout }}>
      {children}
    </AuthContext.Provider>
  )
}
