import type { ReactNode } from 'react'
import Link from 'next/link'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'
import { pageHref, type Query } from '@/lib/href'

export const fieldClass = cn(
  'h-9 rounded-lg border border-input bg-card px-3 text-sm shadow-sm',
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40 focus-visible:border-ring',
)

export function Field({ label, htmlFor, children }: { label: string; htmlFor: string; children: ReactNode }) {
  return (
    <div className="flex min-w-[8rem] flex-col gap-1.5">
      <label htmlFor={htmlFor} className="text-xs font-medium text-muted-foreground">
        {label}
      </label>
      {children}
    </div>
  )
}

export function PageHeading({
  title,
  description,
  children,
  eyebrow,
}: {
  title: ReactNode
  description?: ReactNode
  eyebrow?: ReactNode
  children?: ReactNode
}) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0 space-y-1">
        {eyebrow ? <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground">{eyebrow}</div> : null}
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">{title}</h1>
        {description ? <p className="max-w-2xl text-sm text-muted-foreground">{description}</p> : null}
      </div>
      {children ? <div className="flex flex-wrap items-center gap-2">{children}</div> : null}
    </div>
  )
}

export function Panel({
  title,
  action,
  children,
  className,
  bodyClassName,
}: {
  title?: ReactNode
  action?: ReactNode
  children: ReactNode
  className?: string
  bodyClassName?: string
}) {
  return (
    <section className={cn('rounded-xl border bg-card shadow-sm', className)}>
      {title ? (
        <header className="flex items-center justify-between gap-3 border-b px-4 py-3">
          <h2 className="text-sm font-semibold">{title}</h2>
          {action}
        </header>
      ) : null}
      <div className={cn('p-4', bodyClassName)}>{children}</div>
    </section>
  )
}

export function EmptyState({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <p className={cn('rounded-xl border border-dashed bg-card/50 px-4 py-10 text-center text-sm text-muted-foreground', className)}>
      {children}
    </p>
  )
}

export function Pagination({
  pathname,
  query,
  total,
  offset,
  limit,
}: {
  pathname: string
  query: Query
  total: number
  offset: number
  limit: number
}) {
  if (total <= limit && offset === 0) return null
  const from = offset + 1
  const to = Math.min(offset + limit, total)
  const prev = offset > 0 ? Math.max(0, offset - limit) : null
  const next = offset + limit < total ? offset + limit : null
  const btn = 'inline-flex h-8 items-center gap-1 rounded-lg border bg-card px-2.5 text-sm shadow-sm'
  return (
    <nav className="mt-4 flex flex-wrap items-center justify-between gap-2 text-sm" aria-label="Pagination">
      <p className="tabular text-muted-foreground">
        {from.toLocaleString('en-GB')}–{to.toLocaleString('en-GB')} of {total.toLocaleString('en-GB')}
      </p>
      {/* Unavailable directions are left out rather than greyed out. */}
      <div className="flex gap-2">
        {prev !== null ? (
          <Link className={cn(btn, 'hover:bg-accent')} href={pageHref(pathname, query, { offset: prev || null })}>
            <ChevronLeft aria-hidden className="h-4 w-4" /> Previous
          </Link>
        ) : null}
        {next !== null ? (
          <Link className={cn(btn, 'hover:bg-accent')} href={pageHref(pathname, query, { offset: next })}>
            Next <ChevronRight aria-hidden className="h-4 w-4" />
          </Link>
        ) : null}
      </div>
    </nav>
  )
}

// Segmented control built from links (server-rendered filters).
export function Segmented({
  options,
  value,
  hrefFor,
  label,
}: {
  options: { value: string; label: string }[]
  value: string
  hrefFor: (value: string) => string
  label: string
}) {
  return (
    // Scrolls sideways rather than widening the page on narrow screens.
    <div
      role="group"
      aria-label={label}
      className="inline-flex max-w-full overflow-x-auto rounded-lg border bg-card p-0.5 shadow-sm [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
    >
      {options.map((o) => (
        <Link
          key={o.value}
          href={hrefFor(o.value)}
          aria-current={o.value === value ? 'true' : undefined}
          className={cn(
            'shrink-0 whitespace-nowrap rounded-md px-2.5 py-1 text-sm transition-colors',
            o.value === value ? 'bg-primary text-primary-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground',
          )}
        >
          {o.label}
        </Link>
      ))}
    </div>
  )
}
