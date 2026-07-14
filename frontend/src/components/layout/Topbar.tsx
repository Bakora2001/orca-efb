import { Search, Bell, Menu, ChevronDown, LogOut, User } from 'lucide-react'
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useUTCClock } from '../ui/useUTCClock'
import { logout } from '../../lib/api'
import { useAuth } from '../../lib/AuthContext'

export default function Topbar({ onMenuClick }: { onMenuClick: () => void }) {
  const { timeString } = useUTCClock()
  const [profileOpen, setProfileOpen] = useState(false)
  const navigate = useNavigate()
  const { user, onLogout } = useAuth()

  const displayName = user?.full_name || user?.username || 'User'
  const initials = displayName
    .split(' ')
    .map((n) => n[0])
    .join('')
    .slice(0, 2)
    .toUpperCase()
  const roleLabel = user?.role === 'admin' ? 'Administrator' : 'Dispatcher'

  const handleLogout = () => {
    setProfileOpen(false)
    onLogout()   // clears context state
    logout()     // tells server to clear cookie, then redirects to /login
  }

  return (
    <header className="sticky top-0 z-30 bg-white border-b border-borderc px-4 sm:px-6 py-3 flex items-center justify-between gap-4">
      <div className="flex items-center gap-3 flex-1 min-w-0">
        <button onClick={onMenuClick} className="lg:hidden text-textprimary">
          <Menu size={22} />
        </button>
        <div className="relative flex-1 max-w-md hidden sm:block">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-textsecondary" />
          <input
            type="text"
            placeholder="Search flights, airports, aircraft..."
            className="w-full pl-9 pr-3 py-2 rounded-lg border border-borderc bg-bg text-sm text-textprimary placeholder:text-textsecondary focus:border-primary focus:ring-2 focus:ring-primary/15 outline-none transition"
          />
        </div>
      </div>

      <div className="flex items-center gap-3 sm:gap-4">
        <div className="hidden sm:flex items-center gap-1.5 bg-bg border border-borderc rounded-full px-3 py-1.5 text-xs font-semibold text-textprimary mono">
          <span className="w-1.5 h-1.5 rounded-full bg-success animate-pulse-slow" />
          {timeString} UTC
        </div>

        <button className="relative text-textsecondary hover:text-textprimary transition">
          <Bell size={20} />
          <span className="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-danger" />
        </button>

        <div className="relative">
          <button
            onClick={() => setProfileOpen((s) => !s)}
            className="flex items-center gap-2 pl-2 border-l border-borderc"
          >
            <div className="w-8 h-8 rounded-full bg-primary-dark text-white flex items-center justify-center text-xs font-bold">
              {initials || <User size={14} />}
            </div>
            <div className="hidden md:block text-left">
              <p className="text-xs font-semibold text-textprimary leading-tight">{displayName}</p>
              <p className="text-[11px] text-textsecondary leading-tight">{roleLabel}</p>
            </div>
            <ChevronDown size={15} className="text-textsecondary hidden md:block" />
          </button>

          {profileOpen && (
            <div className="absolute right-0 mt-2 w-48 bg-white border border-borderc rounded-lg shadow-cardHover py-1.5 z-50">
              <div className="px-3.5 py-2 border-b border-borderc mb-1">
                <p className="text-xs font-semibold text-textprimary">{displayName}</p>
                <p className="text-[11px] text-textsecondary">{roleLabel}</p>
              </div>
              <button
                onClick={handleLogout}
                className="w-full flex items-center gap-2 px-3.5 py-2 text-sm text-danger hover:bg-red-50 transition"
              >
                <LogOut size={15} />
                Sign Out
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  )
}
