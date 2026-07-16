import { useState, useEffect } from 'react'
import {
  FileText, Download, Play, Shield, AlertTriangle, Activity, Plane, TrendingDown
} from 'lucide-react'
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer, ReferenceLine, Dot
} from 'recharts'
import { aircraft as aircraftApi, airports as airportsApi, performanceReport, getToken, BASE_URL } from '../lib/api'
import type { ApiAirport } from '../lib/api'
import Combobox from '../components/ui/Combobox'
import Card from '../components/ui/Card'
import PerformanceChartModal, { type ChartModalParams } from '../components/ui/PerformanceChartModal'

// ── Types ─────────────────────────────────────────────────────────────
interface ReportRow {
  airport_id: string
  airport: string
  icao: string
  elev_ft: number | null
  rwy_m: number | null
  surface: string | null
  oat_c: number
  structural_kg: number | null
  wat_kg: number | null
  wat_flap: string | null
  toda_kg: number | null
  asda_kg: number | null
  rtow_kg: number
  factor: string
  field_tables_ready: boolean
  error?: string
}

interface ReportData {
  aircraft: { id: string; reg: string; type: string; mtow_kg: number }
  flap: string
  temperatures: number[]
  rows: ReportRow[]
  note: string
}

// ── Chart tooltip component ────────────────────────────────────────────
function CustomTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null
  const fmt = (v: number | null | undefined) =>
    v == null ? '—' : `${Math.round(v).toLocaleString()} kg`
  return (
    <div className="bg-white border border-slate-200 rounded-xl shadow-xl p-3 text-[11px] min-w-[160px]">
      <p className="font-bold text-slate-700 mb-2">OAT: {label}°C</p>
      {payload.map((p: any) => (
        <div key={p.name} className="flex items-center justify-between gap-4 mb-0.5">
          <span className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full inline-block" style={{ background: p.color }} />
            <span className="text-slate-500">{p.name}</span>
          </span>
          <span className="font-mono font-bold" style={{ color: p.color }}>{fmt(p.value)}</span>
        </div>
      ))}
    </div>
  )
}

