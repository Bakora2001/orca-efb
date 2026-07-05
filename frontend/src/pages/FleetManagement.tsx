import { Plane, Plus } from 'lucide-react'
import Card from '../components/ui/Card'
import { mockAircraft } from '../data/mockData'

const statusColors: Record<string, string> = {
  active: 'bg-success/10 text-success',
  maintenance: 'bg-warning/10 text-warning',
  grounded: 'bg-danger/10 text-danger',
}

export default function FleetManagement() {
  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-textprimary">Fleet Management</h1>
          <p className="text-textsecondary text-sm mt-1">Track registration, configuration, and maintenance status.</p>
        </div>
        <button className="bg-primary hover:bg-[#1850E0] text-white font-semibold rounded-lg px-5 py-2.5 flex items-center gap-2 transition w-fit">
          <Plus size={16} /> Add Aircraft
        </button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {mockAircraft.map((a) => (
          <Card key={a.registration} className="hover:shadow-cardHover transition">
            <div className="flex items-center justify-between mb-3">
              <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center text-primary">
                <Plane size={18} />
              </div>
              <span className={`text-xs font-semibold px-2.5 py-1 rounded-full capitalize ${statusColors[a.status]}`}>{a.status}</span>
            </div>
            <p className="font-bold text-textprimary text-lg">{a.registration}</p>
            <p className="text-textsecondary text-xs mb-3">{a.type} · {a.configuration}</p>
            <div className="space-y-1.5 text-xs">
              <Row label="Basic Weight" value={`${a.basicWeight.toLocaleString()} kg`} />
              <Row label="Fuel Capacity" value={`${a.fuelCapacity.toLocaleString()} kg`} />
              <Row label="Cycles" value={a.cycles.toLocaleString()} />
              <Row label="Hours" value={a.hours.toLocaleString()} />
            </div>
          </Card>
        ))}
      </div>
    </div>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between">
      <span className="text-textsecondary">{label}</span>
      <span className="font-semibold text-textprimary mono">{value}</span>
    </div>
  )
}
