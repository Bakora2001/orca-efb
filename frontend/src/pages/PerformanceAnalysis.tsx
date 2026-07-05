import { useState } from 'react'
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, ReferenceLine, Legend
} from 'recharts'
import {
  Thermometer, Gauge, Layers, Shield, AlertTriangle,
  Play, Download, HelpCircle, CheckCircle2, ChevronRight,
  TrendingUp, Scale, Clock
} from 'lucide-react'
import Card from '../components/ui/Card'

const BASE_LIMITS: { [key: number]: { wat: number; runway: number; obstacle: number } } = {
  [-20]: { wat: 23650, runway: 21800, obstacle: 20100 },
  [-10]: { wat: 22870, runway: 21100, obstacle: 19400 },
  [0]:   { wat: 22040, runway: 20300, obstacle: 18600 },
  [10]:  { wat: 21120, runway: 19500, obstacle: 17800 },
  [20]:  { wat: 20210, runway: 18600, obstacle: 16900 },
  [30]:  { wat: 20412, runway: 17900, obstacle: 16100 },
  [40]:  { wat: 19520, runway: 17100, obstacle: 15200 },
  [50]:  { wat: 18580, runway: 16200, obstacle: 14300 },
}

const getShift = (pa: number, qnh: number) => {
  return Math.round(-0.35 * (pa - 215) + 8 * (qnh - 1013))
}

const getLimitsAtTemp = (t: number, pa: number, qnh: number) => {
  const shift = getShift(pa, qnh)
  const temps = [-20, -10, 0, 10, 20, 30, 40, 50]

  if (t <= -20) {
    return {
      wat: BASE_LIMITS[-20].wat + shift,
      runway: BASE_LIMITS[-20].runway + shift,
      obstacle: BASE_LIMITS[-20].obstacle + shift,
    }
  }
  if (t >= 50) {
    return {
      wat: BASE_LIMITS[50].wat + shift,
      runway: BASE_LIMITS[50].runway + shift,
      obstacle: BASE_LIMITS[50].obstacle + shift,
    }
  }

  let i = 0
  while (i < temps.length - 1 && t > temps[i + 1]) {
    i++
  }
  const tLo = temps[i]
  const tHi = temps[i + 1]
  const factor = (t - tLo) / (tHi - tLo)

  const watLo = BASE_LIMITS[tLo].wat
  const watHi = BASE_LIMITS[tHi].wat
  const runwayLo = BASE_LIMITS[tLo].runway
  const runwayHi = BASE_LIMITS[tHi].runway
  const obstacleLo = BASE_LIMITS[tLo].obstacle
  const obstacleHi = BASE_LIMITS[tHi].obstacle

  return {
    wat: Math.round((watLo + factor * (watHi - watLo)) + shift),
    runway: Math.round((runwayLo + factor * (runwayHi - runwayLo)) + shift),
    obstacle: Math.round((obstacleLo + factor * (obstacleHi - obstacleLo)) + shift),
  }
}

interface Envelope3DProps {
  oat: number
  pa: number
  qnh: number
  weight: number
  currLimit: number
}

