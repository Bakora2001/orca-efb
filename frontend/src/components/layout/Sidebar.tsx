import { NavLink } from 'react-router-dom'
import {
  LayoutDashboard, Radio, Scale, Map, FileText, CloudSun, Route,
  Plane, Building2, BarChart3, Bot, FileBarChart, Users, Settings, X
} from 'lucide-react'

const navItems = [
  { to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/dispatch-center', label: 'Dispatch Center', icon: Radio },
  { to: '/payload-rtow', label: 'Payload & RTOW', icon: Scale },
  { to: '/flight-planning', label: 'Flight Planning', icon: Map },
  { to: '/ofp-generator', label: 'OFP Generator', icon: FileText },
  { to: '/weather', label: 'Weather', icon: CloudSun },
  { to: '/route-builder', label: 'Route Builder', icon: Route },
  { to: '/fleet', label: 'Fleet Management', icon: Plane },
  { to: '/airports', label: 'Airports Database', icon: Building2 },
  { to: '/performance', label: 'Performance Analysis', icon: BarChart3 },
  { to: '/ai-assistant', label: 'AI Dispatch Assistant', icon: Bot },
  { to: '/reports', label: 'Reports', icon: FileBarChart },
  { to: '/users', label: 'Users', icon: Users },
  { to: '/settings', label: 'Settings', icon: Settings },
]

export default function Sidebar({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <>
      {/* mobile overlay */}
      {open && (
        <div
          className="fixed inset-0 bg-black/40 z-40 lg:hidden"
          onClick={onClose}
        />
      )}

      <aside
        className={`fixed lg:sticky top-0 left-0 h-screen w-[260px] bg-white border-r border-borderc z-50 flex flex-col transition-transform duration-300 ${
          open ? 'translate-x-0' : '-translate-x-full'
        } lg:translate-x-0`}
      >
        <div className="flex items-center justify-between px-5 py-5 border-b border-borderc">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-lg bg-primary-darker flex items-center justify-center">
              <svg width="20" height="16" viewBox="0 0 64 64">
                <path d="M32 16 C26 22 14 24 8 22 C12 30 22 34 30 32 C28 38 20 42 12 42 C20 48 34 48 38 38 C40 44 36 50 30 52 C40 52 48 44 48 34 C52 38 52 46 48 50 C56 46 58 36 54 28 C52 22 44 18 38 22 C40 18 38 14 32 16 Z" fill="#FFFFFF"/>
              </svg>
            </div>
            <div>
              <p className="text-sm font-bold text-textprimary leading-tight">ORCA AVIATION</p>
              <p className="text-[11px] text-textsecondary leading-tight">EFB Platform</p>
            </div>
          </div>
          <button onClick={onClose} className="lg:hidden text-textsecondary">
            <X size={20} />
          </button>
        </div>

        <nav className="flex-1 overflow-y-auto py-3 px-3">
          {navItems.map((item) => {
            const Icon = item.icon
            return (
              <NavLink
                key={item.to}
                to={item.to}
                onClick={onClose}
                className={({ isActive }) =>
                  `flex items-center gap-3 px-3.5 py-2.5 rounded-lg text-sm font-medium mb-1 transition ${
                    isActive
                      ? 'bg-primary text-white shadow-sm'
                      : 'text-textprimary hover:bg-slate-50'
                  }`
                }
              >
                <Icon size={17} />
                {item.label}
              </NavLink>
            )
          })}
        </nav>

        <div className="px-4 py-4 border-t border-borderc">
          <div className="bg-bg rounded-lg px-3 py-2.5 text-xs text-textsecondary">
            <p className="font-semibold text-textprimary mb-0.5">v1.0.0 — Build 2026.06</p>
            <p>Dash 8 Performance Engine</p>
          </div>
        </div>
      </aside>
    </>
  )
}
