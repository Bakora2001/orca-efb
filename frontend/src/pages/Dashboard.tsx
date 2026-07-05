import {
  Calendar, Plane, Clock, FileText, CloudRain, Target, AlertTriangle, Sparkles, CheckCircle
} from 'lucide-react'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts'

const statCards = [
  { label: 'Flights Planned Today', value: '24', sub: '↑ 15% vs yesterday', icon: Calendar, color: 'text-primary' },
  { label: 'Aircraft Online', value: '8', sub: 'View Fleet', icon: Plane, color: 'text-primary' },
  { label: 'Pending Dispatches', value: '12', sub: 'View All', icon: Clock, color: 'text-warning' },
  { label: 'Generated OFPs', value: '31', sub: 'Today', icon: FileText, color: 'text-primary' },
  { label: 'Weather Alerts', value: '3', sub: 'View Alerts', icon: CloudRain, color: 'text-danger' },
  { label: 'Dispatch Accuracy', value: '99.8%', sub: 'This Month', icon: Target, color: 'text-success' },
]

const dispatches = [
  { tail: '5Y-DWN', route: 'EGPD → UNAA', time: '20:31 UTC', status: 'APPROVED' },
  { tail: '5Y-DWO', route: 'KABI → KABR', time: '19:45 UTC', status: 'APPROVED' },
  { tail: '5Y-DWP', route: 'CTCA → BGAA', time: '18:22 UTC', status: 'MARGINAL' },
  { tail: '5Y-DWN', route: 'HKJK → VGHS', time: '17:10 UTC', status: 'APPROVED' },
  { tail: '5Y-DWO', route: 'OIAA → OMDW', time: '16:05 UTC', status: 'APPROVED' },
]

const upcoming = [
  { flight: 'KABI', route: 'KABI → HADR', time: '00:45', aircraft: '5Y-DWN', status: 'Planned' },
  { flight: 'HADR', route: 'HADR → KABR', time: '04:30', aircraft: '5Y-DWO', status: 'Planned' },
  { flight: 'EGPD', route: 'EGPD → UNAA', time: '06:15', aircraft: '5Y-DWP', status: 'Planned' },
  { flight: 'HKJK', route: 'HKJK → VGHS', time: '08:00', aircraft: '5Y-DWN', status: 'Planned' },
  { flight: 'CTCA', route: 'CTCA → BGAA', time: '10:30', aircraft: '5Y-DWO', status: 'Planned' },
]

const fuelData = [
  { time: '00-04', planned: 35, burn: 20 },
  { time: '04-08', planned: 50, burn: 30 },
  { time: '08-12', planned: 38, burn: 28 },
  { time: '12-16', planned: 30, burn: 22 },
  { time: '16-20', planned: 42, burn: 26 },
  { time: '20-24', planned: 33, burn: 20 },
]

function statusColor(status: string) {
  if (status === 'APPROVED') return 'text-success bg-success/10'
  if (status === 'MARGINAL') return 'text-warning bg-warning/10'
  return 'text-danger bg-danger/10'
}

