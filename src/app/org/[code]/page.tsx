import type { Metadata } from 'next'
import type { ReactNode } from 'react'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ChevronRight, ExternalLink, Globe, MapPin, Phone, Rss } from 'lucide-react'
import { ChangeList } from '@/components/change-list'
import { CopyButton } from '@/components/copy-button'
import { EmptyState, Pagination, Panel, Segmented } from '@/components/field'
import { GroupBadge, GroupIcon } from '@/components/group-badge'
import { Lifeline } from '@/components/lifeline'
import { OrgLink, orgHref } from '@/components/org-link'
import { StatusBadge } from '@/components/status-badge'
import { API_BASE, apiUrl, fetchChildren, fetchOrg } from '@/lib/api'
import { formatDate, formatNumber, formatRange } from '@/lib/format'
import { groupDef } from '@/lib/groups'
import { firstParam, pageHref, type Query } from '@/lib/href'
import { displayAddress, displayName } from '@/lib/names'
import { inverseRelLabel, relLabel } from '@/lib/rels'
import { cn } from '@/lib/utils'
import type { OrgDetail, OrgRef, OrgRelInfo } from '../../../../worker/src/api/types'

type Params = Promise<{ code: string }>

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { code } = await params
  const detail = await fetchOrg(code.toUpperCase())
  return { title: detail ? `${displayName(detail.org.name)} (${detail.org.code})` : code.toUpperCase() }
}

const TABS = ['overview', 'timeline', 'members', 'relationships', 'details'] as const
type Tab = (typeof TABS)[number]

function yearsSince(iso: string | null, until?: string | null): string | null {
  if (!iso) return null
  const end = until ? new Date(until) : new Date()
  const years = Math.floor((end.getTime() - new Date(iso).getTime()) / (365.25 * 86_400_000))
  return years >= 1 ? `${years} year${years === 1 ? '' : 's'}` : 'under a year'
}

function Fact({ label, children, icon }: { label: string; children: ReactNode; icon?: ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="flex items-center gap-1.5 text-xs text-muted-foreground">{icon}{label}</dt>
      <dd className="mt-0.5 break-words text-sm">{children}</dd>
    </div>
  )
}

function Crumbs({ detail }: { detail: OrgDetail }) {
  const h = detail.hierarchy
  const chain: OrgRef[] = [h.region, h.icb, h.sicbl, h.pcn].filter((x): x is OrgRef => !!x && x.code !== detail.org.code)
  if (detail.parent && !chain.some((c) => c.code === detail.parent!.code) && detail.parent.code !== detail.org.code) chain.push(detail.parent)
  if (!chain.length) return null
  return (
    <nav aria-label="Where it sits" className="flex flex-wrap items-center gap-1 text-xs text-muted-foreground">
      <Link href="/areas" className="hover:text-foreground">England</Link>
      {chain.map((c) => (
        <span key={c.code} className="inline-flex items-center gap-1">
          <ChevronRight aria-hidden className="h-3 w-3" />
          <Link href={orgHref(c.code)} className="hover:text-foreground hover:underline">
            {displayName(c.name)?.replace(/ Commissioning Region$/i, '') || c.code}
          </Link>
        </span>
      ))}
    </nav>
  )
}

function Hierarchy({ detail }: { detail: OrgDetail }) {
  const h = detail.hierarchy
  const rows: [string, OrgRef | null, Parameters<typeof GroupIcon>[0]['group']][] = [
    ['Region', h.region, 'commissioner'],
    ['ICB', h.icb, 'commissioner'],
    ['Sub-ICB location', h.sicbl, 'commissioner'],
    ['PCN', h.pcn, 'pcn'],
    ['Operated by', detail.parent, null],
  ]
  // Skip the operator when it is already shown as an area level (e.g. a practice's Sub-ICB).
  const areaCodes = new Set([h.region, h.icb, h.sicbl, h.pcn].map((r) => r?.code))
  const present = rows.filter(([label, r]) => r && r.code !== detail.org.code && (label !== 'Operated by' || !areaCodes.has(r.code)))
  if (!present.length) return <p className="text-sm text-muted-foreground">No area or parent recorded in ODS.</p>
  return (
    <ol className="relative space-y-3 before:absolute before:bottom-3 before:left-[13px] before:top-3 before:w-px before:bg-border">
      {present.map(([label, r, g]) => (
        <li key={label} className="relative flex items-center gap-3">
          <GroupIcon group={g ?? 'other'} className="relative ring-4 ring-card" />
          <div className="min-w-0">
            <p className="text-xs text-muted-foreground">{label}</p>
            <OrgLink org={r} className="text-sm font-medium" />
          </div>
        </li>
      ))}
    </ol>
  )
}

