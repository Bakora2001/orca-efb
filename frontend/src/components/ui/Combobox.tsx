import { useState, useEffect, useRef } from 'react'
import { ChevronDown, Search, X } from 'lucide-react'

export interface ComboItem {
  id: string
  label: string
  sub?: string
}

export default function Combobox({
  items,
  value,
  onChange,
  placeholder = 'Select…',
  emptyOption
}: {
  items: ComboItem[]
  value: string
  onChange: (id: string) => void
  placeholder?: string
  emptyOption?: string
}) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const ref = useRef<HTMLDivElement>(null)

  // Close on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const selected = items.find(i => i.id === value)
  const q = query.toLowerCase()
  const filtered = items.filter(i => {
    if (query.length === 0) return true
    const labelMatch = i.label ? i.label.toLowerCase().includes(q) : false
    const subMatch = i.sub ? i.sub.toLowerCase().includes(q) : false
    return labelMatch || subMatch
  })

  const select = (id: string) => {
    onChange(id)
    setOpen(false)
    setQuery('')
  }

  return (
    <div ref={ref} className="relative w-full">
      {/* Trigger */}
      <button
        type="button"
        onClick={() => { setOpen(o => !o); setQuery('') }}
        className="w-full flex items-center justify-between gap-2 px-3 py-2 rounded-xl border border-borderc bg-white hover:border-primary focus:border-primary text-xs font-bold text-textprimary transition outline-none"
      >
        <span className="truncate font-mono">
          {selected ? selected.label : <span className="text-textsecondary font-normal">{placeholder}</span>}
        </span>
        <ChevronDown size={12} className={`text-textsecondary shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="absolute z-50 top-full mt-1 left-0 min-w-full w-max bg-white border border-borderc rounded-xl shadow-lg overflow-hidden">
          {/* Search input */}
          <div className="flex items-center gap-2 px-3 py-2 border-b border-slate-100">
            <Search size={12} className="text-slate-400 shrink-0" />
            <input
              autoFocus
              type="text"
              placeholder="Type to filter…"
              value={query}
              onChange={e => setQuery(e.target.value)}
              className="flex-1 text-xs outline-none bg-transparent text-textprimary placeholder:text-slate-400"
            />
            {query && (
              <button onClick={() => setQuery('')}>
                <X size={11} className="text-slate-400" />
              </button>
            )}
          </div>

          {/* Options */}
          <div className="max-h-52 overflow-y-auto">
            {emptyOption && (
              <button
                className={`w-full text-left px-3 py-2 text-xs hover:bg-slate-50 transition text-textsecondary italic ${!value ? 'bg-primary/5 text-primary font-bold not-italic' : ''}`}
                onClick={() => select('')}
              >
                {emptyOption}
              </button>
            )}
            {filtered.length === 0 ? (
              <div className="px-3 py-3 text-xs text-textsecondary text-center">No results</div>
            ) : (
              filtered.map(item => (
                <button
                  key={item.id}
                  className={`w-full text-left px-3 py-2 hover:bg-slate-50 transition flex items-center justify-between gap-2 ${item.id === value ? 'bg-primary/5' : ''}`}
                  onClick={() => select(item.id)}
                >
                  <span className="font-mono font-bold text-xs text-textprimary truncate">{item.label}</span>
                  {item.sub && <span className="text-[10px] text-textsecondary truncate max-w-[150px]">{item.sub}</span>}
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  )
}
