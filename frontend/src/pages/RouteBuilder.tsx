import { useState, useEffect, useRef, useCallback } from 'react'
import {
  MapPin, Plus, Trash2, Navigation, Loader2, ArrowRight,
  Sparkles, BarChart3, Send, X, Search, GripVertical,
  AlertTriangle, CheckCircle2, RefreshCw, Plane
} from 'lucide-react'
import {
  aircraft as aircraftApi, airports as airportsApi,
  navpoints as navpointsApi, navlog as navlogApi,
  type ApiAircraft, type ApiAirport, type ApiNavpoint, type NavlogResult
} from '../lib/api'
import Combobox, { type ComboItem } from '../components/ui/Combobox'
import Card from '../components/ui/Card'
import { useNavigate } from 'react-router-dom'
import { MapContainer, TileLayer, Polyline, Marker, Tooltip, useMap } from 'react-leaflet'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'

// ─── Types ────────────────────────────────────────────────────────
type WaypointEntry = {
  kind: 'airport' | 'fix'
  id: string
  ident: string
  name: string
  lat: number
  lon: number
}

// ─── Leaflet Route Map ────────────────────────────────────────────

// Great-circle distance (nm) and initial bearing
function gcNm(lat1: number, lon1: number, lat2: number, lon2: number) {
  const toRad = (d: number) => d * Math.PI / 180
  const p1 = toRad(lat1), p2 = toRad(lat2)
  const dp = toRad(lat2 - lat1), dl = toRad(lon2 - lon1)
  const h = Math.sin(dp / 2) ** 2 + Math.cos(p1) * Math.cos(p2) * Math.sin(dl / 2) ** 2
  return 2 * 3440.065 * Math.asin(Math.sqrt(h))
}

function gcBearing(lat1: number, lon1: number, lat2: number, lon2: number) {
  const toRad = (d: number) => d * Math.PI / 180
  const p1 = toRad(lat1), p2 = toRad(lat2), dl = toRad(lon2 - lon1)
  const y = Math.sin(dl) * Math.cos(p2)
  const x = Math.cos(p1) * Math.sin(p2) - Math.sin(p1) * Math.cos(p2) * Math.cos(dl)
  return (Math.atan2(y, x) * 180 / Math.PI + 360) % 360
}

function buildAirportIcon(seq: number, isFirst: boolean, isLast: boolean) {
  const color = isFirst ? '#16a34a' : isLast ? '#dc2626' : '#2563eb'
  const bg    = isFirst ? '#f0fdf4' : isLast ? '#fef2f2' : '#eff6ff'
  return new L.DivIcon({
    className: '',
    html: `
      <div style="
        width:26px;height:26px;
        border:2.5px solid ${color};
        border-radius:50%;
        background:${bg};
        box-shadow:0 1px 4px rgba(0,0,0,0.25),0 0 0 2px rgba(255,255,255,0.8);
        display:flex;align-items:center;justify-content:center;
        font-size:10px;font-weight:900;color:${color};font-family:monospace;
      ">${seq}</div>`,
    iconSize: [26, 26],
    iconAnchor: [13, 13],
  })
}

function buildWaypointIcon(seq: number) {
  return new L.DivIcon({
    className: '',
    html: `
      <div style="
        width:18px;height:18px;
        background:#1e3a6e;
        transform:rotate(45deg);
        border:2px solid #fff;
        box-shadow:0 0 0 1.5px #1e3a6e,0 1px 4px rgba(0,0,0,0.3);
        display:flex;align-items:center;justify-content:center;
      ">
        <span style="transform:rotate(-45deg);font-size:7px;font-weight:900;color:#fff;font-family:monospace;">${seq}</span>
      </div>`,
    iconSize: [18, 18],
    iconAnchor: [9, 9],
  })
}

// Mid-point DivIcon for segment distance/bearing labels
function buildSegmentIcon(distNm: number, brg: number) {
  return new L.DivIcon({
    className: '',
    html: `
      <div style="
        background:rgba(15,23,42,0.82);
        border:1px solid rgba(255,255,255,0.18);
        border-radius:5px;
        padding:2px 6px;
        font-size:9px;
        font-weight:700;
        color:#e2e8f0;
        font-family:monospace;
        white-space:nowrap;
        box-shadow:0 1px 4px rgba(0,0,0,0.3);
        pointer-events:none;
      ">${Math.round(distNm)} NM · ${Math.round(brg).toString().padStart(3,'0')}°</div>`,
    iconSize: [90, 18],
    iconAnchor: [45, 9],
  })
}

