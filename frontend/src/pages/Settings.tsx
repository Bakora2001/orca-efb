import { Settings as SettingsIcon, Bell, Lock, Database } from 'lucide-react'
import Card from '../components/ui/Card'

export default function Settings() {
  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <h1 className="text-2xl font-bold text-textprimary">Settings</h1>
        <p className="text-textsecondary text-sm mt-1">Manage system configuration and preferences.</p>
      </div>

      <Card>
        <h2 className="font-bold text-textprimary mb-4 flex items-center gap-2"><SettingsIcon size={18} className="text-primary" />General</h2>
        <div className="space-y-4">
          <ToggleRow label="Dark Mode" desc="Switch to dark interface theme" />
          <ToggleRow label="Auto-refresh Dashboard" desc="Refresh live metrics every 30 seconds" defaultOn />
        </div>
      </Card>

      <Card>
        <h2 className="font-bold text-textprimary mb-4 flex items-center gap-2"><Bell size={18} className="text-primary" />Notifications</h2>
        <div className="space-y-4">
          <ToggleRow label="Weather Alerts" desc="Notify on significant weather changes" defaultOn />
          <ToggleRow label="Dispatch Approvals" desc="Notify when a dispatch is approved" defaultOn />
        </div>
      </Card>

      <Card>
        <h2 className="font-bold text-textprimary mb-4 flex items-center gap-2"><Lock size={18} className="text-primary" />Security</h2>
        <div className="space-y-4">
          <ToggleRow label="Two-Factor Authentication" desc="Require a code at sign in" />
        </div>
      </Card>

      <Card>
        <h2 className="font-bold text-textprimary mb-4 flex items-center gap-2"><Database size={18} className="text-primary" />Performance Data</h2>
        <p className="text-sm text-textsecondary">Dash 8 Q400 performance database — last updated 12 June 2026.</p>
        <button className="mt-3 border border-borderc rounded-lg px-4 py-2 text-sm font-semibold text-textprimary hover:border-primary hover:text-primary transition">
          Check for Updates
        </button>
      </Card>
    </div>
  )
}

function ToggleRow({ label, desc, defaultOn }: { label: string; desc: string; defaultOn?: boolean }) {
  return (
    <div className="flex items-center justify-between">
      <div>
        <p className="text-sm font-semibold text-textprimary">{label}</p>
        <p className="text-xs text-textsecondary">{desc}</p>
      </div>
      <label className="relative inline-flex items-center cursor-pointer">
        <input type="checkbox" defaultChecked={defaultOn} className="sr-only peer" />
        <div className="w-11 h-6 bg-slate-200 peer-checked:bg-primary rounded-full transition-colors" />
        <div className="absolute left-1 top-1 w-4 h-4 bg-white rounded-full transition-transform peer-checked:translate-x-5" />
      </label>
    </div>
  )
}
