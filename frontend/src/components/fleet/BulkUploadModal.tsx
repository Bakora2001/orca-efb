import { useState, useRef } from 'react'
import { Upload, X, AlertCircle, FileText, CheckCircle2 } from 'lucide-react'
import type { ApiAircraft } from '../../lib/api'

interface BulkUploadModalProps {
  onClose: () => void
  onUpload: (data: Partial<ApiAircraft>[]) => Promise<void>
}

const TEMPLATE_HEADERS = [
  'registration', 'type', 'manufacturer', 'mtow_kg', 'mlw_kg', 
  'mzfw_kg', 'bew_kg', 'max_pax', 'cruise_tas_kt', 'fuel_burn_kg_hr', 'flaps', 'notes'
]

export default function BulkUploadModal({ onClose, onUpload }: BulkUploadModalProps) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)
  
  const fileInputRef = useRef<HTMLInputElement>(null)

  const downloadTemplate = () => {
    const csvContent = "data:text/csv;charset=utf-8," + TEMPLATE_HEADERS.join(',') + "\n5Y-DWN,DASH 8-300,De Havilland,19504,19050,17916,11500,50,270,600,\"5, 10, 15, 35\",Sample Notes"
    const encodedUri = encodeURI(csvContent)
    const link = document.createElement("a")
    link.setAttribute("href", encodedUri)
    link.setAttribute("download", "aircraft_bulk_template.csv")
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    setLoading(true)
    setError(null)

    const reader = new FileReader()
    reader.onload = async (evt) => {
      try {
        const text = evt.target?.result as string
        const lines = text.split('\n').filter(line => line.trim().length > 0)
        
        if (lines.length < 2) {
          throw new Error('CSV file must contain headers and at least one row of data.')
        }

        const headers = lines[0].split(',').map(h => h.trim().toLowerCase())
        
        const payload: Partial<ApiAircraft>[] = []

        for (let i = 1; i < lines.length; i++) {
          // Extremely basic CSV split that ignores commas inside quotes
          const match = lines[i].match(/(".*?"|[^",\s]+)(?=\s*,|\s*$)/g)
          const values = lines[i].split(/,(?=(?:(?:[^"]*"){2})*[^"]*$)/).map(v => v.replace(/^"|"$/g, '').trim())

          const rowData: any = {}
          headers.forEach((header, index) => {
            rowData[header] = values[index] || ''
          })

          if (!rowData.registration || !rowData.type) {
            throw new Error(`Row ${i + 1} is missing registration or type.`)
          }

          payload.push({
            registration: rowData.registration,
            type: rowData.type,
            manufacturer: rowData.manufacturer || undefined,
            mtow_kg: rowData.mtow_kg ? Number(rowData.mtow_kg) : undefined,
            mlw_kg: rowData.mlw_kg ? Number(rowData.mlw_kg) : undefined,
            mzfw_kg: rowData.mzfw_kg ? Number(rowData.mzfw_kg) : undefined,
            bew_kg: rowData.bew_kg ? Number(rowData.bew_kg) : undefined,
            max_pax: rowData.max_pax ? Number(rowData.max_pax) : undefined,
            cruise_tas_kt: rowData.cruise_tas_kt ? Number(rowData.cruise_tas_kt) : undefined,
            fuel_burn_kg_hr: rowData.fuel_burn_kg_hr ? Number(rowData.fuel_burn_kg_hr) : undefined,
            flaps: rowData.flaps ? rowData.flaps.split(',').map((f: string) => f.trim()).filter(Boolean) : undefined,
            notes: rowData.notes || undefined,
          })
        }

        await onUpload(payload)
        setSuccess(true)
        setTimeout(() => onClose(), 2000)

      } catch (err: any) {
        setError(err.message || 'Failed to process CSV file')
      } finally {
        setLoading(false)
        if (fileInputRef.current) fileInputRef.current.value = ''
      }
    }
    
    reader.onerror = () => {
      setError('Failed to read file')
      setLoading(false)
    }

    reader.readAsText(file)
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
        <div className="flex items-center justify-between p-5 border-b border-borderc">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-emerald-100 text-emerald-700 flex items-center justify-center">
              <Upload size={18} />
            </div>
            <div>
              <h2 className="font-bold text-textprimary text-lg">Bulk Upload</h2>
              <p className="text-textsecondary text-xs">Import aircraft via CSV</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 text-textsecondary hover:bg-slate-100 rounded-full transition">
            <X size={20} />
          </button>
        </div>

        <div className="p-6">
          {error && (
            <div className="mb-6 flex items-start gap-2 text-sm text-danger bg-red-50 border border-red-200 rounded-lg px-4 py-3">
              <AlertCircle size={16} className="shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          {success ? (
            <div className="py-8 flex flex-col items-center justify-center text-center">
              <div className="w-16 h-16 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mb-4">
                <CheckCircle2 size={32} />
              </div>
              <h3 className="font-bold text-lg text-emerald-700">Upload Successful!</h3>
              <p className="text-slate-500 text-sm mt-1">The aircraft have been added to your fleet.</p>
            </div>
          ) : (
            <>
              <div className="mb-6 bg-slate-50 border border-slate-200 rounded-lg p-4">
                <h4 className="font-bold text-sm text-slate-800 mb-2">Instructions</h4>
                <ul className="text-xs text-slate-600 space-y-1.5 list-disc pl-4">
                  <li>Please download and use the provided CSV template.</li>
                  <li><strong>Registration</strong> and <strong>Type</strong> are required for every row.</li>
                  <li>Do not remove or rename the header row.</li>
                  <li>Invalid or duplicate registrations will be skipped.</li>
                </ul>
                <button 
                  onClick={downloadTemplate}
                  className="mt-4 flex items-center gap-2 text-xs font-bold text-primary hover:text-[#1850E0] transition"
                >
                  <FileText size={14} /> Download CSV Template
                </button>
              </div>

              <input 
                type="file" 
                accept=".csv" 
                ref={fileInputRef} 
                onChange={handleFileUpload} 
                className="hidden" 
              />
              
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={loading}
                className="w-full flex items-center justify-center gap-2 border-2 border-dashed border-borderc rounded-xl p-8 hover:border-primary hover:bg-slate-50 transition group disabled:opacity-50"
              >
                {loading ? (
                  <span className="font-bold text-slate-600">Processing...</span>
                ) : (
                  <>
                    <Upload size={24} className="text-slate-400 group-hover:text-primary transition" />
                    <div className="text-left">
                      <p className="font-bold text-textprimary group-hover:text-primary transition">Select CSV File</p>
                      <p className="text-xs text-slate-500">Max size 2MB</p>
                    </div>
                  </>
                )}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
