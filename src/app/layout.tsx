import type { Metadata } from 'next'
import { Suspense, type ReactNode } from 'react'
import localFont from 'next/font/local'
import './globals.css'
import { SiteHeader } from '@/components/site-header'
import { fetchMeta, fetchScopes } from '@/lib/api'
import { freshnessCopy } from '@/lib/format'
import type { Scopes } from '../../worker/src/api/types'

const geistSans = localFont({
  src: './fonts/GeistVF.woff',
  variable: '--font-geist-sans',
  weight: '100 900',
})
const geistMono = localFont({
  src: './fonts/GeistMonoVF.woff',
  variable: '--font-geist-mono',
  weight: '100 900',
})

const emptyScopes: Scopes = { regions: [], icbs: [], sicbls: [] }

export const metadata: Metadata = {
  title: {
    default: 'ODS Tracker',
    template: '%s · ODS Tracker',
  },
  description: 'ODS Tracker – NHS organisation changes across England',
}

export default async function RootLayout({ children }: { children: ReactNode }) {
  const [meta, scopes] = await Promise.all([
    fetchMeta().catch(() => null),
    fetchScopes().catch(() => emptyScopes),
  ])
  const freshness = freshnessCopy(meta?.lastSyncDate ?? null, meta?.lastSyncAt ?? null)

  return (
    <html lang="en-GB">
      <body className={`${geistSans.variable} ${geistMono.variable} font-sans antialiased`}>
        <Suspense fallback={<div className="h-36 border-b" />}>
          <SiteHeader scopes={scopes} freshness={freshness} />
        </Suspense>
        <main className="mx-auto max-w-7xl px-4 py-5">{children}</main>
      </body>
    </html>
  )
}
