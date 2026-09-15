import type { Metadata } from 'next'
import Link from 'next/link'
import { Download, Rss } from 'lucide-react'
import { ActivityChart } from '@/components/activity-chart'
import { ChangeList } from '@/components/change-list'
import { EmptyState, PageHeading, Panel, Segmented } from '@/components/field'
import { apiUrl, fetchActivity, fetchChanges, fetchScopes, optional } from '@/lib/api'
import { daysAgoIso, formatNumber } from '@/lib/format'
import { groupDef } from '@/lib/groups'
import { firstParam, pageHref, type Query } from '@/lib/href'
import { KIND_PRESETS, presetField, presetKinds, presetRelatedGroup } from '@/lib/kinds'
import { codeParam, groupsParam, oneOf } from '@/lib/params'
import { displayName, lowerLabel } from '@/lib/names'
import { EMPTY_SCOPES, scopeLabel } from '@/lib/scopes'
import { cn } from '@/lib/utils'

export const metadata: Metadata = { title: 'Changes' }

const TYPE_CHIPS: { value: string; label: string }[] = [
  { value: '', label: 'All types' },
  { value: 'gp', label: 'GP practices' },
  { value: 'pcn', label: 'PCNs' },
  { value: 'pharmacy', label: 'Pharmacies' },
  { value: 'dental', label: 'Dental' },
  { value: 'optical', label: 'Opticians' },
  { value: 'trust,trust_site', label: 'Trusts and sites' },
  { value: 'social_care', label: 'Social care' },
  { value: 'commissioner', label: 'Commissioners' },
]

// The chart covers the chosen period: a few months for short periods, years since 2018.
const PERIODS = [
  { value: '30d', label: '30 days', days: 30, chart: { interval: 'month', months: 3 } },
  { value: '90d', label: '90 days', days: 90, chart: { interval: 'month', months: 4 } },
  { value: '1y', label: '12 months', days: 365, chart: { interval: 'month', months: 12 } },
  { value: 'all', label: 'Since 2018', days: null, chart: { interval: 'year', years: new Date().getUTCFullYear() - 2017 } },
] as const

