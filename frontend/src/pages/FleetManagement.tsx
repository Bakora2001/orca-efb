import { useState, useEffect, useCallback } from 'react'
import { Plane, Plus, RefreshCw, AlertCircle, Loader2, ChevronRight, Settings2, Trash2, Edit, Upload } from 'lucide-react'
import Card from '../components/ui/Card'
import { aircraft as aircraftApi, type ApiAircraft } from '../lib/api'
import AircraftFormModal from '../components/fleet/AircraftFormModal'
import BulkUploadModal from '../components/fleet/BulkUploadModal'

const statusColors: Record<string, string> = {
  active:      'bg-emerald-50 text-emerald-700 border-emerald-200',
  maintenance: 'bg-amber-50  text-amber-700  border-amber-200',
  grounded:    'bg-red-50    text-red-700    border-red-200',
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between items-center text-xs py-1 border-b border-slate-50 last:border-0">
      <span className="text-slate-500 font-medium">{label}</span>
      <span className="font-bold text-textprimary font-mono">{value}</span>
    </div>
  )
}

function AircraftSkeleton() {
  return (
    <div className="bg-white rounded-xl border border-borderc p-5 animate-pulse">
      <div className="flex items-center justify-between mb-4">
        <div className="w-10 h-10 rounded-lg bg-slate-100" />
        <div className="w-16 h-5 rounded-full bg-slate-100" />
      </div>
      <div className="h-5 bg-slate-100 rounded w-24 mb-1" />
      <div className="h-3 bg-slate-100 rounded w-32 mb-4" />
      <div className="space-y-2">
        {[1, 2, 3].map((i) => (
          <div key={i} className="flex justify-between">
            <div className="h-3 bg-slate-100 rounded w-20" />
            <div className="h-3 bg-slate-100 rounded w-16" />
          </div>
        ))}
      </div>
    </div>
  )
}

function deriveStatus(ac: ApiAircraft): 'active' | 'maintenance' | 'grounded' {
  if (!ac.is_active) return 'grounded'
  return 'active'
}