function RelTable({ rows }: { rows: OrgRelInfo[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="text-left text-xs text-muted-foreground">
          <tr className="border-b">
            <th className="py-2 pr-3 font-medium">Organisation</th>
            <th className="py-2 pr-3 font-medium">Relationship</th>
            <th className="py-2 pr-3 font-medium">Dates</th>
            <th className="py-2 font-medium">Status</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id} className="border-b last:border-0">
              <td className="py-2 pr-3">
                <span className="flex items-center gap-2">
                  <GroupIcon group={r.orgGroup} size="xs" />
                  <OrgLink org={r.org} />
                </span>
              </td>
              <td className="whitespace-nowrap py-2 pr-3 text-muted-foreground">{relLabel(r)}</td>
              <td className="whitespace-nowrap py-2 pr-3 tabular">{formatRange(r.opStart ?? r.legalStart, r.opEnd)}</td>
              <td className="py-2"><StatusBadge status={r.opEnd ? 'Inactive' : 'Active'} labels={['Current', 'Ended']} /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

async function Members({ detail, sp }: { detail: OrgDetail; sp: Query }) {
  const group = firstParam(sp.group)
  const status = firstParam(sp.status) ?? 'current'
  const offset = Number(firstParam(sp.offset) ?? 0) || 0
  const list = await fetchChildren(detail.org.code, { group, status, limit: 50, offset })
  const base = `/org/${detail.org.code}`
  const href = (u: Record<string, string | null>) => pageHref(base, sp, { tab: 'members', offset: null, ...u })
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Link href={href({ group: null })} className={cn('rounded-full border px-3 py-1 text-sm', !group ? 'border-primary bg-primary text-primary-foreground' : 'bg-card hover:bg-accent')}>
          All <span className="tabular opacity-80">{formatNumber(detail.childrenTotal)}</span>
        </Link>
        {detail.childGroups.map((g) => (
          <Link
            key={g.group}
            href={href({ group: g.group })}
            className={cn('inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-sm', group === g.group ? 'border-primary bg-primary text-primary-foreground' : 'bg-card hover:bg-accent')}
          >
            {groupDef(g.group).label} <span className="tabular opacity-80">{formatNumber(g.total)}</span>
          </Link>
        ))}
        <div className="ml-auto">
          <Segmented
            label="Membership"
            value={status}
            options={[{ value: 'current', label: 'Current' }, { value: 'past', label: 'Past' }, { value: 'all', label: 'All' }]}
            hrefFor={(v) => href({ status: v === 'current' ? null : v })}
          />
        </div>
      </div>
      {list.items.length === 0 ? (
        <EmptyState>No {status === 'past' ? 'past' : status === 'all' ? '' : 'current'} members of this type.</EmptyState>
      ) : (
        <ul className="divide-y rounded-xl border bg-card shadow-sm">
          {list.items.map((c) => (
            <li key={c.code} className="flex items-center gap-3 px-4 py-2.5">
              <GroupIcon group={c.group} />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-x-2">
                  <Link href={orgHref(c.code)} className={cn('font-medium hover:text-primary hover:underline', c.status !== 'Active' && 'text-muted-foreground')}>
                    {displayName(c.name)}
                  </Link>
                  <span className="font-mono text-xs text-muted-foreground">{c.code}</span>
                  {c.status !== 'Active' ? <StatusBadge status={c.status} /> : null}
                </div>
                <p className="text-xs text-muted-foreground">
                  {groupDef(c.group).singular} · {c.relTypes.map((t) => inverseRelLabel(t.code)).join(', ')}
                </p>
              </div>
              <p className="hidden shrink-0 text-right text-xs tabular text-muted-foreground sm:block">{formatRange(c.start, c.end)}</p>
            </li>
          ))}
        </ul>
      )}
      <Pagination pathname={base} query={{ ...sp, tab: 'members' }} total={list.total} offset={offset} limit={50} />
    </div>
  )
}

export default async function OrgPage({ params, searchParams }: { params: Params; searchParams: Promise<Query> }) {
  const [{ code }, sp] = await Promise.all([params, searchParams])
  const detail = await fetchOrg(code.toUpperCase())
  if (!detail) notFound()
  const { org } = detail
  const def = groupDef(org.group)
  const hasMembers = detail.childrenTotal > 0
  const requested = firstParam(sp.tab) as Tab | undefined
  const tab: Tab = requested && TABS.includes(requested) && (requested !== 'members' || hasMembers) ? requested : 'overview'
  const base = `/org/${org.code}`
  const website = org.url ? (/^https?:\/\//i.test(org.url) ? org.url.toLowerCase() : `https://${org.url.toLowerCase()}`) : null
  const today = new Date().toISOString().slice(0, 10)
  const current = detail.parents.filter((r) => !r.opEnd)
  const past = detail.parents.filter((r) => r.opEnd)
  const tabs: { key: Tab; label: string; count?: number }[] = [
    { key: 'overview', label: 'Overview' },
    { key: 'timeline', label: 'Timeline', count: detail.events.length + detail.relatedEvents.length },
    ...(hasMembers ? [{ key: 'members' as const, label: org.group === 'trust' ? 'Sites' : 'Members', count: detail.childrenTotal }] : []),
    { key: 'relationships', label: 'Relationships', count: detail.parents.length + detail.successions.length },
    { key: 'details', label: 'Details' },
  ]
  const view = firstParam(sp.view) === 'related' ? 'related' : 'own'

  return (
    <article>
      <header className="border-b bg-card">
        <div className="mx-auto max-w-7xl space-y-5 px-4 pb-0 pt-6">
          <Crumbs detail={detail} />
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
            <GroupIcon group={org.group} size="lg" />
            <div className="min-w-0 flex-1 space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">{displayName(org.name)}</h1>
                <StatusBadge status={org.status} />
              </div>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-2 text-sm text-muted-foreground">
                <CopyButton value={org.code} />
                <span>{def.singular}</span>
                {org.primaryRole && displayName(org.primaryRole.name).toLowerCase() !== def.singular.toLowerCase() ? (
                  <span>· {displayName(org.primaryRole.name)}</span>
                ) : null}
              </div>
            </div>
          </div>
          <dl className="grid gap-x-8 gap-y-4 pb-5 sm:grid-cols-2 lg:grid-cols-4">
            <Fact label={org.opEnd ? 'Open' : 'Opened'}>
              {org.opEnd ? formatRange(org.opStart, org.opEnd) : formatDate(org.opStart)}
              {org.opStart ? <span className="text-muted-foreground"> · {yearsSince(org.opStart, org.opEnd)}</span> : null}
            </Fact>
            <Fact label="Address" icon={<MapPin aria-hidden className="h-3 w-3" />}>
              {displayAddress([...org.address, org.town]) || '—'}
              {org.postcode ? (
                <>
                  {', '}
                  <a className="text-primary hover:underline" href={`https://www.google.com/maps/search/${encodeURIComponent(org.postcode)}`} target="_blank" rel="noreferrer">
                    {org.postcode}
                  </a>
                </>
              ) : null}
            </Fact>
            <Fact label="Contact" icon={<Phone aria-hidden className="h-3 w-3" />}>
              {org.tel ? <a href={`tel:${org.tel.replace(/\s/g, '')}`} className="hover:text-primary">{org.tel}</a> : '—'}
              {website ? (
                <a href={website} target="_blank" rel="noreferrer" className="mt-0.5 flex items-center gap-1 truncate text-primary hover:underline">
                  <Globe aria-hidden className="h-3 w-3 shrink-0" />
                  <span className="truncate">{website.replace(/^https?:\/\/(www\.)?/, '').replace(/\/$/, '')}</span>
                </a>
              ) : null}
            </Fact>
            <Fact label="Last changed in ODS">{formatDate(org.lastChange)}</Fact>
          </dl>
          <nav aria-label="Sections" className="-mb-px flex gap-1 overflow-x-auto">
            {tabs.map((t) => (
              <Link
                key={t.key}
                href={t.key === 'overview' ? base : `${base}?tab=${t.key}`}
                aria-current={tab === t.key ? 'page' : undefined}
                className={cn(
                  'inline-flex shrink-0 items-center gap-1.5 border-b-2 px-3 py-2.5 text-sm transition',
                  tab === t.key ? 'border-primary font-medium text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground',
                )}
              >
                {t.label}
                {t.count ? <span className="rounded-full bg-muted px-1.5 text-xs tabular">{formatNumber(t.count)}</span> : null}
              </Link>
            ))}
          </nav>
        </div>
      </header>

      <div className="mx-auto max-w-7xl px-4 py-8">
        {tab === 'overview' ? (
          <div className="grid gap-6 lg:grid-cols-3">
            <div className="space-y-6 lg:col-span-2">
              {detail.parents.some((r) => r.opStart ?? r.legalStart) ? (
                <Panel title="Relationship history" action={<Link href={`${base}?tab=relationships`} className="text-xs font-medium text-primary hover:underline">Table</Link>}>
                  <Lifeline rels={detail.parents} today={today} />
                </Panel>
              ) : null}
              <Panel
                title="Recent changes"
                action={detail.events.length > 6 ? <Link href={`${base}?tab=timeline`} className="text-xs font-medium text-primary hover:underline">All {detail.events.length}</Link> : null}
                bodyClassName="p-0"
              >
                {detail.events.length ? (
                  <ChangeList hideOrg items={detail.events.slice(0, 6)} className="rounded-none border-0 shadow-none" />
                ) : (
                  <p className="p-4 text-sm text-muted-foreground">No changes recorded since the history began.</p>
                )}
              </Panel>
              {detail.relatedEvents.length ? (
                <Panel
                  title={`Changes involving ${displayName(org.name)}`}
                  action={<Link href={`${base}?tab=timeline&view=related`} className="text-xs font-medium text-primary hover:underline">All</Link>}
                  bodyClassName="p-0"
                >
                  <ChangeList items={detail.relatedEvents.slice(0, 6)} className="rounded-none border-0 shadow-none" />
                </Panel>
              ) : null}
            </div>
            <div className="space-y-6">
              <Panel title="Where it sits">
                <Hierarchy detail={detail} />
              </Panel>
              {detail.area?.length ? (
                <Panel title="In this area" bodyClassName="p-2">
                  <ul>
                    {detail.area.slice(0, 10).map((g) => (
                      <li key={g.group}>
                        <Link href={`/explore?scope=${org.code}&group=${g.group}`} className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm hover:bg-accent">
                          <GroupIcon group={g.group} size="xs" />
                          <span className="flex-1">{groupDef(g.group).label}</span>
                          <span className="tabular text-xs text-muted-foreground">{formatNumber(g.active)}</span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                  <Link href={`/changes?scope=${org.code}`} className="mt-1 block rounded-lg px-2 py-1.5 text-xs font-medium text-primary hover:bg-accent">
                    Changes in this area →
                  </Link>
                </Panel>
              ) : null}
              {hasMembers ? (
                <Panel title={org.group === 'trust' ? 'Sites and services' : 'Members'} bodyClassName="p-2">
                  <ul>
                    {detail.childGroups.slice(0, 8).map((g) => (
                      <li key={g.group}>
                        <Link href={`${base}?tab=members&group=${g.group}`} className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm hover:bg-accent">
                          <GroupIcon group={g.group} size="xs" />
                          <span className="flex-1">{groupDef(g.group).label}</span>
                          <span className="tabular text-xs text-muted-foreground">
                            {formatNumber(g.active)} current{g.total > g.active ? ` · ${formatNumber(g.total - g.active)} past` : ''}
                          </span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                </Panel>
              ) : null}
              {detail.successions.length ? (
                <Panel title="Successions" bodyClassName="p-3">
                  <ul className="space-y-2 text-sm">
                    {detail.successions.map((s) => (
                      <li key={s.id}>
                        <p className="text-xs text-muted-foreground">{s.type === 'Successor' ? 'Succeeded by' : 'Predecessor'} · {formatDate(s.date)}</p>
                        <OrgLink org={s.org} />
                      </li>
                    ))}
                  </ul>
                </Panel>
              ) : null}
            </div>
          </div>
        ) : null}

        {tab === 'timeline' ? (
          <div className="mx-auto max-w-3xl space-y-4">
            <Segmented
              label="Timeline"
              value={view}
              options={[
                { value: 'own', label: `Changes to this organisation (${detail.events.length})` },
                { value: 'related', label: `Involving it (${detail.relatedEvents.length})` },
              ]}
              hrefFor={(v) => `${base}?tab=timeline${v === 'related' ? '&view=related' : ''}`}
            />
            <ChangeList
              grouped
              hideOrg={view !== 'related'}
              items={view === 'related' ? detail.relatedEvents : detail.events}
              empty="No changes recorded."
            />
            <a href={apiUrl('/api/changes.rss', { code: org.code })} className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-primary">
              <Rss aria-hidden className="h-3.5 w-3.5" /> RSS feed for this organisation
            </a>
          </div>
        ) : null}

        {tab === 'members' ? <Members detail={detail} sp={sp} /> : null}

        {tab === 'relationships' ? (
          <div className="space-y-6">
            <Panel title={`Current relationships (${current.length})`}>
              {current.length ? <RelTable rows={current} /> : <p className="text-sm text-muted-foreground">None.</p>}
            </Panel>
            {past.length ? (
              <Panel title={`Past relationships (${past.length})`}>
                <RelTable rows={past} />
              </Panel>
            ) : null}
            {detail.successions.length ? (
              <Panel title="Successions">
                <ul className="divide-y text-sm">
                  {detail.successions.map((s) => (
                    <li key={s.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                      <span>
                        <span className="text-muted-foreground">{s.type === 'Successor' ? 'Succeeded by ' : 'Predecessor: '}</span>
                        <OrgLink org={s.org} />
                      </span>
                      <span className="tabular text-muted-foreground">{formatDate(s.date)}</span>
                    </li>
                  ))}
                </ul>
              </Panel>
            ) : null}
          </div>
        ) : null}

        {tab === 'details' ? (
          <div className="grid gap-6 lg:grid-cols-3">
            <Panel title="Roles" className="lg:col-span-2">
              <table className="w-full text-sm">
                <thead className="text-left text-xs text-muted-foreground">
                  <tr className="border-b">
                    <th className="py-2 pr-3 font-medium">Role</th>
                    <th className="py-2 pr-3 font-medium">Dates</th>
                    <th className="py-2 font-medium">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {detail.roles.map((r) => (
                    <tr key={r.id} className="border-b last:border-0">
                      <td className="py-2 pr-3">
                        {displayName(r.role.name) || r.role.code} <span className="font-mono text-xs text-muted-foreground">{r.role.code}</span>
                        {r.primary ? <span className="ml-2 rounded bg-accent px-1.5 py-0.5 text-[11px] font-medium text-accent-foreground">Primary</span> : null}
                      </td>
                      <td className="whitespace-nowrap py-2 pr-3 tabular">{formatRange(r.opStart, r.opEnd)}</td>
                      <td className="py-2"><StatusBadge status={r.status} labels={['Active', 'Ended']} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Panel>
            <Panel title="Record">
              <dl className="space-y-3">
                <Fact label="ODS code"><span className="font-mono">{org.code}</span></Fact>
                <Fact label="Type"><GroupBadge group={org.group} /></Fact>
                <Fact label="Record class">{org.recordClass === 'RC2' ? 'Site (RC2)' : 'Organisation (RC1)'}</Fact>
                {org.legalStart ? <Fact label="Legal dates">{formatRange(org.legalStart, org.legalEnd)}</Fact> : null}
                {org.uprn ? <Fact label="UPRN"><span className="font-mono">{org.uprn}</span></Fact> : null}
                <Fact label="Links">
                  <span className="flex flex-col gap-1">
                    <a className="inline-flex items-center gap-1 text-primary hover:underline" href={`https://directory.spineservices.nhs.uk/ORD/2-0-0/organisations/${org.code}?_format=json`} target="_blank" rel="noreferrer">
                      ORD record <ExternalLink aria-hidden className="h-3 w-3" />
                    </a>
                    <a className="inline-flex items-center gap-1 text-primary hover:underline" href={`${API_BASE}/api/orgs/${org.code}`} target="_blank" rel="noreferrer">
                      Tracker API <ExternalLink aria-hidden className="h-3 w-3" />
                    </a>
                  </span>
                </Fact>
              </dl>
            </Panel>
          </div>
        ) : null}
      </div>
    </article>
  )
}
