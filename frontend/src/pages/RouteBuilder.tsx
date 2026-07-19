import { useState, useEffect, useRef, useCallback, useMemo, Fragment } from 'react'
import {
  MapPin, Plus, Trash2, Navigation, Loader2, ArrowRight,
  Sparkles, BarChart3, Send, X, Search, GripVertical,
  AlertTriangle, CheckCircle2, RefreshCw, Plane
} from 'lucide-react'
import {
  aircraft as aircraftApi, airports as airportsApi,
  navpoints as navpointsApi, navlog as navlogApi,
  airways as airwaysApi,
  type ApiAircraft, type ApiAirport, type ApiNavpoint, type NavlogResult,
  type ApiAirwaySegment
} from '../lib/api'
import Combobox, { type ComboItem } from '../components/ui/Combobox'
import Card from '../components/ui/Card'
import { useNavigate } from 'react-router-dom'
import { MapContainer, TileLayer, Polyline, Marker, CircleMarker, Tooltip, useMap, useMapEvents, LayerGroup } from 'react-leaflet'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'

// ─── SkyVector-style Canvas NavChart Layer ────────────────────────
// Renders airway connection lines + navpoint triangles + ident labels
// entirely on an HTML5 canvas — zero DOM elements, zero lag.

type ChartNode = {
  id: string
  ident: string
  lat: number
  lon: number
  point_type: string
  raw: any
}

// buildNavEdges() was removed — it connected each point to its ~3 nearest
// neighbors within 200nm, which has no relationship to real airway
// structure. Two waypoints being close together doesn't mean an airway
// links them; that's what produced the chaotic long-distance "spiderweb"
// lines. Airway lines are now drawn directly from real segments fetched
// from the backend `airways` table (see fetchSegmentsForView below).

// ─── NavChartLayer ────────────────────────────────────────────────────────────
// Receives ALL navpoints + airports (not viewport-filtered).
// Computes the airway web ONCE on data load using stable refs.
// The draw() function handles viewport culling at render time.
// This eliminates the stale-index spaghetti race condition entirely.

function NavChartLayer({ allNavpoints, allAirports, zoom, onClick }: {
  allNavpoints: import('../lib/api').ApiNavpoint[]
  allAirports:  import('../lib/api').ApiAirport[]
  zoom: number
  onClick: (entity: import('../lib/api').ApiNavpoint | import('../lib/api').ApiAirport) => void
}) {
  const map      = useMap()
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const animRef   = useRef<number>(0)

  // Stable refs — never changes shape after first build, so no index drift
  const nodesRef    = useRef<ChartNode[]>([])
  const builtRef     = useRef(false)

  // Real airway segments for the current viewport — fetched from the backend,
  // not computed. Each segment already carries its own from/to coordinates,
  // so no shared node-index array is needed to draw them.
  const segmentsRef  = useRef<ApiAirwaySegment[]>([])
  const lastFetchRef = useRef<{ bounds: L.LatLngBounds; zoom: number } | null>(null)
  const fetchTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  // ICAO -> coordinates lookup, used to snap an airway segment's endpoint to
  // the airport's own precise location whenever from_ident/to_ident matches
  // a real airport. The airways table and the airports table are separate
  // datasets that can disagree by a few hundredths of a degree (different
  // source surveys, rounding, etc.) — without this, a line that's genuinely
  // meant to terminate at an airport draws a hair short of or past its dot
  // instead of visibly converging on it. Waypoint-to-waypoint segments
  // (no ident match) are untouched and still draw from their own coordinates.
  const airportByIdentRef = useRef<Map<string, { lat: number; lon: number }>>(new Map())

  // Build nodes ONCE when all data arrives — used for dot/triangle symbols
  // and click hit-testing. (Airway lines no longer come from this — see
  // fetchSegmentsForView below.)
  useEffect(() => {
    if (allNavpoints.length === 0 && allAirports.length === 0) return
    // Avoid rebuild if data hasn't meaningfully changed
    const nextCount = allNavpoints.length + allAirports.length
    if (builtRef.current && nodesRef.current.length === nextCount) return

    const worker = setTimeout(() => {
      const nodes: ChartNode[] = []
      const airportByIdent = new Map<string, { lat: number; lon: number }>()
      for (const a of allAirports) {
        if (a.lat != null && a.lon != null) {
          nodes.push({ id: a.id, ident: a.icao, lat: +a.lat, lon: +a.lon, point_type: 'AIRPORT', raw: a })
          if (a.icao) airportByIdent.set(a.icao.toUpperCase().trim(), { lat: +a.lat, lon: +a.lon })
        }
      }
      for (const n of allNavpoints) {
        if (n.lat != null && n.lon != null)
          nodes.push({ id: n.id, ident: n.ident, lat: +n.lat, lon: +n.lon, point_type: n.point_type || 'WAYPOINT', raw: n })
      }
      nodesRef.current = nodes
      airportByIdentRef.current = airportByIdent
      builtRef.current = true
      // Trigger a redraw now that nodes are ready
      cancelAnimationFrame(animRef.current)
      animRef.current = requestAnimationFrame(() => drawFrame())
    }, 100)
    return () => clearTimeout(worker)
  }, [allNavpoints.length, allAirports.length]) // length-only dep — avoids re-run on every pan

  // Create canvas once
  useEffect(() => {
    const pane = map.getPanes().overlayPane
    const canvas = document.createElement('canvas')
    Object.assign(canvas.style, { position:'absolute', top:'0', left:'0', pointerEvents:'none', zIndex:'350' })
    pane.appendChild(canvas)
    canvasRef.current = canvas
    return () => { canvas.parentNode?.removeChild(canvas) }
  }, [map])

  // Draw frame — reads from stable refs, handles its own viewport culling
  const drawFrame = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const W = map.getContainer().clientWidth
    const H = map.getContainer().clientHeight
    canvas.width = W; canvas.height = H
    const ctx = canvas.getContext('2d')!
    ctx.clearRect(0, 0, W, H)

    const nodes = nodesRef.current
    const segments = segmentsRef.current
    if (nodes.length === 0 && segments.length === 0) return

    const topLeft = map.containerPointToLayerPoint([0, 0])
    
    // CRITICAL FIX: The canvas is inside Leaflet's overlayPane, which shifts during pan.
    // If we don't re-position the canvas DOM element to match the top-left layer point,
    // the canvas drifts off-screen or scales incorrectly when resizing to full screen.
    L.DomUtil.setPosition(canvas, topLeft)

    ctx.save()
    ctx.translate(-topLeft.x, -topLeft.y)

    // Project ALL nodes (stable array — indices always correct)
    const pts = nodes.map(n => map.latLngToLayerPoint([n.lat, n.lon]))

    // Viewport bounds for culling (with generous padding to avoid pop-in)
    const pad = 120
    const vMinX = topLeft.x - pad, vMaxX = topLeft.x + W + pad
    const vMinY = topLeft.y - pad, vMaxY = topLeft.y + H + pad
    const inView = (p: { x: number; y: number }) => p.x >= vMinX && p.x <= vMaxX && p.y >= vMinY && p.y <= vMaxY

    // Draw airway lines — from real segment coordinates fetched from the
    // backend (see fetchSegmentsForView), not a computed proximity graph.
    // Only drawn when at least one endpoint is in viewport.
    const lineColor = zoom <= 8 ? 'rgba(0,0,0,0.22)' : 'rgba(0,0,0,0.45)'
    const showRouteLabels = zoom >= 7
    const labels: { x: number; y: number; text: string }[] = []
    ctx.beginPath()
    ctx.strokeStyle = lineColor
    ctx.lineWidth = zoom <= 8 ? 0.5 : 0.9
    ctx.setLineDash([])
    for (const seg of segments) {
      if (seg.from_lat == null || seg.from_lon == null || seg.to_lat == null || seg.to_lon == null) continue

      // Snap to the airport's own coordinates when this endpoint's ident
      // is a real airport — reconciles small survey/rounding drift between
      // the airways table and the airports table so the line visibly
      // terminates on the airport's dot instead of stopping just short of
      // (or past) it. Endpoints that aren't airports (en-route VOR/NDB/fix)
      // are left exactly as the airways table has them.
      const fromAirport = airportByIdentRef.current.get((seg.from_ident || '').toUpperCase().trim())
      const toAirport   = airportByIdentRef.current.get((seg.to_ident   || '').toUpperCase().trim())
      const fLat = fromAirport ? fromAirport.lat : +seg.from_lat
      const fLon = fromAirport ? fromAirport.lon : +seg.from_lon
      const tLat = toAirport   ? toAirport.lat   : +seg.to_lat
      const tLon = toAirport   ? toAirport.lon   : +seg.to_lon

      const a = map.latLngToLayerPoint([fLat, fLon])
      const b = map.latLngToLayerPoint([tLat, tLon])
      if (!inView(a) && !inView(b)) continue
      ctx.moveTo(a.x, a.y)
      ctx.lineTo(b.x, b.y)
      if (showRouteLabels) labels.push({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, text: seg.route_name })
    }
    ctx.stroke()

    if (showRouteLabels) {
      ctx.font = 'bold 9px monospace'
      ctx.fillStyle = 'rgba(20,60,140,0.85)'
      for (const { x, y, text } of labels) ctx.fillText(text, x + 3, y - 3)
    }

    // Draw navpoint symbols (skip airports — React-Leaflet CircleMarkers handle those).
    // Two decluttering passes, matching real chart behavior:
    //  1. Below a floor zoom, fixes don't render at all — a world/regional
    //     view only ever shows airports and airway structure, same as the
    //     reference screenshots.
    //  2. Above that floor, a screen-space grid caps it to one symbol per
    //     cell. This is what actually fixes the solid-triangle-mass
    //     problem: at Z5 the viewport can span an entire country, so even
    //     "only draw what's on screen" still means thousands of points.
    //     A pixel grid naturally reveals more of them as you zoom in,
    //     because the same cell covers less real-world ground.
    const MIN_FIX_ZOOM = 6
    const showLabels = zoom >= 8
    const triSize    = zoom >= 9 ? 5 : zoom >= 8 ? 4 : 3

    if (zoom >= MIN_FIX_ZOOM) {
      const cellPx = zoom >= 9 ? 16 : zoom >= 7 ? 22 : 30
      const claimedCells = new Set<string>()

      // VOR/NDB are more significant navaids than plain waypoints — let
      // them win a contested grid cell by drawing them first.
      const order = [...nodes.keys()].sort((a, b) => {
        const rank = (t: string) => t === 'VOR' ? 0 : t === 'NDB' ? 1 : 2
        return rank(nodes[a].point_type) - rank(nodes[b].point_type)
      })

      for (const i of order) {
        const node = nodes[i]
        if (node.point_type === 'AIRPORT') continue
        const pt = pts[i]
        if (!inView(pt)) continue

        const cellKey = `${Math.floor(pt.x / cellPx)},${Math.floor(pt.y / cellPx)}`
        if (claimedCells.has(cellKey)) continue
        claimedCells.add(cellKey)

        if (node.point_type === 'VOR') {
          ctx.beginPath(); ctx.arc(pt.x, pt.y, triSize + 1, 0, Math.PI * 2)
          ctx.fillStyle = 'rgba(30,90,200,0.85)'; ctx.fill()
          ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.2; ctx.stroke()
        } else if (node.point_type === 'NDB') {
          ctx.beginPath(); ctx.arc(pt.x, pt.y, triSize - 1, 0, Math.PI * 2)
          ctx.fillStyle = 'rgba(180,60,60,0.85)'; ctx.fill()
        } else {
          // WAYPOINT: hollow triangle
          const s = triSize
          ctx.beginPath()
          ctx.moveTo(pt.x,            pt.y - s)
          ctx.lineTo(pt.x + s * 0.87, pt.y + s * 0.5)
          ctx.lineTo(pt.x - s * 0.87, pt.y + s * 0.5)
          ctx.closePath()
          ctx.strokeStyle = 'rgba(30,90,200,0.9)'; ctx.lineWidth = 1.5; ctx.stroke()
        }

        if (showLabels) {
          ctx.font = `bold ${zoom >= 9 ? 10 : 9}px monospace`
          ctx.fillStyle = 'rgba(20,40,120,0.9)'
          ctx.fillText(node.ident, pt.x + triSize + 2, pt.y - 2)
        }
      }
    }

    ctx.restore()
  }, [map, zoom])

  // Fetch real airway segments for the current viewport. Debounced and
  // cache-aware: skips the request entirely if the last fetch already
  // covers the current view at the same zoom, so panning a few pixels
  // doesn't refire the API on every frame.
  const fetchSegmentsForView = useCallback(() => {
    const bounds = map.getBounds()
    const z = map.getZoom()

    const last = lastFetchRef.current
    if (last && last.zoom === z && last.bounds.contains(bounds)) return // already covered

    // Fetch a bit beyond the current viewport so small pans don't
    // immediately trigger another request.
    const padded = bounds.pad(0.5)

    clearTimeout(fetchTimerRef.current)
    fetchTimerRef.current = setTimeout(async () => {
      try {
        // Fewer segments needed when zoomed way out (screen covers less
        // detail anyway); more allowed once zoomed in on a region.
        const limit = z <= 4 ? 600 : z <= 7 ? 1500 : 2000
        const segs = await airwaysApi.getByBbox({
          south: padded.getSouth(),
          north: padded.getNorth(),
          west:  padded.getWest(),
          east:  padded.getEast(),
        }, limit)
        segmentsRef.current = segs
        lastFetchRef.current = { bounds: padded, zoom: z }
        cancelAnimationFrame(animRef.current)
        animRef.current = requestAnimationFrame(() => drawFrame())
      } catch {
        // Network hiccup — keep showing the last-known segments rather
        // than clearing the map.
      }
    }, 250)
  }, [map, drawFrame])

  // Re-attach map listeners whenever drawFrame/fetchSegmentsForView change.
  // Cheap redraw (pan translation, uses cached refs) fires on every move
  // tick; the network fetch only fires once a pan/zoom settles.
  useEffect(() => {
    const schedDraw = () => { cancelAnimationFrame(animRef.current); animRef.current = requestAnimationFrame(drawFrame) }
    const schedFetch = () => { schedDraw(); fetchSegmentsForView() }
    map.on('move zoom viewreset resize', schedDraw)
    map.on('zoomend moveend resize', schedFetch)
    schedFetch() // initial load for the starting viewport
    return () => {
      map.off('move zoom viewreset resize', schedDraw)
      map.off('zoomend moveend resize', schedFetch)
      cancelAnimationFrame(animRef.current)
      clearTimeout(fetchTimerRef.current)
    }
  }, [map, drawFrame, fetchSegmentsForView])

  // Click handler — hit-tests against all nodes in ref
  useEffect(() => {
    const onMapClick = (e: L.LeafletMouseEvent) => {
      const { lat, lng } = e.latlng
      let best: ChartNode | null = null, bestD = Infinity
      for (const node of nodesRef.current) {
        if (node.point_type === 'AIRPORT') continue
        const dx = node.lat - lat, dy = node.lon - lng
        const d = Math.sqrt(dx*dx + dy*dy)
        if (d < 0.15 && d < bestD) { bestD = d; best = node }
      }
      if (best) onClick(best.raw)
    }
    map.on('click', onMapClick)
    return () => { map.off('click', onMapClick) }
  }, [map, onClick])

  return null
}



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

