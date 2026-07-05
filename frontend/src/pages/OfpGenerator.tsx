import { FileText, Download } from 'lucide-react'
import Card from '../components/ui/Card'

const sections = [
  'Flight Summary', 'Aircraft Information', 'Fuel Summary', 'Weather',
  'Alternates', 'Performance Summary', 'Crew Briefing', 'Navlog', 'Airport Information'
]

export default function OfpGenerator() {
  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-textprimary">OFP Generator</h1>
          <p className="text-textsecondary text-sm mt-1">Generate a complete Operational Flight Plan for export.</p>
        </div>
        <button className="bg-primary hover:bg-[#1850E0] text-white font-semibold rounded-lg px-5 py-2.5 flex items-center gap-2 transition w-fit">
          <Download size={16} /> Export PDF
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <Card className="lg:col-span-1">
          <h2 className="font-bold text-textprimary mb-4">Flight Reference</h2>
          <div className="space-y-3 text-sm">
            <RefRow label="OFP No." value="OFP-3381" />
            <RefRow label="Aircraft" value="5Y-DWN" />
            <RefRow label="Route" value="EGPD → FTTC" />
            <RefRow label="Date" value="25 JUN 2026" />
            <RefRow label="Crew" value="J. Dispatcher" />
          </div>
        </Card>

        <Card className="lg:col-span-2">
          <h2 className="font-bold text-textprimary mb-4 flex items-center gap-2">
            <FileText size={18} className="text-primary" />
            OFP Sections
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            {sections.map((s) => (
              <div key={s} className="flex items-center gap-2.5 bg-bg rounded-lg px-3.5 py-2.5 text-sm font-medium text-textprimary">
                <span className="w-1.5 h-1.5 rounded-full bg-success" />
                {s}
              </div>
            ))}
          </div>
        </Card>
      </div>
    </div>
  )
}

function RefRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between border-b border-borderc pb-2 last:border-0">
      <span className="text-textsecondary">{label}</span>
      <span className="font-semibold text-textprimary">{value}</span>
    </div>
  )
}
