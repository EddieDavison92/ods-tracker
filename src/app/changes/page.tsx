import type { Metadata } from 'next'
import Link from 'next/link'
import { Rss } from 'lucide-react'
import { ActivityChart } from '@/components/activity-chart'
import { AreaPicker } from '@/components/area-picker'
import { ChangeList } from '@/components/change-list'
import { PageHeading, Panel, Segmented } from '@/components/field'
import { apiUrl, fetchActivity, fetchChanges, fetchScopes, optional } from '@/lib/api'
import { daysAgoIso, formatNumber } from '@/lib/format'
import { groupDef } from '@/lib/groups'
import { firstParam, pageHref, type Query } from '@/lib/href'
import { KIND_PRESETS, presetKinds } from '@/lib/kinds'
import { displayName } from '@/lib/names'
import { codeParam, groupsParam, oneOf } from '@/lib/params'
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

const PERIODS = [
  { value: '30d', label: '30 days', days: 30, months: 12 },
  { value: '90d', label: '90 days', days: 90, months: 12 },
  { value: '1y', label: '12 months', days: 365, months: 12 },
  { value: 'all', label: 'Since 2018', days: null, months: 100 },
]

export default async function ChangesPage({ searchParams }: { searchParams: Promise<Query> }) {
  const sp = await searchParams
  const scope = codeParam(sp.scope)
  const group = groupsParam(sp.group) ?? ''
  const preset = oneOf(sp.kinds, KIND_PRESETS.map((p) => p.key), 'notable')
  const period = PERIODS.find((p) => p.value === firstParam(sp.period)) ?? PERIODS[1]
  const beforeRaw = firstParam(sp.before) ?? ''
  const before = /^\d{1,12}$/.test(beforeRaw) ? beforeRaw : undefined
  const kinds = presetKinds(preset)?.join(',')
  const since = period.days ? daysAgoIso(period.days) : undefined

  // The feed is essential; the chart and area list degrade.
  const [feed, activity, scopes] = await Promise.all([
    fetchChanges({ scope, group, kinds, since, before, limit: 60 }),
    optional(fetchActivity({ scope, group, kinds, months: period.months })),
    optional(fetchScopes()).then((s) => s ?? EMPTY_SCOPES),
  ])
  const place = scopeLabel(scopes, scope)
  const href = (u: Record<string, string | null>) => pageHref('/changes', sp, { before: null, ...u })
  const periodTotal = (activity?.months ?? []).reduce((a, m) => a + m.opened + m.closed + m.changed, 0)
  const typeLabel = group ? TYPE_CHIPS.find((c) => c.value === group)?.label ?? groupDef(group).label : null
  const presetLabel = KIND_PRESETS.find((p) => p.key === preset)?.label.toLowerCase()

  return (
    <div className="mx-auto max-w-7xl px-4 py-8">
      <PageHeading
        eyebrow={displayName(place)}
        title="Changes"
        description={`What changed in ODS${scope ? ` in ${displayName(place)}` : ' across England'}. Monthly from TRUD releases until August 2026, then every 6 hours from the ODS API.`}
      >
        <AreaPicker scopes={scopes} tone="light" />
        <a href={apiUrl('/api/changes.rss', { scope, group, kinds, since })} className="inline-flex h-9 items-center gap-2 rounded-lg border bg-card px-3 text-sm shadow-sm hover:bg-accent">
          <Rss aria-hidden className="h-4 w-4 text-[#eb6834]" /> RSS
        </a>
      </PageHeading>

      <div className="mb-6 space-y-3">
        <div className="flex flex-wrap gap-2">
          <Segmented
            label="Kind of change"
            value={preset}
            options={KIND_PRESETS.map((p) => ({ value: p.key, label: p.label }))}
            hrefFor={(v) => href({ kinds: v === 'notable' ? null : v })}
          />
          <Segmented
            label="Period"
            value={period.value}
            options={PERIODS.map((p) => ({ value: p.value, label: p.label }))}
            hrefFor={(v) => href({ period: v === '90d' ? null : v })}
          />
        </div>
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Organisation type">
          {TYPE_CHIPS.map((c) => (
            <Link
              key={c.value || 'all'}
              href={href({ group: c.value || null })}
              aria-current={group === c.value ? 'true' : undefined}
              className={cn(
                'rounded-full border px-3 py-1 text-sm transition',
                group === c.value ? 'border-primary bg-primary text-primary-foreground' : 'bg-card hover:bg-accent',
              )}
            >
              {c.label}
            </Link>
          ))}
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <ChangeList
            grouped
            items={feed.items}
            empty={`No ${presetLabel ?? ''} changes${typeLabel ? ` to ${typeLabel.toLowerCase()}` : ''} in this period. Try a longer period or another type.`}
          />
          {feed.nextBefore ? (
            <div className="mt-6 text-center">
              <Link href={pageHref('/changes', sp, { before: String(feed.nextBefore) })} className="inline-flex h-9 items-center rounded-lg border bg-card px-4 text-sm font-medium shadow-sm hover:bg-accent">
                Older changes
              </Link>
            </div>
          ) : null}
        </div>
        <div className="space-y-6 lg:sticky lg:top-24 lg:self-start">
          <Panel title="Changes per month" action={<span className="text-xs text-muted-foreground">{period.months === 100 ? 'Since 2018' : 'Last 12 months'}</span>}>
            {activity ? (
              <>
                <ActivityChart data={activity.months} height={200} />
                <p className="mt-3 text-xs text-muted-foreground">
                  {formatNumber(periodTotal)} {preset === 'all' ? '' : `${presetLabel} `}changes
                  {typeLabel ? ` to ${typeLabel.toLowerCase()}` : ''} in this window. Before September 2026 changes are dated to the monthly release that first showed them, so months with big NHS reorganisations spike.
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