// ── Per-airport RTOW Chart ─────────────────────────────────────────────
function AirportChart({ rows, icao, airport, elev_ft, rwy_m, surface, aircraftId, flapSetting, onCellClick }: {
  rows: ReportRow[]
  icao: string
  airport: string
  elev_ft: number | null
  rwy_m: number | null
  surface: string | null
  aircraftId: string
  flapSetting: string
  onCellClick: (params: ChartModalParams) => void
}) {
  // Build chart data: one data point per temperature, each with WAT/TODA/ASDA/RTOW values
  const chartData = rows.map(r => ({
    oat: r.oat_c,
    WAT:       r.wat_kg   != null ? Math.round(r.wat_kg)   : null,
    TODA:      r.toda_kg  != null ? Math.round(r.toda_kg)  : null,
    ASDA:      r.asda_kg  != null ? Math.round(r.asda_kg)  : null,
    Governing: Math.round(r.rtow_kg),
    factor:    r.factor,
    wat_flap:  r.wat_flap,
  }))

  const hasField = rows.some(r => r.toda_kg != null || r.asda_kg != null)
  const mtow = rows[0] ? rows[0].structural_kg : null

  // Y-axis domain: min value rounded down 500, max = MTOW + 500
  const allValues = chartData.flatMap(d =>
    [d.WAT, d.TODA, d.ASDA, d.Governing, mtow].filter(v => v != null) as number[]
  )
  const yMin = allValues.length > 0 ? Math.floor((Math.min(...allValues) - 500) / 500) * 500 : 0
  const yMax = mtow != null ? Math.ceil((mtow + 500) / 1000) * 1000 : 30000

  const fmtKg = (v: number) => `${(v / 1000).toFixed(1)}t`

  return (
    <div className="mb-10">
      {/* Airport header */}
      <div className="flex items-start gap-2 mb-4">
        <Plane size={14} className="text-slate-400 mt-0.5 shrink-0" />
        <div>
          <h3 className="font-black text-textprimary text-sm">{airport} ({icao})</h3>
          <p className="text-xs text-textsecondary font-medium mt-0.5">
            Elevation {Math.round(elev_ft ?? 0)} ft
            {rwy_m ? ` · Runway ${Math.round(rwy_m)} m` : ''}
            {surface ? ` · ${surface}` : ''}
          </p>
        </div>
      </div>

      {/* RTOW Chart */}
      <div className="bg-slate-50 rounded-xl border border-slate-200 p-4 mb-4">
        <div className="flex items-center gap-2 mb-3">
          <TrendingDown size={14} className="text-primary" />
          <span className="text-xs font-bold text-textprimary">RTOW vs OAT</span>
          <span className="text-[10px] text-textsecondary font-medium ml-1">
            (weight reduces as temperature rises)
          </span>
        </div>

        <ResponsiveContainer width="100%" height={280}>
          <LineChart data={chartData} margin={{ top: 10, right: 20, left: 10, bottom: 10 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
            <XAxis
              dataKey="oat"
              label={{ value: 'OAT (°C)', position: 'insideBottom', offset: -4, fontSize: 10, fill: '#64748b' }}
              tickFormatter={v => `${v}°`}
              tick={{ fontSize: 10, fill: '#64748b' }}
            />
            <YAxis
              domain={[yMin, yMax]}
              tickFormatter={fmtKg}
              tick={{ fontSize: 10, fill: '#64748b' }}
              width={48}
              label={{ value: 'RTOW (tonnes)', angle: -90, position: 'insideLeft', offset: 10, fontSize: 10, fill: '#64748b' }}
            />
            <Tooltip content={<CustomTooltip />} />
            <Legend
              wrapperStyle={{ fontSize: 11, paddingTop: 8 }}
              iconType="circle"
              iconSize={8}
            />

            {/* MTOW structural reference line */}
            {mtow != null && (
              <ReferenceLine
                y={mtow}
                stroke="#22c55e"
                strokeDasharray="4 3"
                label={{ value: `MTOW ${fmtKg(mtow)}`, position: 'right', fontSize: 9, fill: '#22c55e' }}
              />
            )}

            {/* WAT limit */}
            <Line
              type="monotone"
              dataKey="WAT"
              name="WAT Limit"
              stroke="#2563eb"
              strokeWidth={2.5}
              dot={{ r: 4, fill: '#2563eb', strokeWidth: 0 }}
              activeDot={{ r: 6 }}
              connectNulls
            />

            {/* TODA limit */}
            {hasField && (
              <Line
                type="monotone"
                dataKey="TODA"
                name="TODA Limit"
                stroke="#f59e0b"
                strokeWidth={2}
                strokeDasharray="6 2"
                dot={{ r: 3, fill: '#f59e0b', strokeWidth: 0 }}
                activeDot={{ r: 5 }}
                connectNulls
              />
            )}

            {/* ASDA limit */}
            {hasField && (
              <Line
                type="monotone"
                dataKey="ASDA"
                name="ASDA Limit"
                stroke="#f97316"
                strokeWidth={2}
                strokeDasharray="2 4"
                dot={{ r: 3, fill: '#f97316', strokeWidth: 0 }}
                activeDot={{ r: 5 }}
                connectNulls
              />
            )}

            {/* Governing RTOW - bold line */}
            <Line
              type="monotone"
              dataKey="Governing"
              name="Governing RTOW"
              stroke="#7c3aed"
              strokeWidth={3}
              dot={(props: any) => {
                const { cx, cy, payload } = props
                const factorColors: Record<string, string> = {
                  WAT: '#2563eb', TODA: '#f59e0b', ASDA: '#f97316', STRUCT: '#22c55e'
                }
                const fill = factorColors[payload.factor] ?? '#7c3aed'
                return <Dot cx={cx} cy={cy} r={5} fill={fill} stroke="#fff" strokeWidth={1.5} />
              }}
              activeDot={{ r: 7 }}
            />
          </LineChart>
        </ResponsiveContainer>

        <p className="text-[9px] text-textsecondary text-center mt-2">
          Dot color indicates limiting factor: 
          <span className="text-blue-600 font-bold ml-1">● WAT</span>
          <span className="text-amber-500 font-bold ml-1">● TODA</span>
          <span className="text-orange-500 font-bold ml-1">● ASDA</span>
          <span className="text-emerald-600 font-bold ml-1">● Structural</span>
        </p>
      </div>

      {/* Data Table */}
      <div className="overflow-x-auto border border-slate-200 rounded-xl">
        <table className="w-full text-xs text-left border-collapse min-w-[640px]">
          <thead>
            <tr className="bg-slate-50 text-textsecondary text-[10px] uppercase tracking-wider font-bold border-b border-slate-200">
              <th className="px-4 py-3">OAT °C</th>
              <th className="px-4 py-3 text-right">WAT RTOW</th>
              <th className="px-4 py-3 text-right">TODA RTOW</th>
              <th className="px-4 py-3 text-right">ASDA RTOW</th>
              <th className="px-4 py-3 text-right bg-blue-50/60 text-primary">Governing</th>
              <th className="px-4 py-3 text-right">Limiting Factor</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.map((r: ReportRow, idx: number) => {
              const fmt = (v: number | null) =>
                v == null ? '—' : Math.round(v).toLocaleString() + ' kg'
              const isGoverning = (v: number | null) =>
                v != null && Math.abs(Math.round(v) - Math.round(r.rtow_kg)) < 10

              const cellParams = (focusTab: 'WAT' | 'TODA' | 'ASDA' | 'RTOW') => ({
                aircraft_id: aircraftId,
                airport_id: r.airport_id,
                oat: r.oat_c,
                flap: r.wat_flap || flapSetting,
                focusTab,
                rtow_kg: r.rtow_kg,
                wat_kg: r.wat_kg,
                toda_kg: r.toda_kg,
                asda_kg: r.asda_kg,
                structural_kg: r.structural_kg,
                factor: r.factor,
              })

              return (
                <tr key={idx} className="hover:bg-slate-50/50 transition">
                  <td className="px-4 py-2.5 font-bold text-slate-700">{r.oat_c}°C</td>
                  <td 
                    onClick={() => r.wat_kg != null && onCellClick(cellParams('WAT'))}
                    className={`px-4 py-2.5 text-right font-mono font-semibold select-none ${r.wat_kg != null ? 'cursor-pointer hover:underline hover:text-blue-600' : ''} ${isGoverning(r.wat_kg) ? 'text-primary font-black' : 'text-slate-600'}`}
                  >
                    {fmt(r.wat_kg)}{r.wat_flap ? ` F${r.wat_flap}` : ''}
                  </td>
                  <td 
                    onClick={() => r.toda_kg != null && onCellClick(cellParams('TODA'))}
                    className={`px-4 py-2.5 text-right font-mono font-semibold select-none ${r.toda_kg != null ? 'cursor-pointer hover:underline hover:text-amber-600' : ''} ${isGoverning(r.toda_kg) ? 'text-amber-600 font-black' : r.toda_kg == null ? 'text-slate-300' : 'text-slate-600'}`}
                  >
                    {fmt(r.toda_kg)}
                  </td>
                  <td 
                    onClick={() => r.asda_kg != null && onCellClick(cellParams('ASDA'))}
                    className={`px-4 py-2.5 text-right font-mono font-semibold select-none ${r.asda_kg != null ? 'cursor-pointer hover:underline hover:text-orange-600' : ''} ${isGoverning(r.asda_kg) ? 'text-orange-600 font-black' : r.asda_kg == null ? 'text-slate-300' : 'text-slate-600'}`}
                  >
                    {fmt(r.asda_kg)}
                  </td>
                  <td 
                    onClick={() => onCellClick(cellParams('RTOW'))}
                    className="px-4 py-2.5 text-right font-mono font-black text-primary bg-blue-50/30 cursor-pointer hover:underline hover:text-primary-dark select-none"
                  >
                    {fmt(r.rtow_kg)}
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    <span className={`px-2 py-0.5 text-[9px] font-black rounded-full uppercase tracking-wider ${
                      r.factor === 'WAT'    ? 'bg-blue-100 text-blue-700' :
                      r.factor === 'TODA'   ? 'bg-amber-100 text-amber-700' :
                      r.factor === 'ASDA'   ? 'bg-orange-100 text-orange-700' :
                      r.factor === 'STRUCT' ? 'bg-green-100 text-green-700' :
                      'bg-slate-100 text-slate-600'
                    }`}>
                      {r.factor}
                    </span>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ── Main Component ─────────────────────────────────────────────────────
export default function PerformanceAnalysis() {
  const [acList, setAcList] = useState<any[]>([])
  const [apList, setApList] = useState<ApiAirport[]>([])

  const [selectedAc, setSelectedAc] = useState<string>('')
  const [selectedApId, setSelectedApId] = useState<string>('')
  const [flap, setFlap] = useState<string>('auto')
  const [temps, setTemps] = useState<string>('20, 25, 30, 35, 40')

  const [loading, setLoading] = useState(false)
  const [reportData, setReportData] = useState<ReportData | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [activeChartParams, setActiveChartParams] = useState<ChartModalParams | null>(null)

  const acObj = acList.find(a => a.id === selectedAc)
  const availableFlaps: string[] = acObj?.flaps || []

  useEffect(() => {
    async function load() {
      try {
        const [acData, apData] = await Promise.all([
          aircraftApi.list(),
          airportsApi.list()
        ])
        if (Array.isArray(acData)) {
          setAcList(acData)
          if (acData.length > 0) setSelectedAc(acData[0].id)
        } else if ((acData as any)?.data) {
          const list = (acData as any).data
          setAcList(list)
          if (list.length > 0) setSelectedAc(list[0].id)
        }
        if (Array.isArray(apData)) {
          setApList(apData)
        } else if ((apData as any)?.data) {
          setApList((apData as any).data)
        }
      } catch (err) {
        console.error('Failed to load form data', err)
      }
    }
    load()
  }, [])

  const apComboItems = apList.map(ap => ({
    id: ap.id,
    label: `${ap.name} (${ap.icao || '---'})`,
    sub: ap.city || ap.country || undefined
  }))

  const selectedAp = apList.find(a => a.id === selectedApId) ?? null

  const handleGenerate = async () => {
    if (!selectedAc || !selectedApId) {
      setError('Please select an aircraft and an airport.')
      return
    }
    setError(null)
    setLoading(true)
    setReportData(null)

    try {
      const tList = temps.split(',').map(t => t.trim()).filter(Boolean).map(Number).filter(n => !isNaN(n))
      if (tList.length === 0) {
        setError('Please enter at least one valid temperature.')
        setLoading(false)
        return
      }

      const payload = {
        aircraft_id: selectedAc,
        airport_id:  selectedApId,
        flap,
        temps: tList
      }

      const data = await performanceReport.generate(payload)
      if (data && Array.isArray(data.rows) && data.rows.length > 0) {
        setReportData(data)
      } else {
        setError('Report returned no data. Check that performance tables are loaded for this aircraft.')
      }
    } catch (err: any) {
      setError(err.message || 'Error connecting to server.')
    } finally {
      setLoading(false)
    }
  }

  const handleDownloadPdf = async () => {
    if (!selectedAc || !selectedApId) return
    const tList = temps.split(',').map(t => t.trim()).filter(Boolean).map(Number)
    const payload = {
      aircraft_id: selectedAc,
      airport_id:  selectedApId,
      flap,
      temps: tList
    }

    try {
      const response = await fetch(`${BASE_URL}${performanceReport.downloadPdfUrl}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${getToken()}`
        },
        body: JSON.stringify(payload)
      })
      if (!response.ok) {
        const errJson = await response.json()
        throw new Error(errJson.error || 'PDF generation failed')
      }
      const blob = await response.blob()
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      const ac = acList.find(a => a.id === selectedAc)
      a.download = `Airport_Performance_Report_${ac?.registration || 'Unknown'}.pdf`
      document.body.appendChild(a)
      a.click()
      window.URL.revokeObjectURL(url)
      a.remove()
    } catch (err: any) {
      setError(err.message)
    }
  }

  // Group report rows by airport ICAO
  const airportGroups = reportData
    ? Object.values(
        (reportData.rows as ReportRow[]).reduce((acc: any, row: ReportRow) => {
          const key = row.icao || row.airport_id
          if (!acc[key]) acc[key] = { meta: row, rows: [] }
          acc[key].rows.push(row)
          return acc
        }, {})
      ) as Array<{ meta: ReportRow; rows: ReportRow[] }>
    : []

  return (
    <div className="space-y-6 max-w-[1200px] mx-auto px-1 sm:px-4 lg:px-6 py-2">

      {/* Title Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-2 border-b border-borderc">
        <div>
          <h1 className="text-2xl font-bold text-textprimary tracking-tight">Airport Performance Report</h1>
          <p className="text-textsecondary text-sm">Generate airport RTOW limitations by temperature. The report shows WAT, TODA, ASDA and the final governing RTOW for each OAT.</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 lg:gap-8">

        {/* Left Column: Form */}
        <div className="lg:col-span-4 flex flex-col gap-6">
          <Card className="p-6 bg-white border border-borderc shadow-sm">
            <h2 className="text-sm font-bold text-textprimary mb-4 pb-2 border-b border-slate-100 flex items-center gap-2">
              <Shield size={16} className="text-primary" />
              Report Parameters
            </h2>

            <div className="space-y-4">
              <div>
                <label className="block text-[10px] font-bold text-textsecondary uppercase tracking-wider mb-1.5">Aircraft</label>
                <select
                  className="w-full px-3.5 py-2.5 rounded-lg border border-borderc bg-white text-xs font-semibold text-textprimary focus:border-primary focus:ring-2 focus:ring-primary/15 outline-none transition"
                  value={selectedAc}
                  onChange={e => setSelectedAc(e.target.value)}
                >
                  <option value="">— select —</option>
                  {acList.map(a => (
                    <option key={a.id} value={a.id}>{a.registration} — {a.fleet || a.type}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-[10px] font-bold text-textsecondary uppercase tracking-wider mb-1.5">Airport</label>
                <Combobox
                  items={apComboItems}
                  value={selectedApId}
                  onChange={setSelectedApId}
                  placeholder="e.g. Wilson / HKNW"
                  emptyOption="— select airport —"
                />
                {selectedAp && (
                  <p className="text-[10px] text-textsecondary mt-1.5 font-medium">
                    {selectedAp.name} ({selectedAp.icao || '---'}) · Elev {Math.round(selectedAp.elevation_ft ?? 0)} ft
                  </p>
                )}
              </div>

              <div>
                <label className="block text-[10px] font-bold text-textsecondary uppercase tracking-wider mb-1.5">Take-off flap</label>
                <select
                  className="w-full px-3.5 py-2.5 rounded-lg border border-borderc bg-white text-xs font-semibold text-textprimary focus:border-primary focus:ring-2 focus:ring-primary/15 outline-none transition"
                  value={flap}
                  onChange={e => setFlap(e.target.value)}
                >
                  <option value="auto">Auto — best flap</option>
                  {availableFlaps.map(f => (
                    <option key={f} value={f}>Flap {f}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-[10px] font-bold text-textsecondary uppercase tracking-wider mb-1.5">
                  Temperatures °C
                </label>
                <input
                  type="text"
                  className="w-full px-3.5 py-2.5 rounded-lg border border-borderc bg-white text-xs font-semibold text-textprimary focus:border-primary focus:ring-2 focus:ring-primary/15 outline-none transition"
                  value={temps}
                  onChange={e => setTemps(e.target.value)}
                  placeholder="20, 25, 30, 35, 40"
                />
                <p className="text-[10px] text-textsecondary mt-1">Comma separated values (e.g. 20, 25, 30, 35, 40)</p>
              </div>

              {error && (
                <div className="p-3 bg-red-50 border border-red-100 rounded-lg text-xs font-semibold text-red-600 flex items-start gap-2">
                  <AlertTriangle size={14} className="mt-0.5 shrink-0" />
                  <span>{error}</span>
                </div>
              )}

              <button
                id="btn-generate-report"
                onClick={handleGenerate}
                disabled={loading}
                className="w-full mt-2 bg-primary hover:bg-primary-dark disabled:bg-slate-300 disabled:cursor-not-allowed text-white font-bold py-3 px-4 rounded-xl flex items-center justify-center gap-2 shadow-md hover:shadow-lg transition duration-200 text-xs"
              >
                {loading ? <Activity size={16} className="animate-spin" /> : <Play size={16} fill="currentColor" />}
                <span>{loading ? 'Generating...' : 'Generate Report'}</span>
              </button>
            </div>
          </Card>
        </div>

        {/* Right Column: Output */}
        <div className="lg:col-span-8 flex flex-col gap-6">
          {reportData ? (
            <Card className="p-6 bg-white border border-borderc shadow-sm">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between mb-4 pb-3 border-b border-slate-100 gap-4">
                <div>
                  <h2 className="text-base font-black text-textprimary flex items-center gap-2">
                    <FileText size={18} className="text-primary" />
                    Report Generated
                  </h2>
                  <p className="text-xs text-textsecondary font-medium mt-1">
                    {reportData.aircraft?.reg} ({reportData.aircraft?.type}) · Flap: {reportData.flap}
                  </p>
                </div>

                <button
                  id="btn-download-pdf"
                  onClick={handleDownloadPdf}
                  className="bg-slate-800 hover:bg-slate-900 text-white font-bold py-2.5 px-4 rounded-lg flex items-center gap-2 shadow-sm transition text-xs whitespace-nowrap"
                >
                  <Download size={14} />
                  <span>Download PDF</span>
                </button>
              </div>

              {reportData.note && (
                <div className="mb-4 p-3 bg-amber-50 border border-amber-100 rounded-lg text-[11px] font-semibold text-amber-800 flex items-start gap-2">
                  <AlertTriangle size={14} className="mt-0.5 shrink-0" />
                  <span>{reportData.note}</span>
                </div>
              )}

              {/* Chart + Table per airport */}
              {airportGroups.map((group) => (
                <AirportChart
                  key={group.meta.icao}
                  rows={group.rows}
                  icao={group.meta.icao}
                  airport={group.meta.airport}
                  elev_ft={group.meta.elev_ft}
                  rwy_m={group.meta.rwy_m}
                  surface={group.meta.surface}
                  aircraftId={reportData.aircraft.id}
                  flapSetting={reportData.flap}
                  onCellClick={setActiveChartParams}
                />
              ))}
            </Card>
          ) : (
            <Card className="h-full min-h-[400px] flex flex-col items-center justify-center p-6 bg-slate-50/50 border border-borderc border-dashed text-center">
              <div className="w-16 h-16 bg-white rounded-full flex items-center justify-center shadow-sm border border-slate-200 mb-4 text-slate-300">
                <FileText size={32} />
              </div>
              <h3 className="text-sm font-bold text-textprimary mb-1">No Report Generated</h3>
              <p className="text-xs text-textsecondary max-w-[280px]">
                Select an aircraft, airport, and temperature range on the left, then click Generate Report.
              </p>
            </Card>
          )}
        </div>
      </div>

      {activeChartParams && (
        <PerformanceChartModal
          params={activeChartParams}
          onClose={() => setActiveChartParams(null)}
        />
      )}
    </div>
  )
}
