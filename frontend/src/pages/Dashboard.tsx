import { useState, useEffect } from 'react'
import {
  PlaneTakeoff, CloudLightning, ShieldCheck,
  AlertTriangle, Navigation, Clock, ChevronRight, Loader2,
  Activity, WifiOff, RefreshCw
} from 'lucide-react'
import Card from '../components/ui/Card'
import { Link, useNavigate } from 'react-router-dom'
import { aircraft as aircraftApi, weather as weatherApi, health as healthApi, type WeatherResult } from '../lib/api'
import { useAuth } from '../lib/AuthContext'

// ── Small weather detail chip ──────────────────────────────────────────────────
function MetarToken({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col items-center bg-slate-50 border border-borderc rounded-lg px-3 py-2 min-w-[70px]">
      <span className="text-[9px] font-bold text-textsecondary uppercase tracking-wider mb-0.5">{label}</span>
      <span className="font-mono font-bold text-textprimary text-xs">{value}</span>
    </div>
  )
}

// ── Parse a few key fields from a raw METAR string ─────────────────────────────
function parseMetar(raw: string) {
  const wind  = raw.match(/(\d{3}|VRB)(\d{2,3})(G\d{2,3})?KT/)
  const vis   = raw.match(/\s(\d{4}|CAVOK|[0-9]+SM)\s/)
  const cloud = raw.match(/(FEW|SCT|BKN|OVC)\d{3}|CAVOK/)
  const temp  = raw.match(/\s(M?\d{2})\/(M?\d{2})\s/)
  const qnh   = raw.match(/[AQ](\d{4})/)

  const windStr = wind
    ? `${wind[1]}°/${wind[2]}${wind[3] ? ' G' + wind[3].slice(1) : ''} kt`
    : '—'
  const visStr  = vis ? vis[1] : cloud?.[0] === 'CAVOK' ? 'CAVOK' : '—'
  const cloudStr = cloud ? cloud[0] : '—'
  const tempStr = temp ? temp[1].replace('M', '-') + '°C' : '—'
  const qnhStr  = qnh ? (raw.includes('Q') ? qnh[1] + ' hPa' : (parseInt(qnh[1]) / 100).toFixed(2) + ' inHg') : '—'

  return { windStr, visStr, cloudStr, tempStr, qnhStr }
}

