import { useState, useEffect } from 'react'
import {
  X, Activity, TrendingDown, AlertTriangle, Info, BarChart2, FileImage, ZoomIn, ZoomOut, RotateCcw
} from 'lucide-react'
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, ReferenceLine, Legend, Dot, Label
} from 'recharts'
import { performanceChart, fetchBlobUrl } from '../../lib/api'
import type { ChartDataResult, WatChartData, FieldChartData } from '../../lib/api'

// ── Types ──────────────────────────────────────────────────────────────────
export interface ChartModalParams {
  aircraft_id: string
  airport_id: string
  oat: number
  flap?: string
  /** Which tab to open first */
  focusTab?: 'WAT' | 'TODA' | 'ASDA' | 'RTOW'
  /** Pre-computed values to show in header / summary */
  rtow_kg?: number | null
  wat_kg?: number | null
  toda_kg?: number | null
  asda_kg?: number | null
  structural_kg?: number | null
  factor?: string
}

interface Props {
  params: ChartModalParams | null
  onClose: () => void
}

// ── Colour palette for elevation curves ───────────────────────────────────
const ELEVATION_COLORS = [
  '#2563eb', '#7c3aed', '#db2777', '#059669', '#d97706',
  '#0891b2', '#9333ea', '#16a34a', '#ea580c', '#4f46e5'
]

const TAB_META = {
  RTOW:  { label: 'Summary',    color: '#7c3aed', activeBg: 'bg-purple-50', text: 'text-purple-700' },
  WAT:   { label: 'WAT Limit',  color: '#2563eb', activeBg: 'bg-blue-50',   text: 'text-blue-700' },
  TODA:  { label: 'TODA Limit', color: '#f59e0b', activeBg: 'bg-amber-50',  text: 'text-amber-700' },
  ASDA:  { label: 'ASDA Limit', color: '#f97316', activeBg: 'bg-orange-50', text: 'text-orange-700' },
  CHART: { label: 'AFM Chart',  color: '#0f766e', activeBg: 'bg-teal-50',   text: 'text-teal-700' },
}

// ── Custom Tooltips ────────────────────────────────────────────────────────
function WatTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-white border border-slate-200 rounded-xl shadow-xl p-3 text-[11px] min-w-[160px]">
      <p className="font-bold text-slate-700 mb-2">OAT: {label}°C</p>
      {payload.map((p: any) => (
        <div key={p.name} className="flex items-center justify-between gap-4 mb-0.5">
          <span className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full inline-block" style={{ background: p.color }} />
            <span className="text-slate-500">{p.name}</span>
          </span>
          <span className="font-mono font-bold" style={{ color: p.color }}>
            {p.value != null ? `${Math.round(p.value).toLocaleString()} kg` : '—'}
          </span>
        </div>
      ))}
    </div>
  )
}

function FieldTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-white border border-slate-200 rounded-xl shadow-xl p-3 text-[11px] min-w-[180px]">
      <p className="font-bold text-slate-700 mb-2">Weight: {Number(label).toLocaleString()} kg</p>
      {payload.map((p: any) => (
        <div key={p.name} className="flex items-center justify-between gap-4 mb-0.5">
          <span className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full inline-block" style={{ background: p.color }} />
            <span className="text-slate-500">{p.name}</span>
          </span>
          <span className="font-mono font-bold" style={{ color: p.color }}>
            {p.value != null ? `${Math.round(p.value).toLocaleString()} m` : '—'}
          </span>
        </div>
      ))}
    </div>
  )
}

