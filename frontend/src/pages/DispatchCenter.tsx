import { useState, useEffect, useRef, useCallback } from 'react'
import {
  Save, Play, AlertTriangle, CheckCircle2, Plane,
  Loader2, Search, X, WifiOff, ChevronDown, RefreshCw
} from 'lucide-react'
import Card from '../components/ui/Card'
import {
  aircraft as aircraftApi,
  airports as airportsApi,
  payload as payloadApi,
  compute as computeApi,
  weather as weatherApi,
  type ApiAircraft,
  type ApiAirport,
  type PayloadResult,
  type ComputeResult,
  type WeatherResult
} from '../lib/api'
import Combobox, { type ComboItem } from '../components/ui/Combobox'

// ─── Haversine distance (NM) ─────────────────────────────────────────────────
function gcNm(lat1: number, lon1: number, lat2: number, lon2: number) {
  const R = 3440.065
  const toR = (d: number) => d * Math.PI / 180
  const dp = toR(lat2 - lat1), dl = toR(lon2 - lon1)
  const h = Math.sin(dp / 2) ** 2 + Math.cos(toR(lat1)) * Math.cos(toR(lat2)) * Math.sin(dl / 2) ** 2
  return Math.round(2 * R * Math.asin(Math.sqrt(h)))
}

// ─── METAR parser helpers ─────────────────────────────────────────────────────
function parseMetar(raw: string) {
  const wind  = raw.match(/(\d{3}|VRB)(\d{2,3})(G\d{2,3})?KT/)
  const cloud = raw.match(/(FEW|SCT|BKN|OVC)\d{3}|CAVOK/)
  const temp  = raw.match(/\s(M?\d{2})\/(M?\d{2})\s/)
  const qnh   = raw.match(/ Q(\d{4})/)
  const vis   = raw.match(/\s(\d{4}|CAVOK|\d+SM)\s/)

  const windStr  = wind ? `${wind[1]}/${wind[2]}${wind[3] ? 'G' + wind[3].slice(1) : ''} kt` : '—'
  const cloudStr = cloud ? cloud[0] : 'CAVOK'
  const tempStr  = temp ? temp[1].replace('M', '-') + '°C' : '—'
  const qnhStr   = qnh ? qnh[1] + ' hPa' : '—'
  const visStr   = vis ? vis[1] : cloud?.[0] === 'CAVOK' ? 'CAVOK' : '—'

  const oatNum = temp ? (() => {
    const t = parseInt(temp[1].replace('M', ''))
    return temp[1].startsWith('M') ? -t : t
  })() : null

  const qnhNum = qnh ? parseInt(qnh[1]) : null

  return { windStr, cloudStr, tempStr, qnhStr, visStr, oatNum, qnhNum }
}

function MetarChip({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col items-center bg-slate-50 border border-borderc rounded-lg px-3 py-2 min-w-[72px]">
      <span className="text-[8px] font-bold text-textsecondary uppercase tracking-widest mb-0.5">{label}</span>
      <span className="font-mono font-bold text-textprimary text-xs leading-tight">{value}</span>
    </div>
  )
}

// ─── Section header ───────────────────────────────────────────────────────────
function SecNum({ num }: { num: number }) {
  return (
    <span className="w-5 h-5 rounded-full bg-primary text-white text-[10px] font-black flex items-center justify-center shrink-0">{num}</span>
  )
}
function Sec({ num, title, right }: { num: number; title: string; right?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between pb-2 mb-4 border-b border-slate-100">
      <div className="flex items-center gap-2">
        <SecNum num={num} />
        <span className="text-xs font-bold text-textprimary tracking-wide">{title}</span>
      </div>
      {right}
    </div>
  )
}

// ─── Weight row ───────────────────────────────────────────────────────────────
function TR({ icon, label, kg, bold, pending }: { icon?: string; label: string; kg: number | null; bold?: boolean; pending?: boolean }) {
  const KG_TO_LB = 2.20462
  const displayKg = kg ?? 0
  return (
    <div className={`grid grid-cols-12 items-center text-xs last:border-0 ${bold ? 'py-2.5 font-bold bg-slate-50/50 -mx-4 px-4 border-t border-b border-slate-100' : 'py-2 border-b border-slate-50'}`}>
      <span className={`col-span-6 flex items-center gap-2 ${bold ? 'text-textprimary font-black' : 'text-slate-600'}`}>
        {icon && <span className="text-xs">{icon}</span>}
        {label}
        {pending && <span className="text-[8px] bg-amber-100 text-amber-600 px-1 rounded font-bold">ESTIMATE</span>}
      </span>
      <span className={`col-span-3 text-right font-mono font-bold ${bold ? 'text-textprimary' : 'text-slate-700'}`}>
        {displayKg.toLocaleString()}
      </span>
      <span className={`col-span-3 text-right font-mono ${bold ? 'text-textprimary font-black' : 'text-textsecondary'}`}>
        {Math.round(displayKg * KG_TO_LB).toLocaleString()}
      </span>
    </div>
  )
}

// ─── Save-to-localStorage draft key ──────────────────────────────────────────
const DRAFT_KEY = 'orca_dispatch_draft'