const TILE_LAYERS = [
  {
    id: 'terrain',
    label: 'Terrain',
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Shaded_Relief/MapServer/tile/{z}/{y}/{x}',
    attribution: 'Esri World Shaded Relief',
    maxNativeZoom: 13,
  },
  {
    id: 'topo',
    label: 'Topo',
    url: 'https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png',
    attribution: '© OpenTopoMap',
    maxNativeZoom: 17,
  },
  {
    id: 'satellite',
    label: 'Satellite',
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    attribution: 'Esri World Imagery',
    maxNativeZoom: 19,
  },
  {
    id: 'osm',
    label: 'Street',
    url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
    attribution: '© OpenStreetMap contributors',
    maxNativeZoom: 19,
  },
]

function MapUpdater({ waypoints }: { waypoints: WaypointEntry[] }) {
  const map = useMap()
  useEffect(() => {
    if (waypoints.length >= 2) {
      const bounds = L.latLngBounds(waypoints.map(w => [w.lat, w.lon]))
      map.fitBounds(bounds, { padding: [50, 50], maxZoom: 11 })
    } else if (waypoints.length === 1) {
      map.setView([waypoints[0].lat, waypoints[0].lon], 9)
    }
  }, [waypoints, map])
  return null
}

function RouteMap({ waypoints, totalNm }: { waypoints: WaypointEntry[]; totalNm: number }) {
  const [layerIdx, setLayerIdx] = useState(0)
  const center: [number, number] = waypoints.length > 0
    ? [waypoints[0].lat, waypoints[0].lon]
    : [1.2, 36.8]

  const layer = TILE_LAYERS[layerIdx]

  // Build mid-point markers for each segment
  const segmentMarkers = waypoints.length >= 2
    ? waypoints.slice(0, -1).map((wp, i) => {
        const next = waypoints[i + 1]
        const distNm = gcNm(wp.lat, wp.lon, next.lat, next.lon)
        const brg    = gcBearing(wp.lat, wp.lon, next.lat, next.lon)
        const midLat = (wp.lat + next.lat) / 2
        const midLon = (wp.lon + next.lon) / 2
        return { lat: midLat, lon: midLon, distNm, brg, key: `${wp.id}-${next.id}` }
      })
    : []

  return (
    <div className="w-full rounded-xl overflow-hidden border border-borderc relative z-0" style={{ height: 440 }}>
      {/* Layer switcher overlay */}
      <div className="absolute top-3 right-3 z-[1000] flex gap-1 bg-white/90 backdrop-blur-sm rounded-lg border border-slate-200 shadow-md p-1">
        {TILE_LAYERS.map((tl, idx) => (
          <button
            key={tl.id}
            onClick={() => setLayerIdx(idx)}
            className={`px-2 py-1 text-[10px] font-bold rounded transition ${
              layerIdx === idx
                ? 'bg-primary text-white'
                : 'text-slate-500 hover:text-slate-800 hover:bg-slate-100'
            }`}
          >{tl.label}</button>
        ))}
      </div>

      {/* Route stats overlay */}
      {waypoints.length >= 2 && (
        <div className="absolute bottom-3 left-3 z-[1000] bg-slate-900/85 backdrop-blur-sm text-white rounded-lg border border-white/10 shadow-lg px-3 py-2 text-[10px] font-mono flex gap-4">
          <span>📍 {waypoints.length} fixes</span>
          <span>✈ {Math.round(totalNm)} NM total</span>
          <span className="text-slate-400">
            {waypoints[0]?.ident} → {waypoints[waypoints.length - 1]?.ident}
          </span>
        </div>
      )}

      <MapContainer
        center={center}
        zoom={5}
        style={{ height: '100%', width: '100%', background: '#d8d0aa' }}
        scrollWheelZoom={true}
        zoomControl={true}
      >
        <TileLayer
          key={layer.id}
          attribution={layer.attribution}
          url={layer.url}
          maxNativeZoom={layer.maxNativeZoom}
          maxZoom={19}
        />

        {/* Route line with dashed shadow for depth */}
        {waypoints.length >= 2 && (
          <>
            <Polyline
              positions={waypoints.map(w => [w.lat, w.lon])}
              color="rgba(0,0,0,0.25)"
              weight={6}
              opacity={0.6}
            />
            <Polyline
              positions={waypoints.map(w => [w.lat, w.lon])}
              color="#a855f7"
              weight={3}
              opacity={0.95}
              dashArray=""
            />
          </>
        )}

        {/* Segment distance/bearing labels */}
        {segmentMarkers.map(seg => (
          <Marker
            key={seg.key}
            position={[seg.lat, seg.lon]}
            icon={buildSegmentIcon(seg.distNm, seg.brg)}
            interactive={false}
            zIndexOffset={500}
          />
        ))}

        {/* Waypoint markers */}
        {waypoints.map((wp, i) => (
          <Marker
            key={`${wp.id}-${i}`}
            position={[wp.lat, wp.lon]}
            icon={wp.kind === 'airport'
              ? buildAirportIcon(i + 1, i === 0, i === waypoints.length - 1)
              : buildWaypointIcon(i + 1)
            }
            zIndexOffset={1000}
          >
            <Tooltip
              direction="top"
              offset={[0, -14]}
              opacity={1}
              className=""
            >
              <div style={{
                background: 'rgba(15,23,42,0.92)',
                border: '1px solid rgba(255,255,255,0.15)',
                borderRadius: 8,
                padding: '4px 8px',
                color: '#f1f5f9',
                fontFamily: 'monospace',
                fontSize: 11,
                fontWeight: 700,
                whiteSpace: 'nowrap',
                boxShadow: '0 2px 8px rgba(0,0,0,0.4)',
              }}>
                <div style={{ color: '#94a3b8', fontSize: 9, fontWeight: 600, marginBottom: 2 }}>
                  {wp.kind === 'airport' ? '🛬 Airport' : '⬥ Fix'} #{i + 1}
                </div>
                <div style={{ color: '#e2e8f0', fontSize: 12 }}>{wp.ident}</div>
                {wp.name !== wp.ident && (
                  <div style={{ color: '#94a3b8', fontSize: 9, marginTop: 2 }}>{wp.name}</div>
                )}
                <div style={{ color: '#64748b', fontSize: 9, marginTop: 2 }}>
                  {wp.lat.toFixed(4)}°, {wp.lon.toFixed(4)}°
                </div>
              </div>
            </Tooltip>
          </Marker>
        ))}

        <MapUpdater waypoints={waypoints} />
      </MapContainer>
    </div>
  )
}

