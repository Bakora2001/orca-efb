import { useState, useEffect, useRef } from 'react'
import {
  MapPin, Clock, Fuel, BarChart3, AlertTriangle,
  Calendar, Send, Download, Trash2, Sliders,
  CloudSun, Plus, CheckCircle2, ChevronRight,
  Sparkles, ArrowLeftRight, Save, FolderOpen,
  Navigation, Wind, Plane, Loader2, X, Search
} from 'lucide-react'
import { aircraft as aircraftApi, airports as airportsApi, navpoints as navpointsApi, navlog as navlogApi, type ApiAircraft, type ApiAirport, type ApiNavpoint, type NavlogResult } from '../lib/api'
import Combobox from '../components/ui/Combobox'

function StatBox({ label, value, sub, loading }: { label: string; value: string; sub?: string; loading?: boolean }) {
  return (
    <div className="bg-white rounded-xl border border-borderc shadow-card p-4">
      <p className="text-[10px] font-bold text-textsecondary uppercase tracking-wider mb-1">{label}</p>
      {loading ? (
        <div className="h-6 w-16 bg-slate-100 rounded animate-pulse my-1" />
      ) : (
        <p className="text-xl font-black text-textprimary font-mono leading-tight">{value}</p>
      )}
      {sub && <p className="text-[10px] text-textsecondary mt-0.5 font-medium">{sub}</p>}
    </div>
  )
}

type WaypointEntry = {
  kind: 'airport' | 'fix'
  id: string
  ident: string
  name: string
  lat: number
  lon: number
}

