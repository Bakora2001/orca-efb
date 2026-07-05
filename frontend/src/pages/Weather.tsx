import { useState } from 'react'
import { Search, CloudSun, Wind, Eye, Gauge, Cloud, Thermometer } from 'lucide-react'
import Card from '../components/ui/Card'

export default function Weather() {
  const [query, setQuery] = useState('EGPD')

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-textprimary">Weather</h1>
        <p className="text-textsecondary text-sm mt-1">METAR, TAF, and live airport weather conditions.</p>
      </div>

      <Card>
        <div className="relative max-w-md">
          <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-textsecondary" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value.toUpperCase())}
            placeholder="Search ICAO / IATA code"
            className="input-text pl-10"
          />
        </div>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <Card className="lg:col-span-2">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-bold text-textprimary flex items-center gap-2"><CloudSun size={18} className="text-primary" />{query} Conditions</h2>
            <span className="text-xs text-textsecondary mono">Updated 08:42 UTC</span>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-5">
            <WxStat icon={<Wind size={16} />} label="Wind" value="270°/12kt" />
            <WxStat icon={<Eye size={16} />} label="Visibility" value="10 km" />
            <WxStat icon={<Gauge size={16} />} label="QNH" value="1013 hPa" />
            <WxStat icon={<Thermometer size={16} />} label="Temp" value="22°C" />
          </div>
          <div className="bg-bg rounded-lg p-4">
            <p className="text-xs font-semibold text-textsecondary mb-1.5">METAR</p>
            <p className="text-sm font-mono text-textprimary leading-relaxed">EGPD 250850Z 27012KT 9999 FEW035 22/14 Q1013 NOSIG</p>
          </div>
          <div className="bg-bg rounded-lg p-4 mt-3">
            <p className="text-xs font-semibold text-textsecondary mb-1.5">TAF</p>
            <p className="text-sm font-mono text-textprimary leading-relaxed">TAF EGPD 250500Z 2506/2612 27010KT 9999 FEW035 BECMG 2512/2514 25015KT</p>
          </div>
        </Card>

        <Card>
          <h2 className="font-bold text-textprimary mb-4 flex items-center gap-2"><Cloud size={18} className="text-primary" />Weather Trend</h2>
          <div className="space-y-3">
            {['08:00', '09:00', '10:00', '11:00'].map((t, i) => (
              <div key={t} className="flex items-center justify-between text-sm border-b border-borderc pb-2.5 last:border-0">
                <span className="text-textsecondary mono">{t}</span>
                <span className="text-textprimary font-medium">{20 + i}°C · {260 + i * 5}°/{10 + i}kt</span>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </div>
  )
}

function WxStat({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="bg-bg rounded-lg p-3 text-center">
      <div className="flex justify-center text-primary mb-1">{icon}</div>
      <p className="text-textsecondary text-xs">{label}</p>
      <p className="font-bold text-textprimary text-sm mono">{value}</p>
    </div>
  )
}
