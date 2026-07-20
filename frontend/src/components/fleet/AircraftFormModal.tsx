import { useState, useEffect } from 'react'
import { Plane, X, AlertCircle } from 'lucide-react'
import type { ApiAircraft } from '../../lib/api'

interface AircraftFormModalProps {
  aircraft?: ApiAircraft | null
  onClose: () => void
  onSave: (data: Partial<ApiAircraft>) => Promise<void>
}

export default function AircraftFormModal({ aircraft, onClose, onSave }: AircraftFormModalProps) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  
  const [formData, setFormData] = useState({
    registration: '',
    type: '',
    manufacturer: '',
    mtow_kg: '',
    mlw_kg: '',
    mzfw_kg: '',
    bew_kg: '',
    max_pax: '',
    cruise_tas_kt: '',
    fuel_burn_kg_hr: '',
    flaps: '',
    notes: '',
  })

  useEffect(() => {
    if (aircraft) {
      setFormData({
        registration: aircraft.registration || '',
        type: aircraft.type || '',
        manufacturer: aircraft.manufacturer || '',
        mtow_kg: aircraft.mtow_kg ? String(aircraft.mtow_kg) : '',
        mlw_kg: aircraft.mlw_kg ? String(aircraft.mlw_kg) : '',
        mzfw_kg: aircraft.mzfw_kg ? String(aircraft.mzfw_kg) : '',
        bew_kg: aircraft.bew_kg ? String(aircraft.bew_kg) : '',
        max_pax: aircraft.max_pax ? String(aircraft.max_pax) : '',
        cruise_tas_kt: aircraft.cruise_tas_kt ? String(aircraft.cruise_tas_kt) : '',
        fuel_burn_kg_hr: aircraft.fuel_burn_kg_hr ? String(aircraft.fuel_burn_kg_hr) : '',
        flaps: aircraft.flaps ? aircraft.flaps.join(', ') : '',
        notes: aircraft.notes || '',
      })
    }
  }, [aircraft])

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    setFormData(prev => ({ ...prev, [e.target.name]: e.target.value }))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(null)
    try {
      const payload: Partial<ApiAircraft> = {
        registration: formData.registration,
        type: formData.type,
        manufacturer: formData.manufacturer || undefined,
        mtow_kg: formData.mtow_kg ? Number(formData.mtow_kg) : undefined,
        mlw_kg: formData.mlw_kg ? Number(formData.mlw_kg) : undefined,
        mzfw_kg: formData.mzfw_kg ? Number(formData.mzfw_kg) : undefined,
        bew_kg: formData.bew_kg ? Number(formData.bew_kg) : undefined,
        max_pax: formData.max_pax ? Number(formData.max_pax) : undefined,
        cruise_tas_kt: formData.cruise_tas_kt ? Number(formData.cruise_tas_kt) : undefined,
        fuel_burn_kg_hr: formData.fuel_burn_kg_hr ? Number(formData.fuel_burn_kg_hr) : undefined,
        flaps: formData.flaps ? formData.flaps.split(',').map(f => f.trim()).filter(Boolean) : undefined,
        notes: formData.notes || undefined,
      }
      await onSave(payload)
      onClose()
    } catch (err: any) {
      setError(err.message || 'Failed to save aircraft')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 backdrop-blur-sm p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl my-auto">
        <div className="flex items-center justify-between p-6 border-b border-borderc">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-primary text-white flex items-center justify-center">
              <Plane size={18} />
            </div>
            <div>
              <h2 className="font-bold text-textprimary text-xl">{aircraft ? 'Edit Aircraft' : 'Add New Aircraft'}</h2>
              <p className="text-textsecondary text-xs">Enter aircraft specifications and configuration.</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 text-textsecondary hover:bg-slate-100 rounded-full transition">
            <X size={20} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6">
          {error && (
            <div className="mb-6 flex items-center gap-2 text-sm text-danger bg-red-50 border border-red-200 rounded-lg px-4 py-3">
              <AlertCircle size={16} />
              <span>{error}</span>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-4">
              <h3 className="font-bold text-slate-800 border-b border-borderc pb-2">General</h3>
              <div>
                <label className="block text-xs font-bold text-textsecondary mb-1">Registration *</label>
                <input required name="registration" value={formData.registration} onChange={handleChange} className="w-full bg-slate-50 border border-borderc rounded-lg px-3 py-2 text-sm outline-none focus:border-primary transition" placeholder="e.g. 5Y-DWN" />
              </div>
              <div>
                <label className="block text-xs font-bold text-textsecondary mb-1">Type *</label>
                <input required name="type" value={formData.type} onChange={handleChange} className="w-full bg-slate-50 border border-borderc rounded-lg px-3 py-2 text-sm outline-none focus:border-primary transition" placeholder="e.g. DASH 8-300" />
              </div>
              <div>
                <label className="block text-xs font-bold text-textsecondary mb-1">Manufacturer</label>
                <input name="manufacturer" value={formData.manufacturer} onChange={handleChange} className="w-full bg-slate-50 border border-borderc rounded-lg px-3 py-2 text-sm outline-none focus:border-primary transition" placeholder="e.g. De Havilland" />
              </div>
              <h3 className="font-bold text-slate-800 border-b border-borderc pb-2 pt-2">Performance</h3>
              <div>
                <label className="block text-xs font-bold text-textsecondary mb-1">Cruise TAS (kt)</label>
                <input type="number" step="1" name="cruise_tas_kt" value={formData.cruise_tas_kt} onChange={handleChange} className="w-full bg-slate-50 border border-borderc rounded-lg px-3 py-2 text-sm outline-none focus:border-primary transition" placeholder="270" />
              </div>
              <div>
                <label className="block text-xs font-bold text-textsecondary mb-1">Fuel Burn (kg/hr)</label>
                <input type="number" step="1" name="fuel_burn_kg_hr" value={formData.fuel_burn_kg_hr} onChange={handleChange} className="w-full bg-slate-50 border border-borderc rounded-lg px-3 py-2 text-sm outline-none focus:border-primary transition" placeholder="600" />
              </div>
              <div>
                <label className="block text-xs font-bold text-textsecondary mb-1">Available Flaps (comma separated)</label>
                <input name="flaps" value={formData.flaps} onChange={handleChange} className="w-full bg-slate-50 border border-borderc rounded-lg px-3 py-2 text-sm outline-none focus:border-primary transition" placeholder="5, 10, 15, 35" />
              </div>
            </div>

            <div className="space-y-4">
              <h3 className="font-bold text-slate-800 border-b border-borderc pb-2">Weights (kg)</h3>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-textsecondary mb-1">MTOW</label>
                  <input type="number" name="mtow_kg" value={formData.mtow_kg} onChange={handleChange} className="w-full bg-slate-50 border border-borderc rounded-lg px-3 py-2 text-sm outline-none focus:border-primary transition" placeholder="19504" />
                </div>
                <div>
                  <label className="block text-xs font-bold text-textsecondary mb-1">MLW</label>
                  <input type="number" name="mlw_kg" value={formData.mlw_kg} onChange={handleChange} className="w-full bg-slate-50 border border-borderc rounded-lg px-3 py-2 text-sm outline-none focus:border-primary transition" placeholder="19050" />
                </div>
                <div>
                  <label className="block text-xs font-bold text-textsecondary mb-1">MZFW</label>
                  <input type="number" name="mzfw_kg" value={formData.mzfw_kg} onChange={handleChange} className="w-full bg-slate-50 border border-borderc rounded-lg px-3 py-2 text-sm outline-none focus:border-primary transition" placeholder="17916" />
                </div>
                <div>
                  <label className="block text-xs font-bold text-textsecondary mb-1">BEW</label>
                  <input type="number" name="bew_kg" value={formData.bew_kg} onChange={handleChange} className="w-full bg-slate-50 border border-borderc rounded-lg px-3 py-2 text-sm outline-none focus:border-primary transition" placeholder="11500" />
                </div>
              </div>
              
              <h3 className="font-bold text-slate-800 border-b border-borderc pb-2 pt-2">Capacity & Notes</h3>
              <div>
                <label className="block text-xs font-bold text-textsecondary mb-1">Max Passengers</label>
                <input type="number" name="max_pax" value={formData.max_pax} onChange={handleChange} className="w-full bg-slate-50 border border-borderc rounded-lg px-3 py-2 text-sm outline-none focus:border-primary transition" placeholder="50" />
              </div>
              <div>
                <label className="block text-xs font-bold text-textsecondary mb-1">Notes</label>
                <textarea name="notes" value={formData.notes} onChange={handleChange} rows={3} className="w-full bg-slate-50 border border-borderc rounded-lg px-3 py-2 text-sm outline-none focus:border-primary transition resize-none" placeholder="Any operational notes..." />
              </div>
            </div>
          </div>

          <div className="mt-8 flex items-center justify-end gap-3 pt-6 border-t border-borderc">
            <button type="button" onClick={onClose} className="px-5 py-2.5 text-sm font-bold text-slate-600 hover:bg-slate-100 rounded-lg transition">Cancel</button>
            <button type="submit" disabled={loading} className="px-6 py-2.5 bg-primary text-white text-sm font-bold rounded-lg hover:bg-[#1850E0] transition disabled:opacity-50">
              {loading ? 'Saving...' : 'Save Aircraft'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
