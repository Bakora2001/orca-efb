import type { ReactNode } from 'react'
import { TrendingUp, TrendingDown } from 'lucide-react'
import Card from './Card'

export default function StatCard({
  label,
  value,
  icon,
  trend,
  trendUp,
  accent = 'primary',
}: {
  label: string
  value: string
  icon: ReactNode
  trend?: string
  trendUp?: boolean
  accent?: 'primary' | 'success' | 'warning' | 'danger'
}) {
  const accentMap = {
    primary: 'bg-primary/10 text-primary',
    success: 'bg-success/10 text-success',
    warning: 'bg-warning/10 text-warning',
    danger: 'bg-danger/10 text-danger',
  }

  return (
    <Card className="hover:shadow-cardHover transition">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-textsecondary text-xs font-medium">{label}</p>
          <p className="text-2xl font-bold text-textprimary mt-1.5">{value}</p>
          {trend && (
            <div className={`flex items-center gap-1 mt-2 text-xs font-medium ${trendUp ? 'text-success' : 'text-danger'}`}>
              {trendUp ? <TrendingUp size={13} /> : <TrendingDown size={13} />}
              {trend}
            </div>
          )}
        </div>
        <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${accentMap[accent]}`}>
          {icon}
        </div>
      </div>
    </Card>
  )
}
