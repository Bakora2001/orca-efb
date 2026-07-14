import { useState, useEffect, useCallback, useRef } from 'react'
import { Search, MapPin, Plus, RefreshCw, AlertCircle, Globe, Loader2, ChevronUp, ChevronDown } from 'lucide-react'
import Card from '../components/ui/Card'
import { airports as airportsApi, type ApiAirport } from '../lib/api'

function useDebounce<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay)
    return () => clearTimeout(timer)
  }, [value, delay])
  return debounced
}

type SortKey = 'icao' | 'name' | 'country' | 'elevation_ft'
type SortDir = 'asc' | 'desc'

export default function AirportsDatabase() {
  const [query, setQuery] = useState('')
  const [airports, setAirports] = useState<ApiAirport[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [sort, setSort] = useState<SortKey>('icao')
  const [dir, setDir] = useState<SortDir>('asc')
  const abortRef = useRef<AbortController | null>(null)

  const debouncedQuery = useDebounce(query, 300)

  const load = useCallback(async (q: string) => {
    if (abortRef.current) abortRef.current.abort()
    abortRef.current = new AbortController()

    setLoading(true)
    setError(null)
    try {
      const data = await airportsApi.search(q)
      setAirports(data)
    } catch (err: any) {
      if (err.name !== 'AbortError') setError(err.message || 'Failed to load airports')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load(debouncedQuery) }, [debouncedQuery, load])

  const handleSort = (key: SortKey) => {
    if (sort === key) setDir((d) => d === 'asc' ? 'desc' : 'asc')
    else { setSort(key); setDir('asc') }
  }

  const sorted = [...airports].sort((a, b) => {
    const av = a[sort] ?? ''
    const bv = b[sort] ?? ''
    if (typeof av === 'number' && typeof bv === 'number') return dir === 'asc' ? av - bv : bv - av
    return dir === 'asc'
      ? String(av).localeCompare(String(bv))
      : String(bv).localeCompare(String(av))
  })

  const Th = ({ label, k }: { label: string; k: SortKey }) => (
    <th
      onClick={() => handleSort(k)}
      className="px-4 py-3 font-semibold cursor-pointer select-none hover:text-primary transition whitespace-nowrap"
    >
      <span className="flex items-center gap-1">
        {label}
        {sort === k ? (dir === 'asc' ? <ChevronUp size={12} /> : <ChevronDown size={12} />) : null}
      </span>
    </th>
  )

  return (
    <div className="space-y-6">

      {/* ── Header ── */}
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-textprimary tracking-tight">Airports Database</h1>
          <p className="text-textsecondary text-sm mt-0.5">
            ICAO, IATA, runways, elevation and operational data
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => load(debouncedQuery)}
            className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-textsecondary border border-borderc rounded-lg hover:border-primary hover:text-primary transition"
          >
            <RefreshCw size={13} />
            Refresh
          </button>
          <button className="bg-primary hover:bg-[#1850E0] text-white font-semibold rounded-lg px-4 py-2 flex items-center gap-1.5 transition text-sm">
            <Plus size={15} /> Add Airport
          </button>
        </div>
      </div>

      <Card>
        {/* Search bar */}
        <div className="flex items-center gap-3 mb-5">
          <div className="relative flex-1 max-w-lg">
            {loading
              ? <Loader2 size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-primary animate-spin" />
              : <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-textsecondary" />
            }
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search by ICAO, IATA or name…"
              className="w-full pl-10 pr-4 py-2.5 rounded-lg border border-borderc bg-bg text-sm text-textprimary placeholder:text-textsecondary focus:border-primary focus:ring-2 focus:ring-primary/15 outline-none transition"
            />
          </div>
          <span className="text-xs text-textsecondary font-medium hidden sm:block">
            {loading ? 'Searching…' : `${sorted.length} result${sorted.length !== 1 ? 's' : ''}`}
          </span>
        </div>

        {/* Error */}
        {error && (
          <div className="flex items-center gap-2 text-sm text-danger bg-red-50 border border-red-200 rounded-lg px-4 py-3 mb-4">
            <AlertCircle size={16} />
            <span>{error}</span>
            <button onClick={() => load(debouncedQuery)} className="ml-auto text-xs font-bold underline">Retry</button>
          </div>
        )}

        {/* Table */}
        <div className="overflow-x-auto -mx-5">
          <table className="w-full text-sm min-w-[700px]">
            <thead>
              <tr className="text-left text-textsecondary text-xs border-b border-borderc">
                <Th label="ICAO" k="icao" />
                <th className="px-4 py-3 font-semibold">IATA</th>
                <Th label="Name" k="name" />
                <Th label="Country" k="country" />
                <Th label="Elevation (ft)" k="elevation_ft" />
                <th className="px-4 py-3 font-semibold">Coords</th>
                <th className="px-4 py-3 font-semibold">Status</th>
              </tr>
            </thead>
            <tbody>
              {loading && airports.length === 0
                ? Array.from({ length: 8 }).map((_, i) => (
                    <tr key={i} className="border-b border-borderc animate-pulse">
                      {Array.from({ length: 7 }).map((__, j) => (
                        <td key={j} className="px-4 py-3">
                          <div className="h-3 bg-slate-100 rounded w-full" />
                        </td>
                      ))}
                    </tr>
                  ))
                : sorted.length === 0
                  ? (
                    <tr>
                      <td colSpan={7} className="px-4 py-12 text-center text-textsecondary text-sm">
                        <Globe size={32} className="mx-auto mb-2 opacity-30" />
                        {query ? `No airports found for "${query}"` : 'Start typing to search airports'}
                      </td>
                    </tr>
                  )
                  : sorted.map((a) => (
                    <tr key={a.id} className="border-b border-borderc last:border-0 hover:bg-slate-50/60 transition">
                      <td className="px-4 py-3">
                        <span className="flex items-center gap-1.5 font-bold text-textprimary">
                          <MapPin size={12} className="text-primary shrink-0" />
                          {a.icao}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-textsecondary font-mono text-xs">{a.iata || '—'}</td>
                      <td className="px-4 py-3 text-textprimary max-w-[220px] truncate">{a.name}</td>
                      <td className="px-4 py-3 text-textsecondary">{a.country || '—'}</td>
                      <td className="px-4 py-3 text-textprimary font-mono text-xs">
                        {a.elevation_ft != null ? `${a.elevation_ft.toLocaleString()} ft` : '—'}
                      </td>
                      <td className="px-4 py-3 text-textsecondary font-mono text-xs whitespace-nowrap">
                        {a.lat != null && a.lon != null
                          ? `${a.lat.toFixed(3)}°, ${a.lon.toFixed(3)}°`
                          : '—'}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${a.is_active ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>
                          {a.is_active ? 'Active' : 'Inactive'}
                        </span>
                      </td>
                    </tr>
                  ))
              }
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  )
}
