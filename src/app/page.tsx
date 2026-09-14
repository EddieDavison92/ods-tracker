import Link from 'next/link'
import { ArrowRight } from 'lucide-react'
import { ActivityChart } from '@/components/activity-chart'
import { isLiveArea, scopeLabel } from '@/lib/scopes'
import { ChangeList } from '@/components/change-list'
import { CommandSearch } from '@/components/command-search'
import { Panel } from '@/components/field'
import { GroupIcon } from '@/components/group-badge'
import { StatTile } from '@/components/stat'
import { fetchActivity, fetchChanges, fetchFacets, fetchMeta, fetchScopes } from '@/lib/api'
import { formatDate, formatMonth, formatNumber } from '@/lib/format'
import { FAMILY_LABELS, FAMILY_ORDER, GROUPS, type GroupKey } from '@/lib/groups'
import { firstParam, type Query } from '@/lib/href'
import { presetKinds } from '@/lib/kinds'
import { displayName } from '@/lib/names'

// Home feed focuses on NHS services rather than every ODS record (schools, suppliers).
const CORE_GROUPS = 'gp,pcn,branch,pharmacy,dental,optical,trust,commissioner'

const EXAMPLES = [
  { label: 'Archway Medical Centre', href: '/org/F83004' },
  { label: 'UCLH', href: '/org/RRV' },
  { label: 'North West London', href: '/org/Z9B2Z' },
  { label: 'Pharmacies in London', href: '/explore?group=pharmacy&scope=Y56' },
]

