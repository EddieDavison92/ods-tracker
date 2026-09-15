import type { Metadata } from 'next'
import { Suspense, type ReactNode } from 'react'
import Link from 'next/link'
import localFont from 'next/font/local'
import './globals.css'
import { RouteFocus } from '@/components/route-focus'
import { SiteHeader } from '@/components/site-header'
import { fetchMeta, fetchScopes } from '@/lib/api'
import { formatDate, formatRelative } from '@/lib/format'
import type { Scopes } from '../../worker/src/api/types'

const geistSans = localFont({ src: './fonts/GeistVF.woff', variable: '--font-geist-sans', weight: '100 900' })
const geistMono = localFont({ src: './fonts/GeistMonoVF.woff', variable: '--font-geist-mono', weight: '100 900' })

const emptyScopes: Scopes = { regions: [], icbs: [], sicbls: [] }

export const metadata: Metadata = {
  title: { default: 'ODS Tracker – every NHS organisation in England', template: '%s · ODS Tracker' },
  description:
    'Search every NHS Organisation Data Service record in England and see how practices, PCNs, trusts, pharmacies and more have changed since 2018.',
}

export default async function RootLayout({ children }: { children: ReactNode }) {
  const [meta, scopes] = await Promise.all([fetchMeta().catch(() => null), fetchScopes().catch(() => emptyScopes)])
  const checked = formatRelative(meta?.lastSyncAt)

  return (
    <html lang="en-GB">
      <body className={`${geistSans.variable} ${geistMono.variable}`}>
        <Suspense fallback={<div className="h-16 bg-header" />}>
          <SiteHeader scopes={scopes} />
        </Suspense>
        <main id="main" tabIndex={-1} className="min-h-[70vh] focus:outline-hidden">{children}</main>
        <RouteFocus />
        <footer className="mt-10 border-t bg-card">
          <div className="mx-auto grid max-w-7xl gap-6 px-4 py-8 text-sm text-muted-foreground sm:grid-cols-3">
            <div className="space-y-1">
              <p className="font-medium text-foreground">ODS Tracker</p>
              <p>
                NHS organisation data for England, with change history since{' '}
                {meta?.historyFrom ? formatDate(meta.historyFrom) : '2018'}.
              </p>
            </div>
            <div className="space-y-1">
              <p className="font-medium text-foreground">Freshness</p>
              <p>
                Data up to {meta?.lastSyncDate ? formatDate(meta.lastSyncDate) : '—'}
                {checked ? `, checked ${checked}` : ''}. The ODS API is checked every 6 hours.
              </p>
            </div>
            <div className="space-y-1">
              <p className="font-medium text-foreground">Sources</p>
              <p>
                NHS England Organisation Data Service via TRUD and the ORD API, under the Open Government Licence.{' '}
                <Link href="/export" className="text-primary hover:underline">Exports</Link> ·{' '}
                <Link href="/docs" className="text-primary hover:underline">API</Link>
              </p>
            </div>
          </div>
        </footer>
      </body>
    </html>
  )
}
