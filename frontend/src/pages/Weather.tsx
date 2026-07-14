import { useState, useCallback } from 'react'
import {
  Search, CloudSun, Wind, Eye, Gauge, Thermometer,
  RefreshCw, AlertCircle, Loader2, Clock, Radio, Cloud,
  CloudRain, Sun, CloudSnow
} from 'lucide-react'
import Card from '../components/ui/Card'
import { weather as weatherApi, type WeatherResult } from '../lib/api'

// ─── METAR parser — pulls key values from raw string ─────────────────────────
function parseMetar(raw: string) {
  if (!raw || raw.startsWith('No ') || raw.startsWith('METAR unavailable')) return null
  const wind = raw.match(/(\d{3}|VRB)(\d{2,3})(G\d+)?KT/)
  const vis = raw.match(/(\d{4})\s/) || raw.match(/(\d+)SM/)
  const temp = raw.match(/\s([M-]?\d{1,2})\/([M-]?\d{1,2})\s/)
  const qnh = raw.match(/Q(\d{4})/) || raw.match(/A(\d{4})/)
  const clouds = raw.match(/(FEW|SCT|BKN|OVC)(\d{3})/)

  const parseDeg = (s?: string) => s ? (s.startsWith('M') ? -parseInt(s.slice(1)) : parseInt(s)) : null

  return {
    windDir:  wind?.[1] !== 'VRB' ? wind?.[1] : 'VRB',
    windKt:   wind?.[2] ? parseInt(wind[2]) : null,
    gustKt:   wind?.[3] ? parseInt(wind[3].slice(1)) : null,
    visM:     vis?.[1] ? parseInt(vis[1]) : null,
    tempC:    parseDeg(temp?.[1]),
    dewpointC: parseDeg(temp?.[2]),
    qnhHpa:   qnh?.[1] ? parseInt(qnh[1]) : null,
    clouds:   clouds ? `${clouds[1]} ${parseInt(clouds[2]) * 100} ft` : null,
  }
}

function wxIcon(metar: string) {
  if (metar.includes('RA') || metar.includes('DZ')) return CloudRain
  if (metar.includes('SN') || metar.includes('GR')) return CloudSnow
  if (metar.includes('TS')) return CloudRain
  if (metar.includes('FEW') || metar.includes('SCT')) return CloudSun
  if (metar.includes('BKN') || metar.includes('OVC')) return Cloud
  return Sun
}

function WxStat({ icon: Icon, label, value, sub }: { icon: React.ElementType; label: string; value: string; sub?: string }) {
  return (
    <div className="bg-slate-50 border border-slate-100 rounded-xl p-3.5 flex flex-col items-center text-center">
      <div className="p-2 rounded-lg bg-primary/10 text-primary mb-2">
        <Icon size={15} />
      </div>
      <p className="text-[10px] text-textsecondary font-semibold uppercase tracking-wider">{label}</p>
      <p className="font-black text-textprimary text-sm mt-0.5 font-mono">{value}</p>
      {sub && <p className="text-[10px] text-textsecondary mt-0.5">{sub}</p>}
    </div>
  )
}

const PRESETS = ['HKJK', 'HKMO', 'EGPD', 'FTTC', 'HADR', 'HKKI']

