'use client'

import Link from 'next/link'
import { usePathname, useSearchParams } from 'next/navigation'
import { Network } from 'lucide-react'
import { AreaPicker } from '@/components/area-picker'
import { CommandSearch } from '@/components/command-search'
import { cn } from '@/lib/utils'
import type { Scopes } from '../../worker/src/api/types'

const NAV = [
  { href: '/explore', label: 'Explore' },
  { href: '/changes', label: 'Changes' },
  { href: '/areas', label: 'Areas' },
  { href: '/export', label: 'Export' },
  { href: '/docs', label: 'API' },
]

const focusRing = 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/80'

export function SiteHeader({ scopes }: { scopes: Scopes }) {
  const pathname = usePathname()
  const scope = useSearchParams().get('scope')
  const withScope = (href: string) =>
    scope && !['/areas', '/docs'].includes(href) ? `${href}?scope=${encodeURIComponent(scope)}` : href

  return (
    // Sticky only on large screens; on phones it would take a quarter of the viewport.
    <header className="relative z-40 bg-header text-header-foreground shadow-[0_1px_0_rgba(255,255,255,0.06)] lg:sticky lg:top-0">
      <a
        href="#main"
        className="sr-only rounded-md bg-white px-3 py-2 text-sm font-medium text-foreground focus:not-sr-only focus:absolute focus:left-3 focus:top-3 focus:z-50"
      >
        Skip to content
      </a>
      <div className="mx-auto flex h-16 max-w-7xl items-center gap-3 px-4 sm:gap-5">
        <Link href={withScope('/')} aria-label="ODS Tracker home" className={cn('flex shrink-0 items-center gap-2.5 rounded-lg', focusRing)}>
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary shadow-inner">
            <Network aria-hidden className="h-[18px] w-[18px]" />
          </span>
          <span className="hidden text-[15px] font-semibold tracking-tight sm:inline">ODS Tracker</span>
        </Link>
        <div className="min-w-0 flex-1 md:max-w-md">
          <CommandSearch />
        </div>
        <nav aria-label="Main" className="hidden items-center gap-1 lg:flex">
          {NAV.map((item) => (
            <Link
              key={item.href}
              href={withScope(item.href)}
              aria-current={pathname.startsWith(item.href) ? 'page' : undefined}
              className={cn(
                'rounded-md px-3 py-1.5 text-sm text-white/75 transition hover:bg-white/10 hover:text-white',
                focusRing,
                pathname.startsWith(item.href) && 'bg-white/10 text-white',
              )}
            >
              {item.label}
            </Link>
          ))}
        </nav>
        <div className="ml-auto shrink-0">
          <AreaPicker scopes={scopes} />
        </div>
      </div>
      <nav aria-label="Main" className="flex gap-1 overflow-x-auto border-t border-white/10 px-3 py-1.5 lg:hidden">
        {NAV.map((item) => (
          <Link
            key={item.href}
            href={withScope(item.href)}
            aria-current={pathname.startsWith(item.href) ? 'page' : undefined}
            className={cn(
              'shrink-0 rounded-md px-3 py-1.5 text-sm text-white/75',
              focusRing,
              pathname.startsWith(item.href) && 'bg-white/10 text-white',
            )}
          >
            {item.label}
          </Link>
        ))}
      </nav>
    </header>
  )
}
