import type { ReactNode } from 'react'
import Link from 'next/link'
import { cn } from '@/lib/utils'
import { pageHref, type Query } from '@/lib/href'

export const fieldClass = cn(
  'h-8 rounded-md border border-input bg-background px-2 text-sm shadow-sm',
  'focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring',
)

export function Field({
  label,
  htmlFor,
  children,
}: {
  label: string
  htmlFor: string
  children: ReactNode
}) {
  return (
    <div className="flex min-w-[8rem] flex-col gap-1">
      <label htmlFor={htmlFor} className="text-xs font-medium text-muted-foreground">
        {label}
      </label>
      {children}
    </div>
  )
}

export function PageHeading({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
      <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
      {children}
    </div>
  )
}

export function EmptyState({ children }: { children: ReactNode }) {
  return <p className="rounded-md border border-dashed px-3 py-8 text-center text-sm text-muted-foreground">{children}</p>
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
  if (total === 0) return null
  const from = offset + 1
  const to = Math.min(offset + limit, total)
  const prev = offset > 0 ? Math.max(0, offset - limit) : null
  const next = offset + limit < total ? offset + limit : null
  return (
    <nav className="mt-3 flex flex-wrap items-center justify-between gap-2 text-sm" aria-label="Pagination">
      <p className="text-muted-foreground">
        {from}–{to} of {total.toLocaleString('en-GB')}
      </p>
      <div className="flex gap-2">
        {prev !== null ? (
          <Link className="rounded-md border px-2 py-1 hover:bg-accent" href={pageHref(pathname, query, { offset: prev || null })}>
            Previous
          </Link>
        ) : (
          <span className="rounded-md border px-2 py-1 text-muted-foreground">Previous</span>
        )}
        {next !== null ? (
          <Link className="rounded-md border px-2 py-1 hover:bg-accent" href={pageHref(pathname, query, { offset: next })}>
            Next
          </Link>
        ) : (
          <span className="rounded-md border px-2 py-1 text-muted-foreground">Next</span>
        )}
      </div>
    </nav>
  )
}
