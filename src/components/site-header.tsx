'use client'

import Link from 'next/link'
import { Network } from 'lucide-react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { fieldClass } from '@/components/field'
import { scopedHref } from '@/lib/href'
import type { ScopeOption, Scopes } from '../../worker/src/api/types'

const NAV = [
  { href: '/', label: 'Overview' },
  { href: '/practices', label: 'Practices' },
  { href: '/pcns', label: 'PCNs' },
  { href: '/changes', label: 'Changes' },
  { href: '/search', label: 'Search' },
  { href: '/export', label: 'Export' },
]

function labelOf(option: ScopeOption) {
  return option.active ? option.name : `${option.name} (closed)`
}

function locate(scopes: Scopes, scope: string | null) {
  if (!scope) return { region: '', icb: '', sicbl: '' }
  const sicbl = scopes.sicbls.find((s) => s.code === scope)
  if (sicbl) {
    const icb = scopes.icbs.find((i) => i.code === sicbl.parent)
    return { region: icb?.parent ?? '', icb: sicbl.parent ?? '', sicbl: sicbl.code }
  }
  const icb = scopes.icbs.find((i) => i.code === scope)
  if (icb) return { region: icb.parent ?? '', icb: icb.code, sicbl: '' }
  return { region: scope, icb: '', sicbl: '' }
}

export function SiteHeader({ scopes, freshness }: { scopes: Scopes; freshness: string }) {
  const pathname = usePathname()
  const router = useRouter()
  const searchParams = useSearchParams()
  const scope = searchParams.get('scope')
  const selected = locate(scopes, scope)

  const icbs = selected.region
    ? scopes.icbs.filter((i) => i.parent === selected.region)
    : []
  const sicbls = selected.icb
    ? scopes.sicbls.filter((s) => s.parent === selected.icb)
    : []

  function setScope(code: string | null) {
    const params = new URLSearchParams(searchParams.toString())
    params.delete('offset')
    params.delete('before')
    if (code) params.set('scope', code)
    else params.delete('scope')
    const qs = params.toString()
    router.push(qs ? `${pathname}?${qs}` : pathname)
  }

  return (
    <header className="border-b bg-card">
      <div className="mx-auto flex max-w-7xl flex-col gap-3 px-4 py-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Link href={scopedHref('/', scope)} className="flex items-center gap-2">
            <Network aria-hidden className="h-6 w-6 text-primary" />
            <span className="text-lg font-semibold tracking-tight">ODS Tracker</span>
          </Link>
          <p className="text-xs text-muted-foreground">{freshness}</p>
        </div>

        <nav aria-label="Main" className="flex flex-wrap gap-1">
          {NAV.map((item) => {
            const active = item.href === '/' ? pathname === '/' : pathname.startsWith(item.href)
            return (
              <Link
                key={item.href}
                href={scopedHref(item.href, scope)}
                className={`rounded-md px-2.5 py-1 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring ${
                  active ? 'bg-primary text-primary-foreground' : 'hover:bg-accent'
                }`}
              >
                {item.label}
              </Link>
            )
          })}
        </nav>

        <div className="flex flex-wrap gap-2">
          <label className="flex min-w-[12rem] flex-1 flex-col gap-1 text-xs font-medium text-muted-foreground sm:max-w-xs">
            Region
            <select
              className={fieldClass}
              value={selected.region}
              onChange={(e) => setScope(e.target.value || null)}
            >
              <option value="">All England</option>
              {scopes.regions.map((r) => (
                <option key={r.code} value={r.code}>
                  {labelOf(r)}
                </option>
              ))}
            </select>
          </label>
          <label className="flex min-w-[12rem] flex-1 flex-col gap-1 text-xs font-medium text-muted-foreground sm:max-w-xs">
            ICB
            <select
              className={fieldClass}
              value={selected.icb}
              disabled={!selected.region}
              onChange={(e) => setScope(e.target.value || selected.region || null)}
            >
              <option value="">{selected.region ? 'All in region' : 'Select a region first'}</option>
              {icbs.map((i) => (
                <option key={i.code} value={i.code}>
                  {labelOf(i)}
                </option>
              ))}
            </select>
          </label>
          <label className="flex min-w-[12rem] flex-1 flex-col gap-1 text-xs font-medium text-muted-foreground sm:max-w-xs">
            Sub-ICB
            <select
              className={fieldClass}
              value={selected.sicbl}
              disabled={!selected.icb}
              onChange={(e) => setScope(e.target.value || selected.icb || null)}
            >
              <option value="">{selected.icb ? 'All in ICB' : 'Select an ICB first'}</option>
              {sicbls.map((s) => (
                <option key={s.code} value={s.code}>
                  {labelOf(s)}
                </option>
              ))}
            </select>
          </label>
        </div>
      </div>
    </header>
  )
}
