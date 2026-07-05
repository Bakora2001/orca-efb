import { useState, useEffect } from 'react'
import {
  Save, Play, RefreshCw, Calendar, Clock, Edit3,
  RotateCcw, FileText, Send, Download, AlertTriangle,
  CheckCircle2, Gauge, Plane, Wind, Thermometer, Layers,
  ChevronDown
} from 'lucide-react'
import Card from '../components/ui/Card'

/* ── Live UTC Clock Hook ── */
function useUTC() {
  const [t, setT] = useState(new Date())
  useEffect(() => {
    const i = setInterval(() => setT(new Date()), 1000)
    return () => clearInterval(i)
  }, [])
  const p = (n: number) => String(n).padStart(2, '0')
  return {
    time: `${p(t.getUTCHours())}:${p(t.getUTCMinutes())}:${p(t.getUTCSeconds())} UTC`,
    date: t.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }).toUpperCase(),
  }
}

/* ── Section Header ── */
function SecNum({ num }: { num: number }) {
  return (
    <span className="w-5 h-5 rounded-full bg-primary text-white text-[10px] font-black flex items-center justify-center shrink-0">
      {num}
    </span>
  )
}

function Sec({ num, title, right }: { num: number; title: string; right?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between pb-2 mb-4 border-b border-slate-100">
      <div className="flex items-center gap-2">
        <span className="w-5 h-5 rounded-full bg-primary text-white text-[10px] font-black flex items-center justify-center shrink-0">
          {num}
        </span>
        <span className="text-xs font-bold text-textprimary tracking-wide">{title}</span>
      </div>
      {right}
    </div>
  )
}

/* ── Dropdown Field component ── */
function SF({ label, value, options }: { label: string; value: string; options: string[] }) {
  return (
    <div>
      <label className="block text-[9px] font-bold text-textsecondary uppercase tracking-wider mb-1">{label}</label>
      <div className="relative">
        <select
          className="w-full px-2.5 py-1.5 rounded-lg border border-borderc bg-white text-xs font-semibold text-textprimary focus:border-primary focus:ring-2 focus:ring-primary/15 outline-none cursor-pointer transition appearance-none"
          defaultValue={value}
        >
          {options.map(o => <option key={o}>{o}</option>)}
        </select>
        <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-textsecondary text-[8px] pointer-events:none">▼</span>
      </div>
    </div>
  )
}

/* ── Weight Table Row ── */
function TR({ icon, label, kg, lb, bold }: { icon?: string; label: string; kg: number; lb: number; bold?: boolean }) {
  return (
    <div className={`grid grid-cols-12 py-2 border-b border-slate-50 items-center text-xs last:border-0 ${bold ? 'font-bold bg-slate-50/50 -mx-4 px-4 py-2.5 border-t border-b border-slate-100' : ''}`}>
      <span className={`col-span-6 flex items-center gap-2 ${bold ? 'text-textprimary font-black' : 'text-slate-600'}`}>
        {icon && <span className="text-xs">{icon}</span>}
        {label}
      </span>
      <span className={`col-span-3 text-right font-mono font-bold ${bold ? 'text-textprimary' : 'text-slate-700'}`}>
        {kg.toLocaleString()}
      </span>
      <span className={`col-span-3 text-right font-mono ${bold ? 'text-textprimary font-black' : 'text-textsecondary'}`}>
        {lb.toLocaleString()}
      </span>
    </div>
  )
}

