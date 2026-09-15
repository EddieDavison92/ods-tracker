import type { Metadata } from 'next'
import Link from 'next/link'
import { EmptyState, PageHeading } from '@/components/field'
import { GroupIcon } from '@/components/group-badge'
import { fetchScopes, optional } from '@/lib/api'
import { formatNumber } from '@/lib/format'
import { displayName } from '@/lib/names'
import { EMPTY_SCOPES, isLiveArea } from '@/lib/scopes'
import type { ScopeOption } from '../../../worker/src/api/types'

export const metadata: Metadata = { title: 'Areas' }

const short = (name: string) =>
  displayName(name).replace(/ Commissioning Region$/i, '').replace(/^NHS /, '').replace(/ Integrated Care Board$/i, '')

function Counts({ s }: { s: ScopeOption }) {
  if (!s.counts) return null
  return (
    <dl className="grid grid-cols-3 gap-2 text-center">
      {[
        ['Active', s.counts.active],
        ['GP practices', s.counts.gp],
        ['PCNs', s.counts.pcn],
      ].map(([label, n]) => (
        <div key={label as string} className="rounded-lg bg-muted/60 px-2 py-1.5">
          <dd className="text-sm font-semibold tabular">{formatNumber(n as number)}</dd>
          <dt className="text-[11px] text-muted-foreground">{label}</dt>
        </div>
      ))}
    </dl>
  )
}

export default async function AreasPage() {
  // Prerendered and revalidated each minute: if the API is down, show a message rather than fail the build.
  const loaded = await optional(fetchScopes())
  const scopes = loaded ?? EMPTY_SCOPES
  const regions = scopes.regions.filter(isLiveArea)
  const closed = scopes.icbs.filter((i) => !isLiveArea(i))

  return (
    <div className="mx-auto max-w-7xl px-4 py-8">
      <PageHeading
        title="Areas"
        description="NHS England regions, integrated care boards and Sub-ICB locations. Counts are active organisations of every type whose ODS relationships place them in the area."
      />
      {loaded ? null : <EmptyState>Areas could not be loaded just now. Refresh in a minute to try again.</EmptyState>}
      <div className="space-y-10">
        {regions.map((r) => {
          const icbs = scopes.icbs.filter((i) => i.parent === r.code && isLiveArea(i))
          return (
            <section key={r.code}>
              <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
                <div className="flex items-center gap-3">
                  <GroupIcon group="commissioner" size="md" />
                  <div>
                    <h2 className="text-lg font-semibold tracking-tight">
                      <Link href={`/org/${r.code}`} className="hover:text-primary hover:underline">{short(r.name)}</Link>
                    </h2>
                    <p className="text-xs text-muted-foreground">
                      {icbs.length} ICBs · {formatNumber(r.counts?.active)} active organisations · {formatNumber(r.counts?.gp)} GP practices
                    </p>
                  </div>
                </div>
                <div className="flex gap-3 text-sm">
                  <Link href={`/explore?scope=${r.code}`} className="font-medium text-primary hover:underline">Explore</Link>
                  <Link href={`/changes?scope=${r.code}`} className="font-medium text-primary hover:underline">Changes</Link>
                </div>
              </div>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {icbs.map((i) => {
                  const sub = scopes.sicbls.filter((s) => s.parent === i.code)
                  return (
                    <div key={i.code} className="flex flex-col gap-3 rounded-xl border bg-card p-4 shadow-xs">
                      <div className="flex items-start justify-between gap-2">
                        <Link href={`/org/${i.code}`} className="font-medium leading-snug hover:text-primary hover:underline">{short(i.name)}</Link>
                        <span className="font-mono text-xs text-muted-foreground">{i.code}</span>
                      </div>
                      <Counts s={i} />
                      {sub.length > 1 ? (
                        <details className="text-sm">
                          <summary className="cursor-pointer text-xs text-muted-foreground hover:text-foreground">{sub.length} Sub-ICB locations</summary>
                          <ul className="mt-2 space-y-1">
                            {sub.map((s) => (
                              <li key={s.code} className="flex justify-between gap-2">
                                <Link href={`/explore?scope=${s.code}`} className="truncate hover:text-primary hover:underline">{short(s.name)}</Link>
                                <span className="tabular text-xs text-muted-foreground">{formatNumber(s.counts?.gp)} GPs</span>
                              </li>
                            ))}
                          </ul>
                        </details>
                      ) : null}
                      <div className="mt-auto flex gap-3 text-xs">
                        <Link href={`/explore?scope=${i.code}`} className="font-medium text-primary hover:underline">Explore</Link>
                        <Link href={`/changes?scope=${i.code}`} className="font-medium text-primary hover:underline">Changes</Link>
                        <Link href={`/?scope=${i.code}`} className="font-medium text-primary hover:underline">Overview</Link>
                      </div>
                    </div>
                  )
                })}
              </div>
            </section>
          )
        })}
        {closed.length ? (
          <details className="rounded-xl border bg-card p-4 shadow-xs">
            <summary className="cursor-pointer text-sm font-medium">Former ICBs ({closed.length})</summary>
            <ul className="mt-3 grid gap-1 text-sm sm:grid-cols-2 lg:grid-cols-3">
              {closed.map((i) => (
                <li key={i.code}>
                  <Link href={`/org/${i.code}`} className="text-muted-foreground hover:text-primary hover:underline">{short(i.name)}</Link>
                </li>
              ))}
            </ul>
          </details>
        ) : null}
      </div>
    </div>
  )
}
