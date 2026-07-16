import { useState, useEffect } from 'react'
import {
  Calculator, Plane, Thermometer, Gauge, Wind, Layers,
  AlertTriangle, CheckCircle2, RefreshCw, Save, FileText, FolderOpen,
  BarChart3, Send, HelpCircle, Clock, Loader2
} from 'lucide-react'
import Card from '../components/ui/Card'
import Combobox, { type ComboItem } from '../components/ui/Combobox'
import { aircraft as aircraftApi, airports as airportsApi, payload as payloadApi, compute as computeApi, weather as weatherApi, type ApiAircraft, type ApiAirport, type PayloadResult, type ComputeResult } from '../lib/api'
import PerformanceChartModal, { type ChartModalParams } from '../components/ui/PerformanceChartModal'

export default function PayloadRTOW() {
  // Setup data
  const [aircraftList, setAircraftList] = useState<ApiAircraft[]>([])
  const [airportsList, setAirportsList] = useState<ApiAirport[]>([])
  const [loadingSetup, setLoadingSetup] = useState(true)

  // 1. Flight Information State
  const [selectedAircraft, setSelectedAircraft] = useState<string>('')
  const [departure, setDeparture] = useState<string>('')
  const [destination, setDestination] = useState<string>('')
  const [alternate, setAlternate] = useState<string>('')
  const [config, setConfig] = useState('Standard Passenger')
  const [braking, setBraking] = useState('Medium')
  const [unitSystem, setUnitSystem] = useState('Metric (kg)')

  // 2. Conditions State
  const [oat, setOat] = useState<number | ''>('')
  const [qnh, setQnh] = useState<number | ''>('')
  const [pa, setPa] = useState<number | ''>('')
  const [runway, setRunway] = useState('16')
  const [slope, setSlope] = useState('0.0')
  const [wind, setWind] = useState('220° / 12 kt')
  const [flap, setFlap] = useState<string>('')
  const [antiIce, setAntiIce] = useState('Dry')

  // 3. Weights & Inputs State
  const [paxCount, setPaxCount] = useState<number | ''>('')
  const [cargo, setCargo] = useState<number | ''>('')
  const [fuel, setFuel] = useState<number | ''>('')

  // Results State
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [payloadRes, setPayloadRes] = useState<PayloadResult | null>(null)
  const [computeRes, setComputeRes] = useState<ComputeResult | null>(null)
  const [activeChartParams, setActiveChartParams] = useState<ChartModalParams | null>(null)

  // Sliders for What-if Analysis
  const [whatIfFuel, setWhatIfFuel] = useState<number | ''>('')
  const [whatIfPayload, setWhatIfPayload] = useState<number | ''>('')
  const [whatIfFlap, setWhatIfFlap] = useState<string>('')

  useEffect(() => {
    async function loadData() {
      try {
        const [ac, ap] = await Promise.all([
          aircraftApi.list(),
          airportsApi.list()
        ])
        setAircraftList(ac.filter(a => a.is_active))
        setAirportsList(ap.filter(a => a.is_active))
        
        // Removed default selections to leave fields empty on load
      } catch (err) {
        console.error("Failed to load reference data", err)
      } finally {
        setLoadingSetup(false)
      }
    }
    loadData()
  }, [])

  // Auto-fill pax, fuel, and flap when aircraft changes
  useEffect(() => {
    if (!selectedAircraft) return
    const ac = aircraftList.find(a => a.id === selectedAircraft)
    if (!ac) return

    if (ac.max_pax != null) setPaxCount(ac.max_pax)
    if (ac.max_fuel_kg != null) setFuel(ac.max_fuel_kg)
    if (ac.flaps && ac.flaps.length > 0) setFlap(String(ac.flaps[0]))

    // Clear previous results since aircraft changed
    setPayloadRes(null)
    setComputeRes(null)
  }, [selectedAircraft, aircraftList])

  // Auto-fill OAT from live weather when departure airport changes
  useEffect(() => {
    if (!departure) return
    const ap = airportsList.find(a => a.id === departure)
    if (!ap) return
    
    // Clear results when departure changes
    setPayloadRes(null)
    setComputeRes(null)

    // Fetch live OAT
    weatherApi.get(ap.icao).then(res => {
      // Basic METAR parse for Temp
      const tempMatch = res.metar.match(/\s([M-]?\d{1,2})\/([M-]?\d{1,2})\s/)
      if (tempMatch && tempMatch[1]) {
        const tStr = tempMatch[1]
        const tempC = tStr.startsWith('M') ? -parseInt(tStr.slice(1)) : parseInt(tStr)
        setOat(tempC)
      } else if (ap.elevation_ft != null) {
        // Fallback to ISA if no live METAR temp
        setOat(Math.round(15 - (ap.elevation_ft / 1000) * 1.98))
      }
    }).catch(() => {
      if (ap.elevation_ft != null) {
        setOat(Math.round(15 - (ap.elevation_ft / 1000) * 1.98))
      }
    })
  }, [departure, airportsList])

  const calculateData = async () => {
    if (!selectedAircraft || !departure || !destination) return
    setLoading(true)
    setError(null)
    try {
      const [payloadData, computeData] = await Promise.all([
        payloadApi.calculate({
          aircraft_id: selectedAircraft,
          dep_id: departure,
          dest_id: destination,
          alt_id: alternate || undefined,
          oat: Number(oat) || 0,
          flap: flap ? flap.toString() : 'auto',
          pax: Number(paxCount) || 0,
          cargo_kg: Number(cargo) || 0,
          fuel_kg: Number(fuel) || 0
        }),
        computeApi.rtow({
          aircraft_id: selectedAircraft,
          airport_id: departure,
          oat: Number(oat) || 0,
          flap: flap ? flap.toString() : 'auto'
        })
      ])
      
      setPayloadRes(payloadData)
      setComputeRes(computeData)
      
      // Update what-if sliders to match results
      setWhatIfFuel(fuel)
      setWhatIfPayload(payloadData.payload_kg)
      setWhatIfFlap(flap)
    } catch (err: any) {
      setError(err.message || 'Calculation failed')
    } finally {
      setLoading(false)
    }
  }

  const SecNum = ({ num }: { num: number }) => (
    <span className="w-5 h-5 rounded-full bg-primary text-white text-[10px] font-black flex items-center justify-center shrink-0">
      {num}
    </span>
  )

  const acRef = aircraftList.find(a => a.id === selectedAircraft)
  // margin = RTOW minus actual TOW (positive = within limits)
  const margin = payloadRes ? payloadRes.rtow_kg - payloadRes.tow_kg : 0
  const isWithinLimits = margin >= 0

  return (
    <div className="space-y-6 max-w-7xl mx-auto px-1 sm:px-4 lg:px-6">
      {/* Header Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-2 border-b border-borderc">
        <div>
          <h1 className="text-2xl font-bold text-textprimary tracking-tight">Payload & RTOW</h1>
          <p className="text-textsecondary text-sm mt-1">Live dispatch performance calculator</p>
        </div>
        <div className="flex items-center gap-1.5 text-xs text-textsecondary bg-white border border-borderc rounded-lg px-3 py-1.5 shadow-sm">
          <Clock className="text-primary" size={14} />
          <span>Real-time API Link Active</span>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 lg:gap-8">
        
        {/* ── LEFT COLUMN: INPUTS (col-span-7) ── */}
        <div className="lg:col-span-7 space-y-6 lg:space-y-8">
          
          <Card className="p-6">
            <h2 className="text-sm font-bold text-textprimary mb-5 flex items-center gap-2 pb-2 border-b border-slate-100">
              <SecNum num={1} />
              Flight Information
            </h2>
            
            {loadingSetup ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {[1, 2, 3, 4].map(i => (
                  <div key={i}>
                    <div className="w-20 h-3 bg-slate-100 rounded mb-1.5 animate-pulse" />
                    <div className="w-full h-9 bg-slate-50 border border-slate-100 rounded-xl animate-pulse" />
                  </div>
                ))}
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-[10px] font-bold text-textsecondary uppercase tracking-wider mb-1.5">Aircraft</label>
                  <Combobox
                    items={aircraftList.map(a => ({ id: a.id, label: a.registration, sub: a.type }))}
                    value={selectedAircraft}
                    onChange={setSelectedAircraft}
                    placeholder="Select Aircraft"
                  />
                </div>

                <div>
                  <label className="block text-[10px] font-bold text-textsecondary uppercase tracking-wider mb-1.5">Departure</label>
                  <Combobox
                    items={airportsList.map(a => ({ id: a.id, label: a.icao, sub: a.name }))}
                    value={departure}
                    onChange={setDeparture}
                    placeholder="Select Departure"
                  />
                </div>

                <div>
                  <label className="block text-[10px] font-bold text-textsecondary uppercase tracking-wider mb-1.5">Destination</label>
                  <Combobox
                    items={airportsList.map(a => ({ id: a.id, label: a.icao, sub: a.name }))}
                    value={destination}
                    onChange={setDestination}
                    placeholder="Select Destination"
                  />
                </div>

                <div>
                  <label className="block text-[10px] font-bold text-textsecondary uppercase tracking-wider mb-1.5">Alternate</label>
                  <Combobox
                    items={airportsList.map(a => ({ id: a.id, label: a.icao, sub: a.name }))}
                    value={alternate}
                    onChange={setAlternate}
                    placeholder="Select Alternate"
                    emptyOption="None (No Alternate)"
                  />
                </div>
              </div>
            )}
          </Card>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
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
                      onChange={(e) => setOat(e.target.value === '' ? '' : Number(e.target.value))}
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-textsecondary uppercase tracking-wider mb-1.5">Flap Setting</label>
                    <Combobox
                      items={(acRef?.flaps ?? []).map(f => ({ id: f, label: `Flap ${f}°` }))}
                      value={flap}
                      onChange={setFlap}
                      placeholder="Select Flap"
                      emptyOption="Auto (Best)"
                    />
                  </div>
                </div>
              </div>
            </Card>

            <Card className="p-6 flex flex-col justify-between">
              <div>
                <h2 className="text-sm font-bold text-textprimary mb-5 flex items-center gap-2 pb-2 border-b border-slate-100">
                  <SecNum num={3} />
                  Weights & Inputs
                </h2>
                <div className="space-y-4">
                  <div>
                    <label className="block text-[10px] font-bold text-textsecondary uppercase tracking-wider mb-1.5">Passengers</label>
                    <input
                      type="number"
                      className="w-full px-3 py-2.5 rounded-lg border border-borderc bg-white text-xs font-semibold text-textprimary outline-none"
                      value={paxCount}
                      onChange={(e) => setPaxCount(e.target.value === '' ? '' : Number(e.target.value))}
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-textsecondary uppercase tracking-wider mb-1.5">Cargo (kg)</label>
                    <input
                      type="number"
                      className="w-full px-3 py-2.5 rounded-lg border border-borderc bg-white text-xs font-semibold text-textprimary outline-none"
                      value={cargo}
                      onChange={(e) => setCargo(e.target.value === '' ? '' : Number(e.target.value))}
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-textsecondary uppercase tracking-wider mb-1.5">Fuel On Board (kg)</label>
                    <input
                      type="number"
                      className="w-full px-3 py-2.5 rounded-lg border border-borderc bg-white text-xs font-semibold text-textprimary outline-none"
                      value={fuel}
                      onChange={(e) => setFuel(e.target.value === '' ? '' : Number(e.target.value))}
                    />
                  </div>
                </div>
              </div>
              <button 
                onClick={calculateData}
                disabled={loading || loadingSetup}
                className="w-full mt-6 bg-primary hover:bg-primary-dark disabled:opacity-50 text-white font-bold py-3 px-4 rounded-xl flex items-center justify-center gap-2 shadow-md hover:shadow-lg transition text-xs"
              >
                {loading ? <Loader2 size={14} className="animate-spin" /> : <Calculator size={14} />}
                <span>Calculate Payload & RTOW</span>
              </button>
            </Card>
          </div>

          {error && (
            <div className="bg-red-50 border border-red-200 text-danger p-4 rounded-xl text-sm font-bold flex items-center gap-2">
              <AlertTriangle size={18} />
              {error}
            </div>
          )}

        </div>

        {/* ── RIGHT COLUMN: RESULTS (col-span-5) ── */}
        {payloadRes && computeRes && (
          <div className="lg:col-span-5 space-y-6 lg:space-y-8 animate-in fade-in zoom-in duration-300">
            <Card className="p-6">
              <h2 className="text-sm font-bold text-textprimary mb-4 flex items-center gap-2 pb-2 border-b border-slate-100">
                <SecNum num={4} />
                Performance Results
              </h2>
              
              <div className="grid grid-cols-2 gap-3 text-center text-xs">
                <div 
                  onClick={() => setActiveChartParams({
                    aircraft_id: selectedAircraft,
                    airport_id: departure,
                    oat: Number(oat) || 0,
                    flap: flap ? flap.toString() : 'auto',
                    focusTab: 'RTOW',
                    rtow_kg: payloadRes.rtow_kg,
                    wat_kg: computeRes.detail?.wat_kg,
                    toda_kg: computeRes.detail?.toda_kg,
                    asda_kg: computeRes.detail?.asda_kg,
                    structural_kg: computeRes.detail?.mtow_kg,
                    factor: computeRes.factor,
                  })}
                  className="bg-slate-50 border border-slate-100 rounded-xl p-3 flex flex-col justify-center cursor-pointer hover:bg-slate-100 hover:border-slate-200 transition select-none"
                >
                  <span className="text-[9px] font-bold text-textsecondary uppercase tracking-wider mb-0.5">RTOW</span>
                  <span className="text-sm font-black font-mono text-textprimary">{payloadRes.rtow_kg.toLocaleString()} kg</span>
                  <span className="text-[8px] text-textsecondary mt-0.5">Max allowed weight (click to see detail)</span>
                </div>
                <div 
                  onClick={() => setActiveChartParams({
                    aircraft_id: selectedAircraft,
                    airport_id: departure,
                    oat: Number(oat) || 0,
                    flap: flap ? flap.toString() : 'auto',
                    focusTab: 'WAT',
                    rtow_kg: payloadRes.rtow_kg,
                    wat_kg: computeRes.detail?.wat_kg,
                    toda_kg: computeRes.detail?.toda_kg,
                    asda_kg: computeRes.detail?.asda_kg,
                    structural_kg: computeRes.detail?.mtow_kg,
                    factor: computeRes.factor,
                  })}
                  className="bg-slate-50 border border-slate-100 rounded-xl p-3 flex flex-col justify-center cursor-pointer hover:bg-slate-100 hover:border-slate-200 transition select-none"
                >
                  <span className="text-[9px] font-bold text-textsecondary uppercase tracking-wider mb-0.5">WAT Limit</span>
                  <span className="text-sm font-black font-mono text-textprimary">{Number(computeRes.detail?.wat_kg || 0).toLocaleString()} kg</span>
                  <span className="text-[8px] text-textsecondary mt-0.5">Weather & Alt (click to see detail)</span>
                </div>
                <div 
                  onClick={() => {
                    const f = computeRes.factor;
                    const tab = (f === 'WAT' || f === 'TODA' || f === 'ASDA') ? f : 'RTOW';
                    setActiveChartParams({
                      aircraft_id: selectedAircraft,
                      airport_id: departure,
                      oat: Number(oat) || 0,
                      flap: flap ? flap.toString() : 'auto',
                      focusTab: tab,
                      rtow_kg: payloadRes.rtow_kg,
                      wat_kg: computeRes.detail?.wat_kg,
                      toda_kg: computeRes.detail?.toda_kg,
                      asda_kg: computeRes.detail?.asda_kg,
                      structural_kg: computeRes.detail?.mtow_kg,
                      factor: computeRes.factor,
                    });
                  }}
                  className="bg-slate-50 border border-slate-100 rounded-xl p-3 flex flex-col justify-center items-center col-span-2 cursor-pointer hover:bg-slate-100 hover:border-slate-200 transition select-none"
                >
                  <span className="text-[9px] font-bold text-textsecondary uppercase tracking-wider mb-0.5">Limiting Factor</span>
                  <span className="text-sm font-black text-primary">{computeRes.factor || 'N/A'}</span>
                  <span className="text-[8px] text-textsecondary mt-0.5">Governing restriction (click to see detail)</span>
                </div>
              </div>

              <h3 className="text-xs font-bold text-textprimary mt-6 mb-3 uppercase tracking-wider">Weight Summary</h3>
              <div className="space-y-2 text-xs border-b border-slate-100 pb-4">
                <div className="flex justify-between py-1 border-b border-slate-50">
                  <span className="text-textsecondary font-medium">Operating Empty Weight</span>
                  <span className="font-bold text-textprimary font-mono">{Number(payloadRes.bew_kg || acRef?.bew_kg || 0).toLocaleString()} kg</span>
                </div>
                <div className="flex justify-between py-1 border-b border-slate-50">
                  <span className="text-textsecondary font-medium">Payload (Pax + Cargo)</span>
                  <span className="font-bold text-textprimary font-mono">
                    {payloadRes.payload_kg.toLocaleString()} kg
                    <span className="text-textsecondary text-[9px] font-medium ml-1">({((payloadRes.payload_kg / payloadRes.rtow_kg) * 100).toFixed(1)}%)</span>
                  </span>
                </div>
                <div className="flex justify-between py-1 border-b border-slate-50">
                  <span className="text-textsecondary font-medium">Max Allowed Payload</span>
                  <span className="font-bold text-success font-mono">{Number(payloadRes.max_payload_kg ?? payloadRes.payload_kg).toLocaleString()} kg</span>
                </div>
                <div className="flex justify-between py-1 border-b border-slate-50">
                  <span className="text-textsecondary font-medium">Fuel On Board</span>
                  <span className="font-bold text-textprimary font-mono">
                    {Number(payloadRes.fob_kg ?? payloadRes.fuel?.total_kg ?? 0).toLocaleString()} kg
                    <span className="text-textsecondary text-[9px] font-medium ml-1">({((Number(payloadRes.fob_kg ?? payloadRes.fuel?.total_kg ?? 0) / payloadRes.rtow_kg) * 100).toFixed(1)}%)</span>
                  </span>
                </div>
                <div className="flex justify-between py-1">
                  <span className="text-textsecondary font-semibold">Takeoff Weight</span>
                  <span className="font-bold text-textprimary font-mono">{payloadRes.tow_kg.toLocaleString()} kg</span>
                </div>
              </div>

              <div className={`border rounded-xl p-3.5 flex items-start gap-3 mt-4 ${isWithinLimits ? 'bg-success/10 border-success/20 text-success' : 'bg-danger/10 border-danger/20 text-danger'}`}>
                <div className="shrink-0 mt-0.5">
                  {isWithinLimits ? <CheckCircle2 size={18} /> : <AlertTriangle size={18} />}
                </div>
                <div>
                  <p className="text-[11px] font-black uppercase tracking-wider leading-none mb-1">
                    {isWithinLimits ? 'WITHIN LIMITS' : 'EXCEEDS LIMITS'}
                  </p>
                  <p className="text-[11px] font-semibold opacity-90">
                    Margin: {margin > 0 ? '+' : ''}{margin.toLocaleString()} kg
                  </p>
                </div>
              </div>
            </Card>
          </div>
        )}
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