export default async function HomePage({ searchParams }: { searchParams: Promise<Query> }) {
  const scope = firstParam((await searchParams).scope)
  const [meta, scopes, facets, changes, activity] = await Promise.all([
    fetchMeta(),
    fetchScopes(),
    fetchFacets({ scope, status: 'active' }),
    fetchChanges({ scope, kinds: presetKinds('notable')!.join(','), group: CORE_GROUPS, limit: 10 }),
    fetchActivity({ scope, months: 24 }),
  ])
  const counts = new Map<GroupKey, number>(facets.groups.map((g) => [g.group, g.count]))
  const withScope = (href: string) => (scope ? `${href}${href.includes('?') ? '&' : '?'}scope=${scope}` : href)
  const place = scopeLabel(scopes, scope)
  // Latest month with any data (the current month may not have synced yet).
  const lastMonth = [...activity.months].reverse().find((m) => m.opened + m.closed + m.changed > 0)
  const recent = activity.months.slice(-3).reduce((a, m) => a + m.opened + m.closed + m.changed, 0)

  return (
    <>
      <section className="relative overflow-hidden bg-header text-white">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 opacity-60"
          style={{
            background:
              'radial-gradient(60rem 30rem at 85% -10%, rgba(42,120,214,0.45), transparent 60%), radial-gradient(40rem 20rem at 0% 110%, rgba(27,175,122,0.18), transparent 60%)',
          }}
        />
        <div className="relative mx-auto max-w-7xl px-4 pb-14 pt-12 sm:pt-16">
          <p className="mb-3 inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-xs text-white/80 ring-1 ring-inset ring-white/15">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
            Data up to {meta.lastSyncDate ? formatDate(meta.lastSyncDate) : '—'} · history since{' '}
            {meta.historyFrom ? formatDate(meta.historyFrom) : '2018'}
          </p>
          <h1 className="max-w-3xl text-3xl font-semibold tracking-tight sm:text-5xl">
            {scope ? displayName(place) : 'Every NHS organisation in England, and how it has changed'}
          </h1>
          <p className="mt-4 max-w-2xl text-base text-white/75 sm:text-lg">
            {scope
              ? `${formatNumber(facets.total)} active organisations in this area, from GP practices to trust sites.`
              : `Search ${formatNumber(meta.stats?.orgs)} organisations from the NHS Organisation Data Service: practices, PCNs, trusts, pharmacies, care homes and more.`}
          </p>
          <div className="mt-8 max-w-2xl">
            <CommandSearch variant="hero" />
            <div className="mt-3 flex flex-wrap items-center gap-2 text-sm text-white/70">
              <span>Try</span>
              {EXAMPLES.map((e) => (
                <Link key={e.href} href={e.href} className="rounded-full bg-white/10 px-3 py-1 text-white/90 ring-1 ring-inset ring-white/15 hover:bg-white/20">
                  {e.label}
                </Link>
              ))}
            </div>
          </div>
        </div>
      </section>

      <div className="mx-auto -mt-8 max-w-7xl space-y-10 px-4">
        <div className="relative grid grid-cols-2 gap-3 md:grid-cols-4">
          <StatTile label="Active organisations" value={formatNumber(facets.total)} href={withScope('/explore')} sub={scope ? displayName(place) : 'All types, England'} />
          <StatTile label="GP practices" value={formatNumber(counts.get('gp') ?? 0)} href={withScope('/explore?group=gp')} sub={`${formatNumber(counts.get('pcn') ?? 0)} PCNs`} icon={<GroupIcon group="gp" size="xs" />} />
          <StatTile label="Pharmacies" value={formatNumber(counts.get('pharmacy') ?? 0)} href={withScope('/explore?group=pharmacy')} sub={`${formatNumber(counts.get('dental') ?? 0)} dental practices`} icon={<GroupIcon group="pharmacy" size="xs" />} />
          <StatTile
            label="Changes, last 3 months"
            value={formatNumber(recent)}
            href={withScope('/changes')}
            sub={
              lastMonth
                ? `${formatNumber(lastMonth.opened)} opened, ${formatNumber(lastMonth.closed)} closed in ${formatMonth(lastMonth.month)}`
                : undefined
            }
          />
        </div>

        <section>
          <div className="mb-4 flex items-end justify-between gap-3">
            <div>
              <h2 className="text-xl font-semibold tracking-tight">Browse by type</h2>
              <p className="text-sm text-muted-foreground">Active organisations{scope ? ` in ${displayName(place)}` : ''}, grouped from ODS roles.</p>
            </div>
            <Link href={withScope('/explore')} className="hidden items-center gap-1 text-sm font-medium text-primary hover:underline sm:inline-flex">
              Explore all <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>
          <div className="space-y-6">
            {FAMILY_ORDER.map((family) => {
              const groups = GROUPS.filter((g) => g.family === family && (counts.get(g.key) ?? 0) > 0)
              if (!groups.length) return null
              return (
                <div key={family}>
                  <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">{FAMILY_LABELS[family]}</h3>
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4">
                    {groups.map((g) => (
                      <Link
                        key={g.key}
                        href={withScope(`/explore?group=${g.key}`)}
                        className="group flex items-start gap-3 rounded-xl border bg-card p-3 shadow-sm transition hover:border-primary/40 hover:shadow-md"
                      >
                        <GroupIcon group={g.key} size="md" />
                        <div className="min-w-0 flex-1">
                          <p className="flex items-baseline justify-between gap-2">
                            <span className="truncate text-sm font-medium group-hover:text-primary">{g.label}</span>
                            <span className="text-sm font-semibold tabular">{formatNumber(counts.get(g.key))}</span>
                          </p>
                          <p className="line-clamp-1 text-xs text-muted-foreground">{g.blurb}</p>
                        </div>
                      </Link>
                    ))}
                  </div>
                </div>
              )
            })}
          </div>
        </section>

        <div className="grid gap-6 lg:grid-cols-5">
          <section className="lg:col-span-3">
            <div className="mb-3 flex items-end justify-between">
              <h2 className="text-xl font-semibold tracking-tight">Latest notable changes</h2>
              <Link href={withScope('/changes')} className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline">
                All changes <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            </div>
            <ChangeList items={changes.items} />
          </section>
          <div className="space-y-6 lg:col-span-2">
            <Panel title="Changes per month" action={<span className="text-xs text-muted-foreground">Last 24 months</span>}>
              <ActivityChart data={activity.months} height={190} />
            </Panel>
            {!scope ? (
              <Panel title="Regions" action={<Link href="/areas" className="text-xs font-medium text-primary hover:underline">All areas</Link>} bodyClassName="p-2">
                <ul>
                  {scopes.regions.filter(isLiveArea).map((r) => (
                    <li key={r.code}>
                      <Link href={`/?scope=${r.code}`} className="flex items-center justify-between rounded-lg px-2 py-2 text-sm hover:bg-accent">
                        <span>{displayName(r.name).replace(/ Commissioning Region$/i, '')}</span>
                        <span className="tabular text-xs text-muted-foreground">{formatNumber(r.counts?.active)} active</span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </Panel>
            ) : null}
          </div>
        </div>
      </div>
    </>
  )
}