// SkyVector-style compass overlay for zoomed-in airports
function buildCompassIcon() {
  return new L.DivIcon({
    className: '',
    html: `
      <svg width="80" height="80" viewBox="0 0 100 100" style="opacity: 0.45; pointer-events: none;">
        <circle cx="50" cy="50" r="48" fill="none" stroke="#1e3a8a" stroke-width="1.5" stroke-dasharray="2,2"/>
        <circle cx="50" cy="50" r="42" fill="none" stroke="#1e3a8a" stroke-width="0.5"/>
        <path d="M 50 2 L 50 8 M 50 98 L 50 92 M 2 50 L 8 50 M 98 50 L 92 50" stroke="#1e3a8a" stroke-width="2"/>
        <path d="M 16 16 L 20 20 M 84 84 L 80 80 M 16 84 L 20 80 M 84 16 L 80 20" stroke="#1e3a8a" stroke-width="1.5"/>
        <text x="50" y="14" font-size="8" fill="#1e3a8a" font-family="monospace" font-weight="bold" text-anchor="middle">N</text>
        <text x="50" y="93" font-size="8" fill="#1e3a8a" font-family="monospace" font-weight="bold" text-anchor="middle">S</text>
        <text x="91" y="53" font-size="8" fill="#1e3a8a" font-family="monospace" font-weight="bold" text-anchor="middle">E</text>
        <text x="9" y="53" font-size="8" fill="#1e3a8a" font-family="monospace" font-weight="bold" text-anchor="middle">W</text>
      </svg>
    `,
    iconSize: [80, 80],
    iconAnchor: [40, 40],
  })
}

// navpointIcon retained for route waypoint fix markers
const navpointIcon = new L.DivIcon({
  className: '',
  html: `<div style="width:10px;height:10px;background:transparent;border:2px solid #1e3a8a;transform:rotate(45deg);"></div>`,
  iconSize: [10, 10],
  iconAnchor: [5, 5]
})

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

// Custom hook to track zoom level and center map on init
function MapEventsHandler({ waypoints, setZoom, setBounds, isFullscreen }: { waypoints: WaypointEntry[], setZoom: (z: number) => void, setBounds: (b: L.LatLngBounds) => void, isFullscreen: boolean }) {
  const map = useMapEvents({
    zoomend: () => {
      setZoom(map.getZoom())
      setBounds(map.getBounds())
    },
    moveend: () => {
      setBounds(map.getBounds())
    }
  })
  
  useEffect(() => {
    setZoom(map.getZoom())
    setBounds(map.getBounds())
    if (waypoints.length >= 2) {
      const bounds = L.latLngBounds(waypoints.map(w => [Number(w.lat), Number(w.lon)]))
      map.fitBounds(bounds, { padding: [50, 50], maxZoom: 11 })
    } else if (waypoints.length === 1) {
      map.setView([Number(waypoints[0].lat), Number(waypoints[0].lon)], 9)
    }
  }, [waypoints, map, setZoom])

  // Fix map rendering issues when container resizes due to fullscreen toggle
  useEffect(() => {
    // Trigger multiple times to handle CSS transitions completing
    const delays = [10, 50, 100, 200, 400]
    const timers = delays.map(delay => setTimeout(() => {
      map.invalidateSize()
    }, delay))
    
    return () => timers.forEach(clearTimeout)
  }, [isFullscreen, map])

  return null
}

interface RouteMapProps {
  waypoints: WaypointEntry[]
  totalNm: number
  allAirports: ApiAirport[]
  allNavpoints: ApiNavpoint[]
  setDepId: (id: string) => void
  setDestId: (id: string) => void
  depId: string
  destId: string
  addFix: (fix: { id: string; ident: string; name: string; lat: number; lon: number; kind: 'fix' | 'airport' }) => void
  isFullscreen: boolean
}

