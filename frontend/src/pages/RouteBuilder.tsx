import { Route, Plus, Trash2 } from 'lucide-react'
import Card from '../components/ui/Card'
import { mockAirports } from '../data/mockData'

export default function RouteBuilder() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-textprimary">Route Builder</h1>
        <p className="text-textsecondary text-sm mt-1">Construct waypoint sequences and visualize the navlog route.</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <Card>
          <h2 className="font-bold text-textprimary mb-4 flex items-center gap-2"><Route size={18} className="text-primary" />Waypoints</h2>
          <div className="space-y-2.5">
            {mockAirports.map((a, i) => (
              <div key={a.icao} className="flex items-center gap-2.5 bg-bg rounded-lg px-3.5 py-2.5">
                <span className="w-6 h-6 rounded-full bg-primary text-white text-xs font-bold flex items-center justify-center">{i + 1}</span>
                <div className="flex-1">
                  <p className="text-sm font-semibold text-textprimary">{a.icao}</p>
                  <p className="text-xs text-textsecondary">{a.name}</p>
                </div>
                <button className="text-textsecondary hover:text-danger transition"><Trash2 size={15} /></button>
              </div>
            ))}
          </div>
          <button className="w-full border border-dashed border-borderc rounded-lg py-2.5 text-sm text-textsecondary flex items-center justify-center gap-1.5 hover:border-primary hover:text-primary transition mt-3">
            <Plus size={15} /> Add Waypoint
          </button>
        </Card>

        <Card className="lg:col-span-2">
          <h2 className="font-bold text-textprimary mb-4">Route Map</h2>
          <div className="rounded-lg bg-aviation-gradient h-80 flex items-center justify-center relative overflow-hidden">
            <svg viewBox="0 0 400 200" className="w-full h-full absolute inset-0">
              <path d="M30,160 C90,130 150,150 200,100 C250,60 300,40 370,30" fill="none" stroke="#FFFFFF" strokeDasharray="3 6" strokeWidth="1.5" opacity="0.8" />
              {[
                [30, 160], [200, 100], [370, 30]
              ].map(([x, y], i) => (
                <circle key={i} cx={x} cy={y} r="5" fill="#FFFFFF" />
              ))}
            </svg>
          </div>
        </Card>
      </div>
    </div>
  )
}
