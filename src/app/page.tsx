import Link from 'next/link'
import { ChangeList } from '@/components/change-list'
import { Card, CardContent } from '@/components/ui/card'
import { fetchChanges, fetchMeta, fetchPcns, fetchPractices, fetchScopes } from '@/lib/api'
import { NOTABLE_KINDS } from '@/lib/constants'
import { daysAgoIso, formatNumber } from '@/lib/format'
import { firstParam, scopedHref, type Query } from '@/lib/href'
import { scopeName } from '@/lib/utils'

export default async function OverviewPage({ searchParams }: { searchParams: Promise<Query> }) {
  const sp = await searchParams
  const scope = firstParam(sp.scope)
  const since = daysAgoIso(90)
  const kinds = NOTABLE_KINDS.join(',')

  const [meta, scopes, scopedPractices, scopedPcns, changes] = await Promise.all([
    fetchMeta(),
    fetchScopes(),
    scope ? fetchPractices({ scope, status: 'active', limit: 1 }) : Promise.resolve(null),
    scope ? fetchPcns({ scope, status: 'active', limit: 1 }) : Promise.resolve(null),
    fetchChanges({ scope, kinds, since, limit: 500 }),
  ])

  const practices = scope ? scopedPractices?.total ?? 0 : meta.stats?.active_practices ?? 0
  const pcns = scope ? scopedPcns?.total ?? 0 : meta.stats?.active_pcns ?? 0
  const changeCount = changes.nextBefore ? `${formatNumber(changes.items.length)}+` : formatNumber(changes.items.length)
  const place = scopeName(scopes, scope)
  const latest = changes.items.slice(0, 20)

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold tracking-tight">Overview · {place}</h1>
      <div className="grid gap-3 sm:grid-cols-3">
        <Stat href={scopedHref('/practices', scope)} label="Active practices" value={formatNumber(practices)} />
        <Stat href={scopedHref('/pcns', scope)} label="Active PCNs" value={formatNumber(pcns)} />
        <Stat href={scopedHref('/changes', scope)} label="Notable changes in last 90 days" value={changeCount} />
      </div>
      <section>
        <div className="mb-2 flex items-baseline justify-between gap-2">
          <h2 className="text-lg font-semibold">Latest notable changes</h2>
          <Link href={scopedHref('/changes', scope)} className="text-sm text-primary hover:underline">
            All changes
          </Link>
        </div>
        <ChangeList items={latest} scope={scope} />
      </section>
      <p className="text-sm text-muted-foreground">
        Explore <Link className="text-primary hover:underline" href={scopedHref('/practices', scope)}>practices</Link>,{' '}
        <Link className="text-primary hover:underline" href={scopedHref('/pcns', scope)}>PCNs</Link>,{' '}
        <Link className="text-primary hover:underline" href={scopedHref('/search', scope)}>search all organisations</Link>
        {' '}or <Link className="text-primary hover:underline" href={scopedHref('/export', scope)}>export a CSV</Link>.
      </p>
    </div>
  )
}

function Stat({ href, label, value }: { href: string; label: string; value: string }) {
  return (
    <Link href={href}>
      <Card className="h-full transition-colors hover:bg-accent/40">
        <CardContent className="p-4">
          <p className="text-xs text-muted-foreground">{label}</p>
          <p className="mt-1 text-3xl font-semibold tabular-nums">{value}</p>
        </CardContent>
      </Card>
    </Link>
  )
}