function Envelope3D({ oat, pa, qnh, weight, currLimit }: Envelope3DProps) {
  const project = (t: number, alt: number, w: number) => {
    const nt = (t - (-20)) / 70
    const na = alt / 15000
    const nw = (w - 12000) / 12000

    const cx = 250
    const cy = 180

    const px = cx - nt * 135 + na * 155
    const py = cy + nt * 45 + na * 35 - nw * 105

    return { x: px, y: py }
  }

  const getLimitWeightLocal = (t: number, alt: number) => {
    const base = 24237
    const tempEffect = -65 * (t + 20) - 0.2 * Math.pow(t + 20, 2)
    const altEffect = -0.35 * alt
    const qnhEffect = 8 * (qnh - 1013)
    return Math.max(12000, Math.min(24000, base + tempEffect + altEffect + qnhEffect))
  }

  const tempSteps = 7
  const altSteps = 7
  const polygons: React.ReactNode[] = []

  for (let i = 0; i < tempSteps; i++) {
    for (let j = 0; j < altSteps; j++) {
      const t1 = -20 + (i / tempSteps) * 70
      const t2 = -20 + ((i + 1) / tempSteps) * 70
      const a1 = (j / altSteps) * 15000
      const a2 = ((j + 1) / altSteps) * 15000

      const w11 = getLimitWeightLocal(t1, a1)
      const w21 = getLimitWeightLocal(t2, a1)
      const w22 = getLimitWeightLocal(t2, a2)
      const w12 = getLimitWeightLocal(t1, a2)

      const p11 = project(t1, a1, w11)
      const p21 = project(t2, a1, w21)
      const p22 = project(t2, a2, w22)
      const p12 = project(t1, a2, w12)

      const avgW = (w11 + w21 + w22 + w12) / 4
      const nw = (avgW - 12000) / 12000
      const hue = Math.max(0, Math.min(240, nw * 240))

      const pointsStr = `${p11.x},${p11.y} ${p21.x},${p21.y} ${p22.x},${p22.y} ${p12.x},${p12.y}`
      polygons.push(
        <polygon
          key={`${i}-${j}`}
          points={pointsStr}
          fill={`hsla(${hue}, 85%, 52%, 0.72)`}
          stroke={`hsla(${hue}, 85%, 42%, 0.22)`}
          strokeWidth="0.8"
        />
      )
    }
  }

  const floorGrid: React.ReactNode[] = []
  for (let i = 0; i <= tempSteps; i++) {
    const t = -20 + (i / tempSteps) * 70
    const pStart = project(t, 0, 12000)
    const pEnd = project(t, 15000, 12000)
    floorGrid.push(
      <line key={`ft-${i}`} x1={pStart.x} y1={pStart.y} x2={pEnd.x} y2={pEnd.y} stroke="#E2E8F0" strokeWidth="0.8" strokeDasharray="2 2" />
    )
  }
  for (let j = 0; j <= altSteps; j++) {
    const alt = (j / altSteps) * 15000
    const pStart = project(-20, alt, 12000)
    const pEnd = project(50, alt, 12000)
    floorGrid.push(
      <line key={`fa-${j}`} x1={pStart.x} y1={pStart.y} x2={pEnd.x} y2={pEnd.y} stroke="#E2E8F0" strokeWidth="0.8" strokeDasharray="2 2" />
    )
  }

  const isSafe = weight <= currLimit
  const dotColor = isSafe ? '#1E5EFF' : '#EF4444'

  const currPos = project(oat, pa, weight)
  const floorPos = project(oat, pa, 12000)
  const tempAxisFloor = project(oat, 15000, 12000)
  const altAxisFloor = project(50, pa, 12000)

  const tempTicks = [-20, 0, 20, 40, 50]
  const altTicks = [0, 5000, 10000, 15000]
  const weightTicks = [12000, 14000, 16000, 18000, 20000, 22000, 24000]

  return (
    <div className="relative w-full h-[320px] bg-slate-50/50 rounded-xl border border-slate-100 flex items-center justify-center overflow-hidden">
      <svg viewBox="0 0 540 320" className="w-full h-full font-sans">
        {floorGrid}

        <line x1={project(-20, 0, 12000).x} y1={project(-20, 0, 12000).y} x2={project(-20, 0, 24000).x} y2={project(-20, 0, 24000).y} stroke="#CBD5E1" strokeWidth="0.8" strokeDasharray="2 2" />
        <line x1={project(-20, 15000, 12000).x} y1={project(-20, 15000, 12000).y} x2={project(-20, 15000, 24000).x} y2={project(-20, 15000, 24000).y} stroke="#CBD5E1" strokeWidth="0.8" strokeDasharray="2 2" />

        {polygons}

        <line x1={project(50, 0, 12000).x} y1={project(50, 0, 12000).y} x2={project(50, 0, 24000).x} y2={project(50, 0, 24000).y} stroke="#CBD5E1" strokeWidth="1" />
        <line x1={project(50, 15000, 12000).x} y1={project(50, 15000, 12000).y} x2={project(50, 15000, 24000).x} y2={project(50, 15000, 24000).y} stroke="#CBD5E1" strokeWidth="1" />

        <line x1={project(-20, 0, 24000).x} y1={project(-20, 0, 24000).y} x2={project(50, 0, 24000).x} y2={project(50, 0, 24000).y} stroke="#CBD5E1" strokeWidth="1" />
        <line x1={project(-20, 0, 24000).x} y1={project(-20, 0, 24000).y} x2={project(-20, 15000, 24000).x} y2={project(-20, 15000, 24000).y} stroke="#CBD5E1" strokeWidth="1" />
        <line x1={project(50, 0, 24000).x} y1={project(50, 0, 24000).y} x2={project(50, 15000, 24000).x} y2={project(50, 15000, 24000).y} stroke="#CBD5E1" strokeWidth="1" />
        <line x1={project(-20, 15000, 24000).x} y1={project(-20, 15000, 24000).y} x2={project(50, 15000, 24000).x} y2={project(50, 15000, 24000).y} stroke="#CBD5E1" strokeWidth="1" />

        <line x1={project(-20, 0, 12000).x} y1={project(-20, 0, 12000).y} x2={project(50, 0, 12000).x} y2={project(50, 0, 12000).y} stroke="#475569" strokeWidth="1" />
        <line x1={project(-20, 0, 12000).x} y1={project(-20, 0, 12000).y} x2={project(-20, 15000, 12000).x} y2={project(-20, 15000, 12000).y} stroke="#CBD5E1" strokeWidth="1" />
        <line x1={project(50, 0, 12000).x} y1={project(50, 0, 12000).y} x2={project(50, 15000, 12000).x} y2={project(50, 15000, 12000).y} stroke="#475569" strokeWidth="1" />
        <line x1={project(-20, 15000, 12000).x} y1={project(-20, 15000, 12000).y} x2={project(50, 15000, 12000).x} y2={project(50, 15000, 12000).y} stroke="#CBD5E1" strokeWidth="1" />

        <line x1={currPos.x} y1={currPos.y} x2={floorPos.x} y2={floorPos.y} stroke={dotColor} strokeWidth="1.2" strokeDasharray="3 3" />
        <line x1={floorPos.x} y1={floorPos.y} x2={tempAxisFloor.x} y2={tempAxisFloor.y} stroke="#94A3B8" strokeWidth="1" strokeDasharray="3 3" />
        <line x1={floorPos.x} y1={floorPos.y} x2={altAxisFloor.x} y2={altAxisFloor.y} stroke="#94A3B8" strokeWidth="1" strokeDasharray="3 3" />
        <circle cx={currPos.x} cy={currPos.y} r="5.5" fill={dotColor} stroke="#FFFFFF" strokeWidth="1.5" style={{ filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.22))' }} />

        {tempTicks.map(t => {
          const p = project(t, 15000, 12000)
          return (
            <g key={`tt-${t}`}>
              <line x1={p.x} y1={p.y} x2={p.x - 2} y2={p.y + 4} stroke="#475569" strokeWidth="1" />
              <text x={p.x - 5} y={p.y + 14} textAnchor="middle" className="fill-slate-500 font-semibold text-[9px]">{t}</text>
            </g>
          )
        })}
        <text x="350" y="275" className="fill-slate-600 font-bold text-[10px]" transform="rotate(15, 350, 275)">Temperature (°C)</text>

        {altTicks.map(alt => {
          const p = project(50, alt, 12000)
          return (
            <g key={`at-${alt}`}>
              <line x1={p.x} y1={p.y} x2={p.x + 2} y2={p.y + 4} stroke="#475569" strokeWidth="1" />
              <text x={p.x + 7} y={p.y + 12} textAnchor="start" className="fill-slate-500 font-semibold text-[9px]">{(alt/1000) === 0 ? '0' : `${alt/1000}k`}</text>
            </g>
          )
        })}
        <text x="210" y="270" className="fill-slate-600 font-bold text-[10px]" transform="rotate(-12, 210, 270)">Pressure Alt (ft)</text>

        {weightTicks.map(w => {
          const p = project(50, 0, w)
          return (
            <g key={`wt-${w}`}>
              <line x1={p.x} y1={p.y} x2={p.x - 4} y2={p.y} stroke="#475569" strokeWidth="1" />
              <text x={p.x - 8} y={p.y + 3} textAnchor="end" className="fill-slate-500 font-mono text-[9px]">{w.toLocaleString()}</text>
            </g>
          )
        })}
        <text x="45" y="180" className="fill-slate-600 font-bold text-[10px]" transform="rotate(-90, 45, 180)">Weight (kg)</text>

        <g transform="translate(420, 20)">
          <rect width="105" height="65" fill="#FFFFFF" stroke="#E2E8F0" rx="6" className="shadow-sm" />
          <circle cx="15" cy="15" r="4" fill="#3B82F6" />
          <text x="26" y="18" className="fill-slate-700 text-[9px] font-medium">WAT Limit</text>
          <circle cx="15" cy="30" r="4" fill="#F59E0B" />
          <text x="26" y="33" className="fill-slate-700 text-[9px] font-medium">Runway Limit</text>
          <circle cx="15" cy="45" r="4" fill="#EF4444" />
          <text x="26" y="48" className="fill-slate-700 text-[9px] font-medium">Obstacle Limit</text>
        </g>
        
        <g transform="translate(15, 20)">
          <rect width="115" height="35" fill="#FFFFFF" stroke="#E2E8F0" rx="6" className="shadow-sm" />
          <circle cx="15" cy="17" r="4.5" fill={dotColor} stroke="#FFFFFF" strokeWidth="1" />
          <text x="26" y="20" className="fill-slate-700 text-[9px] font-semibold">Current Weight</text>
        </g>
      </svg>
    </div>
  )
}