export default function FlightPlanning() {
  const [aircraftList, setAircraftList] = useState<ApiAircraft[]>([])
  const [airportsList, setAirportsList] = useState<ApiAirport[]>([])
  
  const [selectedAircraft, setSelectedAircraft] = useState<string>('')
  const [departure, setDeparture] = useState<string>('')
  const [destination, setDestination] = useState<string>('')
  const [alternate, setAlternate] = useState<string>('')
  
  const [waypoints, setWaypoints] = useState<WaypointEntry[]>([])
  
  const [navlog, setNavlog] = useState<NavlogResult | null>(null)
  const [loadingSetup, setLoadingSetup] = useState(true)
  const [loadingNavlog, setLoadingNavlog] = useState(false)
  const [loadingRoute, setLoadingRoute] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Waypoint search state
  const [isSearching, setIsSearching] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<ApiNavpoint[]>([])
  const searchTimeoutRef = useRef<number | null>(null)

  useEffect(() => {
    async function loadData() {
      try {
        const [ac, ap] = await Promise.all([
          aircraftApi.list(),
          airportsApi.list()
        ])
        const activeAc = ac.filter(a => a.is_active)
        const activeAp = ap.filter(a => a.is_active)
        
        setAircraftList(activeAc)
        setAirportsList(activeAp)
        
        // Fields left empty on load instead of auto-selecting index 0
      } catch (err) {
        console.error("Failed to load setup data", err)
        setError("Failed to load setup data")
      } finally {
        setLoadingSetup(false)
      }
    }
    loadData()
  }, [])

  // Auto-build waypoints from Dep/Dest initially or when they change
  useEffect(() => {
    if (departure && destination && airportsList.length > 0) {
      const depAp = airportsList.find(a => a.id === departure)
      const destAp = airportsList.find(a => a.id === destination)
      
      const newWps: WaypointEntry[] = []
      if (depAp) newWps.push({ kind: 'airport', id: depAp.id, ident: depAp.icao, name: depAp.name, lat: Number(depAp.lat ?? 0), lon: Number(depAp.lon ?? 0) })
      
      // Preserve intermediate fixes if possible, otherwise clear
      const existingFixes = waypoints.filter(w => w.kind === 'fix')
      newWps.push(...existingFixes)
      
      if (destAp) newWps.push({ kind: 'airport', id: destAp.id, ident: destAp.icao, name: destAp.name, lat: Number(destAp.lat ?? 0), lon: Number(destAp.lon ?? 0) })
      
      setWaypoints(newWps)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [departure, destination])

  // Re-run navlog whenever waypoints or aircraft changes
  useEffect(() => {
    if (waypoints.length < 2 || !selectedAircraft) return
    
    const runNavlog = async () => {
      setLoadingNavlog(true)
      setError(null)
      try {
        const data = await navlogApi.generate({
          aircraft_id: selectedAircraft,
          waypoints: waypoints.map(w => ({ kind: w.kind, id: w.id }))
        })
        setNavlog(data)
      } catch (err: any) {
        setError(err.message || "Failed to generate Navlog")
        setNavlog(null)
      } finally {
        setLoadingNavlog(false)
      }
    }
    
    const timeout = setTimeout(runNavlog, 500)
    return () => clearTimeout(timeout)
  }, [waypoints, selectedAircraft])

  const handleOptimizeRoute = async () => {
    if (!departure || !destination) return
    setLoadingRoute(true)
    setError(null)
    try {
      const legs = await navpointsApi.legSuggestions(departure, destination, 8)
      const depAp = airportsList.find(a => a.id === departure)
      const destAp = airportsList.find(a => a.id === destination)
      
      const newWps: WaypointEntry[] = []
      if (depAp) newWps.push({ kind: 'airport', id: depAp.id, ident: depAp.icao, name: depAp.name, lat: Number(depAp.lat ?? 0), lon: Number(depAp.lon ?? 0) })
      
      legs.forEach(l => {
        newWps.push({ kind: 'fix', id: l.id, ident: l.ident, name: l.name || 'Waypoint', lat: l.lat, lon: l.lon })
      })
      
      if (destAp) newWps.push({ kind: 'airport', id: destAp.id, ident: destAp.icao, name: destAp.name, lat: Number(destAp.lat ?? 0), lon: Number(destAp.lon ?? 0) })
      
      setWaypoints(newWps)
    } catch (err: any) {
      setError(err.message || "Failed to optimize route")
    } finally {
      setLoadingRoute(false)
    }
  }

  const handleSearchWaypoint = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value
    setSearchQuery(val)
    if (searchTimeoutRef.current) window.clearTimeout(searchTimeoutRef.current)
    
    if (val.length < 2) {
      setSearchResults([])
      return
    }
    
    searchTimeoutRef.current = window.setTimeout(async () => {
      try {
        const res = await navpointsApi.search(val)
        setSearchResults(res.slice(0, 5))
      } catch (err) {
        console.error(err)
      }
    }, 300)
  }

  const addWaypoint = (wp: ApiNavpoint) => {
    setWaypoints(prev => {
      const copy = [...prev]
      copy.splice(copy.length - 1, 0, { kind: 'fix', id: wp.id, ident: wp.ident, name: wp.name || wp.type, lat: wp.lat, lon: wp.lon })
      return copy
    })
    setIsSearching(false)
    setSearchQuery('')
    setSearchResults([])
  }

  const removeWaypoint = (idx: number) => {
    setWaypoints(prev => prev.filter((_, i) => i !== idx))
  }

  const swapAirports = () => {
    const temp = departure
    setDeparture(destination)
    setDestination(temp)
  }

  const handleQuickAction = (label: string) => {
    if (label === 'Clear Plan') {
      if (window.confirm('Are you sure you want to clear the current flight plan?')) {
        setDeparture('')
        setDestination('')
        setAlternate('')
        setWaypoints([])
        setNavlog(null)
      }
    } else {
      window.alert(`${label} feature is coming soon!`)
    }
  }

  const acRef = aircraftList.find(a => a.id === selectedAircraft)
  const depRef = airportsList.find(a => a.id === departure)
  const destRef = airportsList.find(a => a.id === destination)
  const altRef = airportsList.find(a => a.id === alternate)

  const mtow = acRef?.mtow_kg
  const mlw = acRef?.mlw_kg
  
  // Fake weather for now to match UI (as weather is done in dispatch)
  const wxLegs = navlog?.legs.map(l => ({
    seg: `${l.from_ident} → ${l.to_ident}`,
    wind: '220°/12 kt',
    temp: '-20°C',
    vis: 'CAVOK',
    cond: '⛅'
  })) || []

  return (
    <div className="space-y-4 lg:space-y-6">
      {/* ─── PAGE HEADER ─── */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-textprimary">Flight Planning</h1>
          <p className="text-sm text-textsecondary mt-0.5">Plan, analyze and optimize your flight route</p>
        </div>
        <div className="flex items-center gap-2">
          {loadingSetup ? (
            <div className="flex items-center justify-center p-2"><Loader2 className="animate-spin text-primary" size={20} /></div>
          ) : (
            <div className="w-[180px]">
              <Combobox
                items={aircraftList.map(a => ({ id: a.id, label: a.registration, sub: a.type }))}
                value={selectedAircraft}
                onChange={setSelectedAircraft}
                placeholder="Select Aircraft"
              />
            </div>
          )}
          <button 
            onClick={handleOptimizeRoute}
            disabled={loadingRoute || !selectedAircraft}
            className="flex items-center gap-1.5 bg-primary hover:bg-primary-dark text-white text-xs font-bold px-4 py-2 rounded-lg shadow-sm hover:shadow transition disabled:opacity-50"
          >
            {loadingRoute ? <Loader2 size={13} className="animate-spin" /> : <Sparkles size={13} />}
            Optimize Route
          </button>
        </div>
      </div>

      {error && (
        <div className="bg-red-50 text-red-600 p-3 rounded-xl text-xs font-bold flex items-center gap-2 border border-red-200">
          <AlertTriangle size={15} />
          {error}
        </div>
      )}

      {/* ─── ROUTE SELECTOR ROW ─── */}
      <div className="bg-white rounded-xl border border-borderc shadow-card p-4">
        <div className="flex flex-wrap items-center gap-3">
          {/* Departure */}
          <div className="flex-1 min-w-[150px]">
            <p className="text-[9px] font-bold text-textsecondary uppercase tracking-wider mb-1">Departure</p>
            <div className="flex items-center gap-1.5 w-full">
              <MapPin size={14} className="text-primary shrink-0" />
              <div className="flex-1">
                <Combobox
                  items={airportsList.map(a => ({ id: a.id, label: a.icao, sub: a.name }))}
                  value={departure}
                  onChange={setDeparture}
                  placeholder="Select Departure"
                />
              </div>
            </div>
          </div>

          <button onClick={swapAirports} className="p-2 border border-borderc rounded-lg hover:border-primary hover:bg-blue-50 transition text-textsecondary hover:text-primary" title="Swap airports">
            <ArrowLeftRight size={14} />
          </button>

          {/* Destination */}
          <div className="flex-1 min-w-[150px]">
            <p className="text-[9px] font-bold text-textsecondary uppercase tracking-wider mb-1">Destination</p>
            <div className="flex items-center gap-1.5 w-full">
              <MapPin size={14} className="text-danger shrink-0" />
              <div className="flex-1">
                <Combobox
                  items={airportsList.map(a => ({ id: a.id, label: a.icao, sub: a.name }))}
                  value={destination}
                  onChange={setDestination}
                  placeholder="Select Destination"
                />
              </div>
            </div>
          </div>

          <div className="w-px h-8 bg-borderc self-center hidden sm:block" />

          {/* Alternate */}
          <div className="flex-1 min-w-[130px]">
            <p className="text-[9px] font-bold text-textsecondary uppercase tracking-wider mb-1">Alternate</p>
            <div className="flex items-center gap-1.5 w-full">
              <Navigation size={14} className="text-warning shrink-0" />
              <div className="flex-1">
                <Combobox
                  items={airportsList.map(a => ({ id: a.id, label: a.icao, sub: a.name }))}
                  value={alternate}
                  onChange={setAlternate}
                  placeholder="Select Alternate"
                  emptyOption="None"
                />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ─── KEY STATS ROW ─── */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 lg:gap-4">
        <StatBox label="Total Distance" value={navlog ? `${navlog.totals.dist_nm} NM` : '—'} loading={loadingNavlog} />
        <StatBox label="Est. Flight Time" value={navlog ? navlog.totals.ete_hhmm : '—'} loading={loadingNavlog} />
        <StatBox label="Cruise TAS" value={acRef ? `${acRef.cruise_tas_kt} kt` : '—'} loading={loadingSetup} />
        <StatBox label="Trip Fuel Required" value={navlog ? `${navlog.totals.fuel_kg.toLocaleString()} kg` : '—'} loading={loadingNavlog} />
        <StatBox label="Avg Wind" value="220°/12 kt" sub="Estimated" />
        <StatBox label="Cost Index" value="50" sub="Optimized for fuel" />
      </div>

      {/* ─── MAIN CONTENT: Waypoints + Details ─── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 lg:gap-6">

        {/* LEFT: Waypoints Timeline */}
        <div className="lg:col-span-1 bg-white rounded-xl border border-borderc shadow-card p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-bold text-textprimary">Route & Waypoints</h2>
            <span className="text-xs text-textsecondary font-mono">{depRef?.icao || ''} → {destRef?.icao || ''}</span>
          </div>

          {/* Timeline */}
          <div className="relative ml-2 pl-5 border-l-2 border-borderc space-y-5">
            {waypoints.map((wp, idx) => {
              const isEnd = idx === waypoints.length - 1
              const isStart = idx === 0
              return (
                <div key={idx} className="relative group">
                  <span className={`absolute -left-[25px] top-1 w-3 h-3 rounded-full border-2 ${isStart || isEnd ? 'bg-primary border-primary shadow-sm' : 'bg-white border-slate-300'}`} />
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="flex items-center gap-1.5">
                        <span className={`text-sm font-black tracking-widest font-mono ${isStart || isEnd ? 'text-primary' : 'text-textprimary'}`}>{wp.ident}</span>
                        {isStart && <span className="text-[8px] bg-slate-100 text-textsecondary px-1.5 py-0.5 rounded font-bold uppercase">DEP</span>}
                        {isEnd && <span className="text-[8px] bg-slate-100 text-textsecondary px-1.5 py-0.5 rounded font-bold uppercase">DEST</span>}
                      </div>
                      <p className="text-[10px] text-textsecondary mt-0.5 truncate max-w-[150px]">{wp.name}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] font-mono font-bold text-textsecondary">
                        {typeof wp.lat === 'number' ? wp.lat.toFixed(2) : '—'}, {typeof wp.lon === 'number' ? wp.lon.toFixed(2) : '—'}
                      </span>
                      {!isStart && !isEnd && (
                        <button onClick={() => removeWaypoint(idx)} className="text-slate-300 hover:text-danger transition opacity-0 group-hover:opacity-100">
                          <X size={14} />
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>

          <div className="mt-5 pt-4 border-t border-borderc">
            {!isSearching ? (
              <button onClick={() => setIsSearching(true)} className="w-full flex items-center justify-center gap-1.5 py-2 border border-dashed border-borderc hover:border-primary text-xs font-bold text-textsecondary hover:text-primary rounded-lg transition">
                <Plus size={13} />Add Waypoint
              </button>
            ) : (
              <div className="space-y-2">
                <div className="relative">
                  <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    autoFocus
                    type="text"
                    placeholder="Search fix or VOR..."
                    value={searchQuery}
                    onChange={handleSearchWaypoint}
                    className="w-full pl-9 pr-9 py-2 bg-slate-50 border border-primary/40 focus:border-primary rounded-lg text-xs outline-none"
                  />
                  <button onClick={() => setIsSearching(false)} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                    <X size={14} />
                  </button>
                </div>
                {searchResults.length > 0 && (
                  <div className="bg-white border border-borderc rounded-lg shadow-sm overflow-hidden divide-y divide-slate-100">
                    {searchResults.map(res => (
                      <button
                        key={res.id}
                        onClick={() => addWaypoint(res)}
                        className="w-full text-left px-3 py-2 hover:bg-slate-50 flex items-center justify-between text-xs transition"
                      >
                        <div>
                          <span className="font-bold text-textprimary font-mono">{res.ident}</span>
                          <span className="ml-2 text-textsecondary text-[10px]">{res.name || res.type}</span>
                        </div>
                        <Plus size={12} className="text-primary" />
                      </button>
                    ))}
                  </div>
                )}
                {searchQuery.length >= 2 && searchResults.length === 0 && (
                  <div className="text-[10px] text-textsecondary p-2 text-center">No navpoints found</div>
                )}
              </div>
            )}
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
                Fuel Estimate
              </h2>
              <div className="space-y-2.5 text-xs">
                <div className="flex items-center justify-between py-1.5 border-b border-slate-50">
                  <span className="text-textsecondary font-medium">Trip Fuel</span>
                  {loadingNavlog ? <div className="h-4 w-12 bg-slate-100 rounded animate-pulse" /> : <span className="font-bold text-textprimary font-mono">{navlog?.totals.fuel_kg.toLocaleString() || 0} kg</span>}
                </div>
                <div className="flex items-center justify-between py-1.5 border-b border-slate-50">
                  <span className="text-textsecondary font-medium">Alternate + Contingency</span>
                  {loadingNavlog ? <div className="h-4 w-12 bg-slate-100 rounded animate-pulse" /> : <span className="font-bold text-textprimary font-mono">TBD</span>}
                </div>
              </div>
              <div className="mt-3 pt-3 border-t border-borderc flex justify-between items-baseline">
                <span className="text-xs font-bold text-textprimary">Total Required (Trip)</span>
                {loadingNavlog ? <div className="h-6 w-20 bg-slate-100 rounded animate-pulse" /> : <span className="text-lg font-black text-primary font-mono">{navlog?.totals.fuel_kg.toLocaleString() || 0} kg</span>}
              </div>
            </div>

            {/* Performance Check */}
            <div className="bg-white rounded-xl border border-borderc shadow-card p-5">
              <h2 className="text-sm font-bold text-textprimary mb-4 flex items-center gap-2">
                <BarChart3 size={15} className="text-primary" />
                Structural Limits
              </h2>
              <div className="space-y-2 text-xs">
                <div className="flex items-center justify-between p-2.5 bg-slate-50 rounded-lg border border-slate-100">
                  <span className="text-textsecondary font-medium">MTOW</span>
                  <div className="flex items-center gap-1.5">
                    <span className="font-bold text-textprimary font-mono">{mtow ? mtow.toLocaleString() + ' kg' : '—'}</span>
                  </div>
                </div>
                <div className="flex items-center justify-between p-2.5 bg-slate-50 rounded-lg border border-slate-100">
                  <span className="text-textsecondary font-medium">MLW</span>
                  <div className="flex items-center gap-1.5">
                    <span className="font-bold text-textprimary font-mono">{mlw ? mlw.toLocaleString() + ' kg' : '—'}</span>
                  </div>
                </div>
              </div>
              <div className="mt-3 p-2.5 bg-emerald-50 border border-emerald-100 rounded-lg flex items-center gap-2 text-[11px] text-emerald-700 font-semibold">
                <CheckCircle2 size={14} className="text-emerald-500 shrink-0" />
                Limits sourced from fleet DB
              </div>
            </div>
          </div>

          {/* Lower: Weather along route */}
          <div className="bg-white rounded-xl border border-borderc shadow-card p-5">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-bold text-textprimary flex items-center gap-2">
                <CloudSun size={15} className="text-primary" />
                Weather & Wind (Simulated)
              </h2>
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
                  {loadingNavlog ? (
                    <tr><td colSpan={5} className="py-8 text-center text-slate-400"><Loader2 size={16} className="animate-spin inline" /></td></tr>
                  ) : wxLegs.map((row, i) => (
                    <tr key={i} className={`border-b border-slate-50 last:border-0 hover:bg-slate-50/50 transition text-xs`}>
                      <td className="py-2.5 font-bold text-textprimary">{row.seg}</td>
                      <td className="py-2.5 text-center font-mono text-slate-600">{row.wind}</td>
                      <td className="py-2.5 text-center font-mono font-bold text-textprimary">{row.temp}</td>
                      <td className="py-2.5 text-center font-mono text-textsecondary">{row.vis}</td>
                      <td className="py-2.5 text-center">{row.cond}</td>
                    </tr>
                  ))}
                  {!loadingNavlog && wxLegs.length === 0 && (
                    <tr><td colSpan={5} className="py-4 text-center text-textsecondary text-xs">No route segments yet.</td></tr>
                  )}
                </tbody>
              </table>
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
                  <th className="pb-2 text-right">Track</th>
                  <th className="pb-2 text-right">Dist</th>
                  <th className="pb-2 text-right">Fuel (kg)</th>
                  <th className="pb-2 text-right">ETE</th>
                </tr>
              </thead>
              <tbody>
                {loadingNavlog ? (
                  <tr><td colSpan={5} className="py-8 text-center text-slate-400"><Loader2 size={16} className="animate-spin inline" /></td></tr>
                ) : navlog?.legs.map((row, i) => (
                  <tr key={i} className="border-b border-slate-50 last:border-0 hover:bg-slate-50/50 transition">
                    <td className="py-2.5 font-bold text-textprimary">{row.from_ident} - {row.to_ident}</td>
                    <td className="py-2.5 text-right font-mono text-textsecondary">{row.track_deg.toString().padStart(3, '0')}°</td>
                    <td className="py-2.5 text-right font-mono font-bold text-textprimary">{row.dist_nm}</td>
                    <td className="py-2.5 text-right font-mono text-textsecondary">{row.fuel_kg}</td>
                    <td className="py-2.5 text-right font-mono text-textsecondary">{row.ete_hhmm}</td>
                  </tr>
                ))}
                {!loadingNavlog && navlog && (
                  <tr className="bg-slate-50 border-t-2 border-borderc font-bold">
                    <td className="py-2.5 text-textprimary font-black">Total</td>
                    <td />
                    <td className="py-2.5 text-right font-mono text-primary font-black">{navlog.totals.dist_nm}</td>
                    <td className="py-2.5 text-right font-mono text-textsecondary font-black">{navlog.totals.fuel_kg}</td>
                    <td className="py-2.5 text-right font-mono text-textsecondary font-black">{navlog.totals.ete_hhmm}</td>
                  </tr>
                )}
                {!loadingNavlog && !navlog && (
                   <tr><td colSpan={5} className="py-4 text-center text-textsecondary text-xs">Route not generated.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Alternates */}
        <div className="lg:col-span-1 bg-white rounded-xl border border-borderc shadow-card p-5">
          <h2 className="text-sm font-bold text-textprimary mb-4 flex items-center gap-2">
            <Plane size={15} className="text-primary" />
            Alternate
          </h2>
          <div className="space-y-4">
            {altRef ? (
              <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200/60 hover:border-slate-300 transition space-y-2">
                <div className="flex items-start justify-between">
                  <div>
                    <span className="text-sm font-black text-primary font-mono">{altRef.icao}</span>
                    <p className="text-[10px] text-textsecondary mt-0.5">{altRef.name}</p>
                  </div>
                  <span className="text-[8px] font-black px-2 py-0.5 rounded-full bg-purple-100 text-purple-700">SELECTED</span>
                </div>
              </div>
            ) : (
              <p className="text-xs text-textsecondary text-center py-4">No alternate selected.</p>
            )}
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
            ].map(({ icon: Icon, label }) => (
              <button 
                key={label} 
                onClick={() => handleQuickAction(label)}
                className="flex flex-col items-center justify-center gap-1.5 py-3 border border-borderc rounded-xl bg-white text-xs font-semibold text-textsecondary hover:text-primary hover:border-primary/40 hover:bg-blue-50/30 transition duration-150 shadow-sm"
              >
                <Icon size={16} className="text-primary" />
                <span className="text-[10px] leading-tight text-center">{label}</span>
              </button>
            ))}
          </div>
        </div>
      </div>

    </div>
  )
}
