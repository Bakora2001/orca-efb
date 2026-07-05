import { useState } from 'react'
import { Search, Plus, MapPin } from 'lucide-react'
import Card from '../components/ui/Card'
import { mockAirports } from '../data/mockData'

export default function AirportsDatabase() {
  const [query, setQuery] = useState('')
  const filtered = mockAirports.filter(
    (a) => a.icao.includes(query.toUpperCase()) || a.name.toLowerCase().includes(query.toLowerCase())
  )

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-textprimary">Airports Database</h1>
          <p className="text-textsecondary text-sm mt-1">ICAO, IATA, runways, elevation, and operational support data.</p>
        </div>
        <button className="bg-primary hover:bg-[#1850E0] text-white font-semibold rounded-lg px-5 py-2.5 flex items-center gap-2 transition w-fit">
          <Plus size={16} /> Add Airport
        </button>
      </div>

      <Card>
        <div className="relative max-w-md mb-4">
          <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-textsecondary" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by ICAO, IATA, or name"
            className="input-text pl-10"
          />
        </div>
        <div className="overflow-x-auto -mx-5">
          <table className="w-full text-sm min-w-[640px]">
            <thead>
              <tr className="text-left text-textsecondary text-xs border-b border-borderc">
                <th className="px-5 py-2 font-medium">ICAO</th>
                <th className="px-5 py-2 font-medium">IATA</th>
                <th className="px-5 py-2 font-medium">Name</th>
                <th className="px-5 py-2 font-medium">Country</th>
                <th className="px-5 py-2 font-medium">Elevation</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((a) => (
                <tr key={a.icao} className="border-b border-borderc last:border-0 hover:bg-slate-50/60">
                  <td className="px-5 py-3 font-semibold text-textprimary flex items-center gap-1.5"><MapPin size={13} className="text-primary" />{a.icao}</td>
                  <td className="px-5 py-3 text-textprimary">{a.iata}</td>
                  <td className="px-5 py-3 text-textprimary">{a.name}</td>
                  <td className="px-5 py-3 text-textsecondary">{a.country}</td>
                  <td className="px-5 py-3 text-textprimary mono">{a.elevation} ft</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  )
}