// ─── Main Component ───────────────────────────────────────────────
export default function RouteBuilder() {
  const navigate = useNavigate()

  // Data
  const [acList, setAcList]   = useState<ApiAircraft[]>([])
  const [apList, setApList]   = useState<ApiAirport[]>([])
  const [loadingData, setLoadingData] = useState(true)

  // Route state
  const [acId, setAcId]         = useState('')
  const [depId, setDepId]       = useState('')
  const [destId, setDestId]     = useState('')
  const [waypoints, setWaypoints] = useState<WaypointEntry[]>([])

  // Navlog
  const [navlog, setNavlog]     = useState<NavlogResult | null>(null)
  const [navlogLoading, setNavlogLoading] = useState(false)
  const [navlogError, setNavlogError]     = useState<string | null>(null)

  // Navpoint search
  const [searchQuery, setSearchQuery]   = useState('')
  const [searchResults, setSearchResults] = useState<ApiNavpoint[]>([])
  const [searching, setSearching]         = useState(false)
  const searchRef                         = useRef<HTMLDivElement>(null)
  const searchTimeout                     = useRef<ReturnType<typeof setTimeout>>()

  // Suggest loading
  const [suggesting, setSuggesting] = useState(false)

  // Load aircraft + airports
  useEffect(() => {
    Promise.all([aircraftApi.list(), airportsApi.list()])
      .then(([ac, ap]) => {
        setAcList(ac.filter(a => a.is_active))
        setApList(ap.filter(a => a.is_active))
      })
      .catch(console.error)
      .finally(() => setLoadingData(false))
  }, [])

  // Combobox items
  const acItems: ComboItem[] = acList.map(a => ({
    id: a.id, label: `${a.registration} — ${a.type}`,
  }))
  const apItems: ComboItem[] = apList.map(a => ({
    id: a.id, label: a.name, sub: `${a.icao}`,
  }))

  // When dep/dest changes, rebuild waypoints array
  useEffect(() => {
    const depAp  = apList.find(a => a.id === depId)
    const destAp = apList.find(a => a.id === destId)

    setWaypoints(prev => {
      const fixes = prev.filter(w => w.kind === 'fix')
      const newWps: WaypointEntry[] = []
      if (depAp)  newWps.push({ kind: 'airport', id: depAp.id,  ident: depAp.icao,  name: depAp.name,  lat: Number(depAp.lat ?? 0),  lon: Number(depAp.lon ?? 0) })
      newWps.push(...fixes)
      if (destAp) newWps.push({ kind: 'airport', id: destAp.id, ident: destAp.icao, name: destAp.name, lat: Number(destAp.lat ?? 0), lon: Number(destAp.lon ?? 0) })
      return newWps
    })
    setNavlog(null)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [depId, destId, apList])

  // Search navpoints
  useEffect(() => {
    if (!searchQuery.trim()) { setSearchResults([]); return }
    clearTimeout(searchTimeout.current)
    searchTimeout.current = setTimeout(async () => {
      setSearching(true)
      try {
        const results = await navpointsApi.search(searchQuery)
        setSearchResults(Array.isArray(results) ? results : [])
      } catch { setSearchResults([]) }
      finally  { setSearching(false) }
    }, 300)
    return () => clearTimeout(searchTimeout.current)
  }, [searchQuery])

  // Close search on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) {
        setSearchResults([])
        setSearchQuery('')
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  function addFix(np: ApiNavpoint) {
    const fix: WaypointEntry = {
      kind: 'fix', id: np.id,
      ident: np.ident, name: np.name ?? np.ident,
      lat: Number(np.lat), lon: Number(np.lon),
    }
    setWaypoints(prev => {
      // Insert before final airport if exists
      const last = prev[prev.length - 1]
      if (last?.kind === 'airport') {
        return [...prev.slice(0, -1), fix, last]
      }
      return [...prev, fix]
    })
    setSearchQuery('')
    setSearchResults([])
    setNavlog(null)
  }

  function removeWaypoint(index: number) {
    setWaypoints(prev => prev.filter((_, i) => i !== index))
    setNavlog(null)
  }

  function clearAll() {
    setWaypoints([])
    setNavlog(null)
    setDepId('')
    setDestId('')
  }

  // Auto-suggest intermediate fixes
  async function handleSuggest() {
    if (!depId || !destId) return
    setSuggesting(true)
    try {
      const fixes = await navpointsApi.legSuggestions(depId, destId, 10)
      const fixEntries: WaypointEntry[] = (Array.isArray(fixes) ? fixes : []).map((np: ApiNavpoint) => ({
        kind: 'fix', id: np.id, ident: np.ident, name: np.name ?? np.ident,
        lat: Number(np.lat), lon: Number(np.lon),
      }))
      setWaypoints(prev => {
        const dep  = prev.find(w => w.kind === 'airport' && w.id === depId)
        const dest = prev.find(w => w.kind === 'airport' && w.id === destId)
        return [...(dep ? [dep] : []), ...fixEntries, ...(dest ? [dest] : [])]
      })
      setNavlog(null)
    } catch (err: any) {
      console.error('Suggest failed', err)
    } finally {
      setSuggesting(false)
    }
  }

  // Calculate navlog
  async function handleCalcNavlog() {
    if (!acId || waypoints.length < 2) return
    setNavlogLoading(true)
    setNavlogError(null)
    try {
      const data = await navlogApi.generate({
        aircraft_id: acId,
        waypoints: waypoints.map(w => ({ kind: w.kind, id: w.id })),
      })
      setNavlog(data)
    } catch (err: any) {
      setNavlogError(err.message || 'Navlog calculation failed')
    } finally {
      setNavlogLoading(false)
    }
  }

  // Send to OFP Generator
  function handleSendToOfp() {
    sessionStorage.setItem('ofp_route', JSON.stringify({
      depId, destId, acId,
      waypoints: waypoints.map(w => ({ kind: w.kind, id: w.id })),
    }))
    navigate('/ofp-generator')
  }

  const canSuggest   = !!(depId && destId)
  const canNavlog    = !!(acId && waypoints.length >= 2)
  const canSendToOfp = !!(depId && destId && acId)

  // Compute total route distance (NM) from waypoints
  const totalNm = waypoints.length >= 2
    ? waypoints.slice(0, -1).reduce((sum, wp, i) => {
        const next = waypoints[i + 1]
        const toRad = (d: number) => d * Math.PI / 180
        const p1 = toRad(wp.lat), p2 = toRad(next.lat)
        const dp = toRad(next.lat - wp.lat), dl = toRad(next.lon - wp.lon)
        const h = Math.sin(dp/2)**2 + Math.cos(p1)*Math.cos(p2)*Math.sin(dl/2)**2
        return sum + 2 * 3440.065 * Math.asin(Math.sqrt(h))
      }, 0)
    : 0

  // ── Render ─────────────────────────────────────────────────────
  return (
    <div className="space-y-5 max-w-7xl mx-auto">
      {/* Header */}
      <div>
        <div className="flex items-center gap-2 mb-1">
          <span className="text-2xl"></span>
          <h1 className="text-2xl font-bold text-textprimary">Route Builder</h1>
        </div>
        <p className="text-textsecondary text-sm">
          Build waypoint sequences, calculate navlog and send your route to the OFP Generator.
        </p>
      </div>

      {/* Top strip: Aircraft + Dep/Dest + Actions */}
      <Card className="!p-4">
        <div className="flex flex-wrap gap-3 items-end">
          <div className="w-44 shrink-0">
            <label className="block text-[10px] font-bold text-textsecondary uppercase tracking-wider mb-1.5">Aircraft</label>
            {loadingData
              ? <div className="h-9 bg-slate-100 rounded-lg animate-pulse" />
              : <Combobox items={acItems} value={acId} onChange={setAcId} placeholder="Select…" />
            }
          </div>
          <div className="w-52 shrink-0">
            <label className="block text-[10px] font-bold text-textsecondary uppercase tracking-wider mb-1.5">Departure</label>
            {loadingData
              ? <div className="h-9 bg-slate-100 rounded-lg animate-pulse" />
              : <Combobox items={apItems} value={depId} onChange={setDepId} placeholder="Dep airport" />
            }
          </div>
          <div className="flex items-center self-end pb-1.5">
            <ArrowRight size={16} className="text-slate-300" />
          </div>
          <div className="w-52 shrink-0">
            <label className="block text-[10px] font-bold text-textsecondary uppercase tracking-wider mb-1.5">Destination</label>
            {loadingData
              ? <div className="h-9 bg-slate-100 rounded-lg animate-pulse" />
              : <Combobox items={apItems} value={destId} onChange={setDestId} placeholder="Dest airport" />
            }
          </div>

          <div className="flex gap-2 flex-wrap ml-auto self-end">
            <button
              onClick={handleSuggest}
              disabled={!canSuggest || suggesting}
              className="flex items-center gap-1.5 px-3.5 py-2 text-xs font-bold rounded-lg border border-primary/40 text-primary hover:bg-primary/5 disabled:opacity-40 disabled:cursor-not-allowed transition"
            >
              {suggesting ? <Loader2 size={13} className="animate-spin" /> : <Sparkles size={13} />}
              Auto-Suggest
            </button>
            <button
              onClick={clearAll}
              className="flex items-center gap-1.5 px-3.5 py-2 text-xs font-bold rounded-lg border border-borderc text-textsecondary hover:border-red-300 hover:text-red-500 transition"
            >
              <RefreshCw size={13} /> Clear
            </button>
          </div>
        </div>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-5">
        {/* Left: Waypoint editor */}
        <div className="lg:col-span-2 space-y-4">
          <Card>
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-bold text-textprimary text-sm flex items-center gap-2">
                <MapPin size={14} className="text-primary" />
                Waypoints
                <span className="ml-1 text-[10px] bg-slate-100 text-textsecondary px-1.5 py-0.5 rounded-full font-bold">
                  {waypoints.length}
                </span>
              </h2>
            </div>

            {/* Waypoint list */}
            <div className="space-y-1.5 min-h-[60px]">
              {waypoints.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-8 text-center">
                  <Navigation size={20} className="text-slate-300 mb-2" />
                  <p className="text-xs text-textsecondary">No waypoints yet.</p>
                  <p className="text-xs text-slate-400">Select departure & destination above.</p>
                </div>
              ) : (
                waypoints.map((wp, idx) => (
                  <div
                    key={`${wp.id}-${idx}`}
                    className={`flex items-center gap-2.5 rounded-lg px-3 py-2.5 group transition ${
                      wp.kind === 'airport'
                        ? 'bg-primary/5 border border-primary/15'
                        : 'bg-slate-50 border border-slate-100'
                    }`}
                  >
                    <GripVertical size={13} className="text-slate-300 shrink-0" />
                    <div className={`w-6 h-6 rounded-md flex items-center justify-center text-white text-[9px] font-black shrink-0 ${wp.kind === 'airport' ? 'bg-primary' : 'bg-cyan-500'}`}>
                      {idx + 1}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-black text-textprimary font-mono leading-tight">{wp.ident}</p>
                      <p className="text-[10px] text-textsecondary truncate leading-tight">{wp.name}</p>
                    </div>
                    <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full uppercase ${wp.kind === 'airport' ? 'bg-primary/10 text-primary' : 'bg-cyan-50 text-cyan-600'}`}>
                      {wp.kind === 'airport' ? 'APT' : 'FIX'}
                    </span>
                    {/* Only allow removing intermediate fixes, not dep/dest airports */}
                    {(wp.kind === 'fix' || (wp.kind === 'airport' && idx !== 0 && idx !== waypoints.length - 1)) && (
                      <button
                        onClick={() => removeWaypoint(idx)}
                        className="opacity-0 group-hover:opacity-100 text-slate-400 hover:text-red-500 transition"
                      >
                        <X size={13} />
                      </button>
                    )}
                  </div>
                ))
              )}
            </div>

            {/* Fix search */}
            <div ref={searchRef} className="relative mt-3">
              <div className="flex items-center gap-2 border border-dashed border-borderc rounded-lg px-3 py-2.5 focus-within:border-primary transition">
                <Search size={13} className="text-slate-400 shrink-0" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  placeholder="Search & add a fix / navpoint…"
                  className="flex-1 text-xs outline-none bg-transparent text-textprimary placeholder:text-slate-400"
                />
                {searching && <Loader2 size={12} className="text-primary animate-spin shrink-0" />}
              </div>

              {searchResults.length > 0 && (
                <div className="absolute z-50 top-full mt-1 left-0 right-0 bg-white border border-borderc rounded-xl shadow-lg overflow-hidden max-h-48 overflow-y-auto">
                  {searchResults.map(np => (
                    <button
                      key={np.id}
                      onClick={() => addFix(np)}
                      className="w-full text-left px-3 py-2.5 hover:bg-slate-50 transition flex items-center gap-3 border-b border-slate-50 last:border-0"
                    >
                      <div className="w-6 h-6 rounded bg-cyan-100 flex items-center justify-center shrink-0">
                        <MapPin size={11} className="text-cyan-600" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-black text-textprimary font-mono">{np.ident}</p>
                        <p className="text-[10px] text-textsecondary truncate">{np.name ?? np.type}</p>
                      </div>
                      <span className="text-[9px] text-slate-400 font-mono shrink-0">{np.country}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </Card>

          {/* Action buttons */}
          <Card className="!p-4 space-y-2.5">
            <button
              onClick={handleCalcNavlog}
              disabled={!canNavlog || navlogLoading}
              className="w-full flex items-center justify-center gap-2 py-2.5 bg-slate-900 hover:bg-slate-800 disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-bold rounded-xl transition"
            >
              {navlogLoading
                ? <><Loader2 size={15} className="animate-spin" /> Computing…</>
                : <><BarChart3 size={15} /> Calculate Navlog</>
              }
            </button>
            {!acId && (
              <p className="text-[10px] text-textsecondary text-center">Select an aircraft to calculate navlog</p>
            )}
            <button
              onClick={handleSendToOfp}
              disabled={!canSendToOfp}
              className="w-full flex items-center justify-center gap-2 py-2.5 bg-primary hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-bold rounded-xl transition"
            >
              <Send size={15} /> Send to OFP Generator
            </button>
          </Card>
        </div>

        {/* Right: Map + Navlog */}
        <div className="lg:col-span-3 space-y-4">
          {/* SVG Route Map */}
          <Card className="!p-3">
            <div className="flex items-center justify-between mb-2">
              <h2 className="font-bold text-textprimary text-sm flex items-center gap-2">
                <Navigation size={14} className="text-primary" /> Route Map
              </h2>
              {waypoints.length >= 2 && (
                <span className="text-[10px] text-textsecondary bg-slate-50 px-2 py-0.5 rounded-full border border-borderc">
                  {waypoints[0].ident} → {waypoints[waypoints.length - 1].ident}
                </span>
              )}
            </div>
            <RouteMap waypoints={waypoints} totalNm={totalNm} />
          </Card>

          {/* Navlog table */}
          {navlogError && (
            <div className="flex items-center gap-2 bg-red-50 border border-red-200 text-red-600 rounded-xl px-4 py-3 text-sm">
              <AlertTriangle size={15} className="shrink-0" /> {navlogError}
            </div>
          )}

          {navlog && (
            <Card>
              <div className="flex items-center justify-between mb-3">
                <h2 className="font-bold text-textprimary text-sm flex items-center gap-2">
                  <BarChart3 size={14} className="text-primary" /> Navlog
                </h2>
                <div className="flex gap-3 text-[10px] font-mono font-bold text-textsecondary">
                  <span>📏 {navlog.totals.dist_nm} NM</span>
                  <span>⏱ {navlog.totals.ete_hhmm}</span>
                  <span>⛽ {navlog.totals.fuel_lb.toLocaleString()} lb</span>
                </div>
              </div>

              <div className="overflow-x-auto rounded-xl border border-slate-100">
                <table className="w-full text-[11px]">
                  <thead>
                    <tr className="bg-slate-50 text-textsecondary uppercase tracking-wider font-bold text-[10px] border-b border-slate-100">
                      <th className="px-3 py-2.5 text-left">#</th>
                      <th className="px-3 py-2.5 text-left">From</th>
                      <th className="px-3 py-2.5 text-left">To</th>
                      <th className="px-3 py-2.5 text-right">TRK°</th>
                      <th className="px-3 py-2.5 text-right">Dist NM</th>
                      <th className="px-3 py-2.5 text-right">ETE</th>
                      <th className="px-3 py-2.5 text-right">Fuel lb</th>
                      <th className="px-3 py-2.5 text-right">Fuel kg</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {navlog.legs.map((leg, i) => (
                      <tr key={i} className="hover:bg-slate-50/50 transition">
                        <td className="px-3 py-2 text-textsecondary">{i + 1}</td>
                        <td className="px-3 py-2 font-mono font-black text-textprimary">{leg.from_ident}</td>
                        <td className="px-3 py-2 font-mono font-black text-textprimary">{leg.to_ident}</td>
                        <td className="px-3 py-2 text-right font-mono text-slate-600">{leg.track_deg}°</td>
                        <td className="px-3 py-2 text-right font-mono text-slate-600">{leg.dist_nm}</td>
                        <td className="px-3 py-2 text-right font-mono text-slate-600">{leg.ete_hhmm}</td>
                        <td className="px-3 py-2 text-right font-mono font-semibold text-textprimary">{leg.fuel_lb.toLocaleString()}</td>
                        <td className="px-3 py-2 text-right font-mono text-textsecondary">{leg.fuel_kg.toLocaleString()}</td>
                      </tr>
                    ))}
                    {/* Totals */}
                    <tr className="bg-slate-900 text-white font-bold">
                      <td className="px-3 py-2.5 text-xs" colSpan={4}>TOTALS — {navlog.aircraft.registration}</td>
                      <td className="px-3 py-2.5 text-right font-mono text-xs">{navlog.totals.dist_nm}</td>
                      <td className="px-3 py-2.5 text-right font-mono text-xs">{navlog.totals.ete_hhmm}</td>
                      <td className="px-3 py-2.5 text-right font-mono text-xs text-green-400">{navlog.totals.fuel_lb.toLocaleString()}</td>
                      <td className="px-3 py-2.5 text-right font-mono text-xs text-slate-300">{navlog.totals.fuel_kg.toLocaleString()}</td>
                    </tr>
                  </tbody>
                </table>
              </div>

              <div className="mt-3 flex items-center gap-1.5 text-[10px] text-textsecondary">
                <CheckCircle2 size={11} className="text-green-500" />
                {navlog.note}
              </div>
            </Card>
          )}
        </div>
      </div>
    </div>
  )
}
