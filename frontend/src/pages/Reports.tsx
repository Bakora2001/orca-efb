import { FileBarChart, Download } from 'lucide-react'
import Card from '../components/ui/Card'

const reports = [
  { name: 'Dispatch Reports', desc: 'All dispatch decisions and outcomes' },
  { name: 'Aircraft Utilization Reports', desc: 'Hours, cycles, and uptime by aircraft' },
  { name: 'Fuel Reports', desc: 'Fuel burn and efficiency trends' },
  { name: 'Payload Reports', desc: 'Payload and revenue load analysis' },
  { name: 'Performance Reports', desc: 'RTOW and WAT performance summaries' },
  { name: 'Operational Statistics', desc: 'Fleet-wide operational KPIs' },
]

export default function Reports() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-textprimary">Reports</h1>
        <p className="text-textsecondary text-sm mt-1">Generate and export operational reports.</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {reports.map((r) => (
          <Card key={r.name} className="hover:shadow-cardHover transition flex flex-col">
            <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center text-primary mb-3">
              <FileBarChart size={18} />
            </div>
            <p className="font-bold text-textprimary">{r.name}</p>
            <p className="text-xs text-textsecondary mt-1 flex-1">{r.desc}</p>
            <div className="flex gap-2 mt-4">
              {['PDF', 'Excel', 'CSV'].map((fmt) => (
                <button key={fmt} className="flex-1 border border-borderc rounded-lg py-1.5 text-xs font-semibold text-textprimary hover:border-primary hover:text-primary transition flex items-center justify-center gap-1">
                  <Download size={12} /> {fmt}
                </button>
              ))}
            </div>
          </Card>
        ))}
      </div>
    </div>
  )
}