function RouteMap({ waypoints, totalNm, allAirports, allNavpoints, setDepId, setDestId, depId, destId, addFix, isFullscreen }: RouteMapProps) {
  const [layerIdx, setLayerIdx] = useState(2) // Default to Satellite
  const [zoom, setZoom] = useState(5)
  const [bounds, setBounds] = useState<L.LatLngBounds | null>(null)
  const [hoverRouteHint, setHoverRouteHint] = useState(false)

  const center: [number, number] = waypoints.length > 0
    ? [Number(waypoints[0].lat), Number(waypoints[0].lon)]
    : [1.2, 36.8]

  const layer = TILE_LAYERS[layerIdx]

  // Filter entities to viewport to prevent React from lagging with thousands of elements
  const visibleAirports = useMemo(() => {
    if (!bounds) return []
    const padded = bounds.pad(0.1) // buffer to prevent popping
    return allAirports.filter(ap => ap.lat != null && ap.lon != null && padded.contains([Number(ap.lat), Number(ap.lon)]))
  }, [allAirports, bounds])

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

  // Interactive routing click handler
  const handleMapEntityClick = (entity: ApiAirport | ApiNavpoint, kind: 'airport' | 'fix') => {
    if (kind === 'airport') {
      if (!depId) {
        setDepId(entity.id)
      } else if (!destId && entity.id !== depId) {
        setDestId(entity.id)
      } else {
        // If both are set, add as an intermediate waypoint
        const ap = entity as ApiAirport
        addFix({ id: ap.id, ident: (ap as any).icao ?? ap.id, name: ap.name, lat: Number(ap.lat), lon: Number(ap.lon), kind: 'airport' })
      }
    } else {
      const np = entity as ApiNavpoint
      addFix({ id: np.id, ident: np.ident, name: np.name ?? np.ident, lat: Number(np.lat), lon: Number(np.lon), kind: 'fix' })
    }
  }

  return (
    <div className={`w-full rounded-xl overflow-hidden border border-borderc relative z-0 bg-[#d8d0aa] ${isFullscreen ? 'flex-1 min-h-0' : 'h-[440px]'}`}>
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

      {/* Interactive routing hint overlay */}
      {!depId && (
        <div className="absolute top-3 left-1/2 -translate-x-1/2 z-[1000] bg-blue-600/90 backdrop-blur-sm text-white rounded-full px-4 py-1.5 text-[11px] font-bold shadow-lg animate-pulse">
          Click an airport to set Departure
        </div>
      )}
      {depId && !destId && (
        <div className="absolute top-3 left-1/2 -translate-x-1/2 z-[1000] bg-green-600/90 backdrop-blur-sm text-white rounded-full px-4 py-1.5 text-[11px] font-bold shadow-lg animate-pulse">
          Click an airport to set Destination
        </div>
      )}

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
        zoom={zoom}
        style={{ height: '100%', width: '100%', background: 'transparent' }}
        scrollWheelZoom={true}
        zoomControl={true}
        preferCanvas={true}
      >
        <TileLayer
          key={layer.id}
          attribution={layer.attribution}
          url={layer.url}
          maxNativeZoom={layer.maxNativeZoom}
          maxZoom={19}
        />

        <MapEventsHandler waypoints={waypoints} setZoom={setZoom} setBounds={setBounds} isFullscreen={isFullscreen} />

        {/* Global Airports layer (visible at all zooms) */}
        <LayerGroup>
          {visibleAirports.flatMap(ap => {
            if (ap.lat == null || ap.lon == null) return null
            const isDep = ap.id === depId
            const isDest = ap.id === destId
            const isRouteNode = waypoints.some(w => w.id === ap.id)
            
            // Draw the compass if zoomed in closely
            const showCompass = zoom >= 9 && !isRouteNode

            const elements = []
            if (showCompass) {
              elements.push(
                <Marker key={`comp-${ap.id}`} position={[Number(ap.lat), Number(ap.lon)]} icon={buildCompassIcon()} interactive={false} zIndexOffset={100} />
              )
            }
            if (!isRouteNode) {
              elements.push(
                <CircleMarker
                  key={`dot-${ap.id}`}
                  center={[Number(ap.lat), Number(ap.lon)]}
                  radius={zoom >= 8 ? 5 : 3}
                  pathOptions={{
                    fillColor: isDep ? '#16a34a' : isDest ? '#dc2626' : '#3b82f6',
                    fillOpacity: 0.9,
                    color: '#ffffff',
                    weight: 1.5
                  }}
                  eventHandlers={{ click: () => handleMapEntityClick(ap, 'airport') }}
                >
                  <Tooltip direction="top" offset={[0, -5]} className="font-mono text-xs font-bold text-slate-800 bg-white/90 border-slate-200">
                    {ap.icao} - {ap.name}
                  </Tooltip>
                </CircleMarker>
              )
            }
            return elements
          })}
        </LayerGroup>

        {/* SkyVector-style canvas-based navpoint + airway chart. Always
            mounted — airway lines should be visible at any zoom (like the
            World Hi chart reference), even though fix triangles are
            internally suppressed below MIN_FIX_ZOOM inside drawFrame. */}
        <NavChartLayer
          allNavpoints={allNavpoints}
          allAirports={allAirports}
          zoom={zoom}
          onClick={(entity: any) => {
            if (entity.icao) handleMapEntityClick(entity, 'airport')
            else handleMapEntityClick(entity, 'fix')
          }}
        />

        {/* Route line with dashed shadow for depth */}
        {waypoints.length >= 2 && (
          <>
            <Polyline
              positions={waypoints.map(w => [Number(w.lat), Number(w.lon)])}
              color="rgba(0,0,0,0.25)"
              weight={6}
              opacity={0.6}
            />
            <Polyline
              positions={waypoints.map(w => [Number(w.lat), Number(w.lon)])}
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

        {/* Active Route Waypoint markers (rendered on top of global dots) */}
        {waypoints.map((wp, i) => (
          <Marker
            key={`route-${wp.id}-${i}`}
            position={[wp.lat, wp.lon]}
            icon={wp.kind === 'airport'
              ? buildAirportIcon(i + 1, i === 0, i === waypoints.length - 1)
              : buildWaypointIcon(i + 1)
            }
            zIndexOffset={1000}
          >
            <Tooltip direction="top" offset={[0, -14]} opacity={1}>
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
  const [allNavpoints, setAllNavpoints] = useState<ApiNavpoint[]>([])
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
  const [suggesting, setSuggesting] = useState(false)
  const [suggestAttempt, setSuggestAttempt] = useState(1)

  // Navpoint+Airport search
  type UnifiedSearchResult = { id: string; ident: string; name: string; lat: number; lon: number; kind: 'fix' | 'airport'; subLabel?: string }
  const [searchQuery, setSearchQuery]   = useState('')
  const [searchResults, setSearchResults] = useState<UnifiedSearchResult[]>([])
  const [searching, setSearching]         = useState(false)
  const searchRef                         = useRef<HTMLDivElement>(null)
  const searchTimeout                     = useRef<ReturnType<typeof setTimeout>>()

  // Load aircraft + airports + navpoints
  useEffect(() => {
    Promise.all([aircraftApi.list(), airportsApi.list(), navpointsApi.list()])
      .then(([ac, ap, np]) => {
        setAcList(ac.filter(a => a.is_active))
        setApList(ap.filter(a => a.is_active))
        setAllNavpoints(Array.isArray(np) ? np : [])
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

  // Search navpoints AND airports in parallel
  useEffect(() => {
    if (!searchQuery.trim()) { setSearchResults([]); return }
    clearTimeout(searchTimeout.current)
    searchTimeout.current = setTimeout(async () => {
      setSearching(true)
      try {
        const [navResults, apResults] = await Promise.allSettled([
          navpointsApi.search(searchQuery),
          airportsApi.search(searchQuery),
        ])
        const fixes: UnifiedSearchResult[] = (navResults.status === 'fulfilled' && Array.isArray(navResults.value)
          ? navResults.value
          : []
        ).map(np => ({
          id: np.id, ident: np.ident, name: np.name ?? np.ident,
          lat: Number(np.lat), lon: Number(np.lon),
          kind: 'fix' as const, subLabel: np.point_type,
        }))
        const airports: UnifiedSearchResult[] = (apResults.status === 'fulfilled' && Array.isArray(apResults.value)
          ? apResults.value
          : []
        ).map(ap => ({
          id: ap.id, ident: ap.icao, name: ap.name,
          lat: Number(ap.lat), lon: Number(ap.lon),
          kind: 'airport' as const, subLabel: ap.country ?? undefined,
        }))
        const isIcaoLike = /^[A-Z]{2,4}$/i.test(searchQuery.trim())
        setSearchResults(isIcaoLike ? [...airports, ...fixes] : [...fixes, ...airports])
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

  function addFix(result: UnifiedSearchResult) {
    const entry: WaypointEntry = {
      kind: result.kind,
      id: result.id,
      ident: result.ident,
      name: result.name,
      lat: result.lat,
      lon: result.lon,
    }
    setWaypoints(prev => {
      const last = prev[prev.length - 1]
      if (last?.kind === 'airport') {
        return [...prev.slice(0, -1), entry, last]
      }
      return [...prev, entry]
    })
    setSearchQuery('')
    setSearchResults([])
    setNavlog(null)
  }

  function removeWaypoint(index: number) {
    setWaypoints(prev => prev.filter((_, i) => i !== index))
    setNavlog(null)
  }

  function handleClearRoute() {
    setWaypoints([])
    setNavlog(null)
    setNavlogError(null)
    setDepId('')
    setDestId('')
    setSuggestAttempt(1)
  }

  // Auto-suggest intermediate fixes via airways-based route builder
  async function handleSuggest() {
    if (!depId || !destId) return
    setSuggesting(true)
    try {
      const fixes = await navpointsApi.legSuggestions(depId, destId, 8, suggestAttempt)
      const fixEntries: WaypointEntry[] = (Array.isArray(fixes) ? fixes : []).map((np: any) => ({
        kind: 'fix' as const,
        id: np.id ?? `ident:${np.ident}`,
        ident: np.ident,
        name: np.name ?? np.ident,
        lat: Number(np.lat),
        lon: Number(np.lon),
      }))
      setWaypoints(prev => {
        const dep  = prev.find(w => w.kind === 'airport' && w.id === depId)
        const dest = prev.find(w => w.kind === 'airport' && w.id === destId)
        return [...(dep ? [dep] : []), ...fixEntries, ...(dest ? [dest] : [])]
      })
      setNavlog(null)
      setSuggestAttempt(prev => prev + 1)
    } catch (err: any) {
      console.error('Suggest failed', err)
    } finally {
      setSuggesting(false)
    }
  }

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

  function handleSendToOfp() {
    sessionStorage.setItem('ofp_route', JSON.stringify({
      depId, destId, acId,
      waypoints: waypoints.map(w => ({ kind: w.kind, id: w.id })),
    }))
    navigate('/ofp-generator')
  }

  const canNavlog    = !!(acId && waypoints.length >= 2)
  const canSendToOfp = !!(depId && destId && acId)
  const canSuggest   = !!(depId && destId)

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

  const [isFullscreen, setIsFullscreen] = useState(false)

  return (
    <div className={`space-y-5 max-w-7xl mx-auto ${isFullscreen ? 'h-0 overflow-hidden' : ''}`}>
      <div>
        <div className="flex items-center gap-2 mb-1">
          <h1 className="text-2xl font-bold text-textprimary">Route Builder</h1>
        </div>
        <p className="text-textsecondary text-sm">Build waypoint sequences and calculate navlog.</p>
      </div>

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
              {suggestAttempt > 1 ? 'Try Another Route' : 'Auto-Suggest'}
            </button>
            <button
              onClick={handleClearRoute}
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
                  {searchResults.map(r => (
                    <button
                      key={r.id}
                      onClick={() => addFix(r)}
                      className="w-full text-left px-3 py-2.5 hover:bg-slate-50 transition flex items-center gap-3 border-b border-slate-50 last:border-0"
                    >
                      <div className={`w-6 h-6 rounded flex items-center justify-center shrink-0 ${r.kind === 'airport' ? 'bg-blue-100' : 'bg-cyan-100'}`}>
                        {r.kind === 'airport'
                          ? <Plane size={11} className="text-blue-600" />
                          : <MapPin size={11} className="text-cyan-600" />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-black text-textprimary font-mono">{r.ident}</p>
                        <p className="text-[10px] text-textsecondary truncate">{r.name}</p>
                      </div>
                      <span className="text-[9px] px-1.5 py-0.5 rounded font-bold shrink-0 {r.kind === 'airport' ? 'bg-blue-100 text-blue-600' : 'bg-slate-100 text-slate-500'}">
                        {r.kind === 'airport' ? 'APT' : (r.subLabel ?? 'FIX')}
                      </span>
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
          <Card className={`!p-3 ${isFullscreen ? 'fixed inset-4 z-[9999] flex flex-col' : ''}`}>
            <div className="flex items-center justify-between mb-2">
              <h2 className="font-bold text-textprimary text-sm flex items-center gap-2">
                <Navigation size={14} className="text-primary" /> Route Map
              </h2>
              <div className="flex items-center gap-2">
                {waypoints.length >= 2 && (
                  <span className="text-[10px] text-textsecondary bg-slate-50 px-2 py-0.5 rounded-full border border-borderc mr-2">
                    {waypoints[0].ident} → {waypoints[waypoints.length - 1].ident}
                  </span>
                )}
                <button
                  onClick={() => setIsFullscreen(!isFullscreen)}
                  className="p-1 hover:bg-slate-100 rounded text-slate-500 transition"
                  title="Toggle Fullscreen"
                >
                  {isFullscreen ? <X size={16} /> : <span className="text-xs font-bold leading-none select-none">⛶</span>}
                </button>
              </div>
            </div>
            <RouteMap
              waypoints={waypoints}
              totalNm={totalNm}
              allAirports={apList}
              allNavpoints={allNavpoints}
              setDepId={setDepId}
              setDestId={setDestId}
              depId={depId}
              destId={destId}
              addFix={addFix}
              isFullscreen={isFullscreen}
            />
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



// import { useState, useEffect, useRef, useCallback, useMemo, Fragment } from 'react'
// import {
//   MapPin, Plus, Trash2, Navigation, Loader2, ArrowRight,
//   Sparkles, BarChart3, Send, X, Search, GripVertical,
//   AlertTriangle, CheckCircle2, RefreshCw, Plane,
//   Globe, ChevronDown, ChevronUp, Filter, ArrowRightLeft
// } from 'lucide-react'
// import {
//   aircraft as aircraftApi, airports as airportsApi,
//   navpoints as navpointsApi, navlog as navlogApi,
//   type ApiAircraft, type ApiAirport, type ApiNavpoint, type NavlogResult
// } from '../lib/api'
// import Combobox, { type ComboItem } from '../components/ui/Combobox'
// import Card from '../components/ui/Card'
// import { useNavigate } from 'react-router-dom'
// import { MapContainer, TileLayer, Polyline, Marker, CircleMarker, Tooltip, useMap, useMapEvents, LayerGroup } from 'react-leaflet'
// import L from 'leaflet'
// import 'leaflet/dist/leaflet.css'

// // ─── SkyVector-style Canvas NavChart Layer ────────────────────────
// // Renders airway connection lines + navpoint triangles + ident labels
// // entirely on an HTML5 canvas — zero DOM elements, zero lag.

// type ChartNode = {
//   id: string
//   ident: string
//   lat: number
//   lon: number
//   point_type: string
//   raw: any
// }

// // ─── Build edges from ALL nodes (called once, not per-viewport-change) ───────
// function buildNavEdges(nodes: ChartNode[]): [number, number][] {
//   const MAX_NM = 200
//   const edges: [number, number][] = []
//   const grid = new Map<string, number[]>()
  
//   nodes.forEach((node, i) => {
//     const key = `${Math.floor(node.lat / 2)},${Math.floor(node.lon / 2)}`
//     if (!grid.has(key)) grid.set(key, [])
//     grid.get(key)!.push(i)
//   })

//   const seen = new Set<string>()
//   nodes.forEach((node, i) => {
//     const la = node.lat, lo = node.lon
//     const neighbors: { j: number; nm: number }[] = []
//     for (let dy = -2; dy <= 2; dy++) {
//       for (let dx = -2; dx <= 2; dx++) {
//         const key = `${Math.floor(la / 2) + dy},${Math.floor(lo / 2) + dx}`
//         const cell = grid.get(key)
//         if (!cell) continue
//         for (const j of cell) {
//           if (i === j) continue
//           const o = nodes[j]
//           const dp = (la - o.lat) * Math.PI / 180
//           const dl = (lo - o.lon) * Math.PI / 180
//           const a = Math.sin(dp/2)**2 + Math.cos(la*Math.PI/180)*Math.cos(o.lat*Math.PI/180)*Math.sin(dl/2)**2
//           const nm = 2 * 3440.065 * Math.asin(Math.sqrt(Math.max(0, Math.min(1, a))))
//           if (nm <= MAX_NM) neighbors.push({ j, nm })
//         }
//       }
//     }
//     neighbors.sort((a, b) => a.nm - b.nm)
//     for (const { j } of neighbors.slice(0, 3)) {
//       const key = i < j ? `${i}-${j}` : `${j}-${i}`
//       if (!seen.has(key)) { seen.add(key); edges.push([i, j]) }
//     }
//   })
//   return edges
// }

// // ─── NavChartLayer ────────────────────────────────────────────────────────────
// // Receives ALL navpoints + airports (not viewport-filtered).
// // Computes the airway web ONCE on data load using stable refs.
// // The draw() function handles viewport culling at render time.
// // This eliminates the stale-index spaghetti race condition entirely.

// function NavChartLayer({ allNavpoints, allAirports, zoom, onClick }: {
//   allNavpoints: import('../lib/api').ApiNavpoint[]
//   allAirports:  import('../lib/api').ApiAirport[]
//   zoom: number
//   onClick: (entity: import('../lib/api').ApiNavpoint | import('../lib/api').ApiAirport) => void
// }) {
//   const map      = useMap()
//   const canvasRef = useRef<HTMLCanvasElement | null>(null)
//   const animRef   = useRef<number>(0)

//   // Stable refs — never changes shape after first build, so no index drift
//   const nodesRef = useRef<ChartNode[]>([])
//   const edgesRef = useRef<[number, number][]>([])
//   const builtRef = useRef(false)

//   // Build nodes + edges ONCE when all data arrives
//   useEffect(() => {
//     if (allNavpoints.length === 0 && allAirports.length === 0) return
//     // Avoid rebuild if data hasn't meaningfully changed
//     const nextCount = allNavpoints.length + allAirports.length
//     if (builtRef.current && nodesRef.current.length === nextCount) return

//     const worker = setTimeout(() => {
//       const nodes: ChartNode[] = []
//       for (const a of allAirports) {
//         if (a.lat != null && a.lon != null)
//           nodes.push({ id: a.id, ident: a.icao, lat: +a.lat, lon: +a.lon, point_type: 'AIRPORT', raw: a })
//       }
//       for (const n of allNavpoints) {
//         if (n.lat != null && n.lon != null)
//           nodes.push({ id: n.id, ident: n.ident, lat: +n.lat, lon: +n.lon, point_type: n.point_type || 'WAYPOINT', raw: n })
//       }
//       nodesRef.current = nodes
//       edgesRef.current = buildNavEdges(nodes)
//       builtRef.current = true
//       // Trigger a redraw now that edges are ready
//       cancelAnimationFrame(animRef.current)
//       animRef.current = requestAnimationFrame(() => drawFrame())
//     }, 100)
//     return () => clearTimeout(worker)
//   }, [allNavpoints.length, allAirports.length]) // length-only dep — avoids re-run on every pan

//   // Create canvas once
//   useEffect(() => {
//     const pane = map.getPanes().overlayPane
//     const canvas = document.createElement('canvas')
//     Object.assign(canvas.style, { position:'absolute', top:'0', left:'0', pointerEvents:'none', zIndex:'350' })
//     pane.appendChild(canvas)
//     canvasRef.current = canvas
//     return () => { canvas.parentNode?.removeChild(canvas) }
//   }, [map])

//   // Draw frame — reads from stable refs, handles its own viewport culling
//   const drawFrame = useCallback(() => {
//     const canvas = canvasRef.current
//     if (!canvas) return
//     const W = map.getContainer().clientWidth
//     const H = map.getContainer().clientHeight
//     canvas.width = W; canvas.height = H
//     const ctx = canvas.getContext('2d')!
//     ctx.clearRect(0, 0, W, H)

//     const nodes = nodesRef.current
//     const edges = edgesRef.current
//     if (nodes.length === 0) return

//     const topLeft = map.containerPointToLayerPoint([0, 0])
//     ctx.save()
//     ctx.translate(-topLeft.x, -topLeft.y)

//     // Project ALL nodes (stable array — indices always correct)
//     const pts = nodes.map(n => map.latLngToLayerPoint([n.lat, n.lon]))

//     // Viewport bounds for culling (with generous padding to avoid pop-in)
//     const pad = 120
//     const vMinX = topLeft.x - pad, vMaxX = topLeft.x + W + pad
//     const vMinY = topLeft.y - pad, vMaxY = topLeft.y + H + pad
//     const inView = (p: L.Point) => p.x >= vMinX && p.x <= vMaxX && p.y >= vMinY && p.y <= vMaxY

//     // Draw airway lines — only when at least one endpoint is in viewport
//     const lineColor = zoom <= 8 ? 'rgba(80,120,200,0.22)' : 'rgba(60,100,180,0.45)'
//     ctx.beginPath()
//     ctx.strokeStyle = lineColor
//     ctx.lineWidth = zoom <= 8 ? 0.5 : 0.9
//     ctx.setLineDash([])
//     for (const [i, j] of edges) {
//       const a = pts[i], b = pts[j]
//       if (inView(a) || inView(b)) {   // at least one end visible → draw full segment
//         ctx.moveTo(a.x, a.y)
//         ctx.lineTo(b.x, b.y)
//       }
//     }
//     ctx.stroke()

//     // Draw navpoint symbols (skip airports — React-Leaflet CircleMarkers handle those)
//     const showLabels = zoom >= 8
//     const triSize    = zoom >= 9 ? 5 : zoom >= 8 ? 4 : 3

//     for (let i = 0; i < nodes.length; i++) {
//       const node = nodes[i]
//       const pt   = pts[i]
//       if (!inView(pt)) continue
//       if (node.point_type === 'AIRPORT') continue

//       if (node.point_type === 'VOR') {
//         ctx.beginPath(); ctx.arc(pt.x, pt.y, triSize + 1, 0, Math.PI * 2)
//         ctx.fillStyle = 'rgba(30,90,200,0.85)'; ctx.fill()
//         ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.2; ctx.stroke()
//       } else if (node.point_type === 'NDB') {
//         ctx.beginPath(); ctx.arc(pt.x, pt.y, triSize - 1, 0, Math.PI * 2)
//         ctx.fillStyle = 'rgba(180,60,60,0.85)'; ctx.fill()
//       } else {
//         // WAYPOINT: hollow triangle
//         const s = triSize
//         ctx.beginPath()
//         ctx.moveTo(pt.x,            pt.y - s)
//         ctx.lineTo(pt.x + s * 0.87, pt.y + s * 0.5)
//         ctx.lineTo(pt.x - s * 0.87, pt.y + s * 0.5)
//         ctx.closePath()
//         ctx.strokeStyle = 'rgba(30,90,200,0.9)'; ctx.lineWidth = 1.5; ctx.stroke()
//       }

//       if (showLabels) {
//         ctx.font = `bold ${zoom >= 9 ? 10 : 9}px monospace`
//         ctx.fillStyle = 'rgba(20,40,120,0.9)'
//         ctx.fillText(node.ident, pt.x + triSize + 2, pt.y - 2)
//       }
//     }

//     ctx.restore()
//   }, [map, zoom])

//   // Re-attach map listeners whenever drawFrame changes (zoom change)
//   useEffect(() => {
//     const sched = () => { cancelAnimationFrame(animRef.current); animRef.current = requestAnimationFrame(drawFrame) }
//     map.on('move zoom viewreset zoomend moveend', sched)
//     sched()
//     return () => { map.off('move zoom viewreset zoomend moveend', sched); cancelAnimationFrame(animRef.current) }
//   }, [map, drawFrame])

//   // Click handler — hit-tests against all nodes in ref
//   useEffect(() => {
//     const onMapClick = (e: L.LeafletMouseEvent) => {
//       const { lat, lng } = e.latlng
//       let best: ChartNode | null = null, bestD = Infinity
//       for (const node of nodesRef.current) {
//         if (node.point_type === 'AIRPORT') continue
//         const dx = node.lat - lat, dy = node.lon - lng
//         const d = Math.sqrt(dx*dx + dy*dy)
//         if (d < 0.15 && d < bestD) { bestD = d; best = node }
//       }
//       if (best) onClick(best.raw)
//     }
//     map.on('click', onMapClick)
//     return () => { map.off('click', onMapClick) }
//   }, [map, onClick])

//   return null
// }



// // ─── Types ────────────────────────────────────────────────────────
// type WaypointEntry = {
//   kind: 'airport' | 'fix'
//   id: string
//   ident: string
//   name: string
//   lat: number
//   lon: number
// }

// // ─── Leaflet Route Map ────────────────────────────────────────────

// // Great-circle distance (nm) and initial bearing
// function gcNm(lat1: number, lon1: number, lat2: number, lon2: number) {
//   const toRad = (d: number) => d * Math.PI / 180
//   const p1 = toRad(lat1), p2 = toRad(lat2)
//   const dp = toRad(lat2 - lat1), dl = toRad(lon2 - lon1)
//   const h = Math.sin(dp / 2) ** 2 + Math.cos(p1) * Math.cos(p2) * Math.sin(dl / 2) ** 2
//   return 2 * 3440.065 * Math.asin(Math.sqrt(h))
// }

// function gcBearing(lat1: number, lon1: number, lat2: number, lon2: number) {
//   const toRad = (d: number) => d * Math.PI / 180
//   const p1 = toRad(lat1), p2 = toRad(lat2), dl = toRad(lon2 - lon1)
//   const y = Math.sin(dl) * Math.cos(p2)
//   const x = Math.cos(p1) * Math.sin(p2) - Math.sin(p1) * Math.cos(p2) * Math.cos(dl)
//   return (Math.atan2(y, x) * 180 / Math.PI + 360) % 360
// }

// function buildAirportIcon(seq: number, isFirst: boolean, isLast: boolean) {
//   const color = isFirst ? '#16a34a' : isLast ? '#dc2626' : '#2563eb'
//   const bg    = isFirst ? '#f0fdf4' : isLast ? '#fef2f2' : '#eff6ff'
//   return new L.DivIcon({
//     className: '',
//     html: `
//       <div style="
//         width:26px;height:26px;
//         border:2.5px solid ${color};
//         border-radius:50%;
//         background:${bg};
//         box-shadow:0 1px 4px rgba(0,0,0,0.25),0 0 0 2px rgba(255,255,255,0.8);
//         display:flex;align-items:center;justify-content:center;
//         font-size:10px;font-weight:900;color:${color};font-family:monospace;
//       ">${seq}</div>`,
//     iconSize: [26, 26],
//     iconAnchor: [13, 13],
//   })
// }

// function buildWaypointIcon(seq: number) {
//   return new L.DivIcon({
//     className: '',
//     html: `
//       <div style="
//         width:18px;height:18px;
//         background:#1e3a6e;
//         transform:rotate(45deg);
//         border:2px solid #fff;
//         box-shadow:0 0 0 1.5px #1e3a6e,0 1px 4px rgba(0,0,0,0.3);
//         display:flex;align-items:center;justify-content:center;
//       ">
//         <span style="transform:rotate(-45deg);font-size:7px;font-weight:900;color:#fff;font-family:monospace;">${seq}</span>
//       </div>`,
//     iconSize: [18, 18],
//     iconAnchor: [9, 9],
//   })
// }

// // Mid-point DivIcon for segment distance/bearing labels
// function buildSegmentIcon(distNm: number, brg: number) {
//   return new L.DivIcon({
//     className: '',
//     html: `
//       <div style="
//         background:rgba(15,23,42,0.82);
//         border:1px solid rgba(255,255,255,0.18);
//         border-radius:5px;
//         padding:2px 6px;
//         font-size:9px;
//         font-weight:700;
//         color:#e2e8f0;
//         font-family:monospace;
//         white-space:nowrap;
//         box-shadow:0 1px 4px rgba(0,0,0,0.3);
//         pointer-events:none;
//       ">${Math.round(distNm)} NM · ${Math.round(brg).toString().padStart(3,'0')}°</div>`,
//     iconSize: [90, 18],
//     iconAnchor: [45, 9],
//   })
// }

// // SkyVector-style compass overlay for zoomed-in airports
// function buildCompassIcon() {
//   return new L.DivIcon({
//     className: '',
//     html: `
//       <svg width="80" height="80" viewBox="0 0 100 100" style="opacity: 0.45; pointer-events: none;">
//         <circle cx="50" cy="50" r="48" fill="none" stroke="#1e3a8a" stroke-width="1.5" stroke-dasharray="2,2"/>
//         <circle cx="50" cy="50" r="42" fill="none" stroke="#1e3a8a" stroke-width="0.5"/>
//         <path d="M 50 2 L 50 8 M 50 98 L 50 92 M 2 50 L 8 50 M 98 50 L 92 50" stroke="#1e3a8a" stroke-width="2"/>
//         <path d="M 16 16 L 20 20 M 84 84 L 80 80 M 16 84 L 20 80 M 84 16 L 80 20" stroke="#1e3a8a" stroke-width="1.5"/>
//         <text x="50" y="14" font-size="8" fill="#1e3a8a" font-family="monospace" font-weight="bold" text-anchor="middle">N</text>
//         <text x="50" y="93" font-size="8" fill="#1e3a8a" font-family="monospace" font-weight="bold" text-anchor="middle">S</text>
//         <text x="91" y="53" font-size="8" fill="#1e3a8a" font-family="monospace" font-weight="bold" text-anchor="middle">E</text>
//         <text x="9" y="53" font-size="8" fill="#1e3a8a" font-family="monospace" font-weight="bold" text-anchor="middle">W</text>
//       </svg>
//     `,
//     iconSize: [80, 80],
//     iconAnchor: [40, 40],
//   })
// }

// // navpointIcon retained for route waypoint fix markers
// const navpointIcon = new L.DivIcon({
//   className: '',
//   html: `<div style="width:10px;height:10px;background:transparent;border:2px solid #1e3a8a;transform:rotate(45deg);"></div>`,
//   iconSize: [10, 10],
//   iconAnchor: [5, 5]
// })

// const TILE_LAYERS = [
//   {
//     id: 'terrain',
//     label: 'Terrain',
//     url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Shaded_Relief/MapServer/tile/{z}/{y}/{x}',
//     attribution: 'Esri World Shaded Relief',
//     maxNativeZoom: 13,
//   },
//   {
//     id: 'topo',
//     label: 'Topo',
//     url: 'https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png',
//     attribution: '© OpenTopoMap',
//     maxNativeZoom: 17,
//   },
//   {
//     id: 'satellite',
//     label: 'Satellite',
//     url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
//     attribution: 'Esri World Imagery',
//     maxNativeZoom: 19,
//   },
//   {
//     id: 'osm',
//     label: 'Street',
//     url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
//     attribution: '© OpenStreetMap contributors',
//     maxNativeZoom: 19,
//   },
// ]

// // Custom hook to track zoom level and center map on init
// function MapEventsHandler({ waypoints, setZoom, setBounds, isFullscreen }: { waypoints: WaypointEntry[], setZoom: (z: number) => void, setBounds: (b: L.LatLngBounds) => void, isFullscreen: boolean }) {
//   const map = useMapEvents({
//     zoomend: () => {
//       setZoom(map.getZoom())
//       setBounds(map.getBounds())
//     },
//     moveend: () => {
//       setBounds(map.getBounds())
//     }
//   })
  
//   useEffect(() => {
//     setZoom(map.getZoom())
//     setBounds(map.getBounds())
//     if (waypoints.length >= 2) {
//       const bounds = L.latLngBounds(waypoints.map(w => [Number(w.lat), Number(w.lon)]))
//       map.fitBounds(bounds, { padding: [50, 50], maxZoom: 11 })
//     } else if (waypoints.length === 1) {
//       map.setView([Number(waypoints[0].lat), Number(waypoints[0].lon)], 9)
//     }
//   }, [waypoints, map, setZoom])

//   // Fix map rendering issues when container resizes due to fullscreen toggle
//   useEffect(() => {
//     // Trigger multiple times to handle CSS transitions completing
//     const delays = [10, 50, 100, 200, 400]
//     const timers = delays.map(delay => setTimeout(() => {
//       map.invalidateSize()
//     }, delay))
    
//     return () => timers.forEach(clearTimeout)
//   }, [isFullscreen, map])

//   return null
// }

// interface RouteMapProps {
//   waypoints: WaypointEntry[]
//   totalNm: number
//   allAirports: ApiAirport[]
//   allNavpoints: ApiNavpoint[]
//   setDepId: (id: string) => void
//   setDestId: (id: string) => void
//   depId: string
//   destId: string
//   addFix: (fix: ApiNavpoint) => void
//   isFullscreen: boolean
// }

// function RouteMap({ waypoints, totalNm, allAirports, allNavpoints, setDepId, setDestId, depId, destId, addFix, isFullscreen }: RouteMapProps) {
//   const [layerIdx, setLayerIdx] = useState(2) // Default to Satellite
//   const [zoom, setZoom] = useState(5)
//   const [bounds, setBounds] = useState<L.LatLngBounds | null>(null)
//   const [hoverRouteHint, setHoverRouteHint] = useState(false)

//   const center: [number, number] = waypoints.length > 0
//     ? [Number(waypoints[0].lat), Number(waypoints[0].lon)]
//     : [1.2, 36.8]

//   const layer = TILE_LAYERS[layerIdx]

//   // Filter entities to viewport to prevent React from lagging with thousands of elements
//   const visibleAirports = useMemo(() => {
//     if (!bounds) return []
//     const padded = bounds.pad(0.1) // buffer to prevent popping
//     return allAirports.filter(ap => ap.lat != null && ap.lon != null && padded.contains([Number(ap.lat), Number(ap.lon)]))
//   }, [allAirports, bounds])

//   const visibleNavpoints = useMemo(() => {
//     if (!bounds || zoom < 5) return []
//     const padded = bounds.pad(0.3) // wider buffer for smooth panning
//     return allNavpoints.filter(np => np.lat != null && np.lon != null && padded.contains([Number(np.lat), Number(np.lon)]))
//   }, [allNavpoints, bounds, zoom])

//   // Build mid-point markers for each segment
//   const segmentMarkers = waypoints.length >= 2
//     ? waypoints.slice(0, -1).map((wp, i) => {
//         const next = waypoints[i + 1]
//         const distNm = gcNm(wp.lat, wp.lon, next.lat, next.lon)
//         const brg    = gcBearing(wp.lat, wp.lon, next.lat, next.lon)
//         const midLat = (wp.lat + next.lat) / 2
//         const midLon = (wp.lon + next.lon) / 2
//         return { lat: midLat, lon: midLon, distNm, brg, key: `${wp.id}-${next.id}` }
//       })
//     : []

//   // Interactive routing click handler
//   const handleMapEntityClick = (entity: ApiAirport | ApiNavpoint, kind: 'airport' | 'fix') => {
//     if (kind === 'airport') {
//       if (!depId) {
//         setDepId(entity.id)
//       } else if (!destId && entity.id !== depId) {
//         setDestId(entity.id)
//       } else {
//         // If both are set, add as an intermediate airport fix
//         addFix(entity as ApiNavpoint)
//       }
//     } else {
//       addFix(entity as ApiNavpoint)
//     }
//   }

//   return (
//     <div className={`w-full rounded-xl overflow-hidden border border-borderc relative z-0 bg-[#d8d0aa] ${isFullscreen ? 'flex-1 min-h-0' : 'h-[440px]'}`}>
//       {/* Layer switcher overlay */}
//       <div className="absolute top-3 right-3 z-[1000] flex gap-1 bg-white/90 backdrop-blur-sm rounded-lg border border-slate-200 shadow-md p-1">
//         {TILE_LAYERS.map((tl, idx) => (
//           <button
//             key={tl.id}
//             onClick={() => setLayerIdx(idx)}
//             className={`px-2 py-1 text-[10px] font-bold rounded transition ${
//               layerIdx === idx
//                 ? 'bg-primary text-white'
//                 : 'text-slate-500 hover:text-slate-800 hover:bg-slate-100'
//             }`}
//           >{tl.label}</button>
//         ))}
//       </div>

//       {/* Interactive routing hint overlay */}
//       {!depId && (
//         <div className="absolute top-3 left-1/2 -translate-x-1/2 z-[1000] bg-blue-600/90 backdrop-blur-sm text-white rounded-full px-4 py-1.5 text-[11px] font-bold shadow-lg animate-pulse">
//           Click an airport to set Departure
//         </div>
//       )}
//       {depId && !destId && (
//         <div className="absolute top-3 left-1/2 -translate-x-1/2 z-[1000] bg-green-600/90 backdrop-blur-sm text-white rounded-full px-4 py-1.5 text-[11px] font-bold shadow-lg animate-pulse">
//           Click an airport to set Destination
//         </div>
//       )}

//       {/* Chart info overlay */}
//       {zoom >= 5 && (
//         <div className="absolute top-14 left-3 z-[1000] bg-slate-900/70 backdrop-blur-sm text-white rounded-lg px-2.5 py-1.5 text-[9px] font-mono flex gap-3 border border-white/10">
//           <span>✈ {allAirports.length.toLocaleString()} airports</span>
//           <span>⬥ {allNavpoints.length.toLocaleString()} fixes</span>
//           <span className="text-slate-400">Z{zoom}</span>
//         </div>
//       )}

//       {/* Route stats overlay */}
//       {waypoints.length >= 2 && (
//         <div className="absolute bottom-3 left-3 z-[1000] bg-slate-900/85 backdrop-blur-sm text-white rounded-lg border border-white/10 shadow-lg px-3 py-2 text-[10px] font-mono flex gap-4">
//           <span>📍 {waypoints.length} fixes</span>
//           <span>✈ {Math.round(totalNm)} NM total</span>
//           <span className="text-slate-400">
//             {waypoints[0]?.ident} → {waypoints[waypoints.length - 1]?.ident}
//           </span>
//         </div>
//       )}

//       <MapContainer
//         center={center}
//         zoom={zoom}
//         style={{ height: '100%', width: '100%', background: 'transparent' }}
//         scrollWheelZoom={true}
//         zoomControl={true}
//         preferCanvas={true}
//       >
//         <TileLayer
//           key={layer.id}
//           attribution={layer.attribution}
//           url={layer.url}
//           maxNativeZoom={layer.maxNativeZoom}
//           maxZoom={19}
//         />

//         <MapEventsHandler waypoints={waypoints} setZoom={setZoom} setBounds={setBounds} isFullscreen={isFullscreen} />

//         {/* Global Airports layer (visible at all zooms) */}
//         <LayerGroup>
//           {visibleAirports.flatMap(ap => {
//             if (ap.lat == null || ap.lon == null) return null
//             const isDep = ap.id === depId
//             const isDest = ap.id === destId
//             const isRouteNode = waypoints.some(w => w.id === ap.id)
            
//             // Draw the compass if zoomed in closely
//             const showCompass = zoom >= 9 && !isRouteNode

//             const elements = []
//             if (showCompass) {
//               elements.push(
//                 <Marker key={`comp-${ap.id}`} position={[Number(ap.lat), Number(ap.lon)]} icon={buildCompassIcon()} interactive={false} zIndexOffset={100} />
//               )
//             }
//             if (!isRouteNode) {
//               elements.push(
//                 <CircleMarker
//                   key={`dot-${ap.id}`}
//                   center={[Number(ap.lat), Number(ap.lon)]}
//                   radius={zoom >= 8 ? 5 : 3}
//                   pathOptions={{
//                     fillColor: isDep ? '#16a34a' : isDest ? '#dc2626' : '#3b82f6',
//                     fillOpacity: 0.9,
//                     color: '#ffffff',
//                     weight: 1.5
//                   }}
//                   eventHandlers={{ click: () => handleMapEntityClick(ap, 'airport') }}
//                 >
//                   <Tooltip direction="top" offset={[0, -5]} className="font-mono text-xs font-bold text-slate-800 bg-white/90 border-slate-200">
//                     {ap.icao} - {ap.name}
//                   </Tooltip>
//                 </CircleMarker>
//               )
//             }
//             return elements
//           })}
//         </LayerGroup>

//         {/* SkyVector-style canvas-based navpoint + airway chart */}
//         {zoom >= 5 && (
//           <NavChartLayer
//             allNavpoints={allNavpoints}
//             allAirports={allAirports}
//             zoom={zoom}
//             onClick={(entity: any) => {
//               if (entity.icao) handleMapEntityClick(entity, 'airport')
//               else handleMapEntityClick(entity, 'fix')
//             }}
//           />
//         )}

//         {/* Route line with dashed shadow for depth */}
//         {waypoints.length >= 2 && (
//           <>
//             <Polyline
//               positions={waypoints.map(w => [Number(w.lat), Number(w.lon)])}
//               color="rgba(0,0,0,0.25)"
//               weight={6}
//               opacity={0.6}
//             />
//             <Polyline
//               positions={waypoints.map(w => [Number(w.lat), Number(w.lon)])}
//               color="#a855f7"
//               weight={3}
//               opacity={0.95}
//               dashArray=""
//             />
//           </>
//         )}

//         {/* Segment distance/bearing labels */}
//         {segmentMarkers.map(seg => (
//           <Marker
//             key={seg.key}
//             position={[seg.lat, seg.lon]}
//             icon={buildSegmentIcon(seg.distNm, seg.brg)}
//             interactive={false}
//             zIndexOffset={500}
//           />
//         ))}

//         {/* Active Route Waypoint markers (rendered on top of global dots) */}
//         {waypoints.map((wp, i) => (
//           <Marker
//             key={`route-${wp.id}-${i}`}
//             position={[wp.lat, wp.lon]}
//             icon={wp.kind === 'airport'
//               ? buildAirportIcon(i + 1, i === 0, i === waypoints.length - 1)
//               : buildWaypointIcon(i + 1)
//             }
//             zIndexOffset={1000}
//           >
//             <Tooltip direction="top" offset={[0, -14]} opacity={1}>
//               <div style={{
//                 background: 'rgba(15,23,42,0.92)',
//                 border: '1px solid rgba(255,255,255,0.15)',
//                 borderRadius: 8,
//                 padding: '4px 8px',
//                 color: '#f1f5f9',
//                 fontFamily: 'monospace',
//                 fontSize: 11,
//                 fontWeight: 700,
//                 whiteSpace: 'nowrap',
//                 boxShadow: '0 2px 8px rgba(0,0,0,0.4)',
//               }}>
//                 <div style={{ color: '#94a3b8', fontSize: 9, fontWeight: 600, marginBottom: 2 }}>
//                   {wp.kind === 'airport' ? '🛬 Airport' : '⬥ Fix'} #{i + 1}
//                 </div>
//                 <div style={{ color: '#e2e8f0', fontSize: 12 }}>{wp.ident}</div>
//                 {wp.name !== wp.ident && (
//                   <div style={{ color: '#94a3b8', fontSize: 9, marginTop: 2 }}>{wp.name}</div>
//                 )}
//                 <div style={{ color: '#64748b', fontSize: 9, marginTop: 2 }}>
//                   {wp.lat.toFixed(4)}°, {wp.lon.toFixed(4)}°
//                 </div>
//               </div>
//             </Tooltip>
//           </Marker>
//         ))}
//       </MapContainer>
//     </div>
//   )
// }

// // ─── Main Component ───────────────────────────────────────────────
// export default function RouteBuilder() {
//   const navigate = useNavigate()

//   // Data
//   const [acList, setAcList]   = useState<ApiAircraft[]>([])
//   const [apList, setApList]   = useState<ApiAirport[]>([])
//   const [allNavpoints, setAllNavpoints] = useState<ApiNavpoint[]>([])
//   const [loadingData, setLoadingData] = useState(true)

//   // Route state
//   const [acId, setAcId]         = useState('')
//   const [depId, setDepId]       = useState('')
//   const [destId, setDestId]     = useState('')
//   const [waypoints, setWaypoints] = useState<WaypointEntry[]>([])

//   // Navlog
//   const [navlog, setNavlog]     = useState<NavlogResult | null>(null)
//   const [navlogLoading, setNavlogLoading] = useState(false)
//   const [navlogError, setNavlogError]     = useState<string | null>(null)

//   // Navpoint search
//   const [searchQuery, setSearchQuery]   = useState('')
//   const [searchResults, setSearchResults] = useState<ApiNavpoint[]>([])
//   const [searching, setSearching]         = useState(false)
//   const searchRef                         = useRef<HTMLDivElement>(null)
//   const searchTimeout                     = useRef<ReturnType<typeof setTimeout>>()

//   // Suggest loading
//   const [suggesting, setSuggesting] = useState(false)

//   // Load aircraft + airports + navpoints
//   useEffect(() => {
//     Promise.all([aircraftApi.list(), airportsApi.list(), navpointsApi.list()])
//       .then(([ac, ap, np]) => {
//         setAcList(ac.filter(a => a.is_active))
//         setApList(ap.filter(a => a.is_active))
//         setAllNavpoints(Array.isArray(np) ? np : [])
//       })
//       .catch(console.error)
//       .finally(() => setLoadingData(false))
//   }, [])

//   // Combobox items
//   const acItems: ComboItem[] = acList.map(a => ({
//     id: a.id, label: `${a.registration} — ${a.type}`,
//   }))
//   const apItems: ComboItem[] = apList.map(a => ({
//     id: a.id, label: a.name, sub: `${a.icao}`,
//   }))

//   // When dep/dest changes, rebuild waypoints array
//   useEffect(() => {
//     const depAp  = apList.find(a => a.id === depId)
//     const destAp = apList.find(a => a.id === destId)

//     setWaypoints(prev => {
//       const fixes = prev.filter(w => w.kind === 'fix')
//       const newWps: WaypointEntry[] = []
//       if (depAp)  newWps.push({ kind: 'airport', id: depAp.id,  ident: depAp.icao,  name: depAp.name,  lat: Number(depAp.lat ?? 0),  lon: Number(depAp.lon ?? 0) })
//       newWps.push(...fixes)
//       if (destAp) newWps.push({ kind: 'airport', id: destAp.id, ident: destAp.icao, name: destAp.name, lat: Number(destAp.lat ?? 0), lon: Number(destAp.lon ?? 0) })
//       return newWps
//     })
//     setNavlog(null)
//   // eslint-disable-next-line react-hooks/exhaustive-deps
//   }, [depId, destId, apList])

//   // Search navpoints
//   useEffect(() => {
//     if (!searchQuery.trim()) { setSearchResults([]); return }
//     clearTimeout(searchTimeout.current)
//     searchTimeout.current = setTimeout(async () => {
//       setSearching(true)
//       try {
//         const results = await navpointsApi.search(searchQuery)
//         setSearchResults(Array.isArray(results) ? results : [])
//       } catch { setSearchResults([]) }
//       finally  { setSearching(false) }
//     }, 300)
//     return () => clearTimeout(searchTimeout.current)
//   }, [searchQuery])

//   // Close search on outside click
//   useEffect(() => {
//     const handler = (e: MouseEvent) => {
//       if (searchRef.current && !searchRef.current.contains(e.target as Node)) {
//         setSearchResults([])
//         setSearchQuery('')
//       }
//     }
//     document.addEventListener('mousedown', handler)
//     return () => document.removeEventListener('mousedown', handler)
//   }, [])

//   function addFix(np: ApiNavpoint) {
//     const fix: WaypointEntry = {
//       kind: 'fix', id: np.id,
//       ident: np.ident, name: np.name ?? np.ident,
//       lat: Number(np.lat), lon: Number(np.lon),
//     }
//     setWaypoints(prev => {
//       // Insert before final airport if exists
//       const last = prev[prev.length - 1]
//       if (last?.kind === 'airport') {
//         return [...prev.slice(0, -1), fix, last]
//       }
//       return [...prev, fix]
//     })
//     setSearchQuery('')
//     setSearchResults([])
//     setNavlog(null)
//   }

//   function removeWaypoint(index: number) {
//     setWaypoints(prev => prev.filter((_, i) => i !== index))
//     setNavlog(null)
//   }

//   function clearAll() {
//     setWaypoints([])
//     setNavlog(null)
//     setDepId('')
//     setDestId('')
//   }

//   // Auto-suggest intermediate fixes
//   async function handleSuggest() {
//     if (!depId || !destId) return
//     setSuggesting(true)
//     try {
//       const fixes = await navpointsApi.legSuggestions(depId, destId, 10)
//       const fixEntries: WaypointEntry[] = (Array.isArray(fixes) ? fixes : []).map((np: ApiNavpoint) => ({
//         kind: 'fix', id: np.id, ident: np.ident, name: np.name ?? np.ident,
//         lat: Number(np.lat), lon: Number(np.lon),
//       }))
//       setWaypoints(prev => {
//         const dep  = prev.find(w => w.kind === 'airport' && w.id === depId)
//         const dest = prev.find(w => w.kind === 'airport' && w.id === destId)
//         return [...(dep ? [dep] : []), ...fixEntries, ...(dest ? [dest] : [])]
//       })
//       setNavlog(null)
//     } catch (err: any) {
//       console.error('Suggest failed', err)
//     } finally {
//       setSuggesting(false)
//     }
//   }

//   // Calculate navlog
//   async function handleCalcNavlog() {
//     if (!acId || waypoints.length < 2) return
//     setNavlogLoading(true)
//     setNavlogError(null)
//     try {
//       const data = await navlogApi.generate({
//         aircraft_id: acId,
//         waypoints: waypoints.map(w => ({ kind: w.kind, id: w.id })),
//       })
//       setNavlog(data)
//     } catch (err: any) {
//       setNavlogError(err.message || 'Navlog calculation failed')
//     } finally {
//       setNavlogLoading(false)
//     }
//   }

//   // Send to OFP Generator
//   function handleSendToOfp() {
//     sessionStorage.setItem('ofp_route', JSON.stringify({
//       depId, destId, acId,
//       waypoints: waypoints.map(w => ({ kind: w.kind, id: w.id })),
//     }))
//     navigate('/ofp-generator')
//   }

//   const canSuggest   = !!(depId && destId)
//   const canNavlog    = !!(acId && waypoints.length >= 2)
//   const canSendToOfp = !!(depId && destId && acId)

//   // ── Browse Routes panel ────────────────────────────────────────────
//   const [browseOpen, setBrowseOpen] = useState(true)
//   const [filterCountry, setFilterCountry] = useState('')
//   const [filterRegion, setFilterRegion]   = useState('')
//   const [filterFrom, setFilterFrom]       = useState('')
//   const [filterTo, setFilterTo]           = useState('')
//   const [browseTerm, setBrowseTerm]       = useState('')

//   // Unique countries and regions from loaded airports
//   const countries = useMemo(() => {
//     const set = new Set(apList.map(a => a.country).filter(Boolean) as string[])
//     return Array.from(set).sort()
//   }, [apList])

//   const regions = useMemo(() => {
//     const set = new Set(
//       apList
//         .filter(a => !filterCountry || a.country === filterCountry)
//         .map(a => a.region)
//         .filter(Boolean) as string[]
//     )
//     return Array.from(set).sort()
//   }, [apList, filterCountry])

//   // Filtered airport list for browse panel
//   const browseAirports = useMemo(() => {
//     let list = apList
//     if (filterCountry) list = list.filter(a => a.country === filterCountry)
//     if (filterRegion)  list = list.filter(a => a.region === filterRegion)
//     if (browseTerm) {
//       const t = browseTerm.toUpperCase()
//       list = list.filter(a =>
//         a.icao?.toUpperCase().includes(t) ||
//         a.name?.toUpperCase().includes(t) ||
//         a.city?.toUpperCase()?.includes(t)
//       )
//     }
//     return list.slice(0, 200) // cap at 200 for performance
//   }, [apList, filterCountry, filterRegion, browseTerm])

//   // For 'between two countries' mode: cross-country pairs
//   const crossCountryPairs = useMemo(() => {
//     if (!filterFrom || !filterTo) return []
//     const fromAps = apList.filter(a => a.country === filterFrom)
//     const toAps   = apList.filter(a => a.country === filterTo)
//     const pairs: Array<{ dep: ApiAirport; dest: ApiAirport }> = []
//     for (const dep of fromAps.slice(0, 20)) {
//       for (const dest of toAps.slice(0, 20)) {
//         pairs.push({ dep, dest })
//       }
//     }
//     return pairs.slice(0, 100)
//   }, [apList, filterFrom, filterTo])

//   function loadRoute(depAp: ApiAirport, destAp: ApiAirport) {
//     setDepId(depAp.id)
//     setDestId(destAp.id)
//     setNavlog(null)
//   }

//   // Compute total route distance (NM) from waypoints
//   const totalNm = waypoints.length >= 2
//     ? waypoints.slice(0, -1).reduce((sum, wp, i) => {
//         const next = waypoints[i + 1]
//         const toRad = (d: number) => d * Math.PI / 180
//         const p1 = toRad(wp.lat), p2 = toRad(next.lat)
//         const dp = toRad(next.lat - wp.lat), dl = toRad(next.lon - wp.lon)
//         const h = Math.sin(dp/2)**2 + Math.cos(p1)*Math.cos(p2)*Math.sin(dl/2)**2
//         return sum + 2 * 3440.065 * Math.asin(Math.sqrt(h))
//       }, 0)
//     : 0

//   const [isFullscreen, setIsFullscreen] = useState(false)

//   // ── Render ─────────────────────────────────────────────────────
//   return (
//     <div className={`space-y-5 max-w-7xl mx-auto ${isFullscreen ? 'h-0 overflow-hidden' : ''}`}>
//       {/* Header */}
//       <div>
//         <div className="flex items-center gap-2 mb-1">
//           <span className="text-2xl"></span>
//           <h1 className="text-2xl font-bold text-textprimary">Route Builder</h1>
//         </div>
//         <p className="text-textsecondary text-sm">
//           Browse airport routes by country or region, then build waypoint sequences and calculate navlog.
//         </p>
//       </div>

//       {/* ── Browse Routes Panel ── */}
//       <Card className="!p-0 overflow-hidden">
//         <button
//           onClick={() => setBrowseOpen(v => !v)}
//           className="w-full flex items-center gap-2 px-4 py-3 hover:bg-slate-50 transition text-left"
//         >
//           <Globe size={15} className="text-primary" />
//           <span className="font-bold text-sm text-textprimary">Browse Airport Routes</span>
//           <span className="ml-2 text-[10px] bg-primary/10 text-primary px-2 py-0.5 rounded-full font-bold">
//             {browseAirports.length} airports
//           </span>
//           <span className="ml-auto text-textsecondary">
//             {browseOpen ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
//           </span>
//         </button>

//         {browseOpen && (
//           <div className="border-t border-borderc px-4 py-3 space-y-3">
//             {/* Filter row */}
//             <div className="flex flex-wrap gap-2 items-end">
//               {/* Search */}
//               <div className="flex items-center gap-1.5 border border-borderc rounded-lg px-2.5 py-1.5 focus-within:border-primary transition min-w-[160px] flex-1">
//                 <Search size={12} className="text-slate-400 shrink-0" />
//                 <input
//                   value={browseTerm}
//                   onChange={e => setBrowseTerm(e.target.value)}
//                   placeholder="Search ICAO, name, city…"
//                   className="flex-1 text-xs outline-none bg-transparent text-textprimary placeholder:text-slate-400"
//                 />
//                 {browseTerm && <button onClick={() => setBrowseTerm('')}><X size={11} className="text-slate-400" /></button>}
//               </div>

//               {/* Country filter */}
//               <div className="flex flex-col gap-0.5">
//                 <label className="text-[9px] font-bold text-textsecondary uppercase tracking-wider">Country</label>
//                 <select
//                   value={filterCountry}
//                   onChange={e => { setFilterCountry(e.target.value); setFilterRegion('') }}
//                   className="text-xs border border-borderc rounded-lg px-2 py-1.5 bg-white text-textprimary outline-none focus:border-primary min-w-[140px]"
//                 >
//                   <option value="">All countries</option>
//                   {countries.map(c => <option key={c} value={c}>{c}</option>)}
//                 </select>
//               </div>

//               {/* Region filter */}
//               {regions.length > 0 && (
//                 <div className="flex flex-col gap-0.5">
//                   <label className="text-[9px] font-bold text-textsecondary uppercase tracking-wider">Region / FIR</label>
//                   <select
//                     value={filterRegion}
//                     onChange={e => setFilterRegion(e.target.value)}
//                     className="text-xs border border-borderc rounded-lg px-2 py-1.5 bg-white text-textprimary outline-none focus:border-primary min-w-[160px]"
//                   >
//                     <option value="">All regions</option>
//                     {regions.map(r => <option key={r} value={r}>{r}</option>)}
//                   </select>
//                 </div>
//               )}

//               {/* Between two countries */}
//               <div className="flex items-center gap-1.5 border border-dashed border-primary/40 rounded-lg px-3 py-1.5">
//                 <ArrowRightLeft size={12} className="text-primary shrink-0" />
//                 <span className="text-[10px] font-bold text-primary">Between:</span>
//                 <select
//                   value={filterFrom}
//                   onChange={e => setFilterFrom(e.target.value)}
//                   className="text-xs border-0 outline-none bg-transparent text-textprimary max-w-[120px]"
//                 >
//                   <option value="">From country</option>
//                   {countries.map(c => <option key={c} value={c}>{c}</option>)}
//                 </select>
//                 <ArrowRight size={10} className="text-slate-400" />
//                 <select
//                   value={filterTo}
//                   onChange={e => setFilterTo(e.target.value)}
//                   className="text-xs border-0 outline-none bg-transparent text-textprimary max-w-[120px]"
//                 >
//                   <option value="">To country</option>
//                   {countries.map(c => <option key={c} value={c}>{c}</option>)}
//                 </select>
//                 {(filterFrom || filterTo) && (
//                   <button onClick={() => { setFilterFrom(''); setFilterTo('') }}>
//                     <X size={11} className="text-slate-400 hover:text-red-500" />
//                   </button>
//                 )}
//               </div>

//               {/* Clear all filters */}
//               {(filterCountry || filterRegion || filterFrom || filterTo || browseTerm) && (
//                 <button
//                   onClick={() => { setFilterCountry(''); setFilterRegion(''); setFilterFrom(''); setFilterTo(''); setBrowseTerm('') }}
//                   className="flex items-center gap-1 text-xs text-textsecondary hover:text-red-500 transition px-2 py-1.5 border border-dashed border-borderc rounded-lg"
//                 >
//                   <RefreshCw size={11} /> Clear
//                 </button>
//               )}
//             </div>

//             {/* Cross-country pairs table */}
//             {filterFrom && filterTo && crossCountryPairs.length > 0 ? (
//               <div className="rounded-xl border border-borderc overflow-hidden">
//                 <div className="bg-slate-50 px-3 py-1.5 text-[10px] font-bold text-textsecondary uppercase tracking-wider flex items-center gap-2">
//                   <ArrowRightLeft size={10} />
//                   Cross-country routes: {filterFrom} → {filterTo}
//                   <span className="text-slate-400 font-normal">({crossCountryPairs.length} pairs)</span>
//                 </div>
//                 <div className="max-h-48 overflow-y-auto divide-y divide-slate-50">
//                   {crossCountryPairs.map(({ dep, dest }, i) => (
//                     <button
//                       key={i}
//                       onClick={() => loadRoute(dep, dest)}
//                       className="w-full text-left px-3 py-2 hover:bg-primary/5 transition flex items-center gap-3 group"
//                     >
//                       <div className="flex-1 min-w-0">
//                         <span className="text-xs font-black text-textprimary font-mono">{dep.icao}</span>
//                         <span className="text-slate-400 mx-1.5 text-xs">→</span>
//                         <span className="text-xs font-black text-textprimary font-mono">{dest.icao}</span>
//                       </div>
//                       <div className="text-[10px] text-textsecondary truncate flex-1 min-w-0">
//                         {dep.name} → {dest.name}
//                       </div>
//                       <span className="text-[9px] text-primary font-bold opacity-0 group-hover:opacity-100 transition shrink-0">
//                         Load ↗
//                       </span>
//                     </button>
//                   ))}
//                 </div>
//               </div>
//             ) : (
//               /* Airport grid */
//               <div className="rounded-xl border border-borderc overflow-hidden">
//                 <div className="bg-slate-50 px-3 py-1.5 text-[10px] font-bold text-textsecondary uppercase tracking-wider">
//                   Airports — click to load as departure, double-click to load as destination
//                 </div>
//                 {loadingData ? (
//                   <div className="flex items-center justify-center py-6">
//                     <Loader2 size={18} className="animate-spin text-primary" />
//                     <span className="ml-2 text-xs text-textsecondary">Loading airports…</span>
//                   </div>
//                 ) : browseAirports.length === 0 ? (
//                   <div className="py-6 text-center text-xs text-textsecondary">No airports match your filters.</div>
//                 ) : (
//                   <div className="max-h-52 overflow-y-auto">
//                     <table className="w-full text-[11px]">
//                       <thead className="sticky top-0 bg-white border-b border-slate-100">
//                         <tr className="text-textsecondary font-bold text-[10px]">
//                           <th className="px-3 py-1.5 text-left">ICAO</th>
//                           <th className="px-3 py-1.5 text-left">Name</th>
//                           <th className="px-3 py-1.5 text-left">City</th>
//                           <th className="px-3 py-1.5 text-left">Country</th>
//                           <th className="px-3 py-1.5 text-right">Action</th>
//                         </tr>
//                       </thead>
//                       <tbody className="divide-y divide-slate-50">
//                         {browseAirports.map(ap => (
//                           <tr key={ap.id} className="hover:bg-slate-50/60 transition group">
//                             <td className="px-3 py-1.5 font-black font-mono text-textprimary">{ap.icao}</td>
//                             <td className="px-3 py-1.5 text-textprimary max-w-[180px] truncate">{ap.name}</td>
//                             <td className="px-3 py-1.5 text-textsecondary">{ap.city || '—'}</td>
//                             <td className="px-3 py-1.5 text-textsecondary">{ap.country || '—'}</td>
//                             <td className="px-3 py-1.5 text-right">
//                               <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition">
//                                 <button
//                                   onClick={() => setDepId(ap.id)}
//                                   title="Set as Departure"
//                                   className="text-[9px] bg-green-500 text-white px-1.5 py-0.5 rounded font-bold hover:bg-green-600 transition"
//                                 >
//                                   DEP
//                                 </button>
//                                 <button
//                                   onClick={() => setDestId(ap.id)}
//                                   title="Set as Destination"
//                                   className="text-[9px] bg-red-500 text-white px-1.5 py-0.5 rounded font-bold hover:bg-red-600 transition"
//                                 >
//                                   DEST
//                                 </button>
//                               </div>
//                             </td>
//                           </tr>
//                         ))}
//                       </tbody>
//                     </table>
//                   </div>
//                 )}
//               </div>
//             )}
//           </div>
//         )}
//       </Card>

//       {/* Top strip: Aircraft + Dep/Dest + Actions */}
//       <Card className="!p-4">
//         <div className="flex flex-wrap gap-3 items-end">
//           <div className="w-44 shrink-0">
//             <label className="block text-[10px] font-bold text-textsecondary uppercase tracking-wider mb-1.5">Aircraft</label>
//             {loadingData
//               ? <div className="h-9 bg-slate-100 rounded-lg animate-pulse" />
//               : <Combobox items={acItems} value={acId} onChange={setAcId} placeholder="Select…" />
//             }
//           </div>
//           <div className="w-52 shrink-0">
//             <label className="block text-[10px] font-bold text-textsecondary uppercase tracking-wider mb-1.5">Departure</label>
//             {loadingData
//               ? <div className="h-9 bg-slate-100 rounded-lg animate-pulse" />
//               : <Combobox items={apItems} value={depId} onChange={setDepId} placeholder="Dep airport" />
//             }
//           </div>
//           <div className="flex items-center self-end pb-1.5">
//             <ArrowRight size={16} className="text-slate-300" />
//           </div>
//           <div className="w-52 shrink-0">
//             <label className="block text-[10px] font-bold text-textsecondary uppercase tracking-wider mb-1.5">Destination</label>
//             {loadingData
//               ? <div className="h-9 bg-slate-100 rounded-lg animate-pulse" />
//               : <Combobox items={apItems} value={destId} onChange={setDestId} placeholder="Dest airport" />
//             }
//           </div>

//           <div className="flex gap-2 flex-wrap ml-auto self-end">
//             <button
//               onClick={handleSuggest}
//               disabled={!canSuggest || suggesting}
//               className="flex items-center gap-1.5 px-3.5 py-2 text-xs font-bold rounded-lg border border-primary/40 text-primary hover:bg-primary/5 disabled:opacity-40 disabled:cursor-not-allowed transition"
//             >
//               {suggesting ? <Loader2 size={13} className="animate-spin" /> : <Sparkles size={13} />}
//               Auto-Suggest
//             </button>
//             <button
//               onClick={clearAll}
//               className="flex items-center gap-1.5 px-3.5 py-2 text-xs font-bold rounded-lg border border-borderc text-textsecondary hover:border-red-300 hover:text-red-500 transition"
//             >
//               <RefreshCw size={13} /> Clear
//             </button>
//           </div>
//         </div>
//       </Card>

//       <div className="grid grid-cols-1 lg:grid-cols-5 gap-5">
//         {/* Left: Waypoint editor */}
//         <div className="lg:col-span-2 space-y-4">
//           <Card>
//             <div className="flex items-center justify-between mb-3">
//               <h2 className="font-bold text-textprimary text-sm flex items-center gap-2">
//                 <MapPin size={14} className="text-primary" />
//                 Waypoints
//                 <span className="ml-1 text-[10px] bg-slate-100 text-textsecondary px-1.5 py-0.5 rounded-full font-bold">
//                   {waypoints.length}
//                 </span>
//               </h2>
//             </div>

//             {/* Waypoint list */}
//             <div className="space-y-1.5 min-h-[60px]">
//               {waypoints.length === 0 ? (
//                 <div className="flex flex-col items-center justify-center py-8 text-center">
//                   <Navigation size={20} className="text-slate-300 mb-2" />
//                   <p className="text-xs text-textsecondary">No waypoints yet.</p>
//                   <p className="text-xs text-slate-400">Select departure & destination above.</p>
//                 </div>
//               ) : (
//                 waypoints.map((wp, idx) => (
//                   <div
//                     key={`${wp.id}-${idx}`}
//                     className={`flex items-center gap-2.5 rounded-lg px-3 py-2.5 group transition ${
//                       wp.kind === 'airport'
//                         ? 'bg-primary/5 border border-primary/15'
//                         : 'bg-slate-50 border border-slate-100'
//                     }`}
//                   >
//                     <GripVertical size={13} className="text-slate-300 shrink-0" />
//                     <div className={`w-6 h-6 rounded-md flex items-center justify-center text-white text-[9px] font-black shrink-0 ${wp.kind === 'airport' ? 'bg-primary' : 'bg-cyan-500'}`}>
//                       {idx + 1}
//                     </div>
//                     <div className="flex-1 min-w-0">
//                       <p className="text-xs font-black text-textprimary font-mono leading-tight">{wp.ident}</p>
//                       <p className="text-[10px] text-textsecondary truncate leading-tight">{wp.name}</p>
//                     </div>
//                     <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full uppercase ${wp.kind === 'airport' ? 'bg-primary/10 text-primary' : 'bg-cyan-50 text-cyan-600'}`}>
//                       {wp.kind === 'airport' ? 'APT' : 'FIX'}
//                     </span>
//                     {/* Only allow removing intermediate fixes, not dep/dest airports */}
//                     {(wp.kind === 'fix' || (wp.kind === 'airport' && idx !== 0 && idx !== waypoints.length - 1)) && (
//                       <button
//                         onClick={() => removeWaypoint(idx)}
//                         className="opacity-0 group-hover:opacity-100 text-slate-400 hover:text-red-500 transition"
//                       >
//                         <X size={13} />
//                       </button>
//                     )}
//                   </div>
//                 ))
//               )}
//             </div>

//             {/* Fix search */}
//             <div ref={searchRef} className="relative mt-3">
//               <div className="flex items-center gap-2 border border-dashed border-borderc rounded-lg px-3 py-2.5 focus-within:border-primary transition">
//                 <Search size={13} className="text-slate-400 shrink-0" />
//                 <input
//                   type="text"
//                   value={searchQuery}
//                   onChange={e => setSearchQuery(e.target.value)}
//                   placeholder="Search & add a fix / navpoint…"
//                   className="flex-1 text-xs outline-none bg-transparent text-textprimary placeholder:text-slate-400"
//                 />
//                 {searching && <Loader2 size={12} className="text-primary animate-spin shrink-0" />}
//               </div>

//               {searchResults.length > 0 && (
//                 <div className="absolute z-50 top-full mt-1 left-0 right-0 bg-white border border-borderc rounded-xl shadow-lg overflow-hidden max-h-48 overflow-y-auto">
//                   {searchResults.map(np => (
//                     <button
//                       key={np.id}
//                       onClick={() => addFix(np)}
//                       className="w-full text-left px-3 py-2.5 hover:bg-slate-50 transition flex items-center gap-3 border-b border-slate-50 last:border-0"
//                     >
//                       <div className="w-6 h-6 rounded bg-cyan-100 flex items-center justify-center shrink-0">
//                         <MapPin size={11} className="text-cyan-600" />
//                       </div>
//                       <div className="flex-1 min-w-0">
//                         <p className="text-xs font-black text-textprimary font-mono">{np.ident}</p>
//                         <p className="text-[10px] text-textsecondary truncate">{np.name ?? np.type}</p>
//                       </div>
//                       <span className="text-[9px] text-slate-400 font-mono shrink-0">{np.country}</span>
//                     </button>
//                   ))}
//                 </div>
//               )}
//             </div>
//           </Card>

//           {/* Action buttons */}
//           <Card className="!p-4 space-y-2.5">
//             <button
//               onClick={handleCalcNavlog}
//               disabled={!canNavlog || navlogLoading}
//               className="w-full flex items-center justify-center gap-2 py-2.5 bg-slate-900 hover:bg-slate-800 disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-bold rounded-xl transition"
//             >
//               {navlogLoading
//                 ? <><Loader2 size={15} className="animate-spin" /> Computing…</>
//                 : <><BarChart3 size={15} /> Calculate Navlog</>
//               }
//             </button>
//             {!acId && (
//               <p className="text-[10px] text-textsecondary text-center">Select an aircraft to calculate navlog</p>
//             )}
//             <button
//               onClick={handleSendToOfp}
//               disabled={!canSendToOfp}
//               className="w-full flex items-center justify-center gap-2 py-2.5 bg-primary hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-bold rounded-xl transition"
//             >
//               <Send size={15} /> Send to OFP Generator
//             </button>
//           </Card>
//         </div>

//         {/* Right: Map + Navlog */}
//         <div className="lg:col-span-3 space-y-4">
//           {/* SVG Route Map */}
//           <Card className={`!p-3 ${isFullscreen ? 'fixed inset-4 z-[9999] flex flex-col' : ''}`}>
//             <div className="flex items-center justify-between mb-2">
//               <h2 className="font-bold text-textprimary text-sm flex items-center gap-2">
//                 <Navigation size={14} className="text-primary" /> Route Map
//               </h2>
//               <div className="flex items-center gap-2">
//                 {waypoints.length >= 2 && (
//                   <span className="text-[10px] text-textsecondary bg-slate-50 px-2 py-0.5 rounded-full border border-borderc mr-2">
//                     {waypoints[0].ident} → {waypoints[waypoints.length - 1].ident}
//                   </span>
//                 )}
//                 <button
//                   onClick={() => setIsFullscreen(!isFullscreen)}
//                   className="p-1 hover:bg-slate-100 rounded text-slate-500 transition"
//                   title="Toggle Fullscreen"
//                 >
//                   {isFullscreen ? <X size={16} /> : <span className="text-xs font-bold leading-none select-none">⛶</span>}
//                 </button>
//               </div>
//             </div>
//             <RouteMap
//               waypoints={waypoints}
//               totalNm={totalNm}
//               allAirports={apList}
//               allNavpoints={allNavpoints}
//               setDepId={setDepId}
//               setDestId={setDestId}
//               depId={depId}
//               destId={destId}
//               addFix={addFix}
//               isFullscreen={isFullscreen}
//             />
//           </Card>

//           {/* Navlog table */}
//           {navlogError && (
//             <div className="flex items-center gap-2 bg-red-50 border border-red-200 text-red-600 rounded-xl px-4 py-3 text-sm">
//               <AlertTriangle size={15} className="shrink-0" /> {navlogError}
//             </div>
//           )}

//           {navlog && (
//             <Card>
//               <div className="flex items-center justify-between mb-3">
//                 <h2 className="font-bold text-textprimary text-sm flex items-center gap-2">
//                   <BarChart3 size={14} className="text-primary" /> Navlog
//                 </h2>
//                 <div className="flex gap-3 text-[10px] font-mono font-bold text-textsecondary">
//                   <span>📏 {navlog.totals.dist_nm} NM</span>
//                   <span>⏱ {navlog.totals.ete_hhmm}</span>
//                   <span>⛽ {navlog.totals.fuel_lb.toLocaleString()} lb</span>
//                 </div>
//               </div>

//               <div className="overflow-x-auto rounded-xl border border-slate-100">
//                 <table className="w-full text-[11px]">
//                   <thead>
//                     <tr className="bg-slate-50 text-textsecondary uppercase tracking-wider font-bold text-[10px] border-b border-slate-100">
//                       <th className="px-3 py-2.5 text-left">#</th>
//                       <th className="px-3 py-2.5 text-left">From</th>
//                       <th className="px-3 py-2.5 text-left">To</th>
//                       <th className="px-3 py-2.5 text-right">TRK°</th>
//                       <th className="px-3 py-2.5 text-right">Dist NM</th>
//                       <th className="px-3 py-2.5 text-right">ETE</th>
//                       <th className="px-3 py-2.5 text-right">Fuel lb</th>
//                       <th className="px-3 py-2.5 text-right">Fuel kg</th>
//                     </tr>
//                   </thead>
//                   <tbody className="divide-y divide-slate-50">
//                     {navlog.legs.map((leg, i) => (
//                       <tr key={i} className="hover:bg-slate-50/50 transition">
//                         <td className="px-3 py-2 text-textsecondary">{i + 1}</td>
//                         <td className="px-3 py-2 font-mono font-black text-textprimary">{leg.from_ident}</td>
//                         <td className="px-3 py-2 font-mono font-black text-textprimary">{leg.to_ident}</td>
//                         <td className="px-3 py-2 text-right font-mono text-slate-600">{leg.track_deg}°</td>
//                         <td className="px-3 py-2 text-right font-mono text-slate-600">{leg.dist_nm}</td>
//                         <td className="px-3 py-2 text-right font-mono text-slate-600">{leg.ete_hhmm}</td>
//                         <td className="px-3 py-2 text-right font-mono font-semibold text-textprimary">{leg.fuel_lb.toLocaleString()}</td>
//                         <td className="px-3 py-2 text-right font-mono text-textsecondary">{leg.fuel_kg.toLocaleString()}</td>
//                       </tr>
//                     ))}
//                     {/* Totals */}
//                     <tr className="bg-slate-900 text-white font-bold">
//                       <td className="px-3 py-2.5 text-xs" colSpan={4}>TOTALS — {navlog.aircraft.registration}</td>
//                       <td className="px-3 py-2.5 text-right font-mono text-xs">{navlog.totals.dist_nm}</td>
//                       <td className="px-3 py-2.5 text-right font-mono text-xs">{navlog.totals.ete_hhmm}</td>
//                       <td className="px-3 py-2.5 text-right font-mono text-xs text-green-400">{navlog.totals.fuel_lb.toLocaleString()}</td>
//                       <td className="px-3 py-2.5 text-right font-mono text-xs text-slate-300">{navlog.totals.fuel_kg.toLocaleString()}</td>
//                     </tr>
//                   </tbody>
//                 </table>
//               </div>

//               <div className="mt-3 flex items-center gap-1.5 text-[10px] text-textsecondary">
//                 <CheckCircle2 size={11} className="text-green-500" />
//                 {navlog.note}
//               </div>
//             </Card>
//           )}
//         </div>
//       </div>
//     </div>
//   )
// }