export default function Dashboard() {
  return (
    <div className="space-y-4 lg:space-y-6">
      {/* Stat cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 lg:gap-4">
        {statCards.map((c) => (
          <div key={c.label} className="bg-surface rounded-xl border border-border shadow-card p-4">
            <c.icon size={18} className={c.color} />
            <p className="text-2xl font-bold text-text-primary mt-2">{c.value}</p>
            <p className="text-xs text-text-secondary mt-1">{c.label}</p>
            <p className={`text-xs font-medium mt-1 ${c.label.includes('Weather') ? 'text-danger' : 'text-text-secondary'}`}>{c.sub}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 lg:gap-6">
        {/* Map */}
        <div className="lg:col-span-2 bg-primary-darker rounded-xl border border-border shadow-card p-4 relative overflow-hidden min-h-[320px]">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <h3 className="text-white font-semibold text-sm">Live Operations Map</h3>
              <span className="flex items-center gap-1 text-xs text-success bg-white/10 px-2 py-0.5 rounded-full">
                <span className="w-1.5 h-1.5 bg-success rounded-full" /> Live
              </span>
            </div>
          </div>
          <div className="absolute inset-0 mt-12 opacity-40 bg-[radial-gradient(circle_at_30%_30%,rgba(30,94,255,0.4),transparent_60%)]" />
          <div className="relative h-64 flex items-center justify-center text-blue-300 text-sm">
            World map visualization (live flights, weather overlays, NOTAMs)
          </div>
        </div>

        {/* Recent Dispatches + Weather Summary */}
        <div className="flex flex-col gap-4 lg:gap-6">
          <div className="bg-surface rounded-xl border border-border shadow-card p-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-semibold text-text-primary text-sm">Recent Dispatches</h3>
              <span className="text-xs text-primary font-medium cursor-pointer">View All</span>
            </div>
            <div className="space-y-2">
              {dispatches.map((d, i) => (
                <div key={i} className="flex items-center justify-between text-sm py-1.5 border-b border-border last:border-0">
                  <div>
                    <p className="font-medium text-text-primary">{d.tail}</p>
                    <p className="text-xs text-text-secondary">{d.route}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-xs text-text-secondary">{d.time}</p>
                    <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${statusColor(d.status)}`}>{d.status}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="bg-surface rounded-xl border border-border shadow-card p-4">
            <h3 className="font-semibold text-text-primary text-sm mb-3">Weather Summary (EGPD)</h3>
            <div className="flex items-center gap-3 mb-3">
              <CloudRain size={28} className="text-warning" />
              <div>
                <p className="text-2xl font-bold text-text-primary">30°C</p>
                <p className="text-xs text-text-secondary">OAT</p>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3 text-xs">
              <div>
                <p className="text-text-secondary">Wind</p>
                <p className="font-semibold text-text-primary">220°/12 kt</p>
              </div>
              <div>
                <p className="text-text-secondary">QNH</p>
                <p className="font-semibold text-text-primary">1013 hPa</p>
              </div>
              <div>
                <p className="text-text-secondary">Visibility</p>
                <p className="font-semibold text-text-primary">10 km</p>
              </div>
              <div>
                <p className="text-text-secondary">Clouds</p>
                <p className="font-semibold text-text-primary">SCT 3,000 ft</p>
              </div>
            </div>
            <p className="text-xs text-primary font-medium mt-3 cursor-pointer">View Full Weather</p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 lg:gap-6">
        {/* Today's overview */}
        <div className="bg-surface rounded-xl border border-border shadow-card p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-semibold text-text-primary text-sm">Today's Overview</h3>
            <span className="text-xs text-primary font-medium cursor-pointer">View Full Report</span>
          </div>
          <div className="flex items-center gap-4">
            <div className="relative w-24 h-24 shrink-0">
              <svg viewBox="0 0 36 36" className="w-24 h-24 -rotate-90">
                <circle cx="18" cy="18" r="16" fill="none" stroke="#E5EAF3" strokeWidth="4" />
                <circle cx="18" cy="18" r="16" fill="none" stroke="#22C55E" strokeWidth="4" strokeDasharray="62.5 100" pathLength="100" />
                <circle cx="18" cy="18" r="16" fill="none" stroke="#F59E0B" strokeWidth="4" strokeDasharray="20.8 100" strokeDashoffset="-62.5" pathLength="100" />
                <circle cx="18" cy="18" r="16" fill="none" stroke="#EF4444" strokeWidth="4" strokeDasharray="8.3 100" strokeDashoffset="-83.3" pathLength="100" />
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <p className="text-lg font-bold text-text-primary">24</p>
                <p className="text-[10px] text-text-secondary">Total</p>
              </div>
            </div>
            <div className="text-xs space-y-1.5">
              <p className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-success" /> Approved <span className="ml-auto font-medium">15 (62.5%)</span></p>
              <p className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-warning" /> Marginal <span className="ml-auto font-medium">5 (20.8%)</span></p>
              <p className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-danger" /> Rejected <span className="ml-auto font-medium">2 (8.3%)</span></p>
              <p className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-blue-200" /> Pending <span className="ml-auto font-medium">2 (8.3%)</span></p>
            </div>
          </div>
        </div>

        {/* Upcoming flights */}
        <div className="bg-surface rounded-xl border border-border shadow-card p-4 overflow-x-auto">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-semibold text-text-primary text-sm">Upcoming Flights</h3>
            <span className="text-xs text-primary font-medium cursor-pointer">View All</span>
          </div>
          <table className="w-full text-xs">
            <thead>
              <tr className="text-text-secondary text-left">
                <th className="pb-2 font-medium">Flight</th>
                <th className="pb-2 font-medium">Route</th>
                <th className="pb-2 font-medium">STD</th>
                <th className="pb-2 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {upcoming.map((u, i) => (
                <tr key={i} className="border-t border-border">
                  <td className="py-2 font-medium text-text-primary">{u.flight}</td>
                  <td className="py-2 text-text-secondary">{u.route}</td>
                  <td className="py-2 text-text-secondary">{u.time}</td>
                  <td className="py-2"><span className="bg-primary/10 text-primary px-2 py-0.5 rounded-full text-[10px] font-medium">{u.status}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Fuel summary */}
        <div className="bg-surface rounded-xl border border-border shadow-card p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-semibold text-text-primary text-sm">Fuel Summary (Today)</h3>
            <span className="text-xs text-primary font-medium cursor-pointer">View All</span>
          </div>
          <p className="text-xl font-bold text-text-primary">83,833 lb</p>
          <p className="text-xs text-text-secondary mb-3">Total Fuel Planned</p>
          <div style={{ width: '100%', height: 90 }}>
            <ResponsiveContainer>
              <BarChart data={fuelData}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E5EAF3" />
                <XAxis dataKey="time" tick={{ fontSize: 9, fill: '#64748B' }} axisLine={false} tickLine={false} />
                <YAxis hide />
                <Tooltip />
                <Bar dataKey="planned" fill="#BFD3FF" radius={[3,3,0,0]} />
                <Bar dataKey="burn" fill="#1E5EFF" radius={[3,3,0,0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 lg:gap-6">
        <div className="bg-warning/10 border border-warning/30 rounded-xl p-4 flex items-start gap-3">
          <AlertTriangle size={18} className="text-warning mt-0.5" />
          <div>
            <p className="text-sm font-semibold text-text-primary">High temperature alert for OIAA (35°C)</p>
            <p className="text-xs text-text-secondary">Consider performance impact for departures. · 10 min ago</p>
          </div>
        </div>

        <div className="bg-surface rounded-xl border border-border shadow-card p-4">
          <h3 className="font-semibold text-text-primary text-sm mb-3">Platform Status</h3>
          <div className="space-y-2 text-sm">
            {['Performance Engine', 'Weather Service', 'Navigation Data', 'Database'].map((s) => (
              <div key={s} className="flex items-center justify-between">
                <span className="text-text-secondary">{s}</span>
                <span className="flex items-center gap-1 text-success font-medium text-xs">
                  <CheckCircle size={14} /> Operational
                </span>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-gradient-to-br from-primary-darker to-primary rounded-xl p-4 text-white flex flex-col">
          <div className="flex items-center gap-2 mb-1">
            <Sparkles size={16} />
            <p className="text-sm font-semibold">AI Dispatch Assistant</p>
            <span className="ml-auto text-[10px] bg-white/20 px-2 py-0.5 rounded-full">New</span>
          </div>
          <p className="text-xs text-blue-100 mb-3">Ask AI for quick dispatch recommendations and analysis</p>
          <button className="mt-auto bg-white text-primary text-sm font-semibold py-2 rounded-lg">Open Assistant</button>
        </div>
      </div>
    </div>
  )
}



// import { CalendarCheck, Plane, Clock3, FileText, Target, CloudLightning, Scale, Fuel } from 'lucide-react'
// import Card from '../components/ui/Card'
// import StatCard from '../components/ui/StatCard'
// import StatusBadge from '../components/ui/StatusBadge'
// import { mockDispatches } from '../data/mockData'

// export default function Dashboard() {
//   return (
//     <div className="space-y-6">
//       <div>
//         <h1 className="text-2xl font-bold text-textprimary">Dashboard</h1>
//         <p className="text-textsecondary text-sm mt-1">Real-time operational overview — Thursday, 25 June 2026</p>
//       </div>

//       <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
//         <StatCard label="Flights Planned Today" value="42" icon={<CalendarCheck size={19} />} trend="+8% vs yesterday" trendUp accent="primary" />
//         <StatCard label="Aircraft Online" value="8 / 10" icon={<Plane size={19} />} trend="2 in maintenance" accent="success" />
//         <StatCard label="Pending Dispatches" value="6" icon={<Clock3 size={19} />} trend="3 marginal" accent="warning" />
//         <StatCard label="Generated OFPs" value="38" icon={<FileText size={19} />} trend="+12% vs yesterday" trendUp accent="primary" />
//       </div>

//       <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
//         <StatCard label="Dispatch Accuracy" value="99.8%" icon={<Target size={19} />} accent="success" />
//         <StatCard label="Weather Alerts" value="2" icon={<CloudLightning size={19} />} accent="danger" />
//         <StatCard label="Average Payload" value="6,420 kg" icon={<Scale size={19} />} accent="primary" />
//         <StatCard label="Average Fuel Burn" value="1,180 kg/hr" icon={<Fuel size={19} />} accent="primary" />
//       </div>

//       <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
//         <Card className="lg:col-span-2">
//           <div className="flex items-center justify-between mb-4">
//             <h2 className="font-bold text-textprimary">Recent Dispatches</h2>
//             <a href="/dispatch-center" className="text-xs font-semibold text-primary hover:underline">View all</a>
//           </div>
//           <div className="overflow-x-auto -mx-5">
//             <table className="w-full text-sm min-w-[600px]">
//               <thead>
//                 <tr className="text-left text-textsecondary text-xs border-b border-borderc">
//                   <th className="px-5 py-2 font-medium">ID</th>
//                   <th className="px-5 py-2 font-medium">Aircraft</th>
//                   <th className="px-5 py-2 font-medium">Route</th>
//                   <th className="px-5 py-2 font-medium">RTOW</th>
//                   <th className="px-5 py-2 font-medium">Status</th>
//                 </tr>
//               </thead>
//               <tbody>
//                 {mockDispatches.map((d) => (
//                   <tr key={d.id} className="border-b border-borderc last:border-0 hover:bg-slate-50/60">
//                     <td className="px-5 py-3 font-semibold text-textprimary">{d.id}</td>
//                     <td className="px-5 py-3 text-textprimary">{d.aircraft}</td>
//                     <td className="px-5 py-3 text-textsecondary">{d.departure} → {d.destination}</td>
//                     <td className="px-5 py-3 text-textprimary mono">{d.rtow.toLocaleString()} kg</td>
//                     <td className="px-5 py-3"><StatusBadge status={d.status} /></td>
//                   </tr>
//                 ))}
//               </tbody>
//             </table>
//           </div>
//         </Card>

//         <Card>
//           <h2 className="font-bold text-textprimary mb-4">Recent Weather Alerts</h2>
//           <div className="space-y-3">
//             <AlertRow airport="EGPD" message="Crosswind exceeding limits on RWY 16" level="warning" />
//             <AlertRow airport="HKJK" message="Visibility below CAT I minimums" level="danger" />
//             <AlertRow airport="FTTC" message="Light turbulence reported FL180-FL250" level="warning" />
//           </div>
//           <h2 className="font-bold text-textprimary mb-3 mt-6">Recent OFPs</h2>
//           <div className="space-y-2 text-sm">
//             <OfpRow id="OFP-3381" route="EGPD → FTTC" />
//             <OfpRow id="OFP-3380" route="HKJK → HKMO" />
//             <OfpRow id="OFP-3379" route="HKMO → HKJK" />
//           </div>
//         </Card>
//       </div>
//     </div>
//   )
// }

// function AlertRow({ airport, message, level }: { airport: string; message: string; level: 'warning' | 'danger' }) {
//   const color = level === 'danger' ? 'bg-danger' : 'bg-warning'
//   return (
//     <div className="flex items-start gap-2.5">
//       <span className={`w-2 h-2 rounded-full mt-1.5 ${color}`} />
//       <div>
//         <p className="text-sm font-semibold text-textprimary">{airport}</p>
//         <p className="text-xs text-textsecondary">{message}</p>
//       </div>
//     </div>
//   )
// }

// function OfpRow({ id, route }: { id: string; route: string }) {
//   return (
//     <div className="flex items-center justify-between text-textprimary">
//       <span className="font-medium">{id}</span>
//       <span className="text-textsecondary text-xs">{route}</span>
//     </div>
//   )
// }
