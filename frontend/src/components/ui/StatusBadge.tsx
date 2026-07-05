import type { DispatchStatus } from '../../types'

const config: Record<DispatchStatus, { label: string; classes: string }> = {
  approved: { label: 'Approved', classes: 'bg-success/10 text-success' },
  marginal: { label: 'Marginal', classes: 'bg-warning/10 text-warning' },
  'not-dispatchable': { label: 'Not Dispatchable', classes: 'bg-danger/10 text-danger' },
}

export default function StatusBadge({ status }: { status: DispatchStatus }) {
  const c = config[status]
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold ${c.classes}`}>
      <span className="w-1.5 h-1.5 rounded-full bg-current" />
      {c.label}
    </span>
  )
}