export default function Dashboard() {
  const { user } = useAuth()
  const navigate = useNavigate()

  const [fleetCount,  setFleetCount]  = useState<number | null>(null)
  const [activeCount, setActiveCount] = useState<number | null>(null)
  const [weather,     setWeather]     = useState<WeatherResult | null>(null)
  const [wxError,     setWxError]     = useState(false)
  const [systemHealth, setSystemHealth] = useState<{ api: string; database: string } | null>(null)
  const [healthChecked, setHealthChecked] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      // Fetch all in parallel, each with individual error handling so one
      // failing request doesn't prevent the others from rendering.
      const [acResult, wxResult, hlResult] = await Promise.allSettled([
        aircraftApi.list(true),
        weatherApi.get('EGPD'),
        healthApi.check(),
      ])

      if (acResult.status === 'fulfilled') {
        setFleetCount(acResult.value.length)
        setActiveCount(acResult.value.filter(a => a.is_active).length)
      } else {
        setFleetCount(0)
        setActiveCount(0)
        console.error('Fleet fetch failed:', acResult.reason)
      }

      if (wxResult.status === 'fulfilled' && wxResult.value) {
        setWeather(wxResult.value)
        setWxError(false)
      } else {
        setWxError(true)
      }

      if (hlResult.status === 'fulfilled' && hlResult.value) {
        setSystemHealth(hlResult.value)
      }
      setHealthChecked(true)
      setLoading(false)
    }
    load()
  }, [])

  // Health: backend returns api:'OK' (uppercase)
  const isHealthy = healthChecked && systemHealth
    ? systemHealth.api?.toUpperCase() === 'OK' && systemHealth.database?.toUpperCase() === 'OK'
    : false

  const StatCard = ({
    icon: Icon, label, value, sub, color, to
  }: { icon: React.ElementType; label: string; value: string | number | null; sub?: string; color: string; to: string }) => (
    <div
      className="bg-white rounded-xl border border-borderc shadow-card p-5 flex flex-col justify-between cursor-pointer group hover:border-primary hover:shadow-md transition duration-200"
      onClick={() => navigate(to)}
    >
      <div className="flex justify-between items-start mb-4">
        <div className={`p-2.5 rounded-xl ${color}`}>
          <Icon size={22} />
        </div>
        <ChevronRight size={18} className="text-borderc group-hover:text-primary transition transform group-hover:translate-x-1" />
      </div>
      <div>
        <p className="text-3xl font-black text-textprimary mb-1">
          {value === null
            ? <Loader2 size={24} className="animate-spin text-borderc my-1" />
            : value}
        </p>
        <p className="text-sm font-bold text-textsecondary">{label}</p>
        {sub && <p className="text-xs text-textsecondary mt-1 font-medium">{sub}</p>}
      </div>
    </div>
  )

  const parsed = weather ? parseMetar(weather.metar) : null

  return (
    <div className="space-y-6">

      {/* ── Welcome Header ── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2">
        <div>
          <h1 className="text-2xl font-bold text-textprimary tracking-tight">
            {user?.full_name ? `Welcome, ${user.full_name.split(' ')[0]}` : 'Overview'}
          </h1>
          <p className="text-textsecondary text-sm mt-0.5">Operational summary and system status</p>
        </div>

        <div className="flex items-center gap-2">
          {!healthChecked ? (
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold border bg-slate-50 text-slate-500 border-slate-200">
              <Loader2 size={12} className="animate-spin" /> Checking Systems
            </div>
          ) : systemHealth ? (
            <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold border ${isHealthy ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-red-50 text-red-700 border-red-200'}`}>
              <span className={`w-2 h-2 rounded-full ${isHealthy ? 'bg-emerald-500 animate-pulse' : 'bg-red-500'}`} />
              {isHealthy ? 'All Systems Operational' : 'System Degraded'}
            </div>
          ) : (
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold border bg-amber-50 text-amber-700 border-amber-200">
              <WifiOff size={12} /> Backend Offline
            </div>
          )}
        </div>
      </div>

      {/* ── Top Stats Grid ── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          icon={PlaneTakeoff}
          label="Active Fleet"
          value={activeCount}
          sub={fleetCount !== null && activeCount !== null ? `${fleetCount - activeCount} in maintenance` : undefined}
          color="bg-primary/10 text-primary"
          to="/fleet"
        />
        <StatCard
          icon={Navigation}
          label="Active Flights"
          value="0"
          sub="0 pending dispatch"
          color="bg-indigo-50 text-indigo-600"
          to="/dispatch-center"
        />
        <StatCard
          icon={AlertTriangle}
          label="NOTAMs"
          value="0"
          sub="No active alerts"
          color="bg-amber-50 text-amber-600"
          to="/airports"
        />
        <StatCard
          icon={ShieldCheck}
          label="Safety Index"
          value="100%"
          sub="Within limits"
          color="bg-emerald-50 text-emerald-600"
          to="/performance"
        />
      </div>

      {/* ── Bottom Row ── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

        {/* ── Weather Widget (spans 2 cols) ── */}
        <div className="lg:col-span-2">
          <Card className="h-full flex flex-col p-5">
            <div className="flex items-center justify-between mb-5 border-b border-borderc pb-3">
              <h2 className="text-sm font-bold text-textprimary flex items-center gap-2">
                <CloudLightning size={16} className="text-primary" />
                Base Weather (EGPD)
              </h2>
              <Link to="/weather" className="text-xs font-bold text-primary hover:underline flex items-center gap-1">
                View Full Wx <ChevronRight size={12} />
              </Link>
            </div>

            <div className="flex-1">
              {loading ? (
                <div className="flex items-center justify-center py-10">
                  <Loader2 size={24} className="text-primary animate-spin" />
                </div>
              ) : weather && !wxError ? (
                <div className="space-y-4">
                  {/* Raw METAR string */}
                  <p className="text-xs font-mono text-slate-600 bg-slate-50 p-3 rounded-xl border border-borderc break-all leading-relaxed">
                    {weather.metar}
                  </p>

                  {/* Parsed key values */}
                  {parsed && (
                    <div className="flex flex-wrap gap-2">
                      <MetarToken label="Wind"  value={parsed.windStr}  />
                      <MetarToken label="Vis"   value={parsed.visStr}   />
                      <MetarToken label="Cloud" value={parsed.cloudStr} />
                      <MetarToken label="Temp"  value={parsed.tempStr}  />
                      <MetarToken label="QNH"   value={parsed.qnhStr}   />
                    </div>
                  )}

                  {/* TAF if available */}
                  {weather.taf && (
                    <div>
                      <p className="text-[9px] font-bold text-textsecondary uppercase tracking-wider mb-1.5">TAF</p>
                      <p className="text-[10px] font-mono text-textsecondary bg-slate-50 p-3 rounded-xl border border-borderc break-all leading-relaxed line-clamp-4">
                        {weather.taf}
                      </p>
                    </div>
                  )}
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center py-10 gap-3">
                  <WifiOff size={28} className="text-slate-300" />
                  <p className="text-sm text-textsecondary font-medium">METAR for EGPD unavailable</p>
                  <button
                    onClick={() => {
                      setWxError(false)
                      setWeather(null)
                      setLoading(true)
                      weatherApi.get('EGPD')
                        .then(wx => { setWeather(wx); setLoading(false) })
                        .catch(() => { setWxError(true); setLoading(false) })
                    }}
                    className="flex items-center gap-1.5 text-xs font-bold text-primary hover:underline"
                  >
                    <RefreshCw size={12} /> Retry
                  </button>
                </div>
              )}
            </div>
          </Card>
        </div>

        {/* ── Activity Feed ── */}
        <div>
          <Card className="h-full flex flex-col p-5">
            <div className="flex items-center justify-between mb-5 border-b border-borderc pb-3">
              <h2 className="text-sm font-bold text-textprimary flex items-center gap-2">
                <Activity size={16} className="text-primary" />
                Recent Activity
              </h2>
              <span className="text-[9px] font-bold text-textsecondary uppercase tracking-wider px-2 py-0.5 bg-slate-100 rounded-full">
                Live
              </span>
            </div>

            {/* Empty state — no hardcoded dummy data */}
            <div className="flex-1 flex flex-col items-center justify-center py-6 text-center gap-3">
              <div className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center">
                <Clock size={18} className="text-slate-400" />
              </div>
              <p className="text-sm font-semibold text-textsecondary">No recent activity</p>
              <p className="text-xs text-slate-400 leading-relaxed max-w-[180px]">
                Flight operations and system events will appear here as they occur.
              </p>
            </div>

            <button
              onClick={() => navigate('/reports')}
              className="w-full mt-4 py-2 text-xs font-bold text-textsecondary hover:text-primary transition bg-slate-50 hover:bg-slate-100 rounded-lg"
            >
              View All Logs
            </button>
          </Card>
        </div>

      </div>
    </div>
  )
}
