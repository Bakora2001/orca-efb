import { Search, Bell, Menu, ChevronDown, LogOut } from 'lucide-react'
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useUTCClock } from '../ui/useUTCClock'

export default function Topbar({ onMenuClick }: { onMenuClick: () => void }) {
  const { timeString } = useUTCClock()
  const [profileOpen, setProfileOpen] = useState(false)
  const navigate = useNavigate()

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
              JD
            </div>
            <div className="hidden md:block text-left">
              <p className="text-xs font-semibold text-textprimary leading-tight">J. Dispatcher</p>
              <p className="text-[11px] text-textsecondary leading-tight">Dispatcher</p>
            </div>
            <ChevronDown size={15} className="text-textsecondary hidden md:block" />
          </button>

          {profileOpen && (
            <div className="absolute right-0 mt-2 w-44 bg-white border border-borderc rounded-lg shadow-cardHover py-1.5 z-50">
              <button
                onClick={() => navigate('/')}
                className="w-full flex items-center gap-2 px-3.5 py-2 text-sm text-danger hover:bg-slate-50 transition"
              >
                <LogOut size={15} />
                Logout
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  )
}
