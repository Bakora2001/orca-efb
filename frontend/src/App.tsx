import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom'
import { Component, type ReactNode, type ErrorInfo } from 'react'
import { AuthProvider } from './lib/AuthProvider'
import { useAuth } from './lib/AuthContext'
import AppLayout from './components/layout/AppLayout'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import DispatchCenter from './pages/DispatchCenter'
import PayloadRTOW from './pages/PayloadRTOW'
import FlightPlanning from './pages/FlightPlanning'
import OfpGenerator from './pages/OfpGenerator'
import Weather from './pages/Weather'
import RouteBuilder from './pages/RouteBuilder'
import FleetManagement from './pages/FleetManagement'
import AirportsDatabase from './pages/AirportsDatabase'
import PerformanceAnalysis from './pages/PerformanceAnalysis'
import AIDispatchAssistant from './pages/AIDispatchAssistant'
import Reports from './pages/Reports'
import Users from './pages/Users'
import Settings from './pages/Settings'

// ─── Error Boundary ───────────────────────────────────────────────────────────
// Catches render-time JS errors and displays them instead of a white screen.

class ErrorBoundary extends Component<
  { children: ReactNode },
  { error: Error | null }
> {
  state = { error: null }

  static getDerivedStateFromError(error: Error) {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[ErrorBoundary]', error, info.componentStack)
  }

  render() {
    if (this.state.error) {
      const err = this.state.error as Error
      return (
        <div style={{
          minHeight: '100vh', background: '#0b1120', color: '#f87171',
          display: 'flex', flexDirection: 'column', alignItems: 'center',
          justifyContent: 'center', padding: '2rem', fontFamily: 'monospace',
        }}>
          <h2 style={{ color: '#fff', marginBottom: '1rem' }}>⚠ Render Error</h2>
          <pre style={{
            background: '#1e293b', padding: '1.5rem', borderRadius: '8px',
            maxWidth: '800px', whiteSpace: 'pre-wrap', wordBreak: 'break-all',
            fontSize: '0.8rem', lineHeight: 1.6, color: '#fca5a5',
          }}>
            {err.message}{'\n\n'}{err.stack}
          </pre>
          <button
            onClick={() => this.setState({ error: null })}
            style={{ marginTop: '1.5rem', padding: '0.5rem 1.5rem', background: '#3b82f6',
              color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer' }}
          >
            Try Again
          </button>
        </div>
      )
    }
    return this.props.children
  }
}

// ─── ProtectedRoute ───────────────────────────────────────────────────────────

interface ProtectedRouteProps {
  children: React.ReactNode
  /** If supplied, only users with this role may access the route */
  role?: 'admin' | 'dispatcher'
}

function ProtectedRoute({ children, role }: ProtectedRouteProps) {
  const location = useLocation()
  const { loading, user } = useAuth()

  // While the initial refresh check is in flight, render nothing (no flash to /login)
  if (loading) {
    return (
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        minHeight: '100vh', background: '#0b1120',
      }}>
        <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="#3b8fff" strokeWidth="2"
          style={{ animation: 'spin 1s linear infinite' }}>
          <circle cx="12" cy="12" r="10" strokeOpacity="0.25" />
          <path d="M12 2a10 10 0 0 1 10 10" />
        </svg>
        <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
      </div>
    )
  }

  // Not authenticated — preserve intended destination for post-login redirect
  if (!user) {
    return <Navigate to="/login" state={{ from: location }} replace />
  }

  // Role-restricted route — dispatchers are redirected to dashboard
  if (role && user.role !== role) {
    return <Navigate to="/dashboard" replace />
  }

  return <>{children}</>
}

// ─── Routes ───────────────────────────────────────────────────────────────────

function AppRoutes() {
  return (
    <Routes>
      {/* Public */}
      <Route path="/"      element={<Navigate to="/login" replace />} />
      <Route path="/login" element={<Login />} />

      {/* Protected — any authenticated user */}
      <Route element={
        <ProtectedRoute>
          <AppLayout />
        </ProtectedRoute>
      }>
        <Route path="/dashboard"       element={<Dashboard />} />
        <Route path="/dispatch-center" element={<DispatchCenter />} />
        <Route path="/payload-rtow"    element={<PayloadRTOW />} />
        <Route path="/flight-planning" element={<FlightPlanning />} />
        <Route path="/ofp-generator"   element={<OfpGenerator />} />
        <Route path="/weather"         element={<Weather />} />
        <Route path="/route-builder"   element={<RouteBuilder />} />
        <Route path="/airports"        element={<AirportsDatabase />} />
        <Route path="/performance"     element={<PerformanceAnalysis />} />
        <Route path="/ai-assistant"    element={<AIDispatchAssistant />} />
        <Route path="/reports"         element={<Reports />} />
        <Route path="/settings"        element={<Settings />} />

        {/* Admin-only */}
        <Route path="/fleet" element={
          <ProtectedRoute role="admin"><FleetManagement /></ProtectedRoute>
        } />
        <Route path="/users" element={
          <ProtectedRoute role="admin"><Users /></ProtectedRoute>
        } />
      </Route>

      {/* Fallback */}
      <Route path="*" element={<Navigate to="/login" replace />} />
    </Routes>
  )
}

// ─── App ──────────────────────────────────────────────────────────────────────

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <ErrorBoundary>
          <AppRoutes />
        </ErrorBoundary>
      </AuthProvider>
    </BrowserRouter>
  )
}