export default function FleetManagement() {
  const [fleet, setFleet] = useState<ApiAircraft[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selected, setSelected] = useState<ApiAircraft | null>(null)
  
  const [showForm, setShowForm] = useState(false)
  const [showBulkUpload, setShowBulkUpload] = useState(false)
  const [editingAircraft, setEditingAircraft] = useState<ApiAircraft | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await aircraftApi.list(true)
      setFleet(data)
    } catch (err: any) {
      setError(err.message || 'Failed to load fleet')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const active = fleet.filter((a) => a.is_active).length
  const total = fleet.length

  const handleSaveAircraft = async (data: Partial<ApiAircraft>) => {
    if (editingAircraft?.id) {
      await aircraftApi.update(editingAircraft.id, data)
    } else {
      await aircraftApi.create(data)
    }
    await load()
  }

  const handleDelete = async (id: string) => {
    if (!window.confirm('Are you sure you want to permanently delete this aircraft?')) return
    try {
      await aircraftApi.delete(id)
      setSelected(null)
      await load()
    } catch (err: any) {
      alert(err.message || 'Failed to delete aircraft')
    }
  }

  const handleBulkUpload = async (data: Partial<ApiAircraft>[]) => {
    await aircraftApi.bulkImport(data)
    await load()
  }

  return (
    <div className="space-y-6">

      {/* ── Header ── */}
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-textprimary tracking-tight">Fleet Management</h1>
          <p className="text-textsecondary text-sm mt-0.5">
            Aircraft registry, configuration & operational status
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={load}
            className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-textsecondary border border-borderc rounded-lg hover:border-primary hover:text-primary transition"
          >
            <RefreshCw size={13} />
            Refresh
          </button>
          <button 
            onClick={() => setShowBulkUpload(true)}
            className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-textprimary border border-borderc rounded-lg hover:border-primary hover:text-primary transition"
          >
            <Upload size={14} /> Bulk Upload
          </button>
          <button 
            onClick={() => { setEditingAircraft(null); setShowForm(true) }}
            className="bg-primary hover:bg-[#1850E0] text-white font-semibold rounded-lg px-4 py-2 flex items-center gap-1.5 transition text-sm"
          >
            <Plus size={15} /> Add Aircraft
          </button>
        </div>
      </div>

      {/* ── Summary Pills ── */}
      <div className="flex flex-wrap gap-3">
        {[
          { label: 'Total Aircraft', value: total, color: 'bg-blue-50 text-blue-700 border-blue-200' },
          { label: 'Active', value: active, color: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
          { label: 'Inactive / Grounded', value: total - active, color: 'bg-red-50 text-red-700 border-red-200' },
        ].map((p) => (
          <div key={p.label} className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full border text-xs font-semibold ${p.color}`}>
            <span className="text-base font-black">{loading ? '—' : p.value}</span>
            {p.label}
          </div>
        ))}
      </div>

      {/* ── Error ── */}
      {error && (
        <div className="flex items-center gap-2 text-sm text-danger bg-red-50 border border-red-200 rounded-lg px-4 py-3">
          <AlertCircle size={16} />
          <span>{error}</span>
          <button onClick={load} className="ml-auto text-xs font-bold underline">Retry</button>
        </div>
      )}

      {/* ── Grid ── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {loading
          ? Array.from({ length: 4 }).map((_, i) => <AircraftSkeleton key={i} />)
          : fleet.map((ac) => {
              const status = deriveStatus(ac)
              return (
                <div
                  key={ac.id}
                  onClick={() => setSelected(ac)}
                  className="bg-white rounded-xl border border-borderc hover:border-primary hover:shadow-md transition cursor-pointer group p-5"
                >
                  {/* Header row */}
                  <div className="flex items-center justify-between mb-3">
                    <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center text-primary group-hover:bg-primary group-hover:text-white transition">
                      <Plane size={18} />
                    </div>
                    <span className={`text-[10px] font-bold px-2.5 py-1 rounded-full border capitalize ${statusColors[status]}`}>
                      {status}
                    </span>
                  </div>

                  <p className="font-black text-textprimary text-lg leading-tight">{ac.registration}</p>
                  <p className="text-textsecondary text-xs mb-4 mt-0.5">
                    {ac.type}{ac.manufacturer ? ` · ${ac.manufacturer}` : ''}
                  </p>

                  <div className="space-y-0.5">
                    <Row label="MTOW" value={ac.mtow_kg ? `${ac.mtow_kg.toLocaleString()} kg` : '—'} />
                    <Row label="MZFW" value={ac.mzfw_kg ? `${ac.mzfw_kg.toLocaleString()} kg` : '—'} />
                    <Row label="BEW"  value={ac.bew_kg  ? `${ac.bew_kg.toLocaleString()}  kg` : '—'} />
                    <Row label="Max Pax" value={ac.max_pax ? String(ac.max_pax) : '—'} />
                  </div>

                  <div className="mt-3 pt-3 border-t border-slate-50 flex items-center justify-between">
                    <span className="text-[10px] text-textsecondary font-mono">
                      Flaps: {ac.flaps?.join(', ') || '—'}
                    </span>
                    <ChevronRight size={14} className="text-textsecondary group-hover:text-primary transition" />
                  </div>
                </div>
              )
            })}
      </div>

      {/* ── Detail Modal ── */}
      {selected && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4"
          onClick={() => setSelected(null)}
        >
          <div
            className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-5">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-primary text-white flex items-center justify-center">
                  <Plane size={18} />
                </div>
                <div>
                  <p className="font-black text-textprimary text-xl">{selected.registration}</p>
                  <p className="text-textsecondary text-xs">{selected.type}</p>
                </div>
              </div>
              <button onClick={() => setSelected(null)} className="text-textsecondary hover:text-textprimary transition p-1">✕</button>
            </div>

            <div className="space-y-1 text-sm">
              {[
                ['Registration', selected.registration],
                ['Type', selected.type],
                ['Manufacturer', selected.manufacturer || '—'],
                ['MTOW', selected.mtow_kg ? `${selected.mtow_kg.toLocaleString()} kg` : '—'],
                ['MLW',  selected.mlw_kg  ? `${selected.mlw_kg.toLocaleString()}  kg` : '—'],
                ['MZFW', selected.mzfw_kg ? `${selected.mzfw_kg.toLocaleString()} kg` : '—'],
                ['BEW',  selected.bew_kg  ? `${selected.bew_kg.toLocaleString()}  kg` : '—'],
                ['Max Pax', selected.max_pax ? String(selected.max_pax) : '—'],
                ['Cruise TAS', selected.cruise_tas_kt ? `${selected.cruise_tas_kt} kt` : '—'],
                ['Fuel Burn', selected.fuel_burn_kg_hr ? `${selected.fuel_burn_kg_hr} kg/hr` : '—'],
                ['Available Flaps', selected.flaps?.join(', ') || '—'],
                ['Status', selected.is_active ? 'Active' : 'Inactive'],
              ].map(([label, value]) => (
                <div key={label} className="flex justify-between py-1.5 border-b border-slate-50 last:border-0">
                  <span className="text-textsecondary text-xs font-medium">{label}</span>
                  <span className="font-semibold text-textprimary text-xs font-mono">{value}</span>
                </div>
              ))}
            </div>

            {selected.notes && (
              <div className="mt-4 p-3 bg-blue-50 border border-blue-100 rounded-lg text-xs text-blue-700">
                <span className="font-bold">Notes: </span>{selected.notes}
              </div>
            )}

            <div className="flex items-center gap-3 mt-6 pt-4 border-t border-borderc">
              <button
                onClick={() => handleDelete(selected.id)}
                className="flex items-center justify-center gap-1.5 px-4 py-2.5 text-danger bg-red-50 hover:bg-red-100 rounded-xl text-sm font-bold transition flex-1"
              >
                <Trash2 size={16} /> Delete
              </button>
              <button
                onClick={() => {
                  setEditingAircraft(selected)
                  setSelected(null)
                  setShowForm(true)
                }}
                className="flex items-center justify-center gap-1.5 px-4 py-2.5 text-textprimary bg-slate-100 hover:bg-slate-200 rounded-xl text-sm font-bold transition flex-1"
              >
                <Edit size={16} /> Edit
              </button>
            </div>
            
            <button
              onClick={() => setSelected(null)}
              className="w-full mt-3 bg-primary text-white font-bold py-2.5 rounded-xl text-sm hover:bg-[#1850E0] transition"
            >
              Close
            </button>
          </div>
        </div>
      )}

      {showForm && (
        <AircraftFormModal
          aircraft={editingAircraft}
          onClose={() => {
            setShowForm(false)
            setEditingAircraft(null)
          }}
          onSave={handleSaveAircraft}
        />
      )}

      {showBulkUpload && (
        <BulkUploadModal
          onClose={() => setShowBulkUpload(false)}
          onUpload={handleBulkUpload}
        />
      )}
    </div>
  )
}