export default function Weather() {
  const [query, setQuery] = useState('')
  const [result, setResult] = useState<WeatherResult | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const fetch = useCallback(async (icao: string) => {
    const code = icao.trim().toUpperCase()
    if (code.length < 3) return
    setLoading(true)
    setError(null)
    setResult(null)
    try {
      const data = await weatherApi.get(code)
      setResult(data)
      setQuery(code)
    } catch (err: any) {
      setError(err.message || 'Failed to fetch weather')
    } finally {
      setLoading(false)
    }
  }, [])

  const parsed = result ? parseMetar(result.metar) : null
  const WxIcon = result ? wxIcon(result.metar) : CloudSun
  const updatedAt = result
    ? new Date(result.fetchedAt).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'UTC' }) + ' UTC'
    : null

  return (
    <div className="space-y-6">

      {/* ── Header ── */}
      <div>
        <h1 className="text-2xl font-bold text-textprimary tracking-tight">Weather Intelligence</h1>
        <p className="text-textsecondary text-sm mt-0.5">
          Live METAR · TAF · Airport weather via NOAA Aviation Weather Center
        </p>
      </div>

      {/* ── Search ── */}
      <Card>
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            {loading
              ? <Loader2 size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-primary animate-spin" />
              : <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-textsecondary" />
            }
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value.toUpperCase())}
              onKeyDown={(e) => e.key === 'Enter' && fetch(query)}
              placeholder="Enter ICAO code (e.g. HKJK, EGPD)…"
              className="w-full pl-10 pr-4 py-2.5 rounded-lg border border-borderc bg-bg text-sm text-textprimary placeholder:text-textsecondary focus:border-primary focus:ring-2 focus:ring-primary/15 outline-none transition font-mono tracking-wider"
              maxLength={4}
            />
          </div>
          <button
            onClick={() => fetch(query)}
            disabled={loading || query.length < 3}
            className="px-5 py-2.5 bg-primary hover:bg-[#1850E0] text-white font-semibold rounded-lg text-sm transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
          >
            {loading ? <Loader2 size={15} className="animate-spin" /> : <Search size={15} />}
            Fetch Weather
          </button>
        </div>

        {/* Preset buttons */}
        <div className="flex flex-wrap gap-2 mt-3">
          <span className="text-[11px] text-textsecondary font-semibold self-center">Quick:</span>
          {PRESETS.map((icao) => (
            <button
              key={icao}
              onClick={() => fetch(icao)}
              className="px-2.5 py-1 text-[11px] font-bold rounded-lg border border-borderc text-textsecondary hover:border-primary hover:text-primary hover:bg-blue-50 transition font-mono"
            >
              {icao}
            </button>
          ))}
        </div>
      </Card>

      {/* ── Error ── */}
      {error && (
        <div className="flex items-center gap-2 text-sm text-danger bg-red-50 border border-red-200 rounded-lg px-4 py-3">
          <AlertCircle size={16} />
          <span>{error}</span>
        </div>
      )}

      {/* ── Results ── */}
      {result && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">

          {/* Main conditions */}
          <div className="lg:col-span-2 space-y-4">
            <Card>
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-primary/10 text-primary flex items-center justify-center">
                    <WxIcon size={20} />
                  </div>
                  <div>
                    <h2 className="font-black text-textprimary text-lg">{result.icao}</h2>
                    <p className="text-textsecondary text-xs">Current Conditions</p>
                  </div>
                </div>
                <div className="text-right">
                  <div className="flex items-center gap-1.5 text-[11px] text-textsecondary">
                    <Clock size={11} />
                    {updatedAt}
                  </div>
                  {result.cached && (
                    <span className="text-[10px] bg-amber-50 text-amber-600 border border-amber-200 px-2 py-0.5 rounded-full font-semibold">
                      Cached
                    </span>
                  )}
                </div>
              </div>

              {/* Parsed stats grid */}
              {parsed ? (
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
                  <WxStat
                    icon={Wind}
                    label="Wind"
                    value={parsed.windDir && parsed.windKt ? `${parsed.windDir}°/${parsed.windKt}kt` : '—'}
                    sub={parsed.gustKt ? `Gust ${parsed.gustKt}kt` : undefined}
                  />
                  <WxStat
                    icon={Eye}
                    label="Visibility"
                    value={parsed.visM ? `${(parsed.visM / 1000).toFixed(1)} km` : '—'}
                  />
                  <WxStat
                    icon={Gauge}
                    label="QNH"
                    value={parsed.qnhHpa ? `${parsed.qnhHpa} hPa` : '—'}
                  />
                  <WxStat
                    icon={Thermometer}
                    label="Temp / Dew"
                    value={parsed.tempC != null ? `${parsed.tempC}°C` : '—'}
                    sub={parsed.dewpointC != null ? `DP ${parsed.dewpointC}°C` : undefined}
                  />
                </div>
              ) : result.metar.startsWith('No ') || result.metar.includes('unavailable') ? (
                <div className="bg-amber-50 border border-amber-100 rounded-lg px-4 py-3 text-xs text-amber-700 font-semibold mb-4">
                  NOAA Aviation Weather Center currently has no live METAR data for this station.
                </div>
              ) : (
                <div className="bg-amber-50 border border-amber-100 rounded-lg px-4 py-3 text-xs text-amber-700 font-semibold mb-4">
                  Raw METAR received — could not parse individual fields.
                </div>
              )}

              {/* METAR raw */}
              <div className="bg-slate-900 rounded-xl p-4">
                <div className="flex items-center gap-2 mb-2">
                  <Radio size={13} className="text-emerald-400" />
                  <span className="text-[10px] font-bold text-emerald-400 uppercase tracking-widest">METAR</span>
                </div>
                <p className="text-sm font-mono text-emerald-300 leading-relaxed break-all">
                  {result.metar || 'No METAR data available'}
                </p>
              </div>

              {/* TAF raw */}
              <div className="bg-slate-900 rounded-xl p-4 mt-3">
                <div className="flex items-center gap-2 mb-2">
                  <Radio size={13} className="text-blue-400" />
                  <span className="text-[10px] font-bold text-blue-400 uppercase tracking-widest">TAF</span>
                </div>
                <p className="text-sm font-mono text-blue-300 leading-relaxed break-all">
                  {result.taf || 'No TAF available for this station'}
                </p>
              </div>
            </Card>
          </div>

          {/* Side panel */}
          <Card>
            <h2 className="font-bold text-textprimary mb-4 flex items-center gap-2">
              <Cloud size={16} className="text-primary" />
              Quick Summary
            </h2>
            <div className="space-y-3">
              {[
                { label: 'Station', value: result.icao },
                { label: 'OAT', value: parsed?.tempC != null ? `${parsed.tempC}°C` : '—' },
                { label: 'Dewpoint', value: parsed?.dewpointC != null ? `${parsed.dewpointC}°C` : '—' },
                { label: 'Wind', value: parsed?.windDir && parsed?.windKt ? `${parsed.windDir}° / ${parsed.windKt} kt` : '—' },
                { label: 'QNH', value: parsed?.qnhHpa ? `${parsed.qnhHpa} hPa` : '—' },
                { label: 'Visibility', value: parsed?.visM ? `${(parsed.visM / 1000).toFixed(1)} km` : '—' },
                { label: 'Cloud Base', value: parsed?.clouds || '—' },
                { label: 'Source', value: 'NOAA AWCS' },
                { label: 'Updated', value: updatedAt || '—' },
              ].map(({ label, value }) => (
                <div key={label} className="flex justify-between items-center text-sm border-b border-borderc pb-2.5 last:border-0">
                  <span className="text-textsecondary text-xs font-medium">{label}</span>
                  <span className="font-bold text-textprimary text-xs font-mono">{value}</span>
                </div>
              ))}
            </div>

            <button
              onClick={() => fetch(result.icao)}
              className="w-full mt-4 flex items-center justify-center gap-2 py-2 border border-borderc rounded-lg text-xs font-semibold text-textsecondary hover:border-primary hover:text-primary transition"
            >
              <RefreshCw size={12} />
              Refresh
            </button>
          </Card>
        </div>
      )}

      {/* ── Loading Skeleton ── */}
      {loading && !result && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
          <div className="lg:col-span-2 space-y-4">
            <Card>
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-slate-100 animate-pulse" />
                  <div>
                    <div className="h-5 w-20 bg-slate-100 rounded animate-pulse mb-1" />
                    <div className="h-3 w-32 bg-slate-100 rounded animate-pulse" />
                  </div>
                </div>
                <div className="h-3 w-24 bg-slate-100 rounded animate-pulse" />
              </div>
              
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
                {[1, 2, 3, 4].map(i => (
                  <div key={i} className="bg-slate-50 border border-slate-100 rounded-xl p-3.5 flex flex-col items-center">
                    <div className="h-8 w-8 rounded-lg bg-slate-200 animate-pulse mb-2" />
                    <div className="h-3 w-12 bg-slate-200 rounded animate-pulse mb-1" />
                    <div className="h-4 w-16 bg-slate-200 rounded animate-pulse" />
                  </div>
                ))}
              </div>

              <div className="bg-slate-900/50 rounded-xl p-4 h-24 animate-pulse mb-3" />
              <div className="bg-slate-900/50 rounded-xl p-4 h-24 animate-pulse" />
            </Card>
          </div>
          
          <Card>
            <div className="h-5 w-32 bg-slate-100 rounded animate-pulse mb-6" />
            <div className="space-y-4">
              {[1, 2, 3, 4, 5, 6, 7].map(i => (
                <div key={i} className="flex justify-between items-center border-b border-slate-100 pb-3">
                  <div className="h-3 w-16 bg-slate-100 rounded animate-pulse" />
                  <div className="h-3 w-20 bg-slate-100 rounded animate-pulse" />
                </div>
              ))}
            </div>
          </Card>
        </div>
      )}

      {/* Empty state */}
      {!result && !loading && !error && (
        <Card>
          <div className="py-16 flex flex-col items-center text-center">
            <CloudSun size={48} className="text-primary/30 mb-4" />
            <p className="text-textprimary font-bold">Enter an ICAO code to fetch live weather</p>
            <p className="text-textsecondary text-sm mt-1">Try HKJK, EGPD, FTTC or any valid station code</p>
          </div>
        </Card>
      )}
    </div>
  )
}
