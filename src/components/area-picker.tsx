'use client'

import { useEffect, useMemo, useState } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import * as Popover from '@radix-ui/react-popover'
import { Check, ChevronDown, ChevronRight, MapPin, Search } from 'lucide-react'
import { displayName } from '@/lib/names'
import { suggest } from '@/lib/suggest'
import { cn } from '@/lib/utils'
import { isLiveArea, scopeLabel } from '@/lib/scopes'
import type { ScopeOption, Scopes, Suggestion } from '../../worker/src/api/types'

// Pages that filter by ?scope. Elsewhere, picking an area opens Explore.
const SCOPED_PATHS = ['/', '/explore', '/changes', '/export']

const compact = (n: number | undefined) =>
  n == null ? '' : new Intl.NumberFormat('en-GB', { notation: 'compact', maximumFractionDigits: 1 }).format(n)

const TYPE_LABEL: Record<ScopeOption['type'], string> = { region: 'Region', icb: 'ICB', sicbl: 'Sub-ICB' }

export function AreaPicker({ scopes, tone = 'dark' }: { scopes: Scopes; tone?: 'dark' | 'light' }) {
  const router = useRouter()
  const pathname = usePathname()
  const params = useSearchParams()
  const current = params.get('scope')
  const scoped = SCOPED_PATHS.includes(pathname)
  const [open, setOpen] = useState(false)
  const [filter, setFilter] = useState('')
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [pcns, setPcns] = useState<Suggestion[]>([])
  const [pcnName, setPcnName] = useState<Record<string, string>>({})

  const known = [...scopes.regions, ...scopes.icbs, ...scopes.sicbls].some((s) => s.code === current)
  // PCN (or other) scopes are not in the area list; look the name up once.
  useEffect(() => {
    if (!current || known || pcnName[current]) return
    let cancelled = false
    suggest(current)
      .then((items) => {
        const hit = items.find((i) => i.code === current)
        if (!cancelled && hit) setPcnName((m) => ({ ...m, [current]: displayName(hit.name) }))
      })
      .catch(() => undefined)
    return () => {
      cancelled = true
    }
  }, [current, known, pcnName])

  const f = filter.trim().toLowerCase()
  // PCNs matching the filter by name (not part of the area tree).
  useEffect(() => {
    if (f.length < 3) return
    const t = setTimeout(() => {
      suggest(f, 'pcn')
        .then((items) => setPcns(items.filter((i) => i.status === 'Active').slice(0, 6)))
        .catch(() => setPcns([]))
    }, 200)
    return () => clearTimeout(t)
  }, [f])

  const select = (code: string | null) => {
    setOpen(false)
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

  const matches = useMemo(
    () =>
      f
        ? [...scopes.regions, ...scopes.icbs, ...scopes.sicbls]
            .filter((s) => s.name.toLowerCase().includes(f) || s.code.toLowerCase() === f)
            .sort((a, b) => Number(isLiveArea(b)) - Number(isLiveArea(a)))
            .slice(0, 30)
        : [],
    [f, scopes],
  )
  const pcnMatches = f.length >= 3 ? pcns : []
  const label = current && !known ? pcnName[current] ?? current : scopeLabel(scopes, current)

  const Row = ({ s, depth, expandable }: { s: ScopeOption; depth: number; expandable?: boolean }) => (
    <div className="flex items-center" style={{ paddingLeft: depth * 16 }}>
      {expandable ? (
        <button
          type="button"
          onClick={() => toggle(s.code)}
          aria-expanded={expanded.has(s.code)}
          aria-label={`${expanded.has(s.code) ? 'Collapse' : 'Expand'} ${displayName(s.name)}`}
          className="flex h-8 w-7 items-center justify-center rounded text-muted-foreground hover:text-foreground focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring/40"
        >
          {expanded.has(s.code) ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
        </button>
      ) : (
        <span className="w-7" />
      )}
      <button
        type="button"
        onClick={() => select(s.code)}
        className={cn(
          'flex min-h-8 min-w-0 flex-1 items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-accent focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring/40',
          current === s.code && 'bg-accent font-medium text-accent-foreground',
          !isLiveArea(s) && 'text-muted-foreground',
        )}
      >
        <span className="min-w-0 flex-1 truncate">
          {displayName(s.name)}
          {!isLiveArea(s) ? ' (former)' : ''}
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
          aria-label={`Area: ${label}. Change area`}
          className={cn(
            'inline-flex h-9 max-w-[16rem] items-center gap-2 rounded-lg px-3 text-sm transition focus-visible:outline-hidden focus-visible:ring-2',
            tone === 'dark'
              ? 'bg-white/10 text-white ring-1 ring-inset ring-white/15 hover:bg-white/15 focus-visible:ring-white/80'
              : 'border bg-card shadow-xs hover:bg-accent focus-visible:ring-ring/40',
          )}
        >
          <MapPin aria-hidden className="h-4 w-4 shrink-0 opacity-80" />
          <span className="truncate">{label}</span>
          <ChevronDown aria-hidden className="h-3.5 w-3.5 shrink-0 opacity-70" />
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          align="end"
          sideOffset={8}
          className="z-50 w-[min(26rem,calc(100vw-1.5rem))] rounded-xl border bg-popover p-2 shadow-2xl"
        >
          <label htmlFor="area-filter" className="mb-1 block px-1 text-xs font-medium text-muted-foreground">
            Find an area or PCN
          </label>
          <div className="mb-2 flex items-center gap-2 rounded-lg border px-2 focus-within:ring-2 focus-within:ring-ring/40">
            <Search aria-hidden className="h-4 w-4 text-muted-foreground" />
            <input
              id="area-filter"
              autoFocus
              value={filter}
              onChange={(e) => {
                setFilter(e.target.value)
                if (e.target.value.trim().length < 3) setPcns([])
              }}
              onKeyDown={(e) => {
                // Enter picks the first match.
                if (e.key === 'Enter') {
                  const first = matches[0]?.code ?? pcnMatches[0]?.code
                  if (first) {
                    e.preventDefault()
                    select(first)
                  }
                }
              }}
              placeholder="e.g. Kent, 93C or Islington PCN"
              className="h-9 flex-1 bg-transparent text-sm outline-hidden placeholder:text-muted-foreground"
            />
          </div>
          <div className="max-h-[60vh] overflow-y-auto">
            {f ? (
              <>
                {matches.map((s) => (
                  <div key={s.code} className="flex items-center gap-1">
                    <Row s={s} depth={0} />
                    <span className="w-16 shrink-0 text-right text-[11px] uppercase text-muted-foreground">{TYPE_LABEL[s.type]}</span>
                  </div>
                ))}
                {pcnMatches.map((p) => (
                  <div key={p.code} className="flex items-center gap-1">
                    <span className="w-7" />
                    <button
                      type="button"
                      onClick={() => select(p.code)}
                      className="flex min-h-8 min-w-0 flex-1 items-center rounded-md px-2 py-1.5 text-left text-sm hover:bg-accent focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring/40"
                    >
                      <span className="truncate">{displayName(p.name)}</span>
                    </button>
                    <span className="w-16 shrink-0 text-right text-[11px] uppercase text-muted-foreground">PCN</span>
                  </div>
                ))}
                {!matches.length && !pcnMatches.length ? (
                  <p className="px-2 py-4 text-center text-sm text-muted-foreground">
                    No areas match. Areas are NHS regions, ICBs, Sub-ICB locations and PCNs; to find places, search a name or postcode instead.
                  </p>
                ) : null}
              </>
            ) : (
              <>
                <div className="flex items-center">
                  <span className="w-7" />
                  <button
                    type="button"
                    onClick={() => select(null)}
                    className={cn('flex min-h-8 flex-1 items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-accent focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring/40', !current && 'bg-accent font-medium')}
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
          <p className="mt-2 border-t px-2 pt-2 text-[11px] text-muted-foreground">
            {scoped ? 'Counts are active organisations of all types.' : 'Choosing an area opens Explore filtered to it.'}
          </p>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  )
}
