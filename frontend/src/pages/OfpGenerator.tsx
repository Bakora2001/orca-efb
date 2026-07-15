import { useState, useEffect } from 'react'
import {
  FileText, Download, Plane, MapPin, Thermometer, Fuel,
  Calendar, Clock, Loader2, CheckCircle2, AlertTriangle,
  ChevronRight, Wind, Weight, ArrowRight, Info, ToggleLeft, ToggleRight
} from 'lucide-react'
import {
  aircraft as aircraftApi, airports as airportsApi, payload as payloadApi,
  briefing, getToken, BASE_URL,
  type ApiAircraft, type ApiAirport, type OfpInput, type PayloadResult
} from '../lib/api'
import Combobox, { type ComboItem } from '../components/ui/Combobox'
import Card from '../components/ui/Card'

// ─── Helpers ──────────────────────────────────────────────────────
const fmtKg = (v: number | null | undefined) =>
  v == null ? '—' : `${Math.round(v).toLocaleString()} kg`
const fmtLb = (v: number | null | undefined) =>
  v == null ? '—' : `${Math.round(v).toLocaleString()} lb`

function SummaryCard({ label, value, sub, highlight }: {
  label: string; value: string; sub?: string; highlight?: boolean
}) {
  return (
    <div className={`rounded-xl border p-4 ${highlight ? 'border-primary/40 bg-primary/5' : 'border-borderc bg-white'}`}>
      <p className="text-[10px] font-bold text-textsecondary uppercase tracking-wider mb-1">{label}</p>
      <p className={`text-lg font-black font-mono leading-tight ${highlight ? 'text-primary' : 'text-textprimary'}`}>{value}</p>
      {sub && <p className="text-[10px] text-textsecondary mt-0.5">{sub}</p>}
    </div>
  )
}

