import { useState } from 'react'
import {
  MapPin, Clock, Fuel, BarChart3,
  Calendar, Send, Download, Trash2, Sliders,
  CloudSun, Plus, CheckCircle2, ChevronRight,
  Sparkles, ArrowLeftRight, Save, FolderOpen,
  Navigation, Wind, Plane
} from 'lucide-react'

// ── shared small stat block ──
function StatBox({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="bg-white rounded-xl border border-borderc shadow-card p-4">
      <p className="text-[10px] font-bold text-textsecondary uppercase tracking-wider mb-1">{label}</p>
      <p className="text-xl font-black text-textprimary font-mono leading-tight">{value}</p>
      {sub && <p className="text-[10px] text-textsecondary mt-0.5 font-medium">{sub}</p>}
    </div>
  )
}

export default function FlightPlanning() {
  const [waypoints, setWaypoints] = useState([
    { id: 1, name: 'EGPD', desc: 'Aberdeen Airport', altitude: 'N/A', tag: 'SID' },
    { id: 2, name: 'NVO',  desc: 'NVO VOR',           altitude: 'FL100', tag: '' },
    { id: 3, name: 'BPK',  desc: 'BPK VOR',           altitude: 'FL200', tag: '' },
    { id: 4, name: 'KEM',  desc: 'KEM VOR',           altitude: 'FL240', tag: '' },
    { id: 5, name: 'AKTIV',desc: 'AKTIV Waypoint',    altitude: 'FL300', tag: '' },
    { id: 6, name: 'UNAA', desc: 'Almaty Intl Airport',altitude: 'N/A',  tag: 'STAR' }
  ])

  const handleAddWaypoint = () => {
    setWaypoints(prev => {
      const copy = [...prev]
      copy.splice(copy.length - 1, 0, { id: Date.now(), name: 'WPT', desc: 'Custom waypoint', altitude: 'FL290', tag: '' })
      return copy
    })
  }

  return (
    <div className="space-y-4 lg:space-y-6">

      {/* ─── PAGE HEADER ─── */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-textprimary">Flight Planning</h1>
          <p className="text-sm text-textsecondary mt-0.5">Plan, analyze and optimize your flight route</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5 text-xs font-semibold text-textsecondary bg-white border border-borderc rounded-lg px-3 py-1.5 shadow-card">
            <Clock size={13} className="text-primary" />
            <span>20:31:08 UTC · 24 JUN 2026</span>
          </div>
          <button className="flex items-center gap-1.5 bg-primary hover:bg-primary-dark text-white text-xs font-bold px-4 py-2 rounded-lg shadow-sm hover:shadow transition">
            <Sparkles size={13} />
            Optimize Route
          </button>
        </div>
      </div>

      {/* ─── ROUTE SELECTOR ROW ─── */}
      <div className="bg-white rounded-xl border border-borderc shadow-card p-4">
        <div className="flex flex-wrap items-center gap-3">
          {/* Departure */}
          <div className="flex-1 min-w-[130px]">
            <p className="text-[9px] font-bold text-textsecondary uppercase tracking-wider mb-1">Departure</p>
            <div className="flex items-center gap-1.5">
              <MapPin size={14} className="text-primary shrink-0" />
              <div>
                <p className="text-sm font-black text-textprimary leading-tight">EGPD</p>
                <p className="text-[10px] text-textsecondary">Aberdeen Airport</p>
              </div>
            </div>
          </div>

          {/* Swap */}
          <button className="p-2 border border-borderc rounded-lg hover:border-primary hover:bg-blue-50 transition text-textsecondary hover:text-primary" title="Swap airports">
            <ArrowLeftRight size={14} />
          </button>

          {/* Destination */}
          <div className="flex-1 min-w-[130px]">
            <p className="text-[9px] font-bold text-textsecondary uppercase tracking-wider mb-1">Destination</p>
            <div className="flex items-center gap-1.5">
              <MapPin size={14} className="text-danger shrink-0" />
              <div>
                <p className="text-sm font-black text-textprimary leading-tight">UNAA</p>
                <p className="text-[10px] text-textsecondary">Almaty Intl Airport</p>
              </div>
            </div>
          </div>

          <div className="w-px h-8 bg-borderc self-center hidden sm:block" />

          {/* Alternate */}
          <div className="flex-1 min-w-[110px]">
            <p className="text-[9px] font-bold text-textsecondary uppercase tracking-wider mb-1">Alternate</p>
            <div className="flex items-center gap-1.5">
              <Navigation size={14} className="text-warning shrink-0" />
              <div>
                <p className="text-sm font-black text-textprimary leading-tight">OIAA</p>
                <p className="text-[10px] text-textsecondary">Al Ain Int Airport</p>
              </div>
            </div>
          </div>

          <div className="w-px h-8 bg-borderc self-center hidden sm:block" />

          {/* Date */}
          <div className="flex items-center gap-1.5 text-xs">
            <Calendar size={14} className="text-textsecondary shrink-0" />
            <div>
              <p className="text-[9px] font-bold text-textsecondary uppercase tracking-wider">Date</p>
              <p className="font-bold text-textprimary">24 Jun 2026</p>
            </div>
          </div>

          {/* Time */}
          <div className="flex items-center gap-1.5 text-xs">
            <Clock size={14} className="text-textsecondary shrink-0" />
            <div>
              <p className="text-[9px] font-bold text-textsecondary uppercase tracking-wider">ETD (UTC)</p>
              <p className="font-bold text-textprimary">10:30</p>
            </div>
          </div>
        </div>
      </div>

      {/* ─── KEY STATS ROW (like Dashboard stat cards) ─── */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 lg:gap-4">
        <StatBox label="Total Distance" value="4,245 NM" />
        <StatBox label="Est. Flight Time" value="05:45" />
        <StatBox label="Cruise Altitude" value="FL300" />
        <StatBox label="Fuel Required" value="2,340 kg" />
        <StatBox label="Avg Wind" value="220°/12 kt" sub="Tailwind component" />
        <StatBox label="Cost Index" value="50" sub="Optimized for fuel" />
      </div>

      {/* ─── MAIN CONTENT: Waypoints + Details ─── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 lg:gap-6">

        {/* LEFT: Waypoints Timeline */}
        <div className="lg:col-span-1 bg-white rounded-xl border border-borderc shadow-card p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-bold text-textprimary">Route & Waypoints</h2>
            <span className="text-xs text-textsecondary font-mono">EGPD → UNAA</span>
          </div>

          {/* Timeline */}
          <div className="relative ml-2 pl-5 border-l-2 border-borderc space-y-5">
            {waypoints.map((wp, idx) => {
              const isEnd = idx === waypoints.length - 1
              const isStart = idx === 0
              return (
                <div key={wp.id} className="relative">
                  <span className={`absolute -left-[25px] top-1 w-3 h-3 rounded-full border-2 ${isStart || isEnd ? 'bg-primary border-primary shadow-sm' : 'bg-white border-slate-300'}`} />
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="flex items-center gap-1.5">
                        <span className={`text-sm font-black tracking-widest font-mono ${isStart || isEnd ? 'text-primary' : 'text-textprimary'}`}>{wp.name}</span>
                        {wp.tag && <span className="text-[8px] bg-slate-100 text-textsecondary px-1.5 py-0.5 rounded font-bold uppercase">{wp.tag}</span>}
                      </div>
                      <p className="text-[10px] text-textsecondary mt-0.5">{wp.desc}</p>
                    </div>
                    <span className="text-[10px] font-mono font-bold text-textsecondary">{wp.altitude}</span>
                  </div>
                </div>
              )
            })}
          </div>

          <div className="flex gap-2 mt-5 pt-4 border-t border-borderc">
            <button onClick={handleAddWaypoint} className="flex-1 flex items-center justify-center gap-1.5 py-2 border border-dashed border-borderc hover:border-primary text-xs font-bold text-textsecondary hover:text-primary rounded-lg transition">
              <Plus size={13} />Add Waypoint
            </button>
            <button className="px-3 py-2 border border-borderc rounded-lg text-xs text-textsecondary hover:bg-slate-50 transition font-bold">•••</button>
          </div>
        </div>

        {/* RIGHT: Fuel, Perf & Weather */}
        <div className="lg:col-span-2 flex flex-col gap-4 lg:gap-6">
          {/* Upper row: Fuel + Performance side by side */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 lg:gap-6">

            {/* Fuel Breakdown */}
            <div className="bg-white rounded-xl border border-borderc shadow-card p-5">
              <h2 className="text-sm font-bold text-textprimary mb-4 flex items-center gap-2">
                <Fuel size={15} className="text-primary" />
                Fuel & Cost Estimate
              </h2>
              <div className="space-y-2.5 text-xs">
                {[
                  { label: 'Trip Fuel',          val: '2,070 kg' },
                  { label: 'Contingency (5%)',   val: '104 kg' },
                  { label: 'Alternate Fuel',     val: '126 kg' },
                  { label: 'Additional Fuel',    val: '40 kg' },
                ].map(r => (
                  <div key={r.label} className="flex items-center justify-between py-1.5 border-b border-slate-50 last:border-0">
                    <span className="text-textsecondary font-medium">{r.label}</span>
                    <span className="font-bold text-textprimary font-mono">{r.val}</span>
                  </div>
                ))}
              </div>
              <div className="mt-3 pt-3 border-t border-borderc flex justify-between items-baseline">
                <span className="text-xs font-bold text-textprimary">Total Required</span>
                <span className="text-lg font-black text-primary font-mono">2,340 kg</span>
              </div>
            </div>

            {/* Performance Check */}
            <div className="bg-white rounded-xl border border-borderc shadow-card p-5">
              <h2 className="text-sm font-bold text-textprimary mb-4 flex items-center gap-2">
                <BarChart3 size={15} className="text-primary" />
                Performance Check
              </h2>
              <div className="space-y-2 text-xs">
                {[
                  { label: 'MTOW',                    val: '24,948 kg' },
                  { label: 'Planned TOW',             val: '19,296 kg' },
                  { label: 'Planned Landing Weight',  val: '16,956 kg' },
                  { label: 'Min Fuel Remaining',      val: '2,300 kg' },
                ].map(r => (
                  <div key={r.label} className="flex items-center justify-between p-2.5 bg-slate-50 rounded-lg border border-slate-100 hover:border-slate-200 transition">
                    <span className="text-textsecondary font-medium">{r.label}</span>
                    <div className="flex items-center gap-1.5">
                      <span className="font-bold text-textprimary font-mono">{r.val}</span>
                      <CheckCircle2 size={13} className="text-success" />
                    </div>
                  </div>
                ))}
              </div>
              <div className="mt-3 p-2.5 bg-emerald-50 border border-emerald-100 rounded-lg flex items-center gap-2 text-[11px] text-emerald-700 font-semibold">
                <CheckCircle2 size={14} className="text-emerald-500 shrink-0" />
                All parameters within limits
              </div>
            </div>
          </div>

          {/* Lower: Weather along route */}
          <div className="bg-white rounded-xl border border-borderc shadow-card p-5">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-bold text-textprimary flex items-center gap-2">
                <CloudSun size={15} className="text-primary" />
                Weather Along Route
              </h2>
              <button className="text-xs font-bold text-primary hover:underline">View Full Weather</button>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-xs border-collapse min-w-[420px]">
                <thead>
                  <tr className="border-b border-borderc text-[9px] uppercase tracking-wider font-bold text-textsecondary">
                    <th className="pb-2 text-left">Segment</th>
                    <th className="pb-2 text-center">Wind</th>
                    <th className="pb-2 text-center">Temp</th>
                    <th className="pb-2 text-center">Visibility</th>
                    <th className="pb-2 text-center">Condition</th>
                  </tr>
                </thead>
                <tbody>
                  {[
                    { seg: 'EGPD → NVO',   wind: '220°/10 kt', temp: '+8°C',  vis: 'CAVOK',    cond: '⛅ Partly Cloudy' },
                    { seg: 'NVO → BPK',    wind: '230°/15 kt', temp: '+2°C',  vis: '9999 m',   cond: '☁️ Overcast' },
                    { seg: 'BPK → KEM',    wind: '240°/20 kt', temp: '-5°C',  vis: '8000 m',   cond: '🌧️ Rain' },
                    { seg: 'KEM → AKTIV',  wind: '230°/25 kt', temp: '-12°C', vis: '5000 m',   cond: '❄️ Snow' },
                    { seg: 'AKTIV → UNAA', wind: '220°/12 kt', temp: '-10°C', vis: 'CAVOK',    cond: '⛅ Partly Cloudy' },
                  ].map((row, i) => (
                    <tr key={i} className={`border-b border-slate-50 last:border-0 hover:bg-slate-50/50 transition text-xs`}>
                      <td className="py-2.5 font-bold text-textprimary">{row.seg}</td>
                      <td className="py-2.5 text-center font-mono text-slate-600">{row.wind}</td>
                      <td className="py-2.5 text-center font-mono font-bold text-textprimary">{row.temp}</td>
                      <td className="py-2.5 text-center font-mono text-textsecondary">{row.vis}</td>
                      <td className="py-2.5 text-center">{row.cond}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="mt-3 flex items-center gap-2">
              <div className="flex-1 h-1.5 rounded-full bg-gradient-to-r from-blue-400 via-emerald-400 via-amber-400 to-red-500" />
              <span className="text-[9px] text-textsecondary font-bold">Light → Heavy</span>
            </div>
          </div>
        </div>
      </div>

      {/* ─── BOTTOM: Nav Log + Alternates + Quick Actions ─── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 lg:gap-6">

        {/* Nav Log */}
        <div className="lg:col-span-1 bg-white rounded-xl border border-borderc shadow-card p-5">
          <h2 className="text-sm font-bold text-textprimary mb-4 flex items-center gap-2">
            <Navigation size={15} className="text-primary" />
            Navigation Log
          </h2>
          <div className="overflow-x-auto">
            <table className="w-full text-xs border-collapse min-w-[240px]">
              <thead>
                <tr className="border-b border-borderc text-[9px] uppercase tracking-wider font-bold text-textsecondary">
                  <th className="pb-2 text-left">Leg</th>
                  <th className="pb-2 text-right">Course</th>
                  <th className="pb-2 text-right">Dist</th>
                  <th className="pb-2 text-right">FL</th>
                </tr>
              </thead>
              <tbody>
                {[
                  { leg: 'EGPD-NVO',   course: '084°', dist: '512',   fl: 'FL100' },
                  { leg: 'NVO-BPK',    course: '096°', dist: '798',   fl: 'FL200' },
                  { leg: 'BPK-KEM',    course: '101°', dist: '1,245', fl: 'FL240' },
                  { leg: 'KEM-AKTIV',  course: '095°', dist: '912',   fl: 'FL300' },
                  { leg: 'AKTIV-UNAA', course: '098°', dist: '778',   fl: 'FL300' },
                ].map((row, i) => (
                  <tr key={i} className="border-b border-slate-50 last:border-0 hover:bg-slate-50/50 transition">
                    <td className="py-2.5 font-bold text-textprimary">{row.leg}</td>
                    <td className="py-2.5 text-right font-mono text-textsecondary">{row.course}</td>
                    <td className="py-2.5 text-right font-mono font-bold text-textprimary">{row.dist}</td>
                    <td className="py-2.5 text-right font-mono text-textsecondary">{row.fl}</td>
                  </tr>
                ))}
                <tr className="bg-slate-50 border-t-2 border-borderc font-bold">
                  <td className="py-2.5 text-textprimary font-black">Total</td>
                  <td />
                  <td className="py-2.5 text-right font-mono text-primary font-black">4,245</td>
                  <td />
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        {/* Alternates */}
        <div className="lg:col-span-1 bg-white rounded-xl border border-borderc shadow-card p-5">
          <h2 className="text-sm font-bold text-textprimary mb-4 flex items-center gap-2">
            <Plane size={15} className="text-primary" />
            Alternate Airports
          </h2>
          <div className="space-y-4">
            {[
              { code: 'OIAA', name: 'Al Ain International Airport', badge: 'PRIMARY', badgeColor: 'bg-purple-100 text-purple-700', dist: '1,120 NM', eta: '02:05', fuel: '540 kg', wx: '28°C SCT 2,500' },
              { code: 'OMSJ', name: 'Sharjah International Airport', badge: 'SECONDARY', badgeColor: 'bg-emerald-100 text-emerald-700', dist: '1,250 NM', eta: '02:20', fuel: '610 kg', wx: '30°C SCT 3,000' },
            ].map(alt => (
              <div key={alt.code} className="p-3.5 bg-slate-50 rounded-xl border border-slate-200/60 hover:border-slate-300 transition space-y-2">
                <div className="flex items-start justify-between">
                  <div>
                    <span className="text-sm font-black text-primary font-mono">{alt.code}</span>
                    <p className="text-[10px] text-textsecondary mt-0.5">{alt.name}</p>
                  </div>
                  <span className={`text-[8px] font-black px-2 py-0.5 rounded-full ${alt.badgeColor}`}>{alt.badge}</span>
                </div>
                <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-[10px] border-t border-slate-200/60 pt-2">
                  <div className="flex justify-between"><span className="text-textsecondary">Distance:</span><span className="font-bold text-textprimary">{alt.dist}</span></div>
                  <div className="flex justify-between"><span className="text-textsecondary">ETA:</span><span className="font-bold text-textprimary">{alt.eta}</span></div>
                  <div className="flex justify-between"><span className="text-textsecondary">Fuel:</span><span className="font-bold text-textprimary">{alt.fuel}</span></div>
                  <div className="flex justify-between"><span className="text-textsecondary">Weather:</span><span className="font-bold text-textprimary">{alt.wx}</span></div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Quick Actions */}
        <div className="lg:col-span-1 bg-white rounded-xl border border-borderc shadow-card p-5">
          <h2 className="text-sm font-bold text-textprimary mb-4">Quick Actions</h2>
          <div className="grid grid-cols-2 gap-2.5">
            {[
              { icon: Save,       label: 'Save Plan' },
              { icon: FolderOpen, label: 'Load Plan' },
              { icon: Download,   label: 'Export OFP' },
              { icon: Send,       label: 'Send to Dispatch' },
              { icon: Trash2,     label: 'Clear Plan' },
              { icon: Sliders,    label: 'Route Options' },
              { icon: CloudSun,   label: 'Weather Brief' },
              { icon: BarChart3,  label: 'Performance' },
            ].map(({ icon: Icon, label }) => (
              <button key={label} className="flex flex-col items-center justify-center gap-1.5 py-3 border border-borderc rounded-xl bg-white text-xs font-semibold text-textsecondary hover:text-primary hover:border-primary/40 hover:bg-blue-50/30 transition duration-150 shadow-sm">
                <Icon size={16} className="text-primary" />
                <span className="text-[10px] leading-tight text-center">{label}</span>
              </button>
            ))}
          </div>

          {/* Route Analysis summary */}
          <div className="mt-4 p-3 bg-blue-50 border border-blue-100 rounded-xl">
            <div className="flex items-start gap-2">
              <div className="bg-primary text-white p-1 rounded shrink-0">
                <Sparkles size={12} fill="currentColor" />
              </div>
              <div className="text-[10px] text-blue-700">
                <p className="font-black text-[9px] uppercase tracking-wider mb-1">Route Optimized For:</p>
                <div className="space-y-0.5 font-semibold leading-relaxed">
                  <p>• Minimum fuel burn</p>
                  <p>• Favorable winds (+12 kt tail)</p>
                  <p>• Operational constraints</p>
                  <p>• Flight time efficiency</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

    </div>
  )
}
