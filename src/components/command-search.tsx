'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Command } from 'cmdk'
import { ArrowRight, Loader2, Search } from 'lucide-react'
import { GroupIcon } from '@/components/group-badge'
import { groupDef } from '@/lib/groups'
import { suggest } from '@/lib/suggest'
import { displayName } from '@/lib/names'
import { cn } from '@/lib/utils'
import type { Suggestion } from '../../worker/src/api/types'

const EXAMPLES = ['F83004', 'University College', 'N19 3NU', 'Z9B2Z', 'Boots']

// Universal search: instant suggestions across every ODS organisation type.
export function CommandSearch({ variant = 'header' }: { variant?: 'header' | 'hero' }) {
  const router = useRouter()
  const triggerRef = useRef<HTMLButtonElement>(null)
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [items, setItems] = useState<Suggestion[]>([])
  const [selected, setSelected] = useState('')
  const [loading, setLoading] = useState(false)
  const seq = useRef(0)

  useEffect(() => {
    if (variant !== 'header') return
    const onKey = (e: KeyboardEvent) => {
      const typing = e.target instanceof HTMLElement && /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName)
      if ((e.key === 'k' && (e.metaKey || e.ctrlKey)) || (e.key === '/' && !typing)) {
        e.preventDefault()
        setOpen(true)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [variant])

  useEffect(() => {
    const q = query.trim()
    if (q.length < 2) return
    const id = ++seq.current
    const t = setTimeout(async () => {
      setLoading(true)
      try {
        const found = await suggest(q)
        if (id !== seq.current) return
        setItems(found)
        // Highlight the best match (an exact code comes first), not "see all results".
        setSelected(found[0]?.code ?? `__all__${q}`)
      } catch {
        if (id === seq.current) setItems([])
      } finally {
        if (id === seq.current) setLoading(false)
      }
    }, 140)
    return () => clearTimeout(t)
  }, [query])

  const changeOpen = useCallback((next: boolean) => {
    setOpen(next)
    // Return focus to whichever button opened the dialog.
    if (!next) setTimeout(() => triggerRef.current?.focus(), 0)
  }, [])

  const go = useCallback(
    (href: string) => {
      setOpen(false)
      setQuery('')
      setItems([])
      router.push(href)
    },
    [router],
  )

  const trigger =
    variant === 'hero' ? (
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen(true)}
        className="flex h-14 w-full items-center gap-3 rounded-2xl border border-white/15 bg-white px-5 text-left text-base text-muted-foreground shadow-xl shadow-black/20 transition hover:ring-4 hover:ring-white/20 focus-visible:outline-hidden focus-visible:ring-4 focus-visible:ring-white/60"
      >
        <Search aria-hidden className="h-5 w-5 shrink-0 text-primary" />
        <span className="flex-1 truncate">
          <span className="sm:hidden">Name, code or postcode</span>
          <span className="hidden sm:inline">Search by name, ODS code or postcode…</span>
        </span>
        <kbd className="hidden rounded-md border bg-muted px-1.5 py-0.5 font-mono text-xs sm:inline">Ctrl K</kbd>
      </button>
    ) : (
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Search organisations"
        className="flex h-9 w-full items-center gap-2 rounded-lg bg-white/10 px-3 text-left text-sm text-white/70 ring-1 ring-inset ring-white/15 transition hover:bg-white/15 hover:text-white focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-white/80"
      >
        <Search aria-hidden className="h-4 w-4 shrink-0" />
        <span className="flex-1 truncate">Search</span>
        <kbd className="hidden rounded border border-white/20 px-1.5 font-mono text-[11px] sm:inline">Ctrl K</kbd>
      </button>
    )

  const q = query.trim()
  const shown = q.length >= 2 ? items : []
  return (
    <>
      {trigger}
      <Command.Dialog
        open={open}
        onOpenChange={changeOpen}
        shouldFilter={false}
        value={selected}
        onValueChange={setSelected}
        label="Search organisations"
        overlayClassName="fixed inset-0 z-50 bg-black/40 backdrop-blur-[2px]"
        contentClassName="fixed left-1/2 top-[8vh] z-50 w-[min(40rem,calc(100vw-1.5rem))] -translate-x-1/2 overflow-hidden rounded-2xl border bg-popover shadow-2xl sm:top-[12vh]"
      >
        <div className="flex items-center gap-2 border-b px-4">
          <Search aria-hidden className="h-4 w-4 text-muted-foreground" />
          <Command.Input
            value={query}
            onValueChange={(v) => {
              setQuery(v)
              if (v.trim().length < 2) {
                seq.current++
                setItems([])
                setLoading(false)
              }
            }}
            placeholder="Name, ODS code or postcode"
            className="h-12 flex-1 bg-transparent text-base outline-hidden placeholder:text-muted-foreground"
          />
          {loading ? <Loader2 aria-hidden className="h-4 w-4 animate-spin text-muted-foreground" /> : null}
        </div>
        <Command.List className="max-h-[60vh] overflow-y-auto p-2">
          {q.length < 2 ? (
            <div className="px-2 py-3">
              <p className="mb-2 text-xs font-medium text-muted-foreground">Try</p>
              <div className="flex flex-wrap gap-1.5">
                {EXAMPLES.map((ex) => (
                  <button
                    key={ex}
                    type="button"
                    onClick={() => setQuery(ex)}
                    className="min-h-8 rounded-full border bg-card px-3 py-1 text-xs hover:border-primary/40 hover:bg-accent"
                  >
                    {ex}
                  </button>
                ))}
              </div>
            </div>
          ) : null}
          {q.length >= 2 && !loading && shown.length === 0 ? (
            <Command.Empty className="px-2 py-6 text-center text-sm text-muted-foreground">No organisations match “{q}”.</Command.Empty>
          ) : null}
          {shown.length > 0 ? (
            <Command.Group heading="Organisations" className="**:[[cmdk-group-heading]]:px-2 **:[[cmdk-group-heading]]:py-1.5 **:[[cmdk-group-heading]]:text-xs **:[[cmdk-group-heading]]:font-medium **:[[cmdk-group-heading]]:text-muted-foreground">
              {shown.map((s) => (
                <Command.Item
                  key={s.code}
                  value={s.code}
                  onSelect={() => go(`/org/${s.code}`)}
                  className="flex cursor-pointer items-center gap-3 rounded-lg px-2 py-2 aria-selected:bg-accent"
                >
                  <GroupIcon group={s.group} />
                  <div className="min-w-0 flex-1">
                    <p className={cn('truncate text-sm font-medium', s.status !== 'Active' && 'text-muted-foreground')}>
                      {displayName(s.name)}
                    </p>
                    <p className="truncate text-xs text-muted-foreground">
                      {groupDef(s.group).singular}
                      {s.town ? ` · ${displayName(s.town)}` : ''}
                      {s.postcode ? ` · ${s.postcode}` : ''}
                      {s.status !== 'Active' ? ' · Closed' : ''}
                    </p>
                  </div>
                  <span className="font-mono text-xs text-muted-foreground">{s.code}</span>
                </Command.Item>
              ))}
            </Command.Group>
          ) : null}
          {q.length >= 2 ? (
            <Command.Item
              value={`__all__${q}`}
              onSelect={() => go(`/explore?q=${encodeURIComponent(q)}&status=all`)}
              className="mt-1 flex cursor-pointer items-center gap-2 rounded-lg px-2 py-2 text-sm text-primary aria-selected:bg-accent"
            >
              <ArrowRight aria-hidden className="h-4 w-4" />
              See all results for “{q}”
            </Command.Item>
          ) : null}
        </Command.List>
        <div className="flex items-center justify-between border-t bg-muted/50 px-4 py-2 text-[11px] text-muted-foreground">
          <span>Every ODS organisation type, open and closed. A full postcode also finds nearby organisations.</span>
          <span className="hidden shrink-0 pl-3 sm:inline">↑↓ move · Enter open · Esc close</span>
        </div>
      </Command.Dialog>
    </>
  )
}
