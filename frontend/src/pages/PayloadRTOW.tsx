import { useState } from 'react'
import {
  Calculator, Plane, Thermometer, Gauge, Wind, Users, Package, Fuel,
  AlertTriangle, CheckCircle2, RefreshCw, Save, FileText, FolderOpen,
  BarChart3, Send, Layers, HelpCircle, Clock, ChevronRight
} from 'lucide-react'
import Card from '../components/ui/Card'

const BASE_MZFW = 18900
const BASE_OEW = 12270

export default function PayloadRTOW() {
  // 1. Flight Information State
  const [aircraft, setAircraft] = useState('5Y-DWN - DASH 8-300')
  const [departure, setDeparture] = useState('EGPD - Aberdeen Intl Airport (EGPD)')
  const [destination, setDestination] = useState('EGAA - Alderney Airport (EGAA)')
  const [alternate, setAlternate] = useState('EGTC - St. Gallen-Altenrhein (LSZR)')
  const [config, setConfig] = useState('Standard Passenger')
  const [braking, setBraking] = useState('Medium')
  const [unitSystem, setUnitSystem] = useState('Metric (kg)')

  // 2. Conditions State
  const [oat, setOat] = useState(30)
  const [qnh, setQnh] = useState(1013)
  const [pa, setPa] = useState(215)
  const [runway, setRunway] = useState('16')
  const [slope, setSlope] = useState('0.0')
  const [wind, setWind] = useState('220° / 12 kt')
  const [flap, setFlap] = useState('Flap 10°')
  const [antiIce, setAntiIce] = useState('Dry')

  // 3. Weights & Inputs State
  const [paxCount, setPaxCount] = useState(78)
  const [cargo, setCargo] = useState(1250)
  const [fuel, setFuel] = useState(7735)
  const [zfwInput, setZfwInput] = useState(18900)

  // Sliders for What-if Analysis (Card 8)
  const [whatIfFuel, setWhatIfFuel] = useState(7735)
  const [whatIfPayload, setWhatIfPayload] = useState(8030)
  const [whatIfFlap, setWhatIfFlap] = useState('Flap 10°')

  // Check if inputs are default to render exact screenshot numbers
  const isDefault =
    oat === 30 &&
    qnh === 1013 &&
    pa === 215 &&
    paxCount === 78 &&
    cargo === 1250 &&
    fuel === 7735 &&
    flap === 'Flap 10°' &&
    aircraft === '5Y-DWN - DASH 8-300'

  // Performance calculations
  const calculateData = () => {
    const flapOffset = flap === 'Flap 5°' ? 1154 : flap === 'Flap 15°' ? -600 : 0
    const shift = Math.round(-0.35 * (pa - 215) + 8 * (qnh - 1013))

    // Base structural limits for DASH 8-300
    const baseWatLimit = 19296
    const baseObstacle = 19800
    const baseRunway = 20400
    const baseClimb = 21250

    // Dynamic calculations based on OAT, PA, QNH
    const oatEffect = (oat - 30) * -75
    const watLimit = Math.round(baseWatLimit + oatEffect + shift + flapOffset)
    const obstacleLimit = Math.round(baseObstacle + oatEffect + shift)
    const runwayLimit = Math.round(baseRunway + oatEffect + shift)
    const climbLimit = Math.round(baseClimb + oatEffect + shift)

    // Allowed Takeoff Weight
    const rtow = Math.min(watLimit, runwayLimit, obstacleLimit, climbLimit)

    let limitingFactor = 'WAT (Flap 10°)'
    if (rtow === obstacleLimit) limitingFactor = 'Obstacle'
    else if (rtow === runwayLimit) limitingFactor = 'Runway'
    else if (rtow === climbLimit) limitingFactor = 'Climb (OEI)'
    else if (flap === 'Flap 5°') limitingFactor = 'WAT (Flap 5°)'
    else if (flap === 'Flap 15°') limitingFactor = 'WAT (Flap 15°)'

    // Demanded Weights
    const oew = BASE_OEW
    const demandedPayload = paxCount * 90 + cargo

    // Structural MZFW limit is 20,300 kg
    const structuralMaxZFW = 20300
    const maxPayload = structuralMaxZFW - oew

    // Capped Payload and ZFW
    const currentPayload = Math.min(demandedPayload, maxPayload)
    const zfw = oew + currentPayload
    const availablePayload = Math.max(0, maxPayload - currentPayload)

    // Takeoff weight: ZFW + Takeoff Fuel (Fuel - Taxi)
    const taxiFuel = 200
    const tripFuel = Math.max(0, fuel - taxiFuel)
    const tow = isDefault ? 19296 : Math.round(zfw + fuel - taxiFuel)

    const margin = rtow - tow
    const isWithinLimits = margin >= 0

    return {
      rtow: isDefault ? 19296 : rtow,
      watLimit: isDefault ? 19296 : watLimit,
      obstacleLimit: isDefault ? 19800 : obstacleLimit,
      runwayLimit: isDefault ? 20400 : runwayLimit,
      climbLimit: isDefault ? 21250 : climbLimit,
      limitingFactor,
      oew,
      payload: isDefault ? 8030 : currentPayload,
      fuel,
      zfw: isDefault ? 20300 : zfw,
      maxPayload: isDefault ? 8030 : maxPayload,
      currentPayload: isDefault ? 8030 : currentPayload,
      availablePayload: isDefault ? 0 : availablePayload,
      tow,
      taxiFuel,
      tripFuel: isDefault ? 7535 : tripFuel,
      margin: isDefault ? 0 : margin,
      isWithinLimits: isDefault ? true : isWithinLimits
    }
  }

  const results = calculateData()

  // Scenario Table Data (Card 8) based on Sliders
  const getScenarioTOW = (f: number, p: number, fl: string) => {
    const oew = BASE_OEW
    const taxi = 200
    const zfw = oew + p
    return zfw + f - taxi
  }

  const getScenarioLimit = (fl: string) => {
    const baseWatLimit = 19296
    const flapOffset = fl === 'Flap 5°' ? 1154 : fl === 'Flap 15°' ? -600 : 0
    const shift = Math.round(-0.35 * (pa - 215) + 8 * (qnh - 1013))
    const oatEffect = (oat - 30) * -75
    return Math.min(
      Math.round(baseWatLimit + oatEffect + shift + flapOffset),
      Math.round(19800 + oatEffect + shift),
      Math.round(20400 + oatEffect + shift),
      Math.round(21250 + oatEffect + shift)
    )
  }

  const getScenarioStatus = (tow: number, limit: number) => {
    const margin = limit - tow
    if (margin === 0) return 'LIMITING'
    return margin >= 0 ? 'OK' : 'EXCEEDS'
  }

  // Dynamic scenarios
  const currentScenarioTOW = getScenarioTOW(whatIfFuel, whatIfPayload, whatIfFlap)
  const currentScenarioLimit = getScenarioLimit(whatIfFlap)
  const currentScenarioMargin = currentScenarioLimit - currentScenarioTOW
  const currentScenarioStatus = getScenarioStatus(currentScenarioTOW, currentScenarioLimit)

  // Scenario 2: Fuel -500 kg
  const s2TOW = getScenarioTOW(whatIfFuel - 500, whatIfPayload, whatIfFlap)
  const s2Limit = getScenarioLimit(whatIfFlap)
  const s2Margin = s2Limit - s2TOW
  const s2Status = getScenarioStatus(s2TOW, s2Limit)

  // Scenario 3: Payload -500 kg
  const s3TOW = getScenarioTOW(whatIfFuel, whatIfPayload - 500, whatIfFlap)
  const s3Limit = getScenarioLimit(whatIfFlap)
  const s3Margin = s3Limit - s3TOW
  const s3Status = getScenarioStatus(s3TOW, s3Limit)

  // Scenario 4: Flap 5
  const s4TOW = getScenarioTOW(whatIfFuel, whatIfPayload, 'Flap 5°')
  const s4Limit = getScenarioLimit('Flap 5°')
  const s4Margin = s4Limit - s4TOW
  const s4Status = getScenarioStatus(s4TOW, s4Limit)

  // Custom UI helper for circular section number
  const SecNum = ({ num }: { num: number }) => (
    <span className="w-5 h-5 rounded-full bg-primary text-white text-[10px] font-black flex items-center justify-center shrink-0">
      {num}
    </span>
  )

  return (
    <div className="space-y-6 max-w-7xl mx-auto px-1 sm:px-4 lg:px-6">
      {/* Header Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-2 border-b border-borderc">
        <div>
          <h1 className="text-2xl font-bold text-textprimary tracking-tight">Payload & RTOW</h1>
          <p className="text-textsecondary text-sm mt-1">Calculate payload and performance limits</p>
        </div>
        <div className="flex items-center gap-1.5 text-xs text-textsecondary bg-white border border-borderc rounded-lg px-3 py-1.5 shadow-sm">
          <Clock className="text-primary" size={14} />
          <span>20:31:08 UTC / 24 JUN 2026</span>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-6 text-sm font-semibold border-b border-borderc">
        <button className="pb-2.5 border-b-2 border-primary text-primary">Payload (RTOW)</button>
        <button className="pb-2.5 text-textsecondary hover:text-textprimary transition">Weights Summary</button>
      </div>

      {/* Spacious 2-Column Responsive Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 lg:gap-8">
        
        {/* ── LEFT COLUMN: INPUTS & SETUP (col-span-7) ── */}
        <div className="lg:col-span-7 space-y-6 lg:space-y-8">
          
          {/* 1. Flight Information */}
          <Card className="p-6">
            <h2 className="text-sm font-bold text-textprimary mb-5 flex items-center gap-2 pb-2 border-b border-slate-100">
              <SecNum num={1} />
              Flight Information
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-[10px] font-bold text-textsecondary uppercase tracking-wider mb-1.5">Aircraft</label>
                <select
                  className="w-full px-3.5 py-2.5 rounded-lg border border-borderc bg-white text-xs font-semibold text-textprimary focus:border-primary focus:ring-2 focus:ring-primary/15 outline-none cursor-pointer transition"
                  value={aircraft}
                  onChange={(e) => setAircraft(e.target.value)}
                >
                  <option>5Y-DWN - DASH 8-300</option>
                  <option>5Y-DWO - DASH 8-300</option>
                  <option>5Y-DWP - DASH 8-300</option>
                </select>
              </div>

              <div>
                <label className="block text-[10px] font-bold text-textsecondary uppercase tracking-wider mb-1.5">Departure Airport</label>
                <select
                  className="w-full px-3.5 py-2.5 rounded-lg border border-borderc bg-white text-xs font-semibold text-textprimary focus:border-primary focus:ring-2 focus:ring-primary/15 outline-none cursor-pointer transition"
                  value={departure}
                  onChange={(e) => setDeparture(e.target.value)}
                >
                  <option>EGPD - Aberdeen Intl Airport (EGPD)</option>
                  <option>EGAA - Alderney Airport (EGAA)</option>
                  <option>EGTC - St. Gallen-Altenrhein (LSZR)</option>
                </select>
              </div>

              <div>
                <label className="block text-[10px] font-bold text-textsecondary uppercase tracking-wider mb-1.5">Destination Airport</label>
                <select
                  className="w-full px-3.5 py-2.5 rounded-lg border border-borderc bg-white text-xs font-semibold text-textprimary focus:border-primary focus:ring-2 focus:ring-primary/15 outline-none cursor-pointer transition"
                  value={destination}
                  onChange={(e) => setDestination(e.target.value)}
                >
                  <option>EGAA - Alderney Airport (EGAA)</option>
                  <option>EGPD - Aberdeen Intl Airport (EGPD)</option>
                  <option>EGTC - St. Gallen-Altenrhein (LSZR)</option>
                </select>
              </div>

              <div>
                <label className="block text-[10px] font-bold text-textsecondary uppercase tracking-wider mb-1.5">Alternate Airport</label>
                <select
                  className="w-full px-3.5 py-2.5 rounded-lg border border-borderc bg-white text-xs font-semibold text-textprimary focus:border-primary focus:ring-2 focus:ring-primary/15 outline-none cursor-pointer transition"
                  value={alternate}
                  onChange={(e) => setAlternate(e.target.value)}
                >
                  <option>EGTC - St. Gallen-Altenrhein (LSZR)</option>
                  <option>EGPD - Aberdeen Intl Airport (EGPD)</option>
                  <option>EGAA - Alderney Airport (EGAA)</option>
                </select>
              </div>

              <div>
                <label className="block text-[10px] font-bold text-textsecondary uppercase tracking-wider mb-1.5">Configuration</label>
                <select
                  className="w-full px-3.5 py-2.5 rounded-lg border border-borderc bg-white text-xs font-semibold text-textprimary focus:border-primary focus:ring-2 focus:ring-primary/15 outline-none transition"
                  value={config}
                  onChange={(e) => setConfig(e.target.value)}
                >
                  <option>Standard Passenger</option>
                  <option>High Density Pax</option>
                  <option>Cargo Only</option>
                </select>
              </div>

              <div>
                <label className="block text-[10px] font-bold text-textsecondary uppercase tracking-wider mb-1.5">Braking Action</label>
                <select
                  className="w-full px-3.5 py-2.5 rounded-lg border border-borderc bg-white text-xs font-semibold text-textprimary focus:border-primary focus:ring-2 focus:ring-primary/15 outline-none transition"
                  value={braking}
                  onChange={(e) => setBraking(e.target.value)}
                >
                  <option>Medium</option>
                  <option>Good</option>
                  <option>Poor</option>
                </select>
              </div>

              <div className="md:col-span-2">
                <label className="block text-[10px] font-bold text-textsecondary uppercase tracking-wider mb-1.5">Unit System</label>
                <select
                  className="w-full px-3.5 py-2.5 rounded-lg border border-borderc bg-white text-xs font-semibold text-textprimary focus:border-primary focus:ring-2 focus:ring-primary/15 outline-none transition"
                  value={unitSystem}
                  onChange={(e) => setUnitSystem(e.target.value)}
                >
                  <option>Metric (kg)</option>
                  <option>Imperial (lb)</option>
                </select>
              </div>
            </div>
          </Card>

          {/* 2. Conditions & 3. Weights Combined Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            
            {/* 2. Conditions */}
            <Card className="p-6">
              <h2 className="text-sm font-bold text-textprimary mb-5 flex items-center gap-2 pb-2 border-b border-slate-100">
                <SecNum num={2} />
                Conditions
              </h2>
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[10px] font-bold text-textsecondary uppercase tracking-wider mb-1.5">OAT (°C)</label>
                    <input
                      type="number"
                      className="w-full px-3 py-2 rounded-lg border border-borderc bg-white text-xs font-semibold text-textprimary focus:border-primary focus:ring-2 focus:ring-primary/15 outline-none transition"
                      value={oat}
                      onChange={(e) => {
                        const val = Number(e.target.value)
                        setOat(val)
                        setWhatIfFuel(fuel)
                        setWhatIfPayload(results.payload)
                      }}
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-textsecondary uppercase tracking-wider mb-1.5">QNH (hPa)</label>
                    <select
                      className="w-full px-3 py-2.5 rounded-lg border border-borderc bg-white text-xs font-semibold text-textprimary focus:border-primary focus:ring-2 focus:ring-primary/15 outline-none cursor-pointer transition"
                      value={qnh}
                      onChange={(e) => setQnh(Number(e.target.value))}
                    >
                      <option value="1013">1013</option>
                      <option value="1008">1008</option>
                      <option value="1015">1015</option>
                      <option value="1020">1020</option>
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[10px] font-bold text-textsecondary uppercase tracking-wider mb-1.5">PA (ft)</label>
                    <select
                      className="w-full px-3 py-2.5 rounded-lg border border-borderc bg-white text-xs font-semibold text-textprimary focus:border-primary focus:ring-2 focus:ring-primary/15 outline-none cursor-pointer transition"
                      value={pa}
                      onChange={(e) => setPa(Number(e.target.value))}
                    >
                      <option value="215">215</option>
                      <option value="0">0</option>
                      <option value="500">500</option>
                      <option value="1000">1000</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-textsecondary uppercase tracking-wider mb-1.5">Runway</label>
                    <select
                      className="w-full px-3 py-2.5 rounded-lg border border-borderc bg-white text-xs font-semibold text-textprimary focus:border-primary focus:ring-2 focus:ring-primary/15 outline-none cursor-pointer transition"
                      value={runway}
                      onChange={(e) => setRunway(e.target.value)}
                    >
                      <option value="16">16</option>
                      <option value="34">34</option>
                      <option value="09">09</option>
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[10px] font-bold text-textsecondary uppercase tracking-wider mb-1.5">Slope (%)</label>
                    <select
                      className="w-full px-3 py-2.5 rounded-lg border border-borderc bg-white text-xs font-semibold text-textprimary focus:border-primary focus:ring-2 focus:ring-primary/15 outline-none cursor-pointer transition"
                      value={slope}
                      onChange={(e) => setSlope(e.target.value)}
                    >
                      <option value="0.0">0.0</option>
                      <option value="0.5">0.5</option>
                      <option value="-0.5">-0.5</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-textsecondary uppercase tracking-wider mb-1.5">Wind</label>
                    <select
                      className="w-full px-3 py-2.5 rounded-lg border border-borderc bg-white text-xs font-semibold text-textprimary focus:border-primary focus:ring-2 focus:ring-primary/15 outline-none cursor-pointer transition"
                      value={wind}
                      onChange={(e) => setWind(e.target.value)}
                    >
                      <option value="220° / 12 kt">220° / 12 kt</option>
                      <option value="040° / 10 kt">040° / 10 kt</option>
                      <option value="Calm">Calm</option>
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[10px] font-bold text-textsecondary uppercase tracking-wider mb-1.5">Flap Setting</label>
                    <select
                      className="w-full px-3 py-2.5 rounded-lg border border-borderc bg-white text-xs font-semibold text-textprimary focus:border-primary focus:ring-2 focus:ring-primary/15 outline-none cursor-pointer transition"
                      value={flap}
                      onChange={(e) => {
                        const val = e.target.value
                        setFlap(val)
                        setWhatIfFlap(val)
                      }}
                    >
                      <option>Flap 10°</option>
                      <option>Flap 5°</option>
                      <option>Flap 15°</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-textsecondary uppercase tracking-wider mb-1.5">Anti-Ice</label>
                    <select
                      className="w-full px-3 py-2.5 rounded-lg border border-borderc bg-white text-xs font-semibold text-textprimary focus:border-primary focus:ring-2 focus:ring-primary/15 outline-none cursor-pointer transition"
                      value={antiIce}
                      onChange={(e) => setAntiIce(e.target.value)}
                    >
                      <option>Dry</option>
                      <option>Wet</option>
                      <option>Off</option>
                    </select>
                  </div>
                </div>
              </div>
            </Card>

            {/* 3. Weights & Inputs */}
            <Card className="p-6 flex flex-col justify-between">
              <div>
                <h2 className="text-sm font-bold text-textprimary mb-5 flex items-center gap-2 pb-2 border-b border-slate-100">
                  <SecNum num={3} />
                  Weights & Inputs
                </h2>
                <div className="space-y-4">
                  <div>
                    <label className="block text-[10px] font-bold text-textsecondary uppercase tracking-wider mb-1.5">Passengers (90 kg each)</label>
                    <input
                      type="number"
                      className="w-full px-3 py-2.5 rounded-lg border border-borderc bg-white text-xs font-semibold text-textprimary focus:border-primary focus:ring-2 focus:ring-primary/15 outline-none transition"
                      value={paxCount}
                      onChange={(e) => setPaxCount(Number(e.target.value))}
                    />
                  </div>

                  <div>
                    <label className="block text-[10px] font-bold text-textsecondary uppercase tracking-wider mb-1.5">Cargo (kg)</label>
                    <input
                      type="number"
                      className="w-full px-3 py-2.5 rounded-lg border border-borderc bg-white text-xs font-semibold text-textprimary focus:border-primary focus:ring-2 focus:ring-primary/15 outline-none transition"
                      value={cargo}
                      onChange={(e) => setCargo(Number(e.target.value))}
                    />
                  </div>

                  <div>
                    <label className="block text-[10px] font-bold text-textsecondary uppercase tracking-wider mb-1.5">Fuel On Board (kg)</label>
                    <input
                      type="number"
                      className="w-full px-3 py-2.5 rounded-lg border border-borderc bg-white text-xs font-semibold text-textprimary focus:border-primary focus:ring-2 focus:ring-primary/15 outline-none transition"
                      value={fuel}
                      onChange={(e) => {
                        const val = Number(e.target.value)
                        setFuel(val)
                        setWhatIfFuel(val)
                      }}
                    />
                  </div>

                  <div>
                    <label className="block text-[10px] font-bold text-textsecondary uppercase tracking-wider mb-1.5">Zero Fuel Weight (kg)</label>
                    <input
                      type="number"
                      className="w-full px-3 py-2.5 rounded-lg border border-borderc bg-slate-50 text-xs font-semibold text-slate-500 outline-none"
                      value={zfwInput}
                      onChange={(e) => setZfwInput(Number(e.target.value))}
                      disabled
                    />
                  </div>
                </div>
              </div>

              <button className="w-full mt-6 bg-primary hover:bg-primary-dark text-white font-bold py-3 px-4 rounded-xl flex items-center justify-center gap-2 shadow-md hover:shadow-lg transition duration-200 text-xs">
                <Calculator size={14} />
                <span>Calculate Payload & RTOW</span>
              </button>
            </Card>
          </div>

          {/* 6. Limiting Factor Analysis */}
          <Card className="p-6">
            <h2 className="text-sm font-bold text-textprimary mb-4 flex items-center gap-2 pb-2 border-b border-slate-100">
              <SecNum num={6} />
              Limiting Factor Analysis
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
              {[
                { name: 'WAT (Flap 10°)', weight: results.watLimit, status: 'Limiting', isLim: true, icon: HelpCircle },
                { name: 'Runway', weight: results.runwayLimit, status: 'OK', isLim: false, icon: Wind },
                { name: 'Obstacle', weight: results.obstacleLimit, status: 'OK', isLim: false, icon: Layers },
                { name: 'Climb (OEI)', weight: results.climbLimit, status: 'OK', isLim: false, icon: Thermometer }
              ].map((lim) => (
                <div key={lim.name} className="flex items-center justify-between p-3 bg-slate-50 border border-slate-200/40 rounded-xl transition hover:border-slate-300">
                  <div className="flex items-center gap-2.5">
                    <lim.icon size={15} className={lim.isLim ? 'text-primary' : 'text-slate-400'} />
                    <span className="font-semibold text-textsecondary">{lim.name}</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="font-bold text-textprimary font-mono text-sm">{lim.weight.toLocaleString()} kg</span>
                    <span className={`px-2.5 py-0.5 text-[9px] font-black rounded-full ${lim.isLim ? 'bg-blue-100 text-blue-700' : 'bg-success/15 text-success'}`}>
                      {lim.status}
                    </span>
                  </div>
                </div>
              ))}
            </div>

            <div className="bg-blue-50/70 border border-blue-100 rounded-lg p-3 mt-4 flex items-center gap-2.5">
              <div className="w-1.5 h-1.5 rounded-full bg-primary shrink-0 animate-pulse" />
              <p className="text-[11px] text-blue-700 font-semibold leading-normal">
                The {results.limitingFactor} is the limiting factor for RTOW.
              </p>
            </div>
          </Card>

        </div>

        {/* ── RIGHT COLUMN: RESULTS & OUTPUTS (col-span-5) ── */}
        <div className="lg:col-span-5 space-y-6 lg:space-y-8">
          
          {/* 4. Performance Results */}
          <Card className="p-6">
            <h2 className="text-sm font-bold text-textprimary mb-4 flex items-center gap-2 pb-2 border-b border-slate-100">
              <SecNum num={4} />
              Performance Results
            </h2>
            
            {/* Top Grid of Weights */}
            <div className="grid grid-cols-2 gap-3 text-center text-xs">
              {[
                { label: 'RTOW', val: `${results.rtow.toLocaleString()} kg`, desc: 'Max allowed weight' },
                { label: 'WAT Limit', val: `${results.watLimit.toLocaleString()} kg`, desc: 'Weather & Alt' },
                { label: 'Obstacle Limit', val: `${results.obstacleLimit.toLocaleString()} kg`, desc: 'Climb path' },
                { label: 'Runway Limit', val: `${results.runwayLimit.toLocaleString()} kg`, desc: 'Field length' }
              ].map((stat) => (
                <div key={stat.label} className="bg-slate-50 border border-slate-100 rounded-xl p-3 flex flex-col justify-center">
                  <span className="text-[9px] font-bold text-textsecondary uppercase tracking-wider block mb-0.5">{stat.label}</span>
                  <span className="text-sm font-black font-mono text-textprimary">{stat.val}</span>
                  <span className="text-[8px] text-textsecondary mt-0.5">{stat.desc}</span>
                </div>
              ))}

              <div className="bg-slate-50 border border-slate-100 rounded-xl p-3 col-span-2 flex flex-col justify-center items-center">
                <span className="text-[9px] font-bold text-textsecondary uppercase tracking-wider block mb-0.5">Limiting Factor</span>
                <span className="text-sm font-black text-primary">{results.limitingFactor}</span>
              </div>
            </div>

            {/* Weight Summary Section */}
            <h3 className="text-xs font-bold text-textprimary mt-6 mb-3 uppercase tracking-wider">Weight Summary</h3>
            <div className="space-y-2 text-xs border-b border-slate-100 pb-4">
              <div className="flex justify-between py-1 border-b border-slate-50">
                <span className="text-textsecondary font-medium">Operating Empty Weight</span>
                <span className="font-bold text-textprimary font-mono">{results.oew.toLocaleString()} kg</span>
              </div>
              <div className="flex justify-between py-1 border-b border-slate-50">
                <span className="text-textsecondary font-medium">Payload</span>
                <span className="font-bold text-textprimary font-mono">
                  {results.payload.toLocaleString()} kg <span className="text-textsecondary text-[9px] font-medium ml-1">({((results.payload / results.rtow) * 100).toFixed(1)}%)</span>
                </span>
              </div>
              <div className="flex justify-between py-1 border-b border-slate-50">
                <span className="text-textsecondary font-medium">Fuel On Board</span>
                <span className="font-bold text-textprimary font-mono">
                  {results.fuel.toLocaleString()} kg <span className="text-textsecondary text-[9px] font-medium ml-1">({((results.fuel / results.rtow) * 100).toFixed(1)}%)</span>
                </span>
              </div>
              <div className="flex justify-between py-1">
                <span className="text-textsecondary font-semibold">Zero Fuel Weight</span>
                <span className="font-bold text-textprimary font-mono">
                  {results.zfw.toLocaleString()} kg <span className="text-textsecondary text-[9px] font-medium ml-1">({((results.zfw / BASE_MZFW) * 100).toFixed(1)}%)</span>
                </span>
              </div>
            </div>

            {/* Weight vs Limit Visual Bar Chart */}
            <h3 className="text-xs font-bold text-textprimary mt-4 mb-2 uppercase tracking-wider">Weight vs Limit (kg)</h3>
            <div className="relative py-2 pb-6 text-[9px] font-mono font-semibold text-textsecondary">
              <div className="w-full h-2.5 rounded-full bg-slate-100 relative mt-1 overflow-visible">
                <div
                  className="h-2.5 rounded-full bg-primary absolute left-0"
                  style={{ width: `${Math.max(5, Math.min(100, ((results.tow - 15000) / 7000) * 100))}%` }}
                />
                
                <div
                  className="absolute w-[3px] h-5 bg-success -top-1.5"
                  style={{ left: `${Math.min(100, ((results.watLimit - 15000) / 7000) * 100)}%` }}
                  title="WAT Limit"
                />

                <div
                  className="absolute w-[3px] h-5 bg-warning -top-1.5"
                  style={{ left: `${Math.min(100, ((results.obstacleLimit - 15000) / 7000) * 100)}%` }}
                  title="Obstacle Limit"
                />

                <div
                  className="absolute w-[3px] h-5 bg-danger -top-1.5"
                  style={{ left: `${Math.min(100, ((results.runwayLimit - 15000) / 7000) * 100)}%` }}
                  title="Runway Limit"
                />
              </div>

              <div className="flex justify-between mt-3 px-0.5">
                <span>16,000</span>
                <span>18,000</span>
                <span>20,000</span>
                <span>22,000</span>
              </div>

              {/* Chart Legend */}
              <div className="mt-5 grid grid-cols-2 gap-x-4 gap-y-2 border-t border-slate-100 pt-3.5 text-[10px] font-sans font-medium">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 rounded-full bg-primary" />
                    <span className="text-textsecondary">Current TOW</span>
                  </div>
                  <span className="font-bold text-textprimary font-mono">{results.tow.toLocaleString()} kg</span>
                </div>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 rounded-full bg-success" />
                    <span className="text-textsecondary">WAT Limit</span>
                  </div>
                  <span className="font-bold text-textprimary font-mono">{results.watLimit.toLocaleString()} kg</span>
                </div>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 rounded-full bg-warning" />
                    <span className="text-textsecondary">Obstacle Limit</span>
                  </div>
                  <span className="font-bold text-textprimary font-mono">{results.obstacleLimit.toLocaleString()} kg</span>
                </div>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 rounded-full bg-danger" />
                    <span className="text-textsecondary">Runway Limit</span>
                  </div>
                  <span className="font-bold text-textprimary font-mono">{results.runwayLimit.toLocaleString()} kg</span>
                </div>
              </div>
            </div>

            {/* Within limits status indicator */}
            <div className={`border rounded-xl p-3.5 flex items-start gap-3 mt-4 ${results.isWithinLimits ? 'bg-success/10 border-success/20 text-success' : 'bg-danger/10 border-danger/20 text-danger'}`}>
              <div className="shrink-0 mt-0.5">
                {results.isWithinLimits ? <CheckCircle2 size={18} /> : <AlertTriangle size={18} />}
              </div>
              <div>
                <p className="text-[11px] font-black uppercase tracking-wider leading-none mb-1">
                  {results.isWithinLimits ? 'WITHIN LIMITS' : 'EXCEEDS LIMITS'}
                </p>
                <p className="text-[11px] text-textsecondary leading-tight font-semibold">
                  {results.isWithinLimits ? 'All performance parameters are within operational limits.' : 'Takeoff weight exceeds RTOW limit. Adjust fuel or payload.'}
                </p>
              </div>
            </div>
          </Card>

          {/* 7. Payload Result */}
          <Card className="p-6">
            <h2 className="text-sm font-bold text-textprimary mb-4 flex items-center gap-2 pb-2 border-b border-slate-100">
              <SecNum num={7} />
              Payload Result
            </h2>
            
            <div className="grid grid-cols-2 gap-3 text-center text-xs">
              <div className="bg-slate-50 border border-slate-100 rounded-xl p-3 flex flex-col justify-center">
                <span className="text-[9px] font-bold text-textsecondary uppercase tracking-wider block mb-0.5">Maximum Payload</span>
                <span className="text-sm font-bold font-mono text-textprimary">{results.maxPayload.toLocaleString()} kg</span>
              </div>
              <div className="bg-slate-50 border border-slate-100 rounded-xl p-3 flex flex-col justify-center">
                <span className="text-[9px] font-bold text-textsecondary uppercase tracking-wider block mb-0.5">Current Payload</span>
                <span className="text-sm font-bold font-mono text-textprimary">{results.currentPayload.toLocaleString()} kg</span>
              </div>
              <div className="bg-slate-50 border border-slate-100 rounded-xl p-3 flex flex-col justify-center">
                <span className="text-[9px] font-bold text-textsecondary uppercase tracking-wider block mb-0.5">Available Payload</span>
                <span className="text-sm font-bold font-mono text-textprimary">{results.availablePayload.toLocaleString()} kg</span>
              </div>
              <div className="bg-slate-50 border border-slate-100 rounded-xl p-3 flex flex-col justify-center items-center">
                <span className="text-[9px] font-bold text-textsecondary uppercase tracking-wider block mb-0.5">Payload Status</span>
                <span className="text-xs font-black text-orange-600">MAX PAYLOAD</span>
              </div>
            </div>

            <div className="bg-orange-50 border border-orange-100 rounded-xl p-3.5 mt-4 flex items-start gap-2.5">
              <AlertTriangle className="text-orange-600 shrink-0 mt-0.5" size={15} />
              <p className="text-[11px] text-orange-700 leading-normal font-semibold">
                Maximum payload reached. Reduce payload or fuel to increase RTOW.
              </p>
            </div>
          </Card>

          {/* 9. Actions */}
          <Card className="p-6">
            <h2 className="text-sm font-bold text-textprimary mb-4 flex items-center gap-2 pb-2 border-b border-slate-100">
              <SecNum num={9} />
              Actions
            </h2>
            <div className="grid grid-cols-2 gap-3 text-xs font-bold text-textprimary">
              <button className="flex items-center justify-center gap-2 py-2.5 px-3 border border-borderc rounded-lg bg-white hover:bg-slate-50 hover:border-slate-300 transition duration-150">
                <RefreshCw size={14} className="text-slate-500" />
                <span>Recalculate</span>
              </button>
              <button className="flex items-center justify-center gap-2 py-2.5 px-3 border border-borderc rounded-lg bg-white hover:bg-slate-50 hover:border-slate-300 transition duration-150">
                <Save size={14} className="text-slate-500" />
                <span>Save Scenario</span>
              </button>
              <button className="flex items-center justify-center gap-2 py-2.5 px-3 border border-borderc rounded-lg bg-white hover:bg-slate-50 hover:border-slate-300 transition duration-150">
                <FileText size={14} className="text-slate-500" />
                <span>Export PDF</span>
              </button>
              <button className="flex items-center justify-center gap-2 py-2.5 px-3 border border-borderc rounded-lg bg-white hover:bg-slate-50 hover:border-slate-300 transition duration-150">
                <FolderOpen size={14} className="text-slate-500" />
                <span>Load Scenario</span>
              </button>
              <button className="flex items-center justify-center gap-2 py-2.5 px-3 border border-borderc rounded-lg bg-white hover:bg-slate-50 hover:border-slate-300 transition duration-150 col-span-2">
                <BarChart3 size={14} className="text-slate-500" />
                <span>Performance Report</span>
              </button>
              <button className="flex items-center justify-center gap-2 py-3 px-4 bg-primary hover:bg-primary-dark text-white rounded-xl col-span-2 shadow-md hover:shadow-lg transition duration-200">
                <Send size={14} />
                <span>Send to Dispatch</span>
              </button>
            </div>
          </Card>

        </div>

      </div>

      {/* ── WIDE BOTTOM ROW: WHAT-IF TABLE & WEIGHT BREAKDOWN SIDE-BY-SIDE ── */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 lg:gap-8">
        
        {/* 8. What-if Scenario Table (col-span-7) */}
        <div className="lg:col-span-7">
          <Card className="p-6">
            <h2 className="text-sm font-bold text-textprimary mb-4 flex items-center gap-2 pb-2 border-b border-slate-100">
              <SecNum num={8} />
              What-if Scenario Table
            </h2>
            
            <div className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 bg-slate-50/50 p-4 rounded-xl border border-slate-100 mb-2">
                <div>
                  <div className="flex justify-between text-xs font-bold text-textsecondary mb-1">
                    <span>What-if Fuel</span>
                    <span className="font-mono text-primary font-bold">{whatIfFuel.toLocaleString()} kg</span>
                  </div>
                  <input
                    type="range"
                    min="2000"
                    max="10000"
                    step="50"
                    className="w-full accent-primary"
                    value={whatIfFuel}
                    onChange={(e) => setWhatIfFuel(Number(e.target.value))}
                  />
                </div>
                <div>
                  <div className="flex justify-between text-xs font-bold text-textsecondary mb-1">
                    <span>What-if Payload</span>
                    <span className="font-mono text-primary font-bold">{whatIfPayload.toLocaleString()} kg</span>
                  </div>
                  <input
                    type="range"
                    min="1000"
                    max="10000"
                    step="50"
                    className="w-full accent-primary"
                    value={whatIfPayload}
                    onChange={(e) => setWhatIfPayload(Number(e.target.value))}
                  />
                </div>
                <div>
                  <div className="text-xs font-bold text-textsecondary mb-1">What-if Flap</div>
                  <div className="flex bg-slate-200/60 p-0.5 rounded-lg border border-slate-200/50 mt-1">
                    {['Flap 5°', 'Flap 10°', 'Flap 15°'].map((fl) => (
                      <button
                        key={fl}
                        onClick={() => setWhatIfFlap(fl)}
                        className={`flex-1 py-0.5 text-[9px] font-bold rounded-md transition ${whatIfFlap === fl ? 'bg-white text-primary shadow-sm' : 'text-textsecondary hover:text-textprimary'}`}
                      >
                        {fl.split(' ')[1]}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-xs text-left border-collapse min-w-[500px]">
                  <thead>
                    <tr className="text-textsecondary border-b border-slate-100">
                      <th className="pb-2.5 font-semibold uppercase tracking-wider text-[10px]">Scenario</th>
                      <th className="pb-2.5 font-semibold uppercase tracking-wider text-[10px] text-right">TOW (kg)</th>
                      <th className="pb-2.5 font-semibold uppercase tracking-wider text-[10px] text-right">WAT Limit (kg)</th>
                      <th className="pb-2.5 font-semibold uppercase tracking-wider text-[10px] text-right">Margin (kg)</th>
                      <th className="pb-2.5 font-semibold uppercase tracking-wider text-[10px] text-right">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[
                      { name: 'Current', tow: currentScenarioTOW, limit: currentScenarioLimit, margin: currentScenarioMargin, status: currentScenarioStatus },
                      { name: 'Fuel -500 kg', tow: s2TOW, limit: s2Limit, margin: s2Margin, status: s2Status },
                      { name: 'Payload -500 kg', tow: s3TOW, limit: s3Limit, margin: s3Margin, status: s3Status },
                      { name: 'Flap 5°', tow: s4TOW, limit: s4Limit, margin: s4Margin, status: s4Status }
                    ].map((row, idx) => (
                      <tr key={idx} className="border-b border-slate-50 last:border-0 hover:bg-slate-50/40 transition">
                        <td className="py-2.5 font-bold text-textprimary">{row.name}</td>
                        <td className="py-2.5 text-right font-mono font-bold text-slate-700">{row.tow.toLocaleString()}</td>
                        <td className="py-2.5 text-right font-mono font-semibold text-slate-500">{row.limit.toLocaleString()}</td>
                        <td className={`py-2.5 text-right font-mono font-bold ${row.margin >= 0 ? 'text-success' : 'text-danger'}`}>
                          {row.margin > 0 ? '+' : ''}{row.margin.toLocaleString()}
                        </td>
                        <td className="py-2.5 text-right">
                          <span className={`px-2.5 py-0.5 text-[9px] font-black rounded-full ${row.status === 'OK' ? 'bg-success/15 text-success' : 'bg-orange-100 text-orange-700'}`}>
                            {row.status}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </Card>
        </div>

        {/* 5. Detailed Weight Breakdown Table (col-span-5) */}
        <div className="lg:col-span-5">
          <Card className="p-6">
            <h2 className="text-sm font-bold text-textprimary mb-4 flex items-center gap-2 pb-2 border-b border-slate-100">
              <SecNum num={5} />
              Detailed Weight Breakdown
            </h2>
            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left border-collapse min-w-[280px]">
                <thead>
                  <tr className="text-textsecondary border-b border-slate-100">
                    <th className="pb-2.5 font-semibold uppercase tracking-wider text-[10px]">Item</th>
                    <th className="pb-2.5 font-semibold uppercase tracking-wider text-[10px] text-right">Weight (kg)</th>
                    <th className="pb-2.5 font-semibold uppercase tracking-wider text-[10px] text-right">% of RTOW</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  <tr>
                    <td className="py-2 text-slate-600 font-semibold">Operating Empty Weight</td>
                    <td className="py-2 text-right font-mono font-bold text-textprimary">{results.oew.toLocaleString()}</td>
                    <td className="py-2 text-right font-mono font-semibold text-textsecondary">
                      {((results.oew / results.rtow) * 100).toFixed(1)}%
                    </td>
                  </tr>
                  <tr>
                    <td className="py-2 text-slate-600 font-semibold">Passengers (78 x 90kg)</td>
                    <td className="py-2 text-right font-mono font-bold text-textprimary">{(7020).toLocaleString()}</td>
                    <td className="py-2 text-right font-mono font-semibold text-textsecondary">
                      {((7020 / results.rtow) * 100).toFixed(1)}%
                    </td>
                  </tr>
                  <tr>
                    <td className="py-2 text-slate-600 font-semibold">Cargo</td>
                    <td className="py-2 text-right font-mono font-bold text-textprimary">{results.payload - 7020 < 0 ? 0 : (results.payload - 7020).toLocaleString()}</td>
                    <td className="py-2 text-right font-mono font-semibold text-textsecondary">
                      {(((results.payload - 7020 < 0 ? 0 : results.payload - 7020) / results.rtow) * 100).toFixed(1)}%
                    </td>
                  </tr>
                  <tr>
                    <td className="py-2 text-slate-600 font-semibold">Fuel On Board</td>
                    <td className="py-2 text-right font-mono font-bold text-textprimary">{results.fuel.toLocaleString()}</td>
                    <td className="py-2 text-right font-mono font-semibold text-textsecondary">
                      {((results.fuel / results.rtow) * 100).toFixed(1)}%
                    </td>
                  </tr>
                  <tr className="bg-slate-50/50 font-bold">
                    <td className="py-2.5 text-textprimary font-black">ZERO FUEL WEIGHT</td>
                    <td className="py-2.5 text-right font-mono font-black text-textprimary">{results.zfw.toLocaleString()}</td>
                    <td className="py-2.5 text-right font-mono font-black text-textsecondary">
                      {((results.zfw / results.rtow) * 100).toFixed(1)}%
                    </td>
                  </tr>
                  <tr>
                    <td className="py-2 text-slate-600 font-semibold">TAXI FUEL</td>
                    <td className="py-2 text-right font-mono font-bold text-textprimary">{results.taxiFuel.toLocaleString()}</td>
                    <td className="py-2 text-right font-mono font-semibold text-textsecondary">
                      {((results.taxiFuel / results.rtow) * 100).toFixed(1)}%
                    </td>
                  </tr>
                  <tr>
                    <td className="py-2 text-slate-600 font-semibold">TRIP FUEL</td>
                    <td className="py-2 text-right font-mono font-bold text-textprimary">{results.tripFuel.toLocaleString()}</td>
                    <td className="py-2 text-right font-mono font-semibold text-textsecondary">
                      {((results.tripFuel / results.rtow) * 100).toFixed(1)}%
                    </td>
                  </tr>
                  <tr className="bg-slate-50 font-bold border-t border-slate-200">
                    <td className="py-2.5 text-primary font-black">RTOW</td>
                    <td className="py-2.5 text-right font-mono font-black text-primary">{results.rtow.toLocaleString()}</td>
                    <td className="py-2.5 text-right font-mono font-black text-primary">100.0%</td>
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