// ── WAT Chart ─────────────────────────────────────────────────────────────
function WatChartTab({ data, params }: { data: WatChartData; params: ChartModalParams }) {
  // Pick the flap data with the highest interpolated_kg
  const bestFlapData = data.flapCurves.reduce<typeof data.flapCurves[0] | null>(
    (best, fd) =>
      fd.interpolated_kg != null && (best === null || (fd.interpolated_kg ?? 0) > (best.interpolated_kg ?? 0))
        ? fd : best,
    null
  )

  if (!bestFlapData || bestFlapData.curves.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-48 text-textsecondary text-sm gap-2">
        <AlertTriangle size={20} className="text-amber-400" />
        <p>No WAT performance data available for this aircraft.</p>
        <p className="text-xs text-center max-w-xs">Load WAT cells in the admin panel first.</p>
      </div>
    )
  }

  // Build chart data — one row per unique temperature, columns per elevation
  const allTemps = [...new Set(
    bestFlapData.curves.flatMap(c => c.points.map(p => p.temp_c))
  )].sort((a, b) => a - b)

  const chartData = allTemps.map(temp => {
    const row: Record<string, number | null> = { temp_c: temp }
    bestFlapData.curves.forEach(curve => {
      const pt = curve.points.find(p => p.temp_c === temp)
      row[`elev_${curve.elevation_ft}`] = pt ? pt.value_kg : null
    })
    return row
  })

  const allValues = bestFlapData.curves.flatMap(c => c.points.map(p => p.value_kg ?? 0))
  const yMin = allValues.length > 0 ? Math.floor((Math.min(...allValues) - 200) / 500) * 500 : 0
  const yMax = allValues.length > 0 ? Math.ceil((Math.max(...allValues) + 200) / 500) * 500 : 20000
  const fmtKg = (v: number) => `${(v / 1000).toFixed(1)}t`

  return (
    <div className="space-y-4">
      {/* Explanation */}
      <div className="bg-blue-50 border border-blue-100 rounded-xl p-3 text-[11px] text-blue-800 leading-relaxed">
        <div className="flex items-start gap-2">
          <Info size={13} className="mt-0.5 shrink-0 text-blue-500" />
          <div>
            <span className="font-bold">How WAT is calculated: </span>
            Each line represents WAT kg at one elevation band across temperatures.
            At airport elevation <strong>{Math.round(data.elevation_ft)} ft</strong> and OAT <strong>{data.oat_c}°C</strong>,
            the engine bilinearly interpolates between bounding elevation rows and temperature columns.
            {data.interpolated_kg != null && (
              <> Result: <strong>{data.interpolated_kg.toLocaleString()} kg</strong> (Flap {data.flap_used}).</>
            )}
          </div>
        </div>
      </div>

      {/* Chart */}
      <div className="bg-slate-50 rounded-xl border border-slate-200 p-4">
        <div className="flex items-center gap-2 mb-3">
          <TrendingDown size={14} className="text-blue-600" />
          <span className="text-xs font-bold text-textprimary">
            WAT Limit vs OAT — Elevation Curves (Flap {bestFlapData.flap})
          </span>
        </div>
        <ResponsiveContainer width="100%" height={300}>
          <LineChart data={chartData} margin={{ top: 10, right: 40, left: 10, bottom: 24 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
            <XAxis
              dataKey="temp_c"
              type="number"
              domain={['dataMin - 2', 'dataMax + 2']}
              tickFormatter={v => `${v}°`}
              tick={{ fontSize: 10, fill: '#64748b' }}
            >
              <Label value="OAT (°C)" offset={-8} position="insideBottom" style={{ fontSize: 10, fill: '#64748b' }} />
            </XAxis>
            <YAxis
              domain={[yMin, yMax]}
              tickFormatter={fmtKg}
              tick={{ fontSize: 10, fill: '#64748b' }}
              width={52}
            >
              <Label value="WAT Limit (tonnes)" angle={-90} position="insideLeft" offset={14} style={{ fontSize: 10, fill: '#64748b' }} />
            </YAxis>
            <Tooltip content={<WatTooltip />} />
            <Legend wrapperStyle={{ fontSize: 10, paddingTop: 8 }} iconType="circle" iconSize={8} />

            {/* Red vertical: current OAT */}
            <ReferenceLine
              x={data.oat_c}
              stroke="#ef4444"
              strokeWidth={2}
              strokeDasharray="5 3"
              label={{ value: `OAT ${data.oat_c}°C`, position: 'top', fontSize: 9, fill: '#ef4444' }}
            />

            {/* Purple horizontal: WAT result */}
            {data.interpolated_kg != null && (
              <ReferenceLine
                y={data.interpolated_kg}
                stroke="#7c3aed"
                strokeWidth={2}
                strokeDasharray="5 3"
                label={{ value: `WAT ${fmtKg(data.interpolated_kg)}`, position: 'right', fontSize: 9, fill: '#7c3aed' }}
              />
            )}

            {/* One line per elevation band */}
            {bestFlapData.curves.map((curve, i) => (
              <Line
                key={curve.elevation_ft}
                type="monotone"
                dataKey={`elev_${curve.elevation_ft}`}
                name={`${Math.round(curve.elevation_ft)} ft`}
                stroke={ELEVATION_COLORS[i % ELEVATION_COLORS.length]}
                strokeWidth={2}
                dot={{ r: 3, strokeWidth: 0 }}
                activeDot={{ r: 5 }}
                connectNulls
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
        <p className="text-[9px] text-textsecondary text-center mt-1">
          <span className="text-red-500 font-bold">Red dashed</span> = current OAT ·{' '}
          <span className="text-purple-600 font-bold">Purple dashed</span> = interpolated WAT limit
        </p>
      </div>

      {/* Interpolation steps */}
      <div className="bg-white border border-slate-100 rounded-xl p-3 text-xs">
        <p className="font-bold text-textprimary mb-2">Bilinear Interpolation Steps</p>
        <div className="space-y-1.5 text-textsecondary">
          {[
            `Find the two elevation rows bracketing ${Math.round(data.elevation_ft)} ft.`,
            `At each elevation row, linearly interpolate along the temperature axis to OAT = ${data.oat_c}°C.`,
            `Linearly interpolate between those two elevation results at the actual elevation.`,
          ].map((step, i) => (
            <div key={i} className="flex items-start gap-2">
              <span className="text-blue-600 font-black shrink-0">{i + 1}.</span>
              <span>{step}</span>
            </div>
          ))}
          <div className="flex items-start gap-2 pt-1 border-t border-slate-100 mt-1">
            <span className="text-green-600 font-black shrink-0">→</span>
            <span>
              Result:{' '}
              {data.interpolated_kg != null
                ? <><strong className="text-textprimary">{data.interpolated_kg.toLocaleString()} kg</strong> WAT limit (Flap {data.flap_used})</>
                : <span className="text-amber-600">No WAT data for these conditions.</span>}
            </span>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── TODA / ASDA Chart ──────────────────────────────────────────────────────
function FieldChartTab({
  data, tableType, color
}: {
  data: FieldChartData
  tableType: 'TODA' | 'ASDA'
  color: string
}) {
  const [selectedFlap, setSelectedFlap] = useState<string>(
    data.flapData.length > 0 ? data.flapData[0].flap : ''
  )

  const flapData = data.flapData.find(f => f.flap === selectedFlap) ?? data.flapData[0]
  const effRwy = data.eff_rwy_m ?? data.available_rwy_m

  if (!flapData || flapData.weight_points.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-48 text-textsecondary text-sm gap-2">
        <AlertTriangle size={20} className="text-amber-400" />
        <p>No {tableType} weight-slice data available.</p>
        {data.available_rwy_m == null && (
          <p className="text-xs text-center max-w-[260px]">
            No runway length recorded for this airport — field limits cannot be applied.
          </p>
        )}
      </div>
    )
  }

  const pts = flapData.weight_points
  const allW = pts.map(p => p.weight_kg)
  const allD = pts.map(p => p.required_m)
  const xMin = Math.floor((Math.min(...allW) - 500) / 1000) * 1000
  const xMax = Math.ceil((Math.max(...allW) + 500) / 1000) * 1000
  const yMin = Math.floor((Math.min(...allD, effRwy ?? 0) - 50) / 100) * 100
  const yMax = Math.ceil((Math.max(...allD, effRwy ?? 0) + 100) / 100) * 100
  const fmtKg = (v: number) => `${(v / 1000).toFixed(1)}t`

  return (
    <div className="space-y-4">
      {/* Explanation */}
      <div className="rounded-xl p-3 text-[11px] leading-relaxed border"
        style={{ backgroundColor: `${color}18`, borderColor: `${color}40`, color: '#334155' }}>
        <div className="flex items-start gap-2">
          <Info size={13} className="mt-0.5 shrink-0" style={{ color }} />
          <div>
            <span className="font-bold">How {tableType} is calculated: </span>
            At elevation <strong>{Math.round(data.elevation_ft)} ft</strong> and OAT <strong>{data.oat_c}°C</strong>,
            the required runway distance is interpolated for each weight slice.
            The horizontal line shows available runway{data.surface_factor > 1 ? ` (effective ${data.eff_rwy_m}m after ×${data.surface_factor} surface penalty)` : ''}.
            The curve intersects it at the limiting weight.
          </div>
        </div>
      </div>

      {/* Flap selector */}
      {data.flapData.length > 1 && (
        <div className="flex items-center gap-2 text-xs">
          <span className="text-textsecondary font-semibold">Flap:</span>
          <div className="flex gap-1">
            {data.flapData.map(fd => (
              <button
                key={fd.flap}
                onClick={() => setSelectedFlap(fd.flap)}
                className={`px-2.5 py-1 rounded-lg font-bold transition text-[10px] ${
                  selectedFlap === fd.flap
                    ? 'bg-primary text-white shadow'
                    : 'bg-slate-100 text-textsecondary hover:bg-slate-200'
                }`}
              >
                Flap {fd.flap}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Chart */}
      <div className="bg-slate-50 rounded-xl border border-slate-200 p-4">
        <div className="flex items-center gap-2 mb-3">
          <BarChart2 size={14} style={{ color }} />
          <span className="text-xs font-bold text-textprimary">
            {tableType} Required Distance vs Aircraft Weight — Flap {flapData.flap}
          </span>
        </div>
        <ResponsiveContainer width="100%" height={300}>
          <LineChart data={pts} margin={{ top: 10, right: 40, left: 10, bottom: 24 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
            <XAxis
              dataKey="weight_kg"
              type="number"
              domain={[xMin, xMax]}
              tickFormatter={fmtKg}
              tick={{ fontSize: 10, fill: '#64748b' }}
            >
              <Label value="Aircraft Weight (tonnes)" offset={-8} position="insideBottom" style={{ fontSize: 10, fill: '#64748b' }} />
            </XAxis>
            <YAxis
              domain={[yMin, yMax]}
              tickFormatter={v => `${v}m`}
              tick={{ fontSize: 10, fill: '#64748b' }}
              width={52}
            >
              <Label value="Required Distance (m)" angle={-90} position="insideLeft" offset={14} style={{ fontSize: 10, fill: '#64748b' }} />
            </YAxis>
            <Tooltip content={<FieldTooltip />} />

            {/* Red horizontal: available runway */}
            {effRwy != null && (
              <ReferenceLine
                y={effRwy}
                stroke="#ef4444"
                strokeWidth={2}
                strokeDasharray="5 3"
                label={{ value: `Available: ${Math.round(effRwy)}m`, position: 'right', fontSize: 9, fill: '#ef4444' }}
              />
            )}

            {/* Green vertical: limiting weight */}
            {flapData.limiting_weight_kg != null && (
              <ReferenceLine
                x={flapData.limiting_weight_kg}
                stroke="#22c55e"
                strokeWidth={2}
                strokeDasharray="5 3"
                label={{ value: `Limit: ${fmtKg(flapData.limiting_weight_kg)}`, position: 'top', fontSize: 9, fill: '#22c55e' }}
              />
            )}

            {/* Required distance curve */}
            <Line
              type="monotone"
              dataKey="required_m"
              name={`${tableType} Required`}
              stroke={color}
              strokeWidth={2.5}
              dot={(props: any) => {
                const { cx, cy, payload } = props
                const over = effRwy != null && payload.required_m > effRwy
                return <Dot cx={cx} cy={cy} r={5} fill={over ? '#ef4444' : '#22c55e'} stroke="#fff" strokeWidth={1.5} />
              }}
              activeDot={{ r: 7 }}
            />
          </LineChart>
        </ResponsiveContainer>
        <p className="text-[9px] text-textsecondary text-center mt-1">
          <span className="text-red-500 font-bold">Red dashed</span> = available runway ·{' '}
          <span className="text-green-600 font-bold">Green dashed</span> = limiting weight ·{' '}
          <span className="text-emerald-600 font-bold">● Green</span> = within limits ·{' '}
          <span className="text-red-500 font-bold">● Red</span> = exceeds
        </p>
      </div>

      {/* Steps */}
      <div className="bg-white border border-slate-100 rounded-xl p-3 text-xs">
        <p className="font-bold text-textprimary mb-2">Calculation Steps</p>
        <div className="space-y-1.5 text-textsecondary">
          {[
            `Load all ${tableType} weight slices for Flap ${flapData.flap}.`,
            `For each weight slice, bilinearly interpolate the required distance at ${Math.round(data.elevation_ft)} ft and ${data.oat_c}°C.`,
            `Find the highest weight whose required distance ≤ available runway (${effRwy != null ? `${Math.round(effRwy)} m effective` : 'N/A'}). Interpolate between slices for precision.`,
          ].map((step, i) => (
            <div key={i} className="flex items-start gap-2">
              <span className="font-black shrink-0" style={{ color }}>{i + 1}.</span>
              <span>{step}</span>
            </div>
          ))}
          <div className="flex items-start gap-2 pt-1 border-t border-slate-100 mt-1">
            <span className="text-green-600 font-black shrink-0">→</span>
            <span>
              {flapData.limiting_weight_kg != null
                ? <><strong className="text-textprimary">{flapData.limiting_weight_kg.toLocaleString()} kg</strong> {tableType} weight limit</>
                : data.available_rwy_m == null
                  ? <span className="text-amber-600">No runway data — {tableType} not applied.</span>
                  : <span className="text-amber-600">No limiting weight found for available runway.</span>
              }
            </span>
          </div>
        </div>
      </div>

      {/* Verification Matrix (as per handwritten notes in the images) */}
      {flapData.weight_matrix && flapData.weight_matrix.length > 0 && (
        <div className="bg-white border border-slate-100 rounded-xl p-3 text-xs">
          <p className="font-bold text-textprimary mb-2 flex items-center gap-1.5">
            <span>📊</span>
            <span>Nomograph Verification Grid (OAT vs Weight Required Runways)</span>
          </p>
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-[10px]">
              <thead>
                <tr className="border-b border-slate-100 text-textsecondary font-bold">
                  <th className="py-1.5 pr-2">Weight (kg / lbs)</th>
                  <th className="py-1.5 text-center">20°C OAT</th>
                  <th className="py-1.5 text-center">30°C OAT</th>
                  <th className="py-1.5 text-center">40°C OAT</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50 font-mono">
                {flapData.weight_matrix.map(row => {
                  const weightLbs = Math.round(row.weight_kg * 2.20462)
                  const renderCell = (val: number | null) => {
                    if (val == null) return <span className="text-slate-300">—</span>
                    const isExceeded = effRwy != null && val > effRwy
                    return (
                      <span className={`font-bold ${isExceeded ? 'text-red-500 bg-red-50 px-1 py-0.5 rounded' : 'text-green-600 bg-green-50 px-1 py-0.5 rounded'}`}>
                        {val}m
                      </span>
                    )
                  }
                  return (
                    <tr key={row.weight_kg} className="hover:bg-slate-50/50">
                      <td className="py-2 text-textprimary font-medium">
                        {row.weight_kg.toLocaleString()} kg <span className="text-textsecondary text-[9px]">({weightLbs.toLocaleString()} lbs)</span>
                      </td>
                      <td className="py-2 text-center">{renderCell(row.temp_20)}</td>
                      <td className="py-2 text-center">{renderCell(row.temp_30)}</td>
                      <td className="py-2 text-center">{renderCell(row.temp_40)}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          {effRwy != null && (
            <p className="text-[9px] text-textsecondary mt-1.5 italic">
              * Distances highlighted in <span className="text-red-500 font-semibold">Red</span> exceed the available runway limit of {Math.round(effRwy)}m.
            </p>
          )}
        </div>
      )}
    </div>
  )
}

// ── Summary (RTOW) Tab ────────────────────────────────────────────────────
function SummaryTab({ data, params }: { data: ChartDataResult; params: ChartModalParams }) {
  const factorColors: Record<string, string> = {
    WAT: 'bg-blue-100 text-blue-700', TODA: 'bg-amber-100 text-amber-700',
    ASDA: 'bg-orange-100 text-orange-700', STRUCT: 'bg-green-100 text-green-700',
    STRUCTURAL: 'bg-green-100 text-green-700',
  }

  const limits = [
    { label: 'Structural (MTOW)', value: params.structural_kg, color: '#22c55e' },
    { label: 'WAT Limit',         value: params.wat_kg,        color: '#2563eb' },
    { label: 'TODA Limit',        value: params.toda_kg,       color: '#f59e0b' },
    { label: 'ASDA Limit',        value: params.asda_kg,       color: '#f97316' },
  ]

  return (
    <div className="space-y-4">
      {/* Metric cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {limits.map(item => (
          <div key={item.label} className="rounded-xl border border-slate-100 p-3 bg-slate-50 text-center">
            <p className="text-[9px] font-bold uppercase tracking-wider mb-1" style={{ color: item.color }}>{item.label}</p>
            <p className="text-sm font-black font-mono text-textprimary">
              {item.value != null ? `${(item.value / 1000).toFixed(1)}t` : '—'}
            </p>
          </div>
        ))}
      </div>

      {/* Governing RTOW */}
      <div className="rounded-xl border-2 border-purple-300 bg-purple-50 p-4 flex items-center gap-4">
        <div className="flex-1">
          <p className="text-[10px] font-bold uppercase tracking-wider text-purple-500 mb-0.5">Governing RTOW</p>
          <p className="text-2xl font-black text-purple-800 font-mono">
            {params.rtow_kg != null ? `${params.rtow_kg.toLocaleString()} kg` : '—'}
          </p>
          {params.rtow_kg != null && (
            <p className="text-[10px] text-purple-600 mt-0.5">{(params.rtow_kg / 1000).toFixed(2)} tonnes</p>
          )}
        </div>
        {params.factor && (
          <div className="text-center">
            <span className={`px-3 py-1.5 text-xs font-black rounded-full uppercase tracking-wider ${factorColors[params.factor] ?? 'bg-slate-100 text-slate-600'}`}>
              {params.factor}
            </span>
            <p className="text-[9px] text-textsecondary mt-1">Limiting Factor</p>
          </div>
        )}
      </div>

      {/* Bar comparison */}
      <div className="bg-white border border-slate-100 rounded-xl p-4">
        <p className="text-xs font-bold text-textprimary mb-3">Limit Comparison</p>
        <div className="space-y-2">
          {limits.map(item => {
            if (item.value == null) return null
            const pct = params.structural_kg ? Math.min(100, (item.value / params.structural_kg) * 100) : 100
            const isGov = params.rtow_kg != null && Math.abs(item.value - params.rtow_kg) < 10
            return (
              <div key={item.label} className="flex items-center gap-2">
                <span className="text-[10px] font-semibold text-textsecondary w-24 shrink-0">{item.label}</span>
                <div className="flex-1 bg-slate-100 rounded-full h-4 overflow-hidden">
                  <div className="h-full rounded-full transition-all duration-700"
                    style={{ width: `${pct}%`, backgroundColor: item.color, opacity: isGov ? 1 : 0.55 }} />
                </div>
                <span className="text-[10px] font-black font-mono w-20 text-right" style={{ color: item.color }}>
                  {Math.round(item.value).toLocaleString()} kg
                </span>
                {isGov && <span className="text-[8px] font-black text-white bg-slate-700 rounded-full px-1.5 py-0.5 shrink-0">GOV</span>}
              </div>
            )
          })}
        </div>
      </div>

      {/* Conditions */}
      <div className="grid grid-cols-2 gap-3 text-[11px]">
        <div className="bg-slate-50 border border-slate-100 rounded-xl p-3">
          <p className="font-bold text-textprimary mb-1.5">Aircraft</p>
          <p className="text-textsecondary">{data.aircraft.registration} ({data.aircraft.type})</p>
          <p className="text-textsecondary">MTOW: {data.aircraft.mtow_kg.toLocaleString()} kg</p>
          <p className="text-textsecondary">Flap: {data.flap}</p>
        </div>
        <div className="bg-slate-50 border border-slate-100 rounded-xl p-3">
          <p className="font-bold text-textprimary mb-1.5">Airport / Conditions</p>
          <p className="text-textsecondary">{data.airport.icao} — {data.airport.name}</p>
          <p className="text-textsecondary">Elevation: {Math.round(data.airport.elevation_ft)} ft</p>
          {data.airport.rwy_m && <p className="text-textsecondary">Runway: {Math.round(data.airport.rwy_m)} m</p>}
          <p className="text-textsecondary">OAT: {params.oat}°C</p>
        </div>
      </div>
    </div>
  )
}

// ── AFM Chart Image Tab ────────────────────────────────────────────────────
function AfmChartTab({ params, chartData }: { params: ChartModalParams; chartData: ChartDataResult | null }) {
  const [selectedType, setSelectedType] = useState<'TODA' | 'ASDA'>(
    params.factor === 'ASDA' ? 'ASDA' : 'TODA'
  )
  const [zoom, setZoom] = useState(1)

  // Blob URL state — one per chart type
  const [blobUrls, setBlobUrls]   = useState<Record<string, string>>({})
  const [loading, setLoading]     = useState<Record<string, boolean>>({})
  const [errors, setErrors]       = useState<Record<string, string | null>>({})

  // Determine flap: prefer the flap param, fall back to chartData.flap
  const effectiveFlap = (params.flap && params.flap !== 'auto')
    ? params.flap.replace(/[^0-9]/g, '')
    : (chartData?.flap ?? '0').replace(/[^0-9]/g, '')

  const rtow   = params.rtow_kg ?? null
  const factor = params.factor  ?? null

  // Key uniquely identifies this chart (type + conditions)
  const imgKey = (tt: string) => `${tt}-${effectiveFlap}-${params.oat}-${rtow}`

  // Fetch authenticated image blob for a given table type
  useEffect(() => {
    const key  = imgKey(selectedType)
    // Already loaded or in progress
    if (blobUrls[key] || loading[key]) return

    const apiPath = performanceChart.chartImageUrl({
      aircraft_id: params.aircraft_id,
      airport_id:  params.airport_id,
      table_type:  selectedType,
      flap:        effectiveFlap,
      oat:         params.oat,
      rtow_kg:     rtow,
      factor,
    })

    setLoading(prev => ({ ...prev, [key]: true }))
    setErrors(prev => ({ ...prev, [key]: null }))

    fetchBlobUrl(apiPath)
      .then(url => {
        setBlobUrls(prev => ({ ...prev, [key]: url }))
      })
      .catch(err => {
        setErrors(prev => ({ ...prev, [key]: err.message || 'Chart render failed' }))
      })
      .finally(() => setLoading(prev => ({ ...prev, [key]: false })))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedType, effectiveFlap, params.oat, rtow, factor])

  // Revoke old blob URLs on unmount
  useEffect(() => {
    return () => {
      Object.values(blobUrls).forEach(u => URL.revokeObjectURL(u))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const currentKey      = imgKey(selectedType)
  const currentBlobUrl  = blobUrls[currentKey]
  const currentLoading  = loading[currentKey]
  const currentError    = errors[currentKey]

  return (
    <div className="space-y-4">
      {/* Explanation */}
      <div className="bg-teal-50 border border-teal-100 rounded-xl p-3 text-[11px] text-teal-800 leading-relaxed">
        <div className="flex items-start gap-2">
          <Info size={13} className="mt-0.5 shrink-0 text-teal-500" />
          <div>
            <span className="font-bold">AFM Nomograph Verification: </span>
            The coloured lines drawn over the chart image trace the <strong>exact construction sequence</strong> from the
            approved AFM:
            ① Vertical from OAT to the airport pressure-altitude curve,
            ② Horizontal to the reference line,
            ③ Parallel to the weight family curves to the selected runway length,
            ④ Vertical down to the take-off weight axis.
            {rtow != null && (
              <> The endpoint confirms <strong>{Math.round(rtow).toLocaleString()} kg</strong>.</>
            )}
          </div>
        </div>
      </div>

      {/* Type selector: TODA / ASDA */}
      <div className="flex items-center gap-2">
        <span className="text-[10px] font-bold text-textsecondary uppercase tracking-wider">Chart:</span>
        <div className="flex gap-1">
          {(['TODA', 'ASDA'] as const).map(tt => (
            <button
              key={tt}
              onClick={() => { setSelectedType(tt); setZoom(1) }}
              className={`px-3 py-1.5 text-[10px] font-black rounded-lg transition ${
                selectedType === tt
                  ? 'bg-teal-600 text-white shadow'
                  : 'bg-slate-100 text-textsecondary hover:bg-slate-200'
              }`}
            >
              {tt}
            </button>
          ))}
        </div>
        {/* Zoom controls */}
        <div className="flex gap-1 ml-auto">
          <button
            onClick={() => setZoom(z => Math.min(3, z + 0.25))}
            className="p-1.5 bg-slate-100 hover:bg-slate-200 rounded-lg transition text-textsecondary"
            title="Zoom In"
          >
            <ZoomIn size={13} />
          </button>
          <button
            onClick={() => setZoom(z => Math.max(0.4, z - 0.25))}
            className="p-1.5 bg-slate-100 hover:bg-slate-200 rounded-lg transition text-textsecondary"
            title="Zoom Out"
          >
            <ZoomOut size={13} />
          </button>
          <button
            onClick={() => setZoom(1)}
            className="p-1.5 bg-slate-100 hover:bg-slate-200 rounded-lg transition text-textsecondary"
            title="Reset zoom"
          >
            <RotateCcw size={13} />
          </button>
        </div>
      </div>

      {/* The image */}
      <div
        className="bg-slate-900 rounded-xl border border-slate-200 overflow-auto"
        style={{ maxHeight: '60vh', cursor: zoom > 1 ? 'move' : 'default' }}
      >
        {currentLoading && (
          <div className="flex flex-col items-center justify-center h-48 gap-3">
            <Activity size={22} className="text-teal-400 animate-spin" />
            <p className="text-xs text-slate-400">Rendering AFM chart trace — please wait…</p>
          </div>
        )}
        {currentError && !currentLoading && (
          <div className="flex flex-col items-center justify-center h-48 gap-3 text-center p-4">
            <AlertTriangle size={24} className="text-amber-400" />
            <p className="text-xs font-bold text-slate-300">Chart trace unavailable</p>
            <p className="text-[10px] text-slate-400 max-w-sm">
              {currentError}
            </p>
            <button
              onClick={() => {
                // Clear error so the useEffect re-runs on next render
                setErrors(prev => ({ ...prev, [currentKey]: null }))
              }}
              className="mt-1 text-[10px] bg-teal-700 text-white px-3 py-1 rounded-lg hover:bg-teal-600 transition"
            >
              Retry
            </button>
          </div>
        )}
        {currentBlobUrl && !currentLoading && !currentError && (
          <img
            key={currentBlobUrl}
            src={currentBlobUrl}
            alt={`${selectedType} AFM nomograph trace — OAT ${params.oat}°C`}
            style={{ width: `${zoom * 100}%`, maxWidth: 'none', display: 'block' }}
            className="transition-transform duration-150"
          />
        )}
      </div>

      {/* Legend */}
      <div className="flex flex-wrap gap-3 text-[10px] text-textsecondary">
        <span className="flex items-center gap-1.5">
          <span className="w-8 h-0.5 inline-block bg-purple-600 rounded" />
          TODA trace (purple)
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-8 h-0.5 inline-block bg-blue-700 rounded" />
          ASDA trace (blue)
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded-full inline-block bg-purple-600" />
          Construction waypoints
        </span>
        <span className="text-amber-600 font-semibold">Zoom controls above to inspect detail</span>
      </div>
    </div>
  )
}

// ── Main Modal ─────────────────────────────────────────────────────────────
export default function PerformanceChartModal({ params, onClose }: Props) {
  const [chartData, setChartData] = useState<ChartDataResult | null>(null)
  const [loading, setLoading]   = useState(false)
  const [error, setError]       = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<'WAT' | 'TODA' | 'ASDA' | 'RTOW' | 'CHART'>('RTOW')

  useEffect(() => {
    if (!params) return
    setActiveTab(params.focusTab ?? 'RTOW')
    setChartData(null)
    setError(null)
    setLoading(true)
    performanceChart.getData({
      aircraft_id: params.aircraft_id,
      airport_id:  params.airport_id,
      oat:         params.oat,
      flap:        params.flap,
    })
      .then(setChartData)
      .catch(e => setError(e.message || 'Failed to load chart data'))
      .finally(() => setLoading(false))
  }, [params])

  if (!params) return null

  const tabs: Array<'RTOW' | 'WAT' | 'TODA' | 'ASDA' | 'CHART'> = ['RTOW', 'WAT', 'TODA', 'ASDA', 'CHART']

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6"
      style={{ backgroundColor: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(4px)' }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden">

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 bg-gradient-to-r from-slate-50 to-white shrink-0">
          <div>
            <h2 className="text-base font-black text-textprimary flex items-center gap-2">
              <BarChart2 size={18} className="text-primary" />
              Performance Calculation Detail
            </h2>
            <p className="text-[11px] text-textsecondary font-medium mt-0.5">
              Interactive interpolation chart — OAT {params.oat}°C
              {params.rtow_kg != null && (
                <>
                  {' · '}
                  <span className="text-purple-600 font-bold">RTOW {params.rtow_kg.toLocaleString()} kg</span>
                  {params.factor && (
                    <span className="ml-1 text-[9px] font-black uppercase bg-purple-100 text-purple-700 rounded-full px-1.5 py-0.5">
                      {params.factor}
                    </span>
                  )}
                </>
              )}
            </p>
          </div>
          <button onClick={onClose} className="p-2 rounded-xl hover:bg-slate-100 text-slate-400 hover:text-slate-700 transition">
            <X size={18} />
          </button>
        </div>

        {/* Tab bar */}
        <div className="flex border-b border-slate-100 px-5 pt-2 gap-1 bg-white shrink-0">
        {tabs.map(tab => {
            const meta = TAB_META[tab]
            const active = activeTab === tab
            const hasData = tab === 'RTOW' ? true
              : tab === 'WAT'    ? (chartData?.wat?.interpolated_kg != null)
              : tab === 'TODA'   ? (chartData?.toda != null && chartData.toda.flapData.length > 0)
              : tab === 'ASDA'   ? (chartData?.asda != null && chartData.asda.flapData.length > 0)
              : true  // CHART tab always shows (may show error internally)

            return (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`flex items-center gap-1.5 px-3 py-2 text-[11px] font-bold rounded-t-lg border-b-2 transition ${
                  active
                    ? `${meta.activeBg} ${meta.text}`
                    : 'border-transparent text-textsecondary hover:text-textprimary hover:bg-slate-50'
                }`}
                style={active ? { borderBottomColor: meta.color } : {}}
              >
                {tab === 'CHART' && <FileImage size={11} className="shrink-0" />}
                {meta.label}
                {!loading && chartData && !hasData && tab !== 'CHART' && (
                  <span className="w-1.5 h-1.5 rounded-full bg-amber-400 inline-block" title="No data available" />
                )}
              </button>
            )
          })}
        </div>

        {/* Scrollable content */}
        <div className="flex-1 overflow-y-auto p-5 min-h-0">

          {loading && (
            <div className="flex flex-col items-center justify-center h-48 gap-3">
              <Activity size={28} className="text-primary animate-spin" />
              <p className="text-sm text-textsecondary font-medium">Loading chart data…</p>
            </div>
          )}

          {!loading && error && (
            <div className="flex flex-col items-center justify-center h-48 gap-3 text-center">
              <AlertTriangle size={28} className="text-amber-400" />
              <p className="text-sm font-bold text-textprimary">Could not load chart data</p>
              <p className="text-xs text-textsecondary max-w-xs">{error}</p>
              <p className="text-xs text-textsecondary mt-1">
                Pre-computed RTOW values are still correct — charts require performance cells loaded in admin panel.
              </p>
            </div>
          )}

          {!loading && !error && chartData && (
            <>
              {activeTab === 'RTOW' && <SummaryTab data={chartData} params={params} />}
              {activeTab === 'WAT'  && (
                chartData.wat
                  ? <WatChartTab data={chartData.wat} params={params} />
                  : <div className="flex flex-col items-center justify-center h-48 text-textsecondary text-sm gap-2">
                      <AlertTriangle size={20} className="text-amber-400" /><span>No WAT data available.</span>
                    </div>
              )}
              {activeTab === 'TODA' && (
                chartData.toda
                  ? <FieldChartTab data={chartData.toda} tableType="TODA" color="#f59e0b" />
                  : <div className="flex flex-col items-center justify-center h-48 text-textsecondary text-sm gap-2">
                      <AlertTriangle size={20} className="text-amber-400" /><span>No TODA data available.</span>
                    </div>
              )}
              {activeTab === 'ASDA' && (
                chartData.asda
                  ? <FieldChartTab data={chartData.asda} tableType="ASDA" color="#f97316" />
                  : <div className="flex flex-col items-center justify-center h-48 text-textsecondary text-sm gap-2">
                      <AlertTriangle size={20} className="text-amber-400" /><span>No ASDA data available.</span>
                    </div>
              )}
              {activeTab === 'CHART' && (
                <AfmChartTab params={params} chartData={chartData} />
              )}
            </>
          )}

          {/* AFM Chart tab works even if the regular chart-data endpoint failed */}
          {!loading && error && activeTab === 'CHART' && (
            <AfmChartTab params={params} chartData={null} />
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-slate-100 bg-slate-50/60 text-[9px] text-textsecondary flex items-center gap-1.5 shrink-0">
          <Info size={10} className="shrink-0" />
          Interpolation mirrors AFM chart bilinear method. Review-only — validate against approved AFM before operational use.
        </div>
      </div>
    </div>
  )
}
