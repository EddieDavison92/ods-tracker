import type { ReactNode } from 'react'
import Link from 'next/link'
import { cn } from '@/lib/utils'

export function StatTile({
  label,
  value,
  sub,
  href,
  icon,
  className,
}: {
  label: string
  value: string
  sub?: ReactNode
  href?: string
  icon?: ReactNode
  className?: string
}) {
  const body = (
    <div
      className={cn(
        'flex h-full flex-col gap-1 rounded-xl border bg-card p-4 shadow-xs transition-colors',
        href && 'hover:border-primary/40 hover:bg-accent/40',
        className,
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-medium text-muted-foreground">{label}</p>
        {icon}
      </div>
      <p className="text-2xl font-semibold tracking-tight sm:text-3xl">{value}</p>
      {sub ? <p className="text-xs text-muted-foreground">{sub}</p> : null}
    </div>
  )
  return href ? (
    <Link href={href} className="block h-full focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring/40 rounded-xl">
      {body}
    </Link>
  ) : (
    body
  )
}
