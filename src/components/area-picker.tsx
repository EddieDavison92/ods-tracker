'use client'

import { useMemo, useState } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import * as Popover from '@radix-ui/react-popover'
import { Check, ChevronDown, ChevronRight, MapPin, Search } from 'lucide-react'
import { displayName } from '@/lib/names'
import { cn } from '@/lib/utils'
import { isLiveArea, scopeLabel } from '@/lib/scopes'
import type { ScopeOption, Scopes } from '../../worker/src/api/types'

// Pages that filter by ?scope. Elsewhere, picking an area opens Explore.
const SCOPED_PATHS = ['/', '/explore', '/changes', '/export']

const compact = (n: number | undefined) =>
  n == null ? '' : new Intl.NumberFormat('en-GB', { notation: 'compact', maximumFractionDigits: 1 }).format(n)

export function AreaPicker({ scopes, tone = 'dark' }: { scopes: Scopes; tone?: 'dark' | 'light' }) {
  const router = useRouter()
  const pathname = usePathname()
  const params = useSearchParams()
  const current = params.get('scope')
  const [open, setOpen] = useState(false)
  const [filter, setFilter] = useState('')
  const [expanded, setExpanded] = useState<Set<string>>(new Set())

  const select = (code: string | null) => {
    setOpen(false)
    const scoped = SCOPED_PATHS.includes(pathname)
    const next = new URLSearchParams(scoped ? params.toString() : '')
    next.delete('offset')
    next.delete('before')
    if (code) next.set('scope', code)
    else next.delete('scope')
    const qs = next.toString()
    router.push(`${scoped ? pathname : '/explore'}${qs ? `?${qs}` : ''}`)
  }

  const toggle = (code: string) =>
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(code)) next.delete(code)
      else next.add(code)
      return next
    })

  const f = filter.trim().toLowerCase()
  const matches = useMemo(
    () =>
      f
        ? [...scopes.regions, ...scopes.icbs, ...scopes.sicbls]
            .filter((s) => s.name.toLowerCase().includes(f) || s.code.toLowerCase() === f)
            .slice(0, 40)
        : [],
    [f, scopes],
  )

  const Row = ({ s, depth, expandable }: { s: ScopeOption; depth: number; expandable?: boolean }) => (
    <div className="flex items-center" style={{ paddingLeft: depth * 16 }}>
      {expandable ? (
        <button
          type="button"
          onClick={() => toggle(s.code)}
          aria-label={expanded.has(s.code) ? 'Collapse' : 'Expand'}
          className="flex h-7 w-6 items-center justify-center text-muted-foreground hover:text-foreground"
        >
          {expanded.has(s.code) ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
        </button>
      ) : (
        <span className="w-6" />
      )}
      <button
        type="button"
        onClick={() => select(s.code)}
        className={cn(
          'flex min-w-0 flex-1 items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-accent',
          current === s.code && 'bg-accent font-medium text-accent-foreground',
          !s.active && 'text-muted-foreground',
        )}
      >
        <span className="min-w-0 flex-1 truncate">
          {displayName(s.name)}
          {!s.active ? ' (closed)' : ''}
        </span>
        {s.counts ? <span className="tabular text-xs text-muted-foreground">{compact(s.counts.active)}</span> : null}
        {current === s.code ? <Check className="h-3.5 w-3.5 text-primary" /> : null}
      </button>
    </div>
  )

  const regions = scopes.regions.filter(isLiveArea)
  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger asChild>
        <button
          type="button"
          className={cn(
            'inline-flex h-9 max-w-[16rem] items-center gap-2 rounded-lg px-3 text-sm transition',
            tone === 'dark'
              ? 'bg-white/10 text-white ring-1 ring-inset ring-white/15 hover:bg-white/15'
              : 'border bg-card shadow-sm hover:bg-accent',
          )}
        >
          <MapPin aria-hidden className="h-4 w-4 shrink-0 opacity-80" />
          <span className="truncate">{scopeLabel(scopes, current)}</span>
          <ChevronDown aria-hidden className="h-3.5 w-3.5 shrink-0 opacity-70" />
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          align="end"
          sideOffset={8}
          className="z-50 w-[min(26rem,calc(100vw-1.5rem))] rounded-xl border bg-popover p-2 shadow-2xl"
        >
          <div className="mb-2 flex items-center gap-2 rounded-lg border px-2">
            <Search aria-hidden className="h-4 w-4 text-muted-foreground" />
            <input
              autoFocus
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder="Find a region, ICB or Sub-ICB"
              className="h-9 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
            />
          </div>
          <div className="max-h-[60vh] overflow-y-auto">
            {f ? (
              matches.length ? (
                matches.map((s) => (
                  <div key={s.code} className="flex items-center gap-1">
                    <Row s={s} depth={0} />
                    <span className="w-16 shrink-0 text-right text-[11px] uppercase text-muted-foreground">
                      {s.type === 'sicbl' ? 'Sub-ICB' : s.type === 'icb' ? 'ICB' : 'Region'}
                    </span>
                  </div>
                ))
              ) : (
                <p className="px-2 py-4 text-center text-sm text-muted-foreground">No areas match.</p>
              )
            ) : (
              <>
                <div className="flex items-center">
                  <span className="w-6" />
                  <button
                    type="button"
                    onClick={() => select(null)}
                    className={cn('flex flex-1 items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-accent', !current && 'bg-accent font-medium')}
                  >
                    <span className="flex-1">All England</span>
                    {!current ? <Check className="h-3.5 w-3.5 text-primary" /> : null}
                  </button>
                </div>
                {regions.map((r) => (
                  <div key={r.code}>
                    <Row s={r} depth={0} expandable />
                    {expanded.has(r.code)
                      ? scopes.icbs
                          .filter((i) => i.parent === r.code && isLiveArea(i))
                          .map((i) => (
                            <div key={i.code}>
                              <Row s={i} depth={1} expandable={scopes.sicbls.some((s) => s.parent === i.code)} />
                              {expanded.has(i.code)
                                ? scopes.sicbls.filter((s) => s.parent === i.code).map((s) => <Row key={s.code} s={s} depth={2} />)
                                : null}
                            </div>
                          ))
                      : null}
                  </div>
                ))}
              </>
            )}
          </div>
          <p className="mt-2 border-t px-2 pt-2 text-[11px] text-muted-foreground">Counts are active organisations of all types.</p>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  )
}
