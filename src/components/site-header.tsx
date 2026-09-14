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
]

export function SiteHeader({ scopes }: { scopes: Scopes }) {
  const pathname = usePathname()
  const scope = useSearchParams().get('scope')
  const withScope = (href: string) => (scope && href !== '/areas' ? `${href}?scope=${encodeURIComponent(scope)}` : href)

  return (
    <header className="sticky top-0 z-40 bg-header text-header-foreground shadow-[0_1px_0_rgba(255,255,255,0.06)]">
      <div className="mx-auto flex h-16 max-w-7xl items-center gap-3 px-4 sm:gap-5">
        <Link href={withScope('/')} className="flex shrink-0 items-center gap-2.5">
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
              className={cn(
                'rounded-md px-3 py-1.5 text-sm text-white/75 transition hover:bg-white/10 hover:text-white',
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
            className={cn(
              'shrink-0 rounded-md px-3 py-1 text-sm text-white/75',
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