/* ════ Main Component ════ */
export default function DispatchCenter() {
  const { time, date } = useUTC()

  return (
    <div className="space-y-6 max-w-7xl mx-auto px-1 sm:px-4 lg:px-6">
      
      {/* ── Page Header ── */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 pb-2 border-b border-borderc">
        <div>
          <h1 className="text-2xl font-bold text-textprimary tracking-tight">Dispatch Center</h1>
          <p className="text-textsecondary text-sm mt-1">Create and manage dispatch operations</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <div className="text-right">
            <div className="text-sm font-bold text-textprimary font-mono leading-tight">{time}</div>
            <div className="text-[10px] text-textsecondary font-medium">{date}</div>
          </div>
          <div className="flex items-center gap-1.5 bg-success/15 border border-success/20 rounded-full px-3 py-1 text-xs font-semibold text-success">
            <span className="w-1.5 h-1.5 rounded-full bg-success animate-pulse" />
            System Online
          </div>
          <div className="relative cursor-pointer p-1.5 bg-white border border-borderc rounded-lg shadow-sm hover:bg-slate-50 transition">
            <span className="text-sm">🔔</span>
            <span className="absolute -top-1 -right-1 w-4 h-4 bg-danger rounded-full text-[9px] font-black text-white flex items-center justify-center">3</span>
          </div>
          <div className="flex items-center gap-2.5 pl-3 border-l border-borderc">
            <div className="w-8 h-8 rounded-full bg-primary text-white flex items-center justify-center text-xs font-bold shadow-sm">CV</div>
            <div className="hidden sm:block text-left">
              <p className="text-xs font-semibold text-textprimary leading-tight">Captain Victor</p>
              <p className="text-[10px] text-textsecondary leading-tight">Dispatcher</p>
            </div>
            <ChevronDown size={12} className="text-textsecondary" />
          </div>
        </div>
      </div>

      {/* ── Dispatch Meta Bar ── */}
      <Card className="p-4 flex flex-col md:flex-row md:items-center justify-between gap-4 md:gap-6">
        <div className="flex flex-wrap items-center gap-4 md:gap-6 text-xs font-semibold">
          <div>
            <div className="text-[9px] font-bold text-textsecondary uppercase tracking-wider mb-0.5">Dispatch ID</div>
            <div className="flex items-center gap-1.5">
              <span className="font-mono text-textprimary font-bold text-sm">DSP-240620-0017</span>
              <button className="text-textsecondary hover:text-primary transition"><RefreshCw size={12} /></button>
            </div>
          </div>
          <div className="hidden md:block w-px h-8 bg-slate-200" />
          <div>
            <div className="text-[9px] font-bold text-textsecondary uppercase tracking-wider mb-0.5">Flight Date</div>
            <div className="flex items-center gap-1.5 text-textprimary">
              <Calendar size={13} className="text-textsecondary" />
              <span>24 JUN 2026</span>
            </div>
          </div>
          <div className="hidden md:block w-px h-8 bg-slate-200" />
          <div>
            <div className="text-[9px] font-bold text-textsecondary uppercase tracking-wider mb-0.5">Flight Time (UTC)</div>
            <div className="flex items-center gap-1.5 text-textprimary">
              <Clock size={13} className="text-textsecondary" />
              <span>10:30</span>
            </div>
          </div>
          <div className="hidden md:block w-px h-8 bg-slate-200" />
          <div>
            <div className="text-[9px] font-bold text-textsecondary uppercase tracking-wider mb-0.5">Aircraft</div>
            <div className="flex items-center gap-1.5 text-textprimary">
              <Plane size={13} className="text-textsecondary" />
              <span>5Y-DWN · DASH 8-300</span>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-3.5 border-t border-slate-100 pt-3.5 md:border-t-0 md:pt-0">
          <button className="flex-1 md:flex-none flex items-center justify-center gap-2 py-2 px-4 rounded-xl border border-borderc bg-white text-xs font-bold text-textsecondary hover:bg-slate-50 transition duration-150">
            <Save size={13} />
            <span>Save Draft</span>
          </button>
          <button className="flex-1 md:flex-none flex items-center justify-center gap-2 py-2 px-5 bg-primary hover:bg-primary-dark text-white rounded-xl text-xs font-bold shadow-md hover:shadow-lg transition duration-200">
            <Play size={13} fill="white" />
            <span>Run Analysis</span>
          </button>
        </div>
      </Card>

      {/* Spacious 2-Column Responsive Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 lg:gap-8">
        
        {/* ── LEFT COLUMN: FLIGHT INFO & WEATHER (col-span-7) ── */}
        <div className="lg:col-span-7 space-y-6 lg:space-y-8">
          
          {/* ① Flight / Route */}
          <Card className="p-6">
            <Sec num={1} title="Flight / Route" />
            
            <div className="grid grid-cols-1 md:grid-cols-12 gap-6 items-center mb-5">
              {/* Aircraft illustration */}
              <div className="md:col-span-5 text-center flex flex-col items-center">
                <div className="bg-slate-50 border border-slate-100 rounded-xl p-3 w-full max-w-[200px] mb-2 flex items-center justify-center shadow-sm">
                  <svg viewBox="0 0 120 55" className="w-full h-12">
                    <g transform="translate(8,4)">
                      <path d="M 5 26 C 5 20 16 17 32 17 L 86 17 C 96 17 103 21 103 26 C 103 32 96 36 86 36 L 32 36 C 16 36 5 32 5 26 Z" fill="#C8D5EE" stroke="#A0B4D4" strokeWidth=".8"/>
                      <path d="M 96 17 L 103 7 L 106 7 L 100 17" fill="#B0C2DE" stroke="#A0B4D4" strokeWidth=".5"/>
                      <path d="M 36 26 L 20 47 L 22 49 L 52 33 L 62 33 L 84 50 L 86 48 L 66 26 Z" fill="#A8BCDC" stroke="#8EAAC8" strokeWidth=".6"/>
                      <ellipse cx="34" cy="48" rx="8" ry="3" fill="#7A8EA6"/>
                      <ellipse cx="76" cy="50" rx="7" ry="2.5" fill="#7A8EA6"/>
                      {[28,35,42,49,56,63,70,77].map(wx => <circle key={wx} cx={wx} cy="22" r="2" fill="#5880B0" opacity=".85"/>)}
                      <text x="42" y="30" fontSize="5.5" fill="#1E3A5F" fontWeight="700" fontFamily="monospace">5Y-DWN</text>
                    </g>
                  </svg>
                </div>
                <p className="text-sm font-black font-mono text-textprimary tracking-wider leading-none">5Y-DWN</p>
                <p className="text-[10px] text-textsecondary mt-1 font-bold">DASH 8 – 300</p>
              </div>

              {/* Airports Info */}
              <div className="md:col-span-7 space-y-4">
                {[
                  { label: 'Departure', code: 'EGPD', name: 'Aberdeen International' },
                  { label: 'Destination', code: 'UNAA', name: 'Eldoret International' },
                  { label: 'Alternate', code: 'FTTC', name: 'Abeche Airport' },
                ].map(a => (
                  <div key={a.code} className="flex items-center justify-between pb-3 border-b border-slate-100 last:border-0 last:pb-0">
                    <div>
                      <span className="text-[9px] font-bold text-textsecondary uppercase tracking-wider block mb-0.5">{a.label} Airport</span>
                      <div className="flex items-baseline gap-2">
                        <span className="text-base font-black font-mono text-primary leading-none">{a.code}</span>
                        <span className="text-[11px] text-textsecondary truncate max-w-[150px]">{a.name}</span>
                      </div>
                    </div>
                    <button className="text-[10px] font-bold text-primary bg-blue-50 border border-blue-100 rounded px-2.5 py-0.5 hover:bg-blue-100 transition">AIP</button>
                  </div>
                ))}
              </div>
            </div>

            {/* Distances Banner */}
            <div className="bg-slate-50 border border-slate-100 rounded-xl p-3.5 text-xs text-slate-700 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2.5">
              <div className="flex items-center gap-2">
                <Plane size={13} className="text-primary" />
                <span className="font-semibold text-textprimary">EGPD → UNAA</span>
                <span className="text-textsecondary text-[11px] font-medium">(Route Distance)</span>
              </div>
              <span className="font-bold text-textprimary font-mono text-sm self-end sm:self-auto">4,245 NM</span>
            </div>
            
            <div className="bg-slate-50 border border-slate-100 rounded-xl p-3.5 text-xs text-slate-700 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2.5 mt-2">
              <div className="flex items-center gap-2">
                <Plane size={13} className="text-slate-400" />
                <span className="font-semibold text-textsecondary">EGPD → FTTC (ALT)</span>
                <span className="text-textsecondary text-[11px] font-medium">(Alternate Distance)</span>
              </div>
              <span className="font-bold text-textprimary font-mono text-sm self-end sm:self-auto">2,891 NM</span>
            </div>
          </Card>

          {/* ② Weather at Departure */}
          <Card className="p-6">
            <Sec num={2} title="Weather at Departure (EGPD)" right={
              <span className="text-[9px] font-black text-primary bg-blue-50 border border-blue-100 px-2 py-0.5 rounded uppercase tracking-wider">METAR</span>
            } />

            {/* Weather summary grid */}
            <div className="flex flex-col sm:flex-row items-start gap-6 border-b border-slate-100 pb-5 mb-5">
              <div className="flex items-center gap-3.5 pr-6 border-r-0 sm:border-r border-slate-100 w-full sm:w-auto">
                <span className="text-4xl">⛅</span>
                <div>
                  <h3 className="text-3xl font-black text-textprimary leading-none">30°C</h3>
                  <span className="text-[10px] text-textsecondary font-bold uppercase tracking-wider">OAT at Departure</span>
                </div>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-4 flex-1 w-full text-xs">
                {[
                  { label: 'Wind', val: '220° / 12 kt' },
                  { label: 'QNH', val: '1013 hPa' },
                  { label: 'Visibility', val: '10 km' },
                  { label: 'Clouds', val: 'SCT 3k ft' },
                  { label: 'Dew Point', val: '18°C' },
                ].map((item) => (
                  <div key={item.label}>
                    <span className="text-[9px] font-bold text-textsecondary uppercase tracking-wider block mb-1">{item.label}</span>
                    <span className="font-bold text-textprimary font-mono">{item.val}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Station data and hourly forecast side-by-side */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <h3 className="text-xs font-bold text-textprimary mb-3 uppercase tracking-wider">Station Data</h3>
                <div className="space-y-1.5 text-xs">
                  {[
                    { k: 'Pressure Alt.', v: '215 ft' },
                    { k: 'Humidity', v: '55%' },
                    { k: 'OAT Category', v: 'HOT DAY' },
                    { k: 'Ceiling', v: 'SCT 3,000 ft' },
                    { k: 'RVR', v: '> 10 km' },
                    { k: 'WX Phenomena', v: 'NIL' },
                  ].map(f => (
                    <div key={f.k} className="flex justify-between py-1 border-b border-slate-50 last:border-0">
                      <span className="text-textsecondary font-medium">{f.k}</span>
                      <span className="font-bold text-textprimary font-mono">{f.v}</span>
                    </div>
                  ))}
                </div>
              </div>
              
              <div>
                <h3 className="text-xs font-bold text-textprimary mb-3 uppercase tracking-wider">Hourly Forecast</h3>
                <div className="space-y-2 text-xs">
                  {[
                    { t: '10:00', i: '⛅', c: '30°C', w: '12kt' },
                    { t: '11:00', i: '🌤', c: '31°C', w: '10kt' },
                    { t: '12:00', i: '⛅', c: '31°C', w: '12kt' },
                    { t: '13:00', i: '☁️', c: '32°C', w: '14kt' },
                    { t: '14:00', i: '🌧', c: '32°C', w: '15kt' },
                  ].map(h => (
                    <div key={h.t} className="flex items-center justify-between py-1 border-b border-slate-50 last:border-0">
                      <span className="text-textsecondary w-10">{h.t}</span>
                      <span className="text-base text-center w-8">{h.i}</span>
                      <span className="font-bold text-textprimary font-mono w-12">{h.c}</span>
                      <span className="text-textsecondary font-mono w-12 text-right">{h.w}</span>
                    </div>
                  ))}
                </div>
                <button className="w-full mt-4 flex items-center justify-center gap-2 py-2 border border-borderc rounded-lg text-xs font-bold text-primary bg-white hover:bg-slate-50 transition">
                  <span>View Full Weather</span>
                  <span>↗</span>
                </button>
              </div>
            </div>
          </Card>
        </div>

        {/* ── RIGHT COLUMN: WEIGHTS & RESULTS (col-span-5) ── */}
        <div className="lg:col-span-5 space-y-6 lg:space-y-8">
          
          {/* ③ Conditions & Parameters */}
          <Card className="p-6">
            <Sec num={3} title="Conditions & Parameters" />
            <div className="space-y-4">
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-[9px] font-bold text-textsecondary uppercase tracking-wider mb-1">OAT (°C)</label>
                  <input className="w-full px-2 py-1.5 rounded-lg border border-borderc bg-white text-xs font-semibold text-textprimary focus:border-primary focus:ring-2 focus:ring-primary/15 outline-none transition" type="number" defaultValue={30}/>
                </div>
                <div>
                  <label className="block text-[9px] font-bold text-textsecondary uppercase tracking-wider mb-1">QNH (hPa)</label>
                  <input className="w-full px-2 py-1.5 rounded-lg border border-borderc bg-white text-xs font-semibold text-textprimary focus:border-primary focus:ring-2 focus:ring-primary/15 outline-none transition" type="number" defaultValue={1013}/>
                </div>
                <div>
                  <label className="block text-[9px] font-bold text-textsecondary uppercase tracking-wider mb-1">Wind</label>
                  <input className="w-full px-2 py-1.5 rounded-lg border border-borderc bg-white text-xs font-semibold text-textprimary focus:border-primary focus:ring-2 focus:ring-primary/15 outline-none transition" type="text" defaultValue="220/12kt"/>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <SF label="Runway" value="16" options={['16','34','04','22']}/>
                <SF label="Flap Setting" value="Flap 10°" options={['Flap 5°','Flap 10°','Flap 15°']}/>
                <SF label="Anti-Ice" value="OFF" options={['OFF','ON','AUTO']}/>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <SF label="Runway Surface" value="Dry" options={['Dry','Wet','Contaminated']}/>
                <SF label="Runway Cond." value="Good" options={['Good','Medium','Poor']}/>
                <SF label="Takeoff Config" value="Standard" options={['Standard','Reduced']}/>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <SF label="Blend / Packs" value="ON" options={['ON','OFF']}/>
                <SF label="AC Condition" value="Standard" options={['Standard','Hot','Cold']}/>
              </div>

              <div>
                <label className="block text-[9px] font-bold text-textsecondary uppercase tracking-wider mb-1">Remarks</label>
                <input className="w-full px-3 py-2 rounded-lg border border-borderc bg-white text-xs text-textprimary focus:border-primary focus:ring-2 focus:ring-primary/15 outline-none transition" placeholder="Enter remarks (optional)..."/>
              </div>
            </div>
          </Card>

          {/* ④ Weights & Payload */}
          <Card className="p-6">
            <Sec num={4} title="Weights & Payload" />
            <div className="grid grid-cols-12 pb-1.5 border-b border-slate-100 mb-2">
              <div className="col-span-6" />
              <div className="col-span-3 text-[9px] font-bold text-textsecondary uppercase tracking-wider text-right">kg</div>
              <div className="col-span-3 text-[9px] font-bold text-textsecondary uppercase tracking-wider text-right">lb</div>
            </div>
            <div className="divide-y divide-slate-50">
              <TR icon="🏗" label="Basic Empty Weight" kg={12270} lb={27070}/>
              <TR icon="👥" label="Passengers (100 kg)" kg={0} lb={0}/>
              <TR icon="📦" label="Cargo" kg={0} lb={0}/>
              <TR icon="⛽" label="Fuel (Total)" kg={7735} lb={17052}/>
              <TR icon="✈" label="Ramp Weight" kg={20005} lb={44122} bold/>
              <TR icon="⚖" label="ZFW" kg={12270} lb={27070}/>
            </div>
            <button className="w-full mt-4 flex items-center justify-center gap-2 py-2 border border-primary text-primary hover:bg-blue-50/50 rounded-xl text-xs font-bold transition">
              <Edit3 size={13} />
              <span>Edit Weights & Payload</span>
            </button>
          </Card>

          {/* ⑤ Fuel Summary */}
          <Card className="p-6">
            <Sec num={5} title="Fuel Summary" />
            <div className="grid grid-cols-12 pb-1.5 border-b border-slate-100 mb-2">
              <div className="col-span-6 text-[9px] font-bold text-textsecondary uppercase tracking-wider">Component</div>
              <div className="col-span-3 text-[9px] font-bold text-textsecondary uppercase tracking-wider text-right">lb</div>
              <div className="col-span-3 text-[9px] font-bold text-textsecondary uppercase tracking-wider text-right">kg</div>
            </div>
            <div className="divide-y divide-slate-50">
              {[
                { l: 'Trip Fuel', lb: 0, kg: 0 },
                { l: 'Alternate Fuel', lb: 16427, kg: 7451 },
                { l: 'Contingency', lb: 0, kg: 0 },
                { l: 'Final Reserve (30 min)', lb: 625, kg: 283 },
                { l: 'Extra / Tankering', lb: 0, kg: 0 },
                { l: 'TOTAL FUEL', lb: 17052, kg: 7735, bold: true },
              ].map(r => (
                <div key={r.l} className={`grid grid-cols-12 py-2 items-center text-xs ${r.bold ? 'font-bold bg-slate-50/50 -mx-4 px-4 py-2.5 border-t border-b border-slate-100' : ''}`}>
                  <span className={`col-span-6 ${r.bold ? 'text-textprimary font-black' : 'text-slate-600'}`}>{r.l}</span>
                  <span className={`col-span-3 text-right font-mono font-bold ${r.bold ? 'text-textprimary' : 'text-slate-700'}`}>{r.lb.toLocaleString()}</span>
                  <span className={`col-span-3 text-right font-mono ${r.bold ? 'text-textprimary font-black' : 'text-textsecondary'}`}>{r.kg.toLocaleString()}</span>
                </div>
              ))}
            </div>
            
            <div className="bg-orange-50 border border-orange-100 rounded-xl p-3 mt-4 flex items-start gap-2.5 text-xs text-orange-700">
              <AlertTriangle size={15} className="text-orange-600 shrink-0 mt-0.5" />
              <p className="leading-tight font-semibold">
                Maximum fuel exceeded by 11,652 lb (Max allowed 5,400 lb)
              </p>
            </div>
          </Card>

          {/* ⑥ Payload Result */}
          <Card className="p-6">
            <Sec num={6} title="Payload Result" />
            <div className="grid grid-cols-2 gap-3 text-xs mb-3">
              <div className="bg-slate-50 border border-slate-100 rounded-xl p-3 flex flex-col justify-center">
                <span className="text-[9px] font-bold text-textsecondary uppercase tracking-wider block mb-0.5">RTOW (Flap 10°)</span>
                <span className="text-sm font-black font-mono text-textprimary">19,296 kg</span>
                <span className="text-[8px] text-textsecondary font-mono mt-0.5">42,560 lb</span>
              </div>
              <div className="bg-slate-50 border border-slate-100 rounded-xl p-3 flex flex-col justify-center">
                <span className="text-[9px] font-bold text-textsecondary uppercase tracking-wider block mb-0.5">Limiting Factor</span>
                <span className="text-xs font-black text-primary truncate">WAT (Flap 10°)</span>
              </div>
              <div className="bg-slate-50 border border-slate-100 rounded-xl p-3 flex flex-col justify-center">
                <span className="text-[9px] font-bold text-textsecondary uppercase tracking-wider block mb-0.5">Maximum Payload</span>
                <span className="text-sm font-black font-mono text-textprimary">0 kg</span>
                <span className="text-[8px] text-textsecondary font-mono mt-0.5">0 lb</span>
              </div>
              <div className="bg-slate-50 border border-slate-100 rounded-xl p-3 flex flex-col justify-center">
                <span className="text-[9px] font-bold text-textsecondary uppercase tracking-wider block mb-0.5">Max Passengers</span>
                <span className="text-sm font-black font-mono text-textprimary">0 Pax</span>
              </div>
            </div>

            <div className="bg-gradient-to-br from-emerald-50 to-emerald-100/60 border border-emerald-200/50 rounded-xl p-4 text-center mt-4">
              <div className="flex items-center justify-center gap-2 mb-1.5">
                <div className="w-6 h-6 rounded-full bg-emerald-600 flex items-center justify-center shrink-0">
                  <CheckCircle2 size={13} color="white" />
                </div>
                <span className="text-[9px] font-bold text-textsecondary uppercase tracking-wider">Dispatch Status</span>
              </div>
              <h3 className="text-xl font-black text-emerald-600 tracking-wider">APPROVED</h3>
              <p className="text-[11px] text-textsecondary mt-1 leading-normal font-semibold">
                Flight is safe to dispatch within all operational limits.
              </p>
            </div>
          </Card>

          {/* ⑧ Quick Actions */}
          <Card className="p-6">
            <Sec num={8} title="Quick Actions" />
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 text-xs font-bold text-textprimary">
              <button className="flex items-center justify-center gap-2 py-2 px-3 border border-borderc rounded-lg bg-white hover:bg-slate-50 transition duration-150">
                <RotateCcw size={13} className="text-slate-500" />
                <span>Recalculate</span>
              </button>
              <button className="flex items-center justify-center gap-2 py-2 px-3 border border-borderc rounded-lg bg-white hover:bg-slate-50 transition duration-150">
                <Gauge size={13} className="text-slate-500" />
                <span>Performance</span>
              </button>
              <button className="flex items-center justify-center gap-2 py-2 px-3 border border-borderc rounded-lg bg-white hover:bg-slate-50 transition duration-150">
                <FileText size={13} className="text-slate-500" />
                <span>OFP Generator</span>
              </button>
              <button className="flex items-center justify-center gap-2 py-2 px-3 border border-borderc rounded-lg bg-white hover:bg-slate-50 transition duration-150">
                <Save size={13} className="text-slate-500" />
                <span>Save Dispatch</span>
              </button>
              <button className="flex items-center justify-center gap-2 py-2 px-3 border border-borderc rounded-lg bg-white hover:bg-slate-50 transition duration-150">
                <Download size={13} className="text-slate-500" />
                <span>Export PDF</span>
              </button>
              <button className="flex items-center justify-center gap-2 py-2 px-3 bg-primary hover:bg-primary-dark text-white rounded-lg transition duration-200">
                <Send size={13} />
                <span>Send to Crew</span>
              </button>
            </div>
          </Card>

        </div>

      </div>

      {/* ── WIDE BOTTOM ROW: WEIGHT SUMMARY TABLE ── */}
      <div className="grid grid-cols-1 gap-6">
        <div className="w-full">
          <Card className="p-6">
            <h2 className="text-sm font-bold text-textprimary mb-4 flex items-center gap-2 pb-2 border-b border-slate-100">
              <SecNum num={7} />
              Weight Summary
            </h2>
            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left border-collapse min-w-[750px]">
                <thead>
                  <tr className="text-textsecondary border-b border-slate-100 text-[10px] uppercase tracking-wider font-semibold">
                    <th className="pb-3">Takeoff Weight (TOW)</th>
                    <th className="pb-3">Landing Weight (LW)</th>
                    <th className="pb-3">Zero Fuel Weight (ZFW)</th>
                    <th className="pb-3">WAT Limit (Flap 10°)</th>
                    <th className="pb-3">Current Weight</th>
                    <th className="pb-3">Margin</th>
                    <th className="pb-3">Limiting Factor</th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="hover:bg-slate-50/40 transition">
                    <td className="py-4 pr-4">
                      <div className="text-sm font-black text-textprimary font-mono">20,005 kg</div>
                      <div className="text-[10px] text-textsecondary font-mono mt-0.5">44,122 lb</div>
                      <div className="text-[10px] text-danger font-bold mt-2 flex items-center gap-1">
                        <span>↑</span> Exceeds RTOW by 709 kg
                      </div>
                    </td>
                    <td className="py-4 pr-4">
                      <div className="text-sm font-black text-textprimary font-mono">20,005 kg</div>
                      <div className="text-[10px] text-textsecondary font-mono mt-0.5">44,122 lb</div>
                      <div className="text-[10px] text-danger font-bold mt-2 flex items-center gap-1">
                        <span>↑</span> Exceeds MLW by 964 kg
                      </div>
                    </td>
                    <td className="py-4 pr-4">
                      <div className="text-sm font-black text-textprimary font-mono">12,270 kg</div>
                      <div className="text-[10px] text-textsecondary font-mono mt-0.5">27,070 lb</div>
                      <div className="text-[10px] text-success font-bold mt-2">
                        Within Limit
                      </div>
                    </td>
                    <td className="py-4 pr-4">
                      <div className="text-sm font-bold text-slate-700 font-mono">19,296 kg</div>
                      <div className="text-[10px] text-textsecondary font-mono mt-0.5">42,560 lb</div>
                    </td>
                    <td className="py-4 pr-4">
                      <div className="text-sm font-bold text-slate-700 font-mono">20,005 kg</div>
                      <div className="text-[10px] text-textsecondary font-mono mt-0.5">44,122 lb</div>
                    </td>
                    <td className="py-4 pr-4">
                      <div className="text-sm font-bold text-danger font-mono">-709 kg</div>
                      <div className="text-[10px] text-danger font-mono mt-0.5">-1,582 lb</div>
                    </td>
                    <td className="py-4">
                      <span className="text-xs font-bold text-primary block mt-1">WAT (Flap 10°)</span>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </Card>
        </div>
      </div>

    </div>
  )
}