export default async function ChangesPage({ searchParams }: { searchParams: Promise<Query> }) {
  const sp = await searchParams
  const scope = codeParam(sp.scope)
  const group = groupsParam(sp.group) ?? ''
  const preset = oneOf(sp.kinds, KIND_PRESETS.map((p) => p.key), 'notable')
  const basis = oneOf(sp.date, ['detected', 'effective'] as const, 'detected')
  const period = PERIODS.find((p) => p.value === firstParam(sp.period)) ?? PERIODS[1]
  const cursorRaw = firstParam(sp.cursor) ?? ''
  const cursor = /^\d{4}-\d{2}-\d{2}\|\d{1,15}$/.test(cursorRaw) ? cursorRaw : undefined
  const kinds = presetKinds(preset)?.join(',')
  const field = presetField(preset)
  const relatedGroup = presetRelatedGroup(preset)
  const since = period.days ? daysAgoIso(period.days) : undefined
  const date = basis === 'effective' ? 'effective' : undefined
  const filters = { scope, group, kinds, field, relatedGroup, since, date }

  // Every section degrades on its own, so a busy database shows a message rather than an error page.
  const [feed, activity, scopes] = await Promise.all([
    optional(fetchChanges({ ...filters, cursor, limit: 60 })),
    optional(fetchActivity({ scope, group, kinds, field, relatedGroup, date, ...period.chart })),
    optional(fetchScopes()).then((s) => s ?? EMPTY_SCOPES),
  ])
  const place = displayName(scopeLabel(scopes, scope))
  const href = (u: Record<string, string | null>) => pageHref('/changes', sp, { cursor: null, before: null, ...u })
  const chartTotal = (activity?.months ?? []).reduce((a, m) => a + m.opened + m.closed + m.changed, 0)
  const typeLabel = group ? lowerLabel(TYPE_CHIPS.find((c) => c.value === group)?.label ?? groupDef(group).label) : null
  const presetLabel = lowerLabel(KIND_PRESETS.find((p) => p.key === preset)?.label ?? '')
  const chartWindow = period.chart.interval === 'year' ? 'per year since 2018' : `per month, last ${period.chart.months} months`

  return (
    <div className="mx-auto max-w-7xl px-4 py-8">
      <PageHeading
        eyebrow={place}
        title="Changes"
        description={`What changed in ODS${scope ? ` in ${place}` : ' across England'}. History comes from monthly NHS releases until August 2026, then from the ODS API every 6 hours.`}
      >
        <a rel="nofollow" href={apiUrl('/api/export/changes.csv', filters)} className="inline-flex h-9 items-center gap-2 rounded-lg border bg-card px-3 text-sm shadow-xs hover:bg-accent">
          <Download aria-hidden className="h-4 w-4" /> CSV
        </a>
        <a rel="nofollow" href={apiUrl('/api/changes.rss', filters)} className="inline-flex h-9 items-center gap-2 rounded-lg border bg-card px-3 text-sm shadow-xs hover:bg-accent">
          <Rss aria-hidden className="h-4 w-4 text-[#eb6834]" /> Follow (RSS)
        </a>
      </PageHeading>

      <div className="mb-6 space-y-3">
        <Segmented
          label="Kind of change"
          value={preset}
          options={KIND_PRESETS.map((p) => ({ value: p.key, label: p.label }))}
          hrefFor={(v) => href({ kinds: v === 'notable' ? null : v })}
        />
        <div className="flex flex-wrap gap-2">
          <Segmented
            label="Period"
            value={period.value}
            options={PERIODS.map((p) => ({ value: p.value, label: p.label }))}
            hrefFor={(v) => href({ period: v === '90d' ? null : v })}
          />
          <Segmented
            label="Date"
            value={basis}
            options={[{ value: 'detected', label: 'By date recorded' }, { value: 'effective', label: 'By date effective' }]}
            hrefFor={(v) => href({ date: v === 'detected' ? null : v })}
          />
        </div>
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Organisation type">
          {TYPE_CHIPS.map((c) => (
            <Link
              key={c.value || 'all'}
              href={href({ group: c.value || null })}
              aria-current={group === c.value ? 'true' : undefined}
              className={cn(
                'inline-flex min-h-8 items-center rounded-full border px-3 py-1 text-sm transition',
                group === c.value ? 'border-primary bg-primary text-primary-foreground' : 'bg-card hover:bg-accent',
              )}
            >
              {c.label}
            </Link>
          ))}
        </div>
        <p className="text-xs text-muted-foreground">
          {basis === 'effective'
            ? 'Showing changes by the date ODS says they took effect.'
            : 'Showing changes by the date they first appeared in ODS. Switch to "date effective" for counts by when things actually happened.'}
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-3 *:min-w-0">
        <section className="lg:col-span-2" aria-labelledby="feed-heading">
          <h2 id="feed-heading" className="sr-only">Latest changes</h2>
          {feed ? (
            <ChangeList
              grouped
              by={basis === 'effective' ? 'effectiveDay' : 'detected'}
              items={feed.items}
              empty={`No ${presetLabel ?? ''} changes${typeLabel ? ` to ${typeLabel}` : ''} in this period. Try a longer period or another type.`}
            />
          ) : (
            <EmptyState>Changes could not be loaded just now; the database may be busy. Refresh in a few seconds.</EmptyState>
          )}
          {feed?.nextCursor ? (
            <div className="mt-6 text-center">
              <Link href={pageHref('/changes', sp, { cursor: feed.nextCursor, before: null })} className="inline-flex h-9 items-center rounded-lg border bg-card px-4 text-sm font-medium shadow-xs hover:bg-accent">
                Older changes
              </Link>
            </div>
          ) : null}
        </section>
        <div className="space-y-6 lg:sticky lg:top-24 lg:self-start">
          <Panel title={`Changes ${chartWindow}`}>
            {activity ? (
              <>
                <ActivityChart data={activity.months} height={200} />
                <p className="mt-3 text-xs text-muted-foreground">
                  {formatNumber(chartTotal)} changes{typeLabel ? ` to ${typeLabel}` : ''} in the chart ({presetLabel}),
                  counted by date {basis === 'effective' ? 'effective' : 'recorded'}.
                  {basis === 'detected' ? ' Before September 2026 changes are dated to the monthly release that first showed them, so reorganisations (e.g. April 2020, April 2026) spike.' : ''}
                </p>
              </>
            ) : (
              <p className="py-8 text-center text-sm text-muted-foreground">The chart could not be loaded just now.</p>
            )}
          </Panel>
        </div>
      </div>
    </div>
  )
}