// ─── Component ────────────────────────────────────────────────────
export default function OfpGenerator() {
  // Data lists
  const [acList, setAcList] = useState<ApiAircraft[]>([])
  const [apList, setApList] = useState<ApiAirport[]>([])
  const [loadingData, setLoadingData] = useState(true)

  // Form fields
  const [acId, setAcId]       = useState('')
  const [depId, setDepId]     = useState('')
  const [destId, setDestId]   = useState('')
  const [altId, setAltId]     = useState('')
  const [alt2Id, setAlt2Id]   = useState('')
  const [oat, setOat]         = useState<string>('25')
  const [flap, setFlap]       = useState('auto')
  const [depDate, setDepDate] = useState('')
  const [depTime, setDepTime] = useState('')
  const [extraFuel, setExtraFuel]   = useState<string>('0')
  const [reserveMin, setReserveMin] = useState<string>('')
  const [includeWx, setIncludeWx]   = useState(true)

  // Preview payload
  const [previewLoading, setPreviewLoading] = useState(false)
  const [previewData, setPreviewData] = useState<PayloadResult | null>(null)
  const [previewError, setPreviewError] = useState<string | null>(null)

  // OFP download
  const [generating, setGenerating] = useState(false)
  const [genError, setGenError]   = useState<string | null>(null)
  const [genSuccess, setGenSuccess] = useState(false)

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

  // Auto-set OAT from ISA deviation when departure airport changes
  useEffect(() => {
    if (!depId) return
    const ap = apList.find(a => a.id === depId)
    if (!ap || ap.elevation_ft == null) return
    // ISA sea-level temp = 15°C, lapse rate = 1.98°C per 1000ft
    const isaOat = Math.round(15 - (ap.elevation_ft / 1000) * 1.98)
    setOat(String(isaOat))
  }, [depId, apList])


  // Combobox item builders
  const acItems: ComboItem[] = acList.map(a => ({
    id: a.id,
    label: `${a.registration} — ${a.type}`,
    sub: a.manufacturer ?? undefined,
  }))
  const apItems: ComboItem[] = apList.map(a => ({
    id: a.id,
    label: a.name,
    sub: `${a.icao}${a.city ? ' · ' + a.city : ''}`,
  }))

  // Dynamic flap list from selected aircraft
  const acObj = acList.find(a => a.id === acId)
  const availableFlaps: string[] = acObj?.flaps ?? []

  // Auto-compute payload preview when all required fields are set
  useEffect(() => {
    if (!acId || !depId || !destId || !oat) {
      setPreviewData(null)
      return
    }
    const oatNum = parseFloat(oat)
    if (isNaN(oatNum)) return

    setPreviewLoading(true)
    setPreviewError(null)

    payloadApi.calculate({
      aircraft_id: acId,
      dep_id: depId,
      dest_id: destId,
      alt_id: altId || undefined,
      oat: oatNum,
      flap: flap === 'auto' ? undefined : flap,
      extra_fuel_lb: extraFuel ? parseFloat(extraFuel) : 0,
      reserve_min: reserveMin ? parseFloat(reserveMin) : undefined,
    })
      .then(data => setPreviewData(data))
      .catch(err => setPreviewError(err.message || 'Preview failed'))
      .finally(() => setPreviewLoading(false))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [acId, depId, destId, altId, oat, flap, extraFuel, reserveMin])

  const depAp   = apList.find(a => a.id === depId)
  const destAp  = apList.find(a => a.id === destId)
  const canGen  = !!(acId && depId && destId && oat)

  async function handleGenerate() {
    if (!canGen) return
    setGenerating(true)
    setGenError(null)
    setGenSuccess(false)

    const body: OfpInput = {
      aircraft_id: acId,
      waypoints: [
        { kind: 'airport', id: depId },
        { kind: 'airport', id: destId },
      ],
      alt_id:   altId  || null,
      alt2_id:  alt2Id || null,
      oat:      parseFloat(oat),
      flap:     flap,
      dep_date: depDate || null,
      dep_time: depTime || null,
      extra_fuel_lb: extraFuel ? parseFloat(extraFuel) : 0,
      reserve_min:   reserveMin ? parseFloat(reserveMin) : null,
      include_weather: includeWx,
    }

    try {
      const token = getToken()
      const res = await fetch(`${BASE_URL}${briefing.ofpUrl}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        credentials: 'include',
        body: JSON.stringify(body),
      })

      if (!res.ok) {
        const err = await res.json().catch(() => ({ message: 'Unknown error' }))
        throw new Error(err.message || `Server error ${res.status}`)
      }

      const blob = await res.blob()
      const url  = URL.createObjectURL(blob)
      const a    = document.createElement('a')
      a.href = url
      const dep  = depAp?.icao  ?? 'DEP'
      const dest = destAp?.icao ?? 'DEST'
      const date = (depDate || new Date().toISOString().slice(0, 10)).replace(/-/g, '')
      a.download = `OFP_${dep}_${dest}_${date}.pdf`
      document.body.appendChild(a)
      a.click()
      URL.revokeObjectURL(url)
      document.body.removeChild(a)
      setGenSuccess(true)
    } catch (err: any) {
      setGenError(err.message || 'Failed to generate OFP')
    } finally {
      setGenerating(false)
    }
  }

  // ── Render ─────────────────────────────────────────────────────
  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-2xl">📋</span>
            <h1 className="text-2xl font-bold text-textprimary">OFP Generator</h1>
          </div>
          <p className="text-textsecondary text-sm">
            Generate a complete Operational Flight Plan PDF — navlog, weights, fuel, weather.
          </p>
        </div>
        <button
          id="ofp-generate-btn"
          onClick={handleGenerate}
          disabled={!canGen || generating}
          className="flex items-center gap-2 bg-primary hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed text-white font-semibold rounded-xl px-5 py-2.5 transition shadow-sm w-fit"
        >
          {generating ? <Loader2 size={16} className="animate-spin" /> : <Download size={16} />}
          {generating ? 'Generating…' : 'Generate & Download OFP'}
        </button>
      </div>

      {/* Error / Success banners */}
      {genError && (
        <div className="flex items-center gap-2 bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-3 text-sm">
          <AlertTriangle size={16} className="shrink-0" />
          {genError}
        </div>
      )}
      {genSuccess && (
        <div className="flex items-center gap-2 bg-green-50 border border-green-200 text-green-700 rounded-xl px-4 py-3 text-sm">
          <CheckCircle2 size={16} className="shrink-0" />
          OFP PDF downloaded successfully!
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-5">
        {/* ── Left: Form ──────────────────────────────────────── */}
        <div className="lg:col-span-2 space-y-4">

          {/* Aircraft & Route */}
          <Card>
            <h2 className="font-bold text-textprimary text-sm mb-4 flex items-center gap-2">
              <Plane size={15} className="text-primary" /> Aircraft & Route
            </h2>
            <div className="space-y-3.5">
              <div>
                <label className="block text-xs font-bold text-textsecondary mb-1.5 uppercase tracking-wider">Aircraft</label>
                {loadingData
                  ? <div className="h-10 bg-slate-100 rounded-lg animate-pulse" />
                  : <Combobox items={acItems} value={acId} onChange={setAcId} placeholder="Select aircraft" />
                }
              </div>
              <div>
                <label className="block text-xs font-bold text-textsecondary mb-1.5 uppercase tracking-wider">Departure</label>
                {loadingData
                  ? <div className="h-10 bg-slate-100 rounded-lg animate-pulse" />
                  : <Combobox items={apItems} value={depId} onChange={setDepId} placeholder="Select departure airport" />
                }
              </div>
              <div>
                <label className="block text-xs font-bold text-textsecondary mb-1.5 uppercase tracking-wider">Destination</label>
                {loadingData
                  ? <div className="h-10 bg-slate-100 rounded-lg animate-pulse" />
                  : <Combobox items={apItems} value={destId} onChange={setDestId} placeholder="Select destination airport" />
                }
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-textsecondary mb-1.5 uppercase tracking-wider">Alternate 1</label>
                  {loadingData
                    ? <div className="h-10 bg-slate-100 rounded-lg animate-pulse" />
                    : <Combobox items={apItems} value={altId} onChange={setAltId} placeholder="Optional" emptyOption="None" />
                  }
                </div>
                <div>
                  <label className="block text-xs font-bold text-textsecondary mb-1.5 uppercase tracking-wider">Alternate 2</label>
                  {loadingData
                    ? <div className="h-10 bg-slate-100 rounded-lg animate-pulse" />
                    : <Combobox items={apItems} value={alt2Id} onChange={setAlt2Id} placeholder="Optional" emptyOption="None" />
                  }
                </div>
              </div>
            </div>
          </Card>

          {/* Flight Conditions */}
          <Card>
            <h2 className="font-bold text-textprimary text-sm mb-4 flex items-center gap-2">
              <Thermometer size={15} className="text-primary" /> Flight Conditions
            </h2>
            <div className="space-y-3.5">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-textsecondary mb-1.5 uppercase tracking-wider">OAT °C</label>
                  <input
                    id="ofp-oat"
                    type="number"
                    value={oat}
                    onChange={e => setOat(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-lg border border-borderc bg-white text-sm font-semibold text-textprimary focus:border-primary focus:ring-2 focus:ring-primary/15 outline-none transition"
                    placeholder="25"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-textsecondary mb-1.5 uppercase tracking-wider">Take-off Flap</label>
                  <select
                    value={flap}
                    onChange={e => setFlap(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-lg border border-borderc bg-white text-sm font-semibold text-textprimary focus:border-primary focus:ring-2 focus:ring-primary/15 outline-none transition"
                  >
                    <option value="auto">Auto — best flap</option>
                    {availableFlaps.map(f => (
                      <option key={f} value={f}>Flap {f}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-textsecondary mb-1.5 uppercase tracking-wider flex items-center gap-1">
                    <Calendar size={11} /> Dep Date
                  </label>
                  <input
                    type="date"
                    value={depDate}
                    onChange={e => setDepDate(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-lg border border-borderc bg-white text-sm font-semibold text-textprimary focus:border-primary focus:ring-2 focus:ring-primary/15 outline-none transition"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-textsecondary mb-1.5 uppercase tracking-wider flex items-center gap-1">
                    <Clock size={11} /> Dep Time (UTC)
                  </label>
                  <input
                    type="time"
                    value={depTime}
                    onChange={e => setDepTime(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-lg border border-borderc bg-white text-sm font-semibold text-textprimary focus:border-primary focus:ring-2 focus:ring-primary/15 outline-none transition"
                  />
                </div>
              </div>
            </div>
          </Card>

          {/* Fuel & Reserve */}
          <Card>
            <h2 className="font-bold text-textprimary text-sm mb-4 flex items-center gap-2">
              <Fuel size={15} className="text-primary" /> Fuel & Reserve
            </h2>
            <div className="space-y-3.5">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-textsecondary mb-1.5 uppercase tracking-wider">Extra Fuel (lb)</label>
                  <input
                    type="number"
                    value={extraFuel}
                    onChange={e => setExtraFuel(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-lg border border-borderc bg-white text-sm font-semibold text-textprimary focus:border-primary focus:ring-2 focus:ring-primary/15 outline-none transition"
                    placeholder="0"
                    min="0"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-textsecondary mb-1.5 uppercase tracking-wider">Reserve (min)</label>
                  <input
                    type="number"
                    value={reserveMin}
                    onChange={e => setReserveMin(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-lg border border-borderc bg-white text-sm font-semibold text-textprimary focus:border-primary focus:ring-2 focus:ring-primary/15 outline-none transition"
                    placeholder="Default"
                    min="0"
                  />
                </div>
              </div>

              {/* Weather toggle */}
              <button
                type="button"
                onClick={() => setIncludeWx(v => !v)}
                className="flex items-center justify-between w-full group"
              >
                <div className="flex items-center gap-2">
                  <Wind size={14} className="text-textsecondary" />
                  <span className="text-sm font-semibold text-textprimary">Include Weather (METAR / TAF)</span>
                </div>
                {includeWx
                  ? <ToggleRight size={24} className="text-primary" />
                  : <ToggleLeft size={24} className="text-slate-300" />
                }
              </button>
            </div>
          </Card>
        </div>

        {/* ── Right: Preview ──────────────────────────────────── */}
        <div className="lg:col-span-3 space-y-4">

          {/* Route summary strip */}
          {(depAp || destAp) && (
            <Card className="!p-4">
              <div className="flex items-center gap-3 text-sm font-bold text-textprimary">
                {depAp && (
                  <div className="flex items-center gap-1.5">
                    <span className="text-lg">{depAp.icao}</span>
                    <span className="text-[10px] text-textsecondary font-medium leading-tight max-w-[120px] truncate">{depAp.name}</span>
                  </div>
                )}
                {depAp && destAp && <ArrowRight size={16} className="text-slate-400 shrink-0" />}
                {destAp && (
                  <div className="flex items-center gap-1.5">
                    <span className="text-lg">{destAp.icao}</span>
                    <span className="text-[10px] text-textsecondary font-medium leading-tight max-w-[120px] truncate">{destAp.name}</span>
                  </div>
                )}
              </div>
            </Card>
          )}

          {/* Payload / Weight preview */}
          <Card>
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-bold text-textprimary text-sm flex items-center gap-2">
                <Weight size={15} className="text-primary" /> Pre-flight Summary
              </h2>
              {previewLoading && <Loader2 size={15} className="text-primary animate-spin" />}
            </div>

            {!acId || !depId || !destId ? (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <div className="w-14 h-14 rounded-full bg-slate-100 flex items-center justify-center mb-3">
                  <Info size={22} className="text-slate-300" />
                </div>
                <p className="text-sm font-semibold text-textsecondary">Select aircraft, departure and destination</p>
                <p className="text-xs text-slate-400 mt-1">A pre-flight weight and fuel summary will appear here.</p>
              </div>
            ) : previewError ? (
              <div className="flex items-center gap-2 bg-red-50 border border-red-200 text-red-600 rounded-xl px-4 py-3 text-sm">
                <AlertTriangle size={15} className="shrink-0" />
                {previewError}
              </div>
            ) : previewData ? (
              <div className="space-y-4">
                {/* Weight summary cards */}
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  <SummaryCard label="RTOW" value={fmtKg(previewData.rtow_kg)} sub={`Factor: ${previewData.limiting_factor}`} highlight />
                  <SummaryCard label="TOW" value={fmtKg(previewData.tow_kg)} />
                  <SummaryCard label="Max Payload" value={fmtKg(previewData.max_payload_kg)} />
                  <SummaryCard label="ZFW" value={fmtKg(previewData.zfw_kg)} />
                  <SummaryCard label="Trip Dist" value={`${previewData.trip_nm} NM`} />
                  <SummaryCard label="Max Pax" value={String(previewData.max_pax)} />
                </div>

                {/* Fuel breakdown */}
                <div className="bg-slate-50 rounded-xl p-4">
                  <p className="text-[10px] font-bold text-textsecondary uppercase tracking-wider mb-3">Fuel Plan</p>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-y-2 gap-x-4 text-sm">
                    {[
                      ['Trip', fmtLb(previewData.fuel?.trip_lb)],
                      ['Alternate', fmtLb(previewData.fuel?.alt_lb)],
                      ['Contingency', fmtLb(previewData.fuel?.cont_lb)],
                      ['Reserve', fmtLb(previewData.fuel?.reserve_lb)],
                      ['Extra', fmtLb(previewData.fuel?.extra_lb)],
                    ].map(([label, val]) => (
                      <div key={label} className="flex justify-between items-center border-b border-slate-100 pb-1">
                        <span className="text-textsecondary text-xs">{label}</span>
                        <span className="font-mono font-semibold text-textprimary text-xs">{val}</span>
                      </div>
                    ))}
                    <div className="flex justify-between items-center col-span-2 sm:col-span-3 pt-1">
                      <span className="text-xs font-bold text-textprimary">Total FOB</span>
                      <span className="font-mono font-black text-primary text-sm">{fmtLb(previewData.fuel?.total_lb)} <span className="text-textsecondary font-normal text-xs">({fmtKg(previewData.fuel?.total_kg)})</span></span>
                    </div>
                  </div>
                </div>

                {previewData.fuel_exceeded && (
                  <div className="flex items-center gap-2 bg-amber-50 border border-amber-200 text-amber-700 rounded-xl px-4 py-3 text-sm">
                    <AlertTriangle size={15} className="shrink-0" />
                    Fuel exceeds max tank capacity by {fmtKg(previewData.fuel_over_by_kg)}
                  </div>
                )}
              </div>
            ) : previewLoading ? (
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {Array.from({ length: 6 }).map((_, i) => (
                  <div key={i} className="h-16 bg-slate-100 rounded-xl animate-pulse" />
                ))}
              </div>
            ) : null}
          </Card>

          {/* OFP sections checklist */}
          <Card>
            <h2 className="font-bold text-textprimary text-sm mb-4 flex items-center gap-2">
              <FileText size={15} className="text-primary" /> OFP Contents
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {[
                { label: 'Flight Information Block', always: true },
                { label: 'Weights & Fuel Summary', always: true },
                { label: 'Leg-by-Leg Navlog', always: true },
                { label: 'Aerodrome Brief — Dep', always: !!depId },
                { label: 'Aerodrome Brief — Dest', always: !!destId },
                { label: 'Aerodrome Brief — Alternate', always: !!altId },
                { label: 'METAR / TAF Weather', always: includeWx },
              ].map(({ label, always }) => (
                <div key={label} className={`flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-medium ${always ? 'bg-green-50 text-green-700' : 'bg-slate-50 text-slate-400 line-through'}`}>
                  <CheckCircle2 size={13} className={always ? 'text-green-500' : 'text-slate-300'} />
                  {label}
                </div>
              ))}
            </div>

            <p className="mt-4 text-[10px] text-slate-400 flex items-start gap-1.5">
              <Info size={11} className="mt-0.5 shrink-0" />
              Review-only. Data must be validated against approved AFM/AIP before operational use.
            </p>
          </Card>
        </div>
      </div>
    </div>
  )
}