export default function PerformanceAnalysis() {
  const [airport, setAirport] = useState('EGPD - Aberdeen')
  const [oat, setOat] = useState(30)
  const [pa, setPa] = useState(215)
  const [qnh, setQnh] = useState(1013)
  const [weight, setWeight] = useState(19296)
  const [view3D, setView3D] = useState(true)

  const [recentAnalyses, setRecentAnalyses] = useState([
    { id: 1, temp: 30, qnh: 1013, flap: '10°', weight: 19296, status: 'SAFE', time: '20:31 UTC' },
    { id: 2, temp: 25, qnh: 1013, flap: '10°', weight: 19296, status: 'SAFE', time: '19:45 UTC' },
    { id: 3, temp: 35, qnh: 1013, flap: '10°', weight: 19296, status: 'EXCEEDS', time: '18:30 UTC' }
  ])

  const currentLimits = getLimitsAtTemp(oat, pa, qnh)
  const isSafe = weight <= currentLimits.wat
  const marginVal = currentLimits.wat - weight
  const marginPct = ((marginVal / currentLimits.wat) * 100).toFixed(1)

  const runwayLimitVal = currentLimits.runway
  const obstacleLimitVal = currentLimits.obstacle
  const climbLimitVal = Math.round(currentLimits.wat + 1588)

  const handleAnalyze = () => {
    const timeStr = `${String(new Date().getUTCHours()).padStart(2, '0')}:${String(new Date().getUTCMinutes()).padStart(2, '0')} UTC`
    const newRun = {
      id: Date.now(),
      temp: oat,
      qnh: qnh,
      flap: '10°',
      weight: weight,
      status: weight <= currentLimits.wat ? 'SAFE' : 'EXCEEDS',
      time: timeStr
    }
    setRecentAnalyses(prev => [newRun, ...prev])
  }

  const applyPreset = (presetName: string) => {
    if (presetName === 'ISA') {
      setOat(15)
      setPa(0)
      setQnh(1013)
    } else if (presetName === 'Hot Day') {
      setOat(35)
      setPa(1000)
      setQnh(1008)
    } else if (presetName === 'Summer') {
      setOat(28)
      setPa(500)
      setQnh(1015)
    } else if (presetName === 'Winter') {
      setOat(-5)
      setPa(0)
      setQnh(1020)
    }
  }

  const chartData = [-20, -10, 0, 10, 20, 30, 40, 50].map(t => {
    const lim = getLimitsAtTemp(t, pa, qnh)
    return {
      temp: t,
      'WAT Limit': lim.wat,
      'Runway Limit': lim.runway,
      'Obstacle Limit': lim.obstacle
    }
  })

  const envelope2DData = [-20, -10, 0, 10, 20, 30, 40, 50].map(t => {
    return {
      temp: t,
      'Sea Level (0 ft)': getLimitsAtTemp(t, 0, qnh).wat,
      '5,000 ft': getLimitsAtTemp(t, 5000, qnh).wat,
      '10,000 ft': getLimitsAtTemp(t, 10000, qnh).wat,
    }
  })

  const activeTempRow = [-20, -10, 0, 10, 20, 30, 40, 50].reduce((prev, curr) => {
    return Math.abs(curr - oat) < Math.abs(prev - oat) ? curr : prev
  }, 30)

  return (
    <div className="space-y-6 max-w-[1600px] mx-auto px-1 sm:px-4 lg:px-6 py-2">
      
      {/* Title Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-2 border-b border-borderc">
        <div>
          <h1 className="text-2xl font-bold text-textprimary tracking-tight">WAT Analysis</h1>
          <p className="text-textsecondary text-sm">Weight and Temperature Analysis</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-1.5 text-xs text-textsecondary bg-white border border-borderc rounded-lg px-3 py-1.5 shadow-sm font-semibold">
            <Clock size={14} className="text-primary animate-pulse-slow" />
            <span>Last Updated: Live Tracking Active</span>
          </div>
          <div className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-50 border border-emerald-100 rounded-lg text-xs font-semibold text-emerald-700">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse-slow" />
            <span>System Online</span>
          </div>
        </div>
      </div>

      {/* Spacious Full-Width Metrics Row at Top */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
        {[
          { label: 'OAT', val: `${oat}°C`, icon: Thermometer, color: 'text-orange-500 bg-orange-50 border-orange-100' },
          { label: 'Pressure Alt', val: `${pa.toLocaleString()} ft`, icon: TrendingUp, color: 'text-blue-500 bg-blue-50 border-blue-100' },
          { label: 'QNH', val: `${qnh} hPa`, icon: Gauge, color: 'text-indigo-500 bg-indigo-50 border-indigo-100' },
          { label: 'Flap Setting', val: '10°', icon: Layers, color: 'text-teal-500 bg-teal-50 border-teal-100' },
          { label: 'Current Weight', val: `${weight.toLocaleString()} kg`, icon: Scale, color: 'text-slate-700 bg-slate-50 border-slate-200' }
        ].map((m, idx) => (
          <div key={idx} className="bg-white border border-borderc rounded-xl p-4 flex items-center gap-3 shadow-sm">
            <div className={`p-2.5 rounded-lg ${m.color.split(' ')[1]} ${m.color.split(' ')[2]} shrink-0`}>
              <m.icon size={16} className={m.color.split(' ')[0]} />
            </div>
            <div className="min-w-0">
              <p className="text-[10px] font-bold text-textsecondary uppercase tracking-wider mb-0.5">{m.label}</p>
              <p className="text-sm font-black text-textprimary truncate">{m.val}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Main Grid Layout - Refactored to 2-Column (4/12 and 8/12) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 lg:gap-8">
        
        {/* ── LEFT COLUMN (col-span-4): INPUTS & RESULTS & LIMITS ── */}
        <div className="lg:col-span-4 flex flex-col gap-6">
          
          {/* Input Parameters Card */}
          <Card className="p-6 bg-white border border-borderc">
            <h2 className="text-sm font-bold text-textprimary mb-4 pb-2 border-b border-slate-100">
              Input Parameters
            </h2>
            <div className="space-y-4">
              <div>
                <label className="block text-[10px] font-bold text-textsecondary uppercase tracking-wider mb-1.5">Airport</label>
                <select
                  className="w-full px-3.5 py-2.5 rounded-lg border border-borderc bg-white text-xs font-semibold text-textprimary focus:border-primary focus:ring-2 focus:ring-primary/15 outline-none transition cursor-pointer"
                  value={airport}
                  onChange={(e) => setAirport(e.target.value)}
                >
                  <option>EGPD - Aberdeen</option>
                  <option>FTTC - Lome</option>
                  <option>HKJK - Nairobi</option>
                  <option>UNAA - Abakan</option>
                </select>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-[10px] font-bold text-textsecondary uppercase tracking-wider mb-1.5">OAT (°C)</label>
                  <div className="relative">
                    <input
                      type="number"
                      className="w-full px-3.5 py-2.5 rounded-lg border border-borderc bg-white text-xs font-semibold text-textprimary focus:border-primary focus:ring-2 focus:ring-primary/15 outline-none transition"
                      value={oat}
                      onChange={(e) => setOat(Number(e.target.value))}
                    />
                    <span className="absolute right-3.5 top-1/2 -translate-y-1/2 text-textsecondary text-xs">°C</span>
                  </div>
                </div>

                <div>
                  <label className="block text-[10px] font-bold text-textsecondary uppercase tracking-wider mb-1.5">QNH (hPa)</label>
                  <div className="relative">
                    <input
                      type="number"
                      className="w-full px-3.5 py-2.5 rounded-lg border border-borderc bg-white text-xs font-semibold text-textprimary focus:border-primary focus:ring-2 focus:ring-primary/15 outline-none transition"
                      value={qnh}
                      onChange={(e) => setQnh(Number(e.target.value))}
                    />
                    <span className="absolute right-3.5 top-1/2 -translate-y-1/2 text-textsecondary text-xs">hPa</span>
                  </div>
                </div>
              </div>

              <div>
                <label className="block text-[10px] font-bold text-textsecondary uppercase tracking-wider mb-1.5">Pressure Altitude (ft)</label>
                <div className="relative">
                  <input
                    type="number"
                    className="w-full px-3.5 py-2.5 rounded-lg border border-borderc bg-white text-xs font-semibold text-textprimary focus:border-primary focus:ring-2 focus:ring-primary/15 outline-none transition"
                    value={pa}
                    onChange={(e) => setPa(Number(e.target.value))}
                  />
                  <span className="absolute right-3.5 top-1/2 -translate-y-1/2 text-textsecondary text-xs font-normal">ft</span>
                </div>
              </div>

              <div>
                <label className="block text-[10px] font-bold text-textsecondary uppercase tracking-wider mb-1.5">Current Weight (kg)</label>
                <div className="relative">
                  <input
                    type="number"
                    className="w-full px-3.5 py-2.5 rounded-lg border border-borderc bg-white text-xs font-bold text-textprimary focus:border-primary focus:ring-2 focus:ring-primary/15 outline-none transition"
                    value={weight}
                    onChange={(e) => setWeight(Number(e.target.value))}
                  />
                  <span className="absolute right-3.5 top-1/2 -translate-y-1/2 text-textsecondary text-xs font-normal">kg</span>
                </div>
              </div>
            </div>

            <div className="mt-5 pt-3 border-t border-slate-100">
              <span className="block text-[10px] font-bold text-textsecondary uppercase tracking-wider mb-2">Quick Presets</span>
              <div className="grid grid-cols-4 gap-2">
                {['ISA', 'Hot Day', 'Summer', 'Winter'].map((preset) => (
                  <button
                    key={preset}
                    onClick={() => applyPreset(preset)}
                    className="py-1.5 text-[10px] font-bold text-textsecondary hover:text-primary bg-slate-50 border border-slate-200 rounded-lg hover:border-primary hover:bg-blue-50 transition duration-150"
                  >
                    {preset}
                  </button>
                ))}
              </div>
            </div>

            <button
              onClick={handleAnalyze}
              className="w-full mt-5 bg-primary hover:bg-primary-dark text-white font-bold py-3 px-4 rounded-xl flex items-center justify-center gap-2 shadow-md hover:shadow-lg transition duration-200 text-xs"
            >
              <Play size={14} fill="currentColor" />
              <span>Analyze WAT</span>
            </button>
          </Card>

          {/* Analysis Result Card */}
          <Card className="p-6 bg-white border border-borderc">
            <div className="flex justify-between items-center mb-3 pb-2 border-b border-slate-100">
              <h2 className="text-sm font-bold text-textprimary">Analysis Result</h2>
              <button className="text-[10px] text-primary font-bold flex items-center gap-1 hover:underline">
                <Download size={12} />
                Export Report
              </button>
            </div>

            <div className="flex items-center justify-start gap-4 py-2 bg-slate-50 border border-slate-100 rounded-xl px-4">
              <div className={`w-12 h-12 rounded-full flex items-center justify-center shrink-0 ${isSafe ? 'bg-success/10 text-success' : 'bg-danger/10 text-danger'}`}>
                {isSafe ? <CheckCircle2 size={26} /> : <AlertTriangle size={26} />}
              </div>
              <div>
                <p className={`text-lg font-black ${isSafe ? 'text-success' : 'text-danger'} tracking-wide leading-none`}>
                  {isSafe ? 'SAFE' : 'EXCEEDS'}
                </p>
                <p className="text-[10px] font-bold text-textsecondary mt-1">
                  {isSafe ? 'Within WAT Limit' : 'Exceeds WAT Limit'}
                </p>
              </div>
            </div>

            <div className="mt-4 space-y-2 text-xs">
              <div className="flex justify-between py-1 border-b border-slate-50">
                <span className="text-textsecondary font-medium">WAT Limit</span>
                <span className="text-textprimary font-bold font-mono">{currentLimits.wat.toLocaleString()} kg</span>
              </div>
              <div className="flex justify-between py-1 border-b border-slate-50">
                <span className="text-textsecondary font-medium">Current Weight</span>
                <span className="text-textprimary font-bold font-mono">{weight.toLocaleString()} kg</span>
              </div>
              <div className="flex justify-between py-1 border-b border-slate-50">
                <span className="text-textsecondary font-medium">Margin</span>
                <span className={`font-bold font-mono ${isSafe ? 'text-success' : 'text-danger'}`}>
                  {isSafe ? '+' : ''}{marginVal.toLocaleString()} kg ({isSafe ? '+' : ''}{marginPct}%)
                </span>
              </div>
              <div className="flex justify-between py-1">
                <span className="text-textsecondary font-medium">Limiting Factor</span>
                <span className="text-textprimary font-black text-right">WAT (Flap 10°)</span>
              </div>
            </div>
          </Card>

          {/* Limiting Factors Card */}
          <Card className="p-6 bg-white border border-borderc">
            <h2 className="text-sm font-bold text-textprimary mb-3 pb-2 border-b border-slate-100">Limiting Factors</h2>
            <div className="space-y-2 text-xs">
              <div className="flex items-center justify-between p-2.5 bg-slate-50 border border-slate-200/50 rounded-xl hover:border-slate-300 transition">
                <span className="font-semibold text-textprimary">WAT (Flap 10°)</span>
                <span className={`px-2.5 py-0.5 text-[9px] font-black rounded-full ${isSafe ? 'bg-success/15 text-success' : 'bg-danger/15 text-danger'}`}>
                  {isSafe ? 'LIMITING' : 'EXCEEDED'}
                </span>
              </div>
              <div className="flex items-center justify-between p-2.5 bg-slate-50 border border-slate-200/50 rounded-xl hover:border-slate-300 transition">
                <span className="font-semibold text-textsecondary">Runway Limit</span>
                <span className={`px-2.5 py-0.5 text-[9px] font-black rounded-full ${weight <= runwayLimitVal ? 'bg-success/10 text-success' : 'bg-danger/10 text-danger'}`}>
                  {weight <= runwayLimitVal ? 'OK' : 'EXCEEDED'}
                </span>
              </div>
              <div className="flex items-center justify-between p-2.5 bg-slate-50 border border-slate-200/50 rounded-xl hover:border-slate-300 transition">
                <span className="font-semibold text-textsecondary">Obstacle Limit</span>
                <span className={`px-2.5 py-0.5 text-[9px] font-black rounded-full ${weight <= obstacleLimitVal ? 'bg-success/10 text-success' : 'bg-danger/10 text-danger'}`}>
                  {weight <= obstacleLimitVal ? 'OK' : 'EXCEEDED'}
                </span>
              </div>
              <div className="flex items-center justify-between p-2.5 bg-slate-50 border border-slate-200/50 rounded-xl hover:border-slate-300 transition">
                <span className="font-semibold text-textsecondary">Climb Limit</span>
                <span className={`px-2.5 py-0.5 text-[9px] font-black rounded-full ${weight <= climbLimitVal ? 'bg-success/10 text-success' : 'bg-danger/10 text-danger'}`}>
                  {weight <= climbLimitVal ? 'OK' : 'EXCEEDED'}
                </span>
              </div>
            </div>
          </Card>
        </div>

        {/* ── RIGHT COLUMN (col-span-8): CHARTS & HISTORY ── */}
        <div className="lg:col-span-8 flex flex-col gap-6">
          
          {/* WAT Chart Card */}
          <Card className="p-6 bg-white border border-borderc">
            <div className="flex justify-between items-center mb-4 pb-2 border-b border-slate-100">
              <h2 className="text-sm font-bold text-textprimary flex items-center gap-2">
                <TrendingUp size={16} className="text-primary" />
                WAT Chart - Flap 10°
              </h2>
              <button className="text-[10px] font-bold text-primary flex items-center gap-1 hover:underline">
                <HelpCircle size={14} />
                Chart Guide
              </button>
            </div>

            <div className="w-full h-[280px]">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData} margin={{ top: 10, right: 10, bottom: 5, left: -5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" />
                  <XAxis
                    dataKey="temp"
                    tick={{ fontSize: 10, fill: '#64748B' }}
                    label={{ value: 'Outside Air Temperature (°C)', position: 'insideBottom', offset: -5, fontSize: 10, fill: '#64748B', fontWeight: 600 }}
                  />
                  <YAxis
                    domain={[14000, 24000]}
                    tick={{ fontSize: 10, fill: '#64748B' }}
                    label={{ value: 'Aircraft Weight (kg)', angle: -90, position: 'insideLeft', offset: 5, fontSize: 10, fill: '#64748B', fontWeight: 600 }}
                  />
                  <Tooltip
                    contentStyle={{ borderRadius: 8, border: '1px solid #E2E8F0', fontSize: 11, fontWeight: 600 }}
                    formatter={(val) => [`${Number(val).toLocaleString()} kg`]}
                    labelFormatter={(label) => `OAT: ${label}°C`}
                  />
                  <Legend wrapperStyle={{ fontSize: 10, fontWeight: 600, paddingTop: 8 }} />
                  
                  <ReferenceLine x={oat} stroke="#64748B" strokeDasharray="3 3" label={{ value: `OAT: ${oat}°C`, position: 'top', fill: '#64748B', fontSize: 9, fontWeight: 700 }} />
                  <ReferenceLine y={weight} stroke="#082A63" strokeDasharray="3 3" label={{ value: `Weight: ${weight.toLocaleString()} kg`, position: 'right', fill: '#082A63', fontSize: 9, fontWeight: 700 }} />

                  <Line type="monotone" dataKey="WAT Limit" stroke="#1E5EFF" strokeWidth={2.5} dot={{ r: 3 }} activeDot={{ r: 5 }} />
                  <Line type="monotone" dataKey="Runway Limit" stroke="#F59E0B" strokeWidth={2.0} dot={{ r: 2 }} />
                  <Line type="monotone" dataKey="Obstacle Limit" stroke="#EF4444" strokeWidth={1.8} strokeDasharray="4 3" dot={{ r: 2 }} />
                </LineChart>
              </ResponsiveContainer>
            </div>

            <div className="bg-blue-50/70 border border-blue-100 rounded-lg p-3 mt-4 flex items-start gap-2.5">
              <HelpCircle className="text-blue-600 shrink-0 mt-0.5" size={15} />
              <p className="text-[11px] text-blue-700 leading-normal font-semibold">
                Note: WAT limit decreases as temperature increases. Ensure aircraft weight is below the limit line.
              </p>
            </div>
          </Card>

          {/* Performance Envelope Card */}
          <Card className="p-6 bg-white border border-borderc">
            <div className="flex justify-between items-center mb-4 pb-2 border-b border-slate-100">
              <h2 className="text-sm font-bold text-textprimary flex items-center gap-2">
                <Shield size={16} className="text-primary" />
                Performance Envelope
              </h2>
              <div className="flex bg-slate-100 p-0.5 rounded-lg border border-slate-200/50">
                <button
                  onClick={() => setView3D(false)}
                  className={`px-2.5 py-1 text-[10px] font-bold rounded-md transition ${!view3D ? 'bg-white text-primary shadow-sm' : 'text-textsecondary hover:text-textprimary'}`}
                >
                  2D Chart
                </button>
                <button
                  onClick={() => setView3D(true)}
                  className={`px-2.5 py-1 text-[10px] font-bold rounded-md transition ${view3D ? 'bg-white text-primary shadow-sm' : 'text-textsecondary hover:text-textprimary'}`}
                >
                  3D Envelope
                </button>
              </div>
            </div>

            {view3D ? (
              <Envelope3D oat={oat} pa={pa} qnh={qnh} weight={weight} currLimit={currentLimits.wat} />
            ) : (
              <div className="w-full h-[320px]">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={envelope2DData} margin={{ top: 10, right: 10, bottom: 5, left: -5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" />
                    <XAxis
                      dataKey="temp"
                      tick={{ fontSize: 10, fill: '#64748B' }}
                      label={{ value: 'Outside Air Temperature (°C)', position: 'insideBottom', offset: -5, fontSize: 10, fill: '#64748B', fontWeight: 600 }}
                    />
                    <YAxis
                      domain={[12000, 24000]}
                      tick={{ fontSize: 10, fill: '#64748B' }}
                      label={{ value: 'WAT Limit Weight (kg)', angle: -90, position: 'insideLeft', offset: 5, fontSize: 10, fill: '#64748B', fontWeight: 600 }}
                    />
                    <Tooltip
                      contentStyle={{ borderRadius: 8, border: '1px solid #E2E8F0', fontSize: 11, fontWeight: 600 }}
                      formatter={(val) => [`${Number(val).toLocaleString()} kg`]}
                    />
                    <Legend wrapperStyle={{ fontSize: 10, fontWeight: 600, paddingTop: 8 }} />
                    
                    <ReferenceLine x={oat} stroke="#64748B" strokeDasharray="3 3" />
                    <ReferenceLine y={weight} stroke="#082A63" strokeDasharray="3 3" />

                    <Line type="monotone" dataKey="Sea Level (0 ft)" stroke="#3B82F6" strokeWidth={2} dot={{ r: 2 }} />
                    <Line type="monotone" dataKey="5,000 ft" stroke="#F59E0B" strokeWidth={2} dot={{ r: 2 }} />
                    <Line type="monotone" dataKey="10,000 ft" stroke="#EF4444" strokeWidth={2} dot={{ r: 2 }} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            )}
          </Card>

          {/* Recent Analyses Card (Spacious Wide layout!) */}
          <Card className="p-6 bg-white border border-borderc">
            <div className="flex justify-between items-center pb-2 mb-3 border-b border-slate-100">
              <h2 className="text-sm font-bold text-textprimary flex items-center gap-1.5">
                Recent Analyses
              </h2>
              <button className="text-[10px] text-primary font-bold hover:underline">View All History</button>
            </div>
            
            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left border-collapse min-w-[500px]">
                <thead>
                  <tr className="text-textsecondary border-b border-slate-100 text-[9px] uppercase tracking-wider font-bold">
                    <th className="pb-2.5">Time</th>
                    <th className="pb-2.5">Weight (kg)</th>
                    <th className="pb-2.5">OAT</th>
                    <th className="pb-2.5">QNH</th>
                    <th className="pb-2.5">Flap</th>
                    <th className="pb-2.5">Status</th>
                    <th className="pb-2.5 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {recentAnalyses.slice(0, 4).map((run) => (
                    <tr key={run.id} className="hover:bg-slate-50/50 transition duration-150">
                      <td className="py-2.5 font-semibold text-textsecondary">{run.time}</td>
                      <td className="py-2.5 font-mono font-bold text-textprimary">{run.weight.toLocaleString()}</td>
                      <td className="py-2.5 font-mono text-slate-700">{run.temp}°C</td>
                      <td className="py-2.5 font-mono text-slate-700">{run.qnh} hPa</td>
                      <td className="py-2.5 font-semibold text-slate-600">{run.flap}</td>
                      <td className="py-2.5">
                        <span className={`px-2.5 py-0.5 text-[9px] font-black rounded-full ${run.status === 'SAFE' ? 'bg-success/10 text-success' : 'bg-danger/10 text-danger'}`}>
                          {run.status}
                        </span>
                      </td>
                      <td className="py-2.5 text-right">
                        <button
                          onClick={() => {
                            setOat(run.temp)
                            setQnh(run.qnh)
                            setWeight(run.weight)
                          }}
                          className="text-[10px] text-primary hover:text-primary-dark font-bold bg-blue-50 hover:bg-blue-100 px-2 py-1 rounded transition"
                        >
                          Load Run
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </div>

      </div>

      {/* ── BOTTOM ROW: WAT LIMITS BREAKDOWN TABLE ── */}
      <Card className="p-6 bg-white border border-borderc">
        <h2 className="text-sm font-bold text-textprimary mb-4 pb-2 border-b border-slate-100 flex items-center gap-2">
          <Layers size={15} className="text-primary" />
          WAT Limits Breakdown (Flap 10°)
        </h2>
        <div className="overflow-x-auto">
          <table className="w-full text-xs text-left border-collapse min-w-[500px]">
            <thead>
              <tr className="text-textsecondary border-b border-slate-100 text-[10px] uppercase tracking-wider font-semibold">
                <th className="pb-3">Temperature (°C)</th>
                <th className="pb-3 text-right">WAT Limit (kg)</th>
                <th className="pb-3 text-right">Runway Limit (kg)</th>
                <th className="pb-3 text-right">Obstacle Limit (kg)</th>
              </tr>
            </thead>
            <tbody>
              {[-20, -10, 0, 10, 20, 30, 40, 50].map((t) => {
                const shift = getShift(pa, qnh)
                const watL = BASE_LIMITS[t].wat + shift
                const rwyL = BASE_LIMITS[t].runway + shift
                const obsL = BASE_LIMITS[t].obstacle + shift
                const isActive = t === activeTempRow

                return (
                  <tr
                    key={t}
                    className={`border-b border-slate-50 last:border-0 transition duration-150 ${isActive ? 'bg-blue-50/80 text-primary font-bold border-l-4 border-l-primary' : 'text-slate-600 hover:bg-slate-50/20'}`}
                  >
                    <td className="py-2.5 px-3 font-semibold">{t}°C</td>
                    <td className="py-2.5 text-right font-mono font-bold">{watL.toLocaleString()}</td>
                    <td className="py-2.5 text-right font-mono font-bold">{rwyL.toLocaleString()}</td>
                    <td className="py-2.5 text-right font-mono font-bold">{obsL.toLocaleString()}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  )
}