interface Draft {
  selectedAircraft: string
  departure: string
  destination: string
  alternate: string
  oat: number | ''
  qnh: number | ''
  flap: string
  paxCount: number | ''
  cargo: number | ''
  fuel: number | ''
  savedAt: string
}

// ─── Main component ───────────────────────────────────────────────────────────
export default function DispatchCenter() {
  const [aircraftList, setAircraftList] = useState<ApiAircraft[]>([])
  const [airportsList, setAirportsList] = useState<ApiAirport[]>([])
  const [loadingSetup, setLoadingSetup] = useState(true)

  const [selectedAircraft, setSelectedAircraft] = useState('')
  const [departure, setDeparture]   = useState('')
  const [destination, setDestination] = useState('')
  const [alternate, setAlternate]   = useState('')

  const [weatherData, setWeatherData] = useState<WeatherResult | null>(null)
  const [wxLoading, setWxLoading]   = useState(false)
  const [wxError, setWxError]       = useState<string | null>(null)

  const [oat,      setOat]      = useState<number | ''>('')
  const [qnh,      setQnh]      = useState<number | ''>('')
  const [flap,     setFlap]     = useState('10°')
  const [paxCount, setPaxCount] = useState<number | ''>('')
  const [cargo,    setCargo]    = useState<number | ''>('')
  const [fuel,     setFuel]     = useState<number | ''>('')

  const [loading,    setLoading]    = useState(false)
  const [error,      setError]      = useState<string | null>(null)
  const [payloadRes, setPayloadRes] = useState<PayloadResult | null>(null)
  const [computeRes, setComputeRes] = useState<ComputeResult | null>(null)

  const [savedAt, setSavedAt] = useState<string | null>(null)

  // Flag to suppress auto-fill when restoring a saved draft
  const isRestoringDraft = useRef(false)

  // ── Load DB data on mount ────────────────────────────────────────────────
  useEffect(() => {
    async function loadData() {
      try {
        const [ac, ap] = await Promise.all([aircraftApi.list(), airportsApi.list()])
        const activeAc = ac.filter(a => a.is_active)
        const activeAp = ap.filter(a => a.is_active)

        setAircraftList(activeAc)
        setAirportsList(activeAp)

        // Try restoring a saved draft first
        const raw = localStorage.getItem(DRAFT_KEY)
        if (raw) {
          try {
            const draft: Draft = JSON.parse(raw)
            if (activeAc.find(a => a.id === draft.selectedAircraft)) {
              isRestoringDraft.current = true
              setSelectedAircraft(draft.selectedAircraft)
            } else if (activeAc.length > 0) {
              setSelectedAircraft(activeAc[0].id)
            }
            if (activeAp.find(a => a.id === draft.departure))    setDeparture(draft.departure)
            if (activeAp.find(a => a.id === draft.destination))  setDestination(draft.destination)
            if (activeAp.find(a => a.id === draft.alternate))    setAlternate(draft.alternate)
            setOat(draft.oat); setQnh(draft.qnh); setFlap(draft.flap)
            setPaxCount(draft.paxCount); setCargo(draft.cargo); setFuel(draft.fuel)
            setSavedAt(draft.savedAt)
            // Allow React to flush, then clear the flag so future aircraft changes auto-fill
            setTimeout(() => { isRestoringDraft.current = false }, 0)
            return
          } catch { /* corrupt draft, fall through */ }
        }

        // We intentionally do not auto-fill default aircraft or airports here
        // so that the user starts with a clean slate unless they have a draft.
      } catch (err) {
        console.error('Failed to load reference data', err)
      } finally {
        setLoadingSetup(false)
      }
    }
    loadData()
  }, [])

  // ── Auto-fill limits when aircraft changes ──────────────────────────────
  useEffect(() => {
    if (!selectedAircraft) return
    if (isRestoringDraft.current) return  // don't overwrite draft values
    const ac = aircraftList.find(a => a.id === selectedAircraft)
    if (!ac) return

    // Set pax to max_pax
    if (ac.max_pax != null) setPaxCount(ac.max_pax)
    // Pre-fill fuel to maximum fuel capacity
    if (ac.max_fuel_kg != null) setFuel(ac.max_fuel_kg)
    // Reset flap to first available setting from DB
    if (ac.flaps && ac.flaps.length > 0) setFlap(String(ac.flaps[0]))
    // Clear previous analysis results since aircraft changed
    setPayloadRes(null)
    setComputeRes(null)
    setError(null)
  }, [selectedAircraft, aircraftList])

  // ── Auto-fetch weather when departure changes ────────────────────────────
  useEffect(() => {
    const ap = airportsList.find(a => a.id === departure)
    if (!ap?.icao) return
    setWxLoading(true)
    setWxError(null)
    weatherApi.get(ap.icao)
      .then(wx => {
        setWeatherData(wx)
        const p = parseMetar(wx.metar)
        if (p.oatNum !== null) setOat(p.oatNum)
        if (p.qnhNum !== null) setQnh(p.qnhNum)
      })
      .catch(err => {
        setWeatherData(null)
        setWxError(err.message || 'Weather fetch failed')
      })
      .finally(() => setWxLoading(false))
  }, [departure, airportsList])

  // ── Save Draft ───────────────────────────────────────────────────────────
  const saveDraft = useCallback(() => {
    const ts = new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
    const draft: Draft = {
      selectedAircraft, departure, destination, alternate,
      oat, qnh, flap, paxCount, cargo, fuel,
      savedAt: ts
    }
    localStorage.setItem(DRAFT_KEY, JSON.stringify(draft))
    setSavedAt(ts)
  }, [selectedAircraft, departure, destination, alternate, oat, qnh, flap, paxCount, cargo, fuel])

  // ── Run Analysis ─────────────────────────────────────────────────────────
  const runAnalysis = async () => {
    if (!selectedAircraft || !departure || !destination) {
      setError('Select aircraft, departure and destination first.')
      return
    }
    setLoading(true)
    setError(null)
    try {
      const oatNum  = Number(oat)  || 0
      const [payloadData, computeData] = await Promise.all([
        payloadApi.calculate({
          aircraft_id: selectedAircraft, dep_id: departure, dest_id: destination,
          alt_id: alternate || undefined, oat: oatNum, flap: String(flap),
          pax: Number(paxCount) || 0, cargo_kg: Number(cargo) || 0, fuel_kg: Number(fuel) || 0
        }),
        computeApi.rtow({ aircraft_id: selectedAircraft, airport_id: departure, oat: oatNum, flap: String(flap) })
      ])
      setPayloadRes(payloadData)
      setComputeRes(computeData)
    } catch (err: any) {
      setError(err.message || 'Analysis failed')
    } finally {
      setLoading(false)
    }
  }

  // ── Derived refs ─────────────────────────────────────────────────────────
  const acRef   = aircraftList.find(a => a.id === selectedAircraft)
  const depRef  = airportsList.find(a => a.id === departure)
  const destRef = airportsList.find(a => a.id === destination)
  const altRef  = airportsList.find(a => a.id === alternate)
  const KG_TO_LB = 2.20462

  // Live route distance (Haversine) — no need to wait for Run Analysis
  const routeDistNm = (depRef?.lat && depRef?.lon && destRef?.lat && destRef?.lon)
    ? gcNm(depRef.lat, depRef.lon, destRef.lat, destRef.lon)
    : null

  // Live weight estimate before Run Analysis
  // Note: pg returns NUMERIC columns as strings, so we must parse with Number()
  const bewKg  = Number(acRef?.bew_kg) || 0
  const safeNum = (v: number | string | '') => (v === '' || v == null) ? 0 : Number(v)
  const paxKg  = safeNum(paxCount) * 100       // 100 kg std pax+bag
  const estTow = bewKg + paxKg + safeNum(cargo) + safeNum(fuel)

  // Post-analysis actuals
  const rtow    = Number(computeRes?.rtow_kg) || 0
  const towKg   = payloadRes ? Number(payloadRes.tow_kg) : estTow
  const zfwKg   = payloadRes ? Number(payloadRes.zfw_kg) : (bewKg + paxKg + safeNum(cargo))
  const margin  = rtow - towKg
  const approved = payloadRes && computeRes && margin >= 0

  // Combobox item builders
  const acItems: ComboItem[] = aircraftList.map(a => ({ id: a.id, label: a.registration, sub: a.type || undefined }))
  const apItems: ComboItem[] = airportsList.map(a => ({ id: a.id, label: a.icao, sub: a.name || undefined }))

  const parsed = weatherData ? parseMetar(weatherData.metar) : null
  const wxIcon = parsed?.oatNum != null
    ? (parsed.oatNum > 25 ? '☀️' : parsed.oatNum > 10 ? '⛅' : parsed.oatNum > 0 ? '🌥️' : '❄️')
    : '⛅'

  // ── Derived limits for inputs ────────────────────────────────────────────
  const maxPax     = acRef?.max_pax != null ? Number(acRef.max_pax) : undefined
  // Max cargo = MZFW - BEW - pax weight (rough structural ceiling)
  const maxCargoKg = (acRef?.mzfw_kg != null && acRef?.bew_kg != null)
    ? Math.max(0, Number(acRef.mzfw_kg) - Number(acRef.bew_kg) - safeNum(paxCount) * 100)
    : undefined


  return (
    <div className="space-y-6 max-w-7xl mx-auto">

      {/* ── Page Header (no clock — Topbar already has it) ── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-2 border-b border-borderc">
        <div>
          <h1 className="text-2xl font-bold text-textprimary tracking-tight">Dispatch Center</h1>
          <p className="text-textsecondary text-sm mt-0.5">Create and manage dispatch operations</p>
        </div>
        <div className="flex items-center gap-2 text-xs">
          {savedAt && (
            <span className="text-[10px] text-textsecondary bg-slate-100 px-2 py-1 rounded-lg">
              Draft saved {savedAt}
            </span>
          )}
        </div>
      </div>

      {/* ── Dispatch Meta Bar ── */}
      <Card className="p-4">
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-5 gap-3 mb-4">
          {/* Aircraft */}
          <div>
            <p className="text-[9px] font-bold text-textsecondary uppercase tracking-wider mb-1.5">Aircraft</p>
            {loadingSetup
              ? <div className="h-8 bg-slate-100 rounded-xl animate-pulse" />
              : <Combobox items={acItems} value={selectedAircraft} onChange={setSelectedAircraft} placeholder="Select aircraft" />}
          </div>
          {/* Departure */}
          <div>
            <p className="text-[9px] font-bold text-textsecondary uppercase tracking-wider mb-1.5">Departure</p>
            {loadingSetup
              ? <div className="h-8 bg-slate-100 rounded-xl animate-pulse" />
              : <Combobox items={apItems} value={departure} onChange={id => { setDeparture(id); setPayloadRes(null); setComputeRes(null) }} placeholder="Select airport" />}
          </div>
          {/* Destination */}
          <div>
            <p className="text-[9px] font-bold text-textsecondary uppercase tracking-wider mb-1.5">Destination</p>
            {loadingSetup
              ? <div className="h-8 bg-slate-100 rounded-xl animate-pulse" />
              : <Combobox items={apItems} value={destination} onChange={id => { setDestination(id); setPayloadRes(null); setComputeRes(null) }} placeholder="Select airport" />}
          </div>
          {/* Alternate */}
          <div>
            <p className="text-[9px] font-bold text-textsecondary uppercase tracking-wider mb-1.5">Alternate</p>
            {loadingSetup
              ? <div className="h-8 bg-slate-100 rounded-xl animate-pulse" />
              : <Combobox items={apItems} value={alternate} onChange={setAlternate} placeholder="None" emptyOption="None (no alternate)" />}
          </div>
          {/* Actions */}
          <div className="col-span-2 sm:col-span-4 lg:col-span-1 flex flex-row lg:flex-col justify-end gap-2 lg:justify-center">
            <button
              onClick={saveDraft}
              disabled={loadingSetup}
              className="flex items-center gap-1.5 py-2 px-3 rounded-xl border border-borderc bg-white text-xs font-bold text-textsecondary hover:bg-slate-50 hover:border-slate-300 transition disabled:opacity-40"
            >
              <Save size={13} />
              {savedAt ? 'Re-save' : 'Save Draft'}
            </button>
            <button
              onClick={runAnalysis}
              disabled={loading || loadingSetup || !departure || !destination || !selectedAircraft}
              className="flex items-center gap-1.5 py-2 px-4 bg-primary hover:bg-primary-dark text-white rounded-xl text-xs font-bold shadow-md hover:shadow-lg transition disabled:opacity-50"
            >
              {loading ? <Loader2 size={13} className="animate-spin" /> : <Play size={13} fill="white" />}
              Run Analysis
            </button>
          </div>
        </div>
      </Card>

      {error && (
        <div className="bg-red-50 border border-red-200 text-danger p-3 rounded-xl text-xs font-bold flex items-center gap-2">
          <AlertTriangle size={16} />{error}
        </div>
      )}

     {/* ── Main 2-col layout ── */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">

        {/* ─── LEFT: Flight / Route + Weather ─── */}
        <div className="lg:col-span-7 space-y-6">

          {/* ① Flight / Route */}
          <Card className="p-6">
            <Sec num={1} title="Flight / Route" />

            <div className="grid grid-cols-1 sm:grid-cols-12 gap-5 items-start mb-5">
              {/* Aircraft svg badge */}
              <div className="sm:col-span-4 flex flex-col items-center gap-2">
                <div className="bg-slate-50 border border-slate-100 rounded-xl p-3 w-full flex items-center justify-center shadow-sm">
                  <svg viewBox="0 0 120 55" className="w-full h-14">
                    <g transform="translate(8,4)">
                      <path d="M 5 26 C 5 20 16 17 32 17 L 86 17 C 96 17 103 21 103 26 C 103 32 96 36 86 36 L 32 36 C 16 36 5 32 5 26 Z" fill="#C8D5EE" stroke="#A0B4D4" strokeWidth=".8"/>
                      <path d="M 96 17 L 103 7 L 106 7 L 100 17" fill="#B0C2DE" stroke="#A0B4D4" strokeWidth=".5"/>
                      <path d="M 36 26 L 20 47 L 22 49 L 52 33 L 62 33 L 84 50 L 86 48 L 66 26 Z" fill="#A8BCDC" stroke="#8EAAC8" strokeWidth=".6"/>
                      <ellipse cx="34" cy="48" rx="8" ry="3" fill="#7A8EA6"/>
                      <ellipse cx="76" cy="50" rx="7" ry="2.5" fill="#7A8EA6"/>
                    </g>
                  </svg>
                </div>
                <p className="text-sm font-black font-mono text-textprimary">{acRef?.registration || '—'}</p>
                <p className="text-[10px] text-textsecondary font-bold">{acRef?.type || '—'}</p>
              </div>

              {/* Route legs */}
              <div className="sm:col-span-8 space-y-3">
                {[
                  { label: 'Departure', ref: depRef, color: 'text-primary' },
                  { label: 'Destination', ref: destRef, color: 'text-danger' },
                  { label: 'Alternate', ref: altRef, color: 'text-warning' },
                ].map(({ label, ref: apRef, color }) => (
                  <div key={label} className="flex items-start justify-between pb-3 border-b border-slate-100 last:border-0 last:pb-0">
                    <div>
                      <span className="text-[9px] font-bold text-textsecondary uppercase tracking-wider block mb-0.5">{label}</span>
                      {apRef ? (
                        <div className="flex items-baseline gap-2 flex-wrap">
                          <span className={`text-base font-black font-mono leading-none ${color}`}>{apRef.icao}</span>
                          <span className="text-[11px] text-textsecondary">{apRef.name}</span>
                        </div>
                      ) : (
                        <span className="text-xs text-slate-400 italic">Not selected</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Route distance banner — computes live from lat/lon */}
            <div className="bg-slate-50 border border-slate-100 rounded-xl p-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 text-xs">
              <div className="flex items-center gap-2">
                <Plane size={13} className="text-primary" />
                <span className="font-semibold text-textprimary">
                  {depRef?.icao || '—'} → {destRef?.icao || '—'}
                </span>
                <span className="text-textsecondary">(Route Distance)</span>
              </div>
              <span className="font-black text-primary font-mono text-sm">
                {payloadRes && payloadRes.trip_nm != null
                  ? `${Number(payloadRes.trip_nm || 0).toLocaleString()} NM`
                  : routeDistNm != null
                    ? `≈ ${Number(routeDistNm || 0).toLocaleString()} NM`
                    : '— NM'}
              </span>
            </div>
          </Card>

          {/* ② Weather */}
          <Card className="p-6">
            <Sec num={2}
              title={`Weather at Departure${depRef ? ` (${depRef.icao})` : ''}`}
              right={
                <span className="text-[9px] font-black text-primary bg-blue-50 border border-blue-100 px-2 py-0.5 rounded uppercase tracking-wider">
                  LIVE METAR
                </span>
              }
            />

            {wxLoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 size={22} className="animate-spin text-primary" />
              </div>
            ) : weatherData && !wxError ? (
              <div className="space-y-4">
                {/* Big temp + wx icon */}
                <div className="flex flex-col sm:flex-row items-start gap-5">
                  <div className="flex items-center gap-3 pr-5 sm:border-r border-slate-100 shrink-0">
                    <span className="text-4xl">{wxIcon}</span>
                    <div>
                      <h3 className="text-3xl font-black text-textprimary leading-none">{parsed?.tempStr || `${oat}°C`}</h3>
                      <span className="text-[10px] text-textsecondary font-bold uppercase tracking-wider">OAT</span>
                    </div>
                  </div>

                  {/* Chip row */}
                  <div className="flex flex-wrap gap-2">
                    <MetarChip label="Wind"  value={parsed?.windStr  || '—'} />
                    <MetarChip label="Vis"   value={parsed?.visStr   || '—'} />
                    <MetarChip label="Cloud" value={parsed?.cloudStr || '—'} />
                    <MetarChip label="QNH"   value={parsed?.qnhStr  || '—'} />
                  </div>
                </div>

                {/* Raw METAR string */}
                <div>
                  <p className="text-[9px] font-bold text-textsecondary uppercase tracking-wider mb-1">Raw METAR</p>
                  <p className="text-[10px] font-mono text-slate-600 bg-slate-50 border border-borderc p-3 rounded-xl break-all leading-relaxed">
                    {weatherData.metar}
                  </p>
                </div>

                {/* TAF if available */}
                {weatherData.taf && (
                  <div>
                    <p className="text-[9px] font-bold text-textsecondary uppercase tracking-wider mb-1">TAF</p>
                    <p className="text-[10px] font-mono text-textsecondary bg-slate-50 border border-borderc p-3 rounded-xl break-all leading-relaxed line-clamp-4">
                      {weatherData.taf}
                    </p>
                  </div>
                )}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-8 gap-3">
                <WifiOff size={26} className="text-slate-300" />
                <p className="text-sm font-semibold text-textsecondary">
                  {wxError || (depRef ? `METAR for ${depRef.icao} unavailable` : 'Select a departure airport')}
                </p>
                {depRef && wxError && (
                  <button
                    onClick={() => {
                      setWxError(null)
                      setWxLoading(true)
                      weatherApi.get(depRef.icao)
                        .then(wx => { setWeatherData(wx); const p = parseMetar(wx.metar); if (p.oatNum !== null) setOat(p.oatNum); if (p.qnhNum !== null) setQnh(p.qnhNum) })
                        .catch(e => setWxError(e.message))
                        .finally(() => setWxLoading(false))
                    }}
                    className="flex items-center gap-1.5 text-xs font-bold text-primary hover:underline"
                  >
                    <RefreshCw size={12} /> Retry
                  </button>
                )}
              </div>
            )}
          </Card>
        </div>

        {/* ─── RIGHT: Conditions + Weights + Results ─── */}
        <div className="lg:col-span-5 space-y-6">

            {/* ③ Conditions */}
          <Card className="p-6">
            <Sec num={3} title="Conditions & Parameters" />
            <div className="grid grid-cols-3 gap-3 mb-4">
              {[
                { label: 'OAT (°C)', val: oat, set: setOat, min: -60, max: 60 },
                { label: 'QNH (hPa)', val: qnh, set: setQnh, min: 850, max: 1100 },
              ].map(f => (
                <div key={f.label}>
                  <label className="block text-[9px] font-bold text-textsecondary uppercase tracking-wider mb-1">{f.label}</label>
                  {loadingSetup ? (
                    <div className="h-8 bg-slate-100 rounded-lg animate-pulse" />
                  ) : (
                    <input
                      className="w-full px-2 py-1.5 rounded-lg border border-borderc text-xs font-semibold text-textprimary focus:border-primary outline-none transition"
                      type="number"
                      min={f.min}
                      max={f.max}
                      value={f.val}
                      onChange={e => f.set(e.target.value === '' ? '' : Number(e.target.value))}
                    />
                  )}
                </div>
              ))}
              <div>
                <label className="block text-[9px] font-bold text-textsecondary uppercase tracking-wider mb-1">Flap Setting</label>
                {loadingSetup ? (
                  <div className="h-8 bg-slate-100 rounded-lg animate-pulse" />
                ) : (
                  <select
                    className="w-full px-2 py-1.5 rounded-lg border border-borderc text-xs font-semibold text-textprimary focus:border-primary outline-none transition"
                    value={flap}
                    onChange={e => setFlap(e.target.value)}
                  >
                    {acRef?.flaps && acRef.flaps.length > 0 ? (
                      acRef.flaps.map(f => (
                        <option key={f} value={String(f)}>Flap {f}°</option>
                      ))
                    ) : (
                      // Fallback if no aircraft selected
                      <option value="">— select aircraft —</option>
                    )}
                  </select>
                )}
              </div>
            </div>

            {/* Pax / Cargo / Fuel with smart limits */}
            <div className="grid grid-cols-3 gap-3 pt-3 border-t border-slate-100">
              {/* Passengers */}
              <div>
                <label className="block text-[9px] font-bold text-textsecondary uppercase tracking-wider mb-1">Passengers</label>
                {loadingSetup ? (
                  <div className="h-8 bg-slate-100 rounded-lg animate-pulse" />
                ) : (
                  <>
                    <input
                      className={`w-full px-2 py-1.5 rounded-lg border text-xs font-semibold text-textprimary focus:border-primary outline-none transition ${
                        maxPax != null && safeNum(paxCount) > maxPax
                          ? 'border-danger bg-red-50'
                          : 'border-borderc'
                      }`}
                      type="number"
                      min={0}
                      max={maxPax}
                      value={paxCount}
                      onChange={e => {
                        const v = e.target.value === '' ? '' : Number(e.target.value)
                        if (typeof v === 'number' && maxPax != null && v > maxPax) return
                        setPaxCount(v)
                      }}
                    />
                    {maxPax != null && (
                      <p className="text-[9px] text-textsecondary mt-0.5 font-mono">max {maxPax} pax</p>
                    )}
                  </>
                )}
              </div>

              {/* Cargo */}
              <div>
                <label className="block text-[9px] font-bold text-textsecondary uppercase tracking-wider mb-1">Cargo (kg)</label>
                {loadingSetup ? (
                  <div className="h-8 bg-slate-100 rounded-lg animate-pulse" />
                ) : (
                  <>
                    <input
                      className={`w-full px-2 py-1.5 rounded-lg border text-xs font-semibold text-textprimary focus:border-primary outline-none transition ${
                        maxCargoKg != null && safeNum(cargo) > maxCargoKg
                          ? 'border-warning bg-amber-50'
                          : 'border-borderc'
                      }`}
                      type="number"
                      min={0}
                      value={cargo}
                      onChange={e => setCargo(e.target.value === '' ? '' : Number(e.target.value))}
                    />
                    {maxCargoKg != null && (
                      <p className="text-[9px] text-textsecondary mt-0.5 font-mono">≤ {maxCargoKg.toLocaleString()} kg est.</p>
                    )}
                  </>
                )}
              </div>

              {/* Fuel */}
              <div>
                <label className="block text-[9px] font-bold text-textsecondary uppercase tracking-wider mb-1">Fuel (kg)</label>
                {loadingSetup ? (
                  <div className="h-8 bg-slate-100 rounded-lg animate-pulse" />
                ) : (
                  <input
                    className="w-full px-2 py-1.5 rounded-lg border border-borderc text-xs font-semibold text-textprimary focus:border-primary outline-none transition"
                    type="number"
                    min={0}
                    value={fuel}
                    onChange={e => setFuel(e.target.value === '' ? '' : Number(e.target.value))}
                  />
                )}
              </div>
            </div>
          </Card>

          {/* ④ Weights — always shown with live estimates */}
          <Card className="p-6">
            <Sec num={4} title="Weights & Payload" right={
              !payloadRes
                ? <span className="text-[9px] bg-amber-50 text-amber-600 border border-amber-200 px-2 py-0.5 rounded font-bold uppercase tracking-wider">Pre-flight Estimate</span>
                : <span className="text-[9px] bg-emerald-50 text-emerald-600 border border-emerald-200 px-2 py-0.5 rounded font-bold uppercase tracking-wider">Actual (Analysis)</span>
            }>
            </Sec>
            <div className="grid grid-cols-12 pb-1.5 border-b border-slate-100 mb-1">
              <div className="col-span-6" />
              <div className="col-span-3 text-[9px] font-bold text-textsecondary uppercase text-right tracking-wider">kg</div>
              <div className="col-span-3 text-[9px] font-bold text-textsecondary uppercase text-right tracking-wider">lb</div>
            </div>
            <TR icon="🏗" label="Basic Empty Weight" kg={bewKg} />
            <TR icon="👥" label="Passengers" kg={paxKg} pending={!payloadRes} />
            <TR icon="📦" label="Cargo" kg={safeNum(cargo)} />
            <TR icon="⛽" label="Fuel (Total)" kg={safeNum(fuel)} />
            <TR icon="✈" label="Takeoff Weight" kg={payloadRes?.tow_kg ?? estTow} bold pending={!payloadRes} />
            <TR icon="⚖" label="Zero Fuel Weight" kg={payloadRes?.zfw_kg ?? (bewKg + paxKg + safeNum(cargo))} />
            {payloadRes && <TR icon="🛬" label="Landing Weight" kg={payloadRes.ldw_kg ?? null} />}
          </Card>

          {/* ⑤ Fuel Summary — after analysis only */}
          {payloadRes && (
            <Card className="p-6">
              <Sec num={5} title="Fuel Summary" />
              <div className="grid grid-cols-12 pb-1.5 border-b border-slate-100 mb-1">
                <div className="col-span-6 text-[9px] font-bold text-textsecondary uppercase tracking-wider">Component</div>
                <div className="col-span-3 text-[9px] font-bold text-textsecondary uppercase tracking-wider text-right">kg</div>
                <div className="col-span-3 text-[9px] font-bold text-textsecondary uppercase tracking-wider text-right">lb</div>
              </div>
              {[
                { l: 'Trip Fuel',           lb: payloadRes.fuel?.trip_lb },
                { l: 'Alternate Fuel',      lb: payloadRes.fuel?.alt_lb },
                { l: 'Contingency (5%)',    lb: payloadRes.fuel?.cont_lb },
                { l: 'Final Reserve (45m)', lb: payloadRes.fuel?.reserve_lb },
                { l: 'Extra / Tankering',   lb: payloadRes.fuel?.extra_lb },
                { l: 'TOTAL FUEL',          lb: payloadRes.fuel?.total_lb, bold: true },
              ].map(r => {
                const kg = Math.round(Number(r.lb || 0) * 0.453592)
                return (
                  <div key={r.l} className={`grid grid-cols-12 items-center text-xs ${r.bold ? 'py-2.5 font-bold bg-slate-50/50 -mx-4 px-4 border-t border-b border-slate-100' : 'py-2 border-b border-slate-50'}`}>
                    <span className={`col-span-6 ${r.bold ? 'text-textprimary font-black' : 'text-slate-600'}`}>{r.l}</span>
                    <span className={`col-span-3 text-right font-mono font-bold ${r.bold ? 'text-textprimary' : 'text-slate-700'}`}>{kg.toLocaleString()}</span>
                    <span className={`col-span-3 text-right font-mono ${r.bold ? 'font-black text-textprimary' : 'text-textsecondary'}`}>{Number(r.lb || 0).toLocaleString()}</span>
                  </div>
                )
              })}
              {payloadRes.fuel_exceeded && (
                <div className="mt-3 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-xs font-semibold flex items-start gap-2">
                  <span className="mt-0.5 text-red-600 font-bold">⚠</span>
                  <div>
                    WARNING: Maximum fuel capacity exceeded by {Number(payloadRes.fuel_over_by_kg || 0).toLocaleString()} kg.
                    Maximum allowed is {Number(payloadRes.max_fuel_kg || 0).toLocaleString()} kg.
                  </div>
                </div>
              )}
            </Card>
          )}

          {/* ⑥ Dispatch Result — after analysis only */}
          {computeRes && payloadRes && (
            <Card className="p-6">
              <Sec num={6} title="Dispatch Result" />
              <div className="grid grid-cols-2 gap-3 mb-4">
                <div className="bg-slate-50 border border-slate-100 rounded-xl p-3">
                  <span className="text-[9px] font-bold text-textsecondary uppercase tracking-wider block mb-1">RTOW (Flap {flap}°)</span>
                  <span className="text-sm font-black font-mono text-textprimary">{rtow.toLocaleString()} kg</span>
                  <span className="text-[9px] text-textsecondary font-mono block mt-0.5">{Math.round(rtow * KG_TO_LB).toLocaleString()} lb</span>
                </div>
                <div className="bg-slate-50 border border-slate-100 rounded-xl p-3">
                  <span className="text-[9px] font-bold text-textsecondary uppercase tracking-wider block mb-1">Limiting Factor</span>
                <span className="text-xs font-black text-primary">{computeRes.factor || 'N/A'}</span>
                </div>
              </div>
              {approved ? (
                <div className="bg-gradient-to-br from-emerald-50 to-emerald-100/60 border border-emerald-200 rounded-xl p-4 text-center">
                  <CheckCircle2 size={22} className="text-emerald-500 mx-auto mb-1.5" />
                  <h3 className="text-lg font-black text-emerald-600 tracking-wider">APPROVED</h3>
                  <p className="text-[11px] text-textsecondary mt-1 font-semibold">
                    TOW {Number(towKg || 0).toLocaleString()} kg — Margin +{Number(margin || 0).toLocaleString()} kg
                  </p>
                </div>
              ) : (
                <div className="bg-gradient-to-br from-red-50 to-red-100/60 border border-red-200 rounded-xl p-4 text-center">
                  <AlertTriangle size={22} className="text-red-500 mx-auto mb-1.5" />
                  <h3 className="text-lg font-black text-red-600 tracking-wider">EXCEEDS LIMITS</h3>
                  <p className="text-[11px] text-red-700 mt-1 font-semibold">
                    TOW exceeds RTOW by {Math.abs(Number(margin || 0)).toLocaleString()} kg. Reduce payload or fuel.
                  </p>
                </div>
              )}
            </Card>
          )}
        </div>
      </div>

      {/* ── Weight Summary Table — wide, after analysis ── */}
      {payloadRes && computeRes && (
        <Card className="p-6">
          <h2 className="text-sm font-bold text-textprimary mb-4 pb-2 border-b border-slate-100 flex items-center gap-2">
            <SecNum num={7} /> Weight Summary
          </h2>
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left border-collapse min-w-[700px]">
              <thead>
                <tr className="text-[10px] uppercase tracking-wider font-semibold text-textsecondary border-b border-slate-100">
                  <th className="pb-3">TOW</th>
                  <th className="pb-3">Landing Weight</th>
                  <th className="pb-3">ZFW</th>
                  <th className="pb-3">WAT Limit</th>
                  <th className="pb-3">RTOW</th>
                  <th className="pb-3">Margin</th>
                  <th className="pb-3">Limiting Factor</th>
                </tr>
              </thead>
              <tbody>
                <tr className="hover:bg-slate-50/50 transition">
                  <td className="py-3 pr-4">
                    <div className="font-black font-mono text-sm text-textprimary">{Number(payloadRes.tow_kg || 0).toLocaleString()} kg</div>
                    <div className="text-[10px] font-mono text-textsecondary">{Math.round(Number(payloadRes.tow_kg || 0) * KG_TO_LB).toLocaleString()} lb</div>
                    {Number(payloadRes.tow_kg) > (Number(acRef?.mtow_kg) || Infinity) && (
                      <div className="text-[10px] text-danger font-bold mt-1">↑ Exceeds MTOW</div>
                    )}
                  </td>
                  <td className="py-3 pr-4">
                    <div className="font-black font-mono text-sm text-textprimary">{Number(payloadRes.ldw_kg || 0).toLocaleString()} kg</div>
                    <div className="text-[10px] font-mono text-textsecondary">{Math.round(Number(payloadRes.ldw_kg || 0) * KG_TO_LB).toLocaleString()} lb</div>
                    {Number(payloadRes.ldw_kg || 0) > (Number(acRef?.mlw_kg) || Infinity) && (
                      <div className="text-[10px] text-danger font-bold mt-1">↑ Exceeds MLW</div>
                    )}
                  </td>
                  <td className="py-3 pr-4">
                    <div className="font-bold font-mono text-sm text-textprimary">{Number(payloadRes.zfw_kg || 0).toLocaleString()} kg</div>
                    <div className="text-[10px] font-mono text-textsecondary">{Math.round(Number(payloadRes.zfw_kg || 0) * KG_TO_LB).toLocaleString()} lb</div>
                  </td>
                  <td className="py-3 pr-4">
                    <div className="font-bold font-mono text-sm text-slate-600">{Number(computeRes.detail?.wat_kg || 0).toLocaleString()} kg</div>
                    <div className="text-[10px] font-mono text-textsecondary">{Math.round(Number(computeRes.detail?.wat_kg || 0) * KG_TO_LB).toLocaleString()} lb</div>
                  </td>
                  <td className="py-3 pr-4">
                    <div className="font-bold font-mono text-sm text-slate-600">{rtow.toLocaleString()} kg</div>
                    <div className="text-[10px] font-mono text-textsecondary">{Math.round(rtow * KG_TO_LB).toLocaleString()} lb</div>
                  </td>
                  <td className="py-3 pr-4">
                    <div className={`font-bold font-mono text-sm ${approved ? 'text-success' : 'text-danger'}`}>
                      {margin > 0 ? '+' : ''}{margin.toLocaleString()} kg
                    </div>
                  </td>
                  <td className="py-3">
                    <span className="text-xs font-bold text-primary">{computeRes.factor}</span>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  )
}
