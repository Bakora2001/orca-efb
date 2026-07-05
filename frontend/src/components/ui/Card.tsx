import type { ReactNode } from 'react'
import clsx from 'clsx'

export default function Card({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={clsx('bg-surface border border-borderc rounded-xl shadow-card p-5', className)}>
      {children}
    </div>
  )
}
