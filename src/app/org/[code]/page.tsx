import type { Metadata } from 'next'
import type { ReactNode } from 'react'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ChevronRight, ExternalLink, Globe, Info, MapPin, Phone, Rss } from 'lucide-react'
import { ChangeList } from '@/components/change-list'
import { CopyButton } from '@/components/copy-button'
import { EmptyState, Pagination, Panel, Segmented } from '@/components/field'
import { GroupBadge, GroupIcon } from '@/components/group-badge'
import { Lifeline } from '@/components/lifeline'
import { OrgLink, orgHref } from '@/components/org-link'
import { StatusBadge } from '@/components/status-badge'
import { API_BASE, apiUrl, fetchChildren, fetchOrg, optional } from '@/lib/api'
import { formatDate, formatNumber, formatRange } from '@/lib/format'
import { groupDef } from '@/lib/groups'
import { firstParam, pageHref, type Query } from '@/lib/href'
import { displayAddress, displayName } from '@/lib/names'
import { codeParam, groupParam, offsetParam, oneOf } from '@/lib/params'
import { inverseRelLabel, relLabel } from '@/lib/rels'
import { cn } from '@/lib/utils'
import type { OrgDetail, OrgRef, OrgRelInfo } from '../../../../worker/src/api/types'

type Params = Promise<{ code: string }>

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const code = codeParam(decodeURIComponent((await params).code))
  if (!code) notFound()
  // Unknown codes 404 here, before any HTML streams; an unavailable API only loses the title.
  let detail: OrgDetail | null
  try {
    detail = await fetchOrg(code)
  } catch {
    return { title: code }
  }
  if (!detail) notFound()
  return { title: `${displayName(detail.org.name)} (${detail.org.code})` }
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
      <dd className="mt-0.5 wrap-break-word text-sm">{children}</dd>
    </div>
  )
}

const inlineLink = 'text-primary underline decoration-primary/40 underline-offset-2 hover:decoration-primary'

function Crumbs({ detail }: { detail: OrgDetail }) {
  const h = detail.hierarchy
  const chain: OrgRef[] = [h.region, h.icb, h.sicbl, h.pcn].filter((x): x is OrgRef => !!x && x.code !== detail.org.code)
  if (detail.parent && !chain.some((c) => c.code === detail.parent!.code) && detail.parent.code !== detail.org.code) chain.push(detail.parent)
  if (!chain.length) return null
  return (
    <nav aria-label="Breadcrumb" className="flex flex-wrap items-center gap-1 text-xs text-muted-foreground">
      <Link href="/areas" className="py-1 hover:text-foreground">England</Link>
      {chain.map((c) => (
        <span key={c.code} className="inline-flex items-center gap-1">
          <ChevronRight aria-hidden className="h-3 w-3" />
          <Link href={orgHref(c.code)} className="py-1 hover:text-foreground hover:underline">
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

// ODS records operational and legal dates separately; either may be missing.
const dateRange = (start: string | null, end: string | null) => (start || end ? formatRange(start, end) : '—')

function RelTable({ rows }: { rows: OrgRelInfo[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="text-left text-xs text-muted-foreground">
          <tr className="border-b">
            <th className="py-2 pr-3 font-medium">Organisation</th>
            <th className="py-2 pr-3 font-medium">Relationship</th>
            <th className="py-2 pr-3 font-medium">Operational</th>
            <th className="hidden py-2 pr-3 font-medium md:table-cell">Legal</th>
            <th className="py-2 font-medium">ODS status</th>
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
                {r.orgStatus && r.orgStatus !== 'Active' ? <span className="ml-6 text-xs text-muted-foreground">Organisation closed</span> : null}
              </td>
              <td className="py-2 pr-3 text-muted-foreground">
                {relLabel(r)} <span className="font-mono text-xs">{r.type.code}</span>
              </td>
              <td className="whitespace-nowrap py-2 pr-3 tabular">{dateRange(r.opStart, r.opEnd)}</td>
              <td className="hidden whitespace-nowrap py-2 pr-3 tabular md:table-cell">{dateRange(r.legalStart, r.legalEnd)}</td>
              <td className="py-2">
                <StatusBadge status={r.status ?? (r.opEnd ? 'Inactive' : 'Active')} labels={['Current', 'Ended']} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// What the linked-organisations list is called for each kind of org.
function membersLabel(detail: OrgDetail): { tab: string; title: string; note: string } {
  const g = detail.org.group
  if (g === 'pcn') return { tab: 'Members', title: 'Members', note: 'Practices and other organisations recorded as partners of this PCN.' }
  if (g === 'trust' || g === 'independent') return { tab: 'Sites', title: 'Sites and services', note: 'Sites and services this organisation operates.' }
  if (g === 'gp') return { tab: 'Sites', title: 'Branches and sites', note: 'Branch surgeries and other sites linked to this practice.' }
  return {
    tab: 'Linked',
    title: 'Linked organisations',
    note: detail.area
      ? 'Organisations with a direct ODS relationship to this one (commissioned, operated or constituent). For everything located in the area, use In this area.'
      : 'Organisations with a direct ODS relationship to this one.',
  }
}

const chip = (on: boolean) =>
  cn('inline-flex min-h-8 items-center gap-1.5 rounded-full border px-3 py-1 text-sm', on ? 'border-primary bg-primary text-primary-foreground' : 'bg-card hover:bg-accent')

async function Members({ detail, sp }: { detail: OrgDetail; sp: Query }) {
  const group = groupParam(sp.group)
  const status = oneOf(sp.status, ['current', 'past', 'all'] as const, 'current')
  // Absent in data cached before the API added it; treat as no breakdown rather than fail.
  const childRels = detail.childRels ?? []
  const relRaw = firstParam(sp.rel)?.toUpperCase()
  const rel = relRaw && childRels.some((r) => r.type.code === relRaw) ? relRaw : undefined
  const offset = offsetParam(sp.offset)
  const list = await optional(fetchChildren(detail.org.code, { group, rel, status, limit: 50, offset }))
  if (!list) return <EmptyState>Members could not be loaded just now. Refresh to try again.</EmptyState>
  const base = `/org/${detail.org.code}`
  const href = (u: Record<string, string | null>) => pageHref(base, sp, { tab: 'members', offset: null, ...u })
  const { note } = membersLabel(detail)

  // Chip counts follow the status toggle and the other filter.
  const byStatus = (c: { active: number; total: number }) => (status === 'current' ? c.active : status === 'past' ? c.total - c.active : c.total)
  const relRows = (type?: string, g?: string) => childRels.filter((r) => (!type || r.type.code === type) && (!g || r.group === g))
  const sum = (rows: { active: number; total: number }[]) => rows.reduce((a, r) => a + byStatus(r), 0)
  const groupCount = (g?: string) => (rel ? sum(relRows(rel, g)) : sum(detail.childGroups.filter((c) => !g || c.group === g)))
  const relTypes = [...new Map(childRels.map((r) => [r.type.code, r.type])).values()]
    .map((t) => ({ ...t, count: sum(relRows(t.code, group)) }))
    .filter((t) => t.count > 0 || t.code === rel)
    .sort((a, b) => b.count - a.count)

  return (
    <div className="space-y-4">
      <p className="flex items-start gap-2 text-sm text-muted-foreground">
        <Info aria-hidden className="mt-0.5 h-4 w-4 shrink-0" />
        {note}
      </p>
      {relTypes.length > 1 ? (
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Relationship type">
            <Link href={href({ rel: null })} className={chip(!rel)}>Any relationship</Link>
            {relTypes.map((t) => (
              <Link key={t.code} href={href({ rel: t.code })} className={chip(rel === t.code)} title={`ODS relationship ${t.code}: ${t.name ?? ''}`}>
                {inverseRelLabel(t.code)} <span className="tabular opacity-80">{formatNumber(t.count)}</span>
              </Link>
            ))}
          </div>
          <p className="text-xs text-muted-foreground">
            ODS lists relationships, so an organisation linked in two ways (for example in the area and a partner) counts under each type.
            &ldquo;Any relationship&rdquo; counts each organisation once.
          </p>
        </div>
      ) : null}
      <div className="flex flex-wrap items-center gap-2">
        <Link href={href({ group: null })} className={chip(!group)}>
          All <span className="tabular opacity-80">{formatNumber(groupCount())}</span>
        </Link>
        {detail.childGroups
          .map((g) => ({ group: g.group, count: groupCount(g.group) }))
          .filter((g) => g.count > 0 || g.group === group)
          .map((g) => (
            <Link key={g.group} href={href({ group: g.group })} className={chip(group === g.group)}>
              {groupDef(g.group).label} <span className="tabular opacity-80">{formatNumber(g.count)}</span>
            </Link>
          ))}
        <div className="sm:ml-auto">
          <Segmented
            label="Membership"
            value={status}
            options={[{ value: 'current', label: 'Current' }, { value: 'past', label: 'Past' }, { value: 'all', label: 'All' }]}
            hrefFor={(v) => href({ status: v === 'current' ? null : v })}
          />
        </div>
      </div>
      {list.items.length === 0 ? (
        <EmptyState>
          No {status === 'all' ? '' : `${status} `}linked organisations{group || rel ? ' matching these filters' : ''}.
          {status === 'current' ? ' Try Past or All.' : ''}
        </EmptyState>
      ) : (
        <ul className="divide-y rounded-xl border bg-card shadow-xs">
          {list.items.map((c) => (
            <li key={c.code} className="flex items-start gap-3 px-4 py-3">
              <GroupIcon group={c.group} className="mt-0.5" />
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
                  <span className="tabular"> · {formatRange(c.start, c.end)}</span>
                </p>
              </div>
            </li>
          ))}
        </ul>
      )}
      <Pagination pathname={base} query={{ ...sp, tab: 'members' }} total={list.total} offset={offset} limit={50} />
    </div>
  )
}

export default async function OrgPage({ params, searchParams }: { params: Params; searchParams: Promise<Query> }) {
  const [{ code: raw }, sp] = await Promise.all([params, searchParams])
  const code = codeParam(decodeURIComponent(raw))
  if (!code) notFound()
  const detail = await fetchOrg(code)
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
  const members = membersLabel(detail)
  const tabs: { key: Tab; label: string; short?: string; count?: number }[] = [
    { key: 'overview', label: 'Overview' },
    { key: 'timeline', label: 'Timeline', count: detail.events.length + detail.relatedEvents.length },
    ...(hasMembers ? [{ key: 'members' as const, label: members.tab, count: detail.childrenTotal }] : []),
    { key: 'relationships', label: 'Relationships', short: 'Links', count: detail.parents.length + detail.successions.length },
    { key: 'details', label: 'Details' },
  ]
  const view = firstParam(sp.view) === 'related' ? 'related' : 'own'
  const rss = apiUrl('/api/changes.rss', { code: org.code })

  // ODS can keep Status=Active after a legal end or succession (e.g. merged ICBs); say so plainly.
  const successor = detail.successions.find((s) => s.type === 'Successor' && s.date && s.date <= today)
  const legallyEnded = !!org.legalEnd && org.legalEnd <= today
  const ended = org.status === 'Active' && (legallyEnded || !!successor)
  // GP practices' primary role is the generic "prescribing cost centre"; the type says enough.
  const roleName = org.group !== 'gp' && org.primaryRole && displayName(org.primaryRole.name).toLowerCase() !== def.singular.toLowerCase()
    ? displayName(org.primaryRole.name)
    : null

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
                <StatusBadge status={ended ? 'Inactive' : org.status} labels={['Active', ended ? 'Ended' : 'Closed']} />
              </div>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-2 text-sm text-muted-foreground">
                <CopyButton value={org.code} />
                <span>{def.singular}</span>
                {roleName ? <span>· {roleName}</span> : null}
                <a
                  rel="nofollow" href={rss}
                  className="inline-flex min-h-7 items-center gap-1.5 rounded-md border bg-card px-2 text-sm shadow-xs hover:bg-accent"
                  title="Subscribe in Outlook, Feedly or any RSS reader to hear about changes"
                >
                  <Rss aria-hidden className="h-3.5 w-3.5 text-[#eb6834]" /> Follow changes
                </a>
              </div>
              {ended ? (
                <p className="flex items-start gap-2 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900 ring-1 ring-inset ring-amber-200">
                  <Info aria-hidden className="mt-0.5 h-4 w-4 shrink-0" />
                  <span>
                    {legallyEnded ? `Legally ended ${formatDate(org.legalEnd)}` : 'Replaced'}
                    {successor ? <>; succeeded by <OrgLink org={successor.org} className="font-medium" /> from {formatDate(successor.date)}</> : null}.
                    {' '}ODS still lists its status as Active.
                  </span>
                </p>
              ) : null}
            </div>
          </div>
          <dl className="grid gap-x-8 gap-y-4 pb-5 sm:grid-cols-2 lg:grid-cols-4">
            <Fact label={org.opEnd ? 'Open' : 'Opened'}>
              {org.opEnd ? formatRange(org.opStart, org.opEnd) : formatDate(org.opStart)}
              {org.opStart ? <span className="text-muted-foreground"> · {yearsSince(org.opStart, org.opEnd)}</span> : null}
            </Fact>
            <Fact label="Address" icon={<MapPin aria-hidden className="h-3 w-3" />}>
              {displayAddress([...org.address, org.town, org.county]) || '—'}
              {org.postcode ? (
                <>
                  {', '}
                  <a className={inlineLink} href={`https://www.google.com/maps/search/${encodeURIComponent(org.postcode)}`} target="_blank" rel="noreferrer">
                    {org.postcode}<span className="sr-only"> (opens map in a new tab)</span>
                  </a>
                </>
              ) : null}
            </Fact>
            <Fact label="Contact" icon={<Phone aria-hidden className="h-3 w-3" />}>
              {org.tel ? <a href={`tel:${org.tel.replace(/\s/g, '')}`} className={inlineLink}>{org.tel}</a> : <span className="text-muted-foreground">No phone in ODS</span>}
              {website ? (
                <a href={website} target="_blank" rel="noreferrer" className={cn('mt-0.5 flex items-center gap-1 truncate', inlineLink)}>
                  <Globe aria-hidden className="h-3 w-3 shrink-0" />
                  <span className="truncate">{website.replace(/^https?:\/\/(www\.)?/, '').replace(/\/$/, '')}</span>
                  <span className="sr-only"> (opens in a new tab)</span>
                </a>
              ) : (
                <span className="mt-0.5 block text-xs text-muted-foreground">No website in ODS</span>
              )}
            </Fact>
            <Fact label="Last changed in ODS">{formatDate(org.lastChange)}</Fact>
          </dl>
          {/* Scrolls sideways on narrow screens; the fade hints there is more. */}
          <div className="relative -mx-4 sm:mx-0">
            <nav
              aria-label="Sections"
              className="-mb-px flex gap-0.5 overflow-x-auto px-4 scrollbar-none sm:gap-1 sm:px-0 [&::-webkit-scrollbar]:hidden"
            >
              {tabs.map((t) => (
                <Link
                  key={t.key}
                  href={t.key === 'overview' ? base : `${base}?tab=${t.key}`}
                  aria-current={tab === t.key ? 'page' : undefined}
                  className={cn(
                    'inline-flex min-h-11 shrink-0 items-center gap-1.5 border-b-2 px-2.5 text-sm transition sm:px-3',
                    tab === t.key ? 'border-primary font-medium text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground',
                  )}
                >
                  {t.short ? (
                    <>
                      <span className="sm:hidden">{t.short}</span>
                      <span className="hidden sm:inline">{t.label}</span>
                    </>
                  ) : (
                    t.label
                  )}
                  {t.count ? <span className="hidden rounded-full bg-muted px-1.5 text-xs tabular sm:inline">{formatNumber(t.count)}</span> : null}
                </Link>
              ))}
            </nav>
            <div aria-hidden className="pointer-events-none absolute inset-y-0 right-0 w-6 bg-linear-to-l from-card sm:hidden" />
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-7xl px-4 py-6 sm:py-8">
        {tab === 'overview' ? (
          <div className="grid gap-6 lg:grid-cols-3 *:min-w-0">
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
                  <ChangeList hideOrg by="effective" items={[...detail.events].sort((a, b) => (b.effectiveDate ?? b.detectedAt).localeCompare(a.effectiveDate ?? a.detectedAt)).slice(0, 6)} className="rounded-none border-0 shadow-none" />
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
            {/* On phones, where the org sits comes before the history. */}
            <div className="order-first space-y-6 lg:order-0">
              <Panel title="Where it sits">
                <Hierarchy detail={detail} />
              </Panel>
              {detail.area?.some((g) => g.active > 0) ? (
                <Panel title="In this area" action={<span className="text-xs text-muted-foreground">Active</span>} bodyClassName="p-2">
                  <ul>
                    {detail.area.filter((g) => g.active > 0).map((g) => (
                      <li key={g.group}>
                        <Link href={`/explore?scope=${org.code}&group=${g.group}`} className="flex min-h-8 items-center gap-2 rounded-lg px-2 py-1.5 text-sm hover:bg-accent">
                          <GroupIcon group={g.group} size="xs" />
                          <span className="flex-1">{groupDef(g.group).label}</span>
                          <span className="tabular text-xs text-muted-foreground">{formatNumber(g.active)}</span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                  <div className="mt-1 flex flex-wrap gap-x-4 px-2 py-1.5 text-xs font-medium">
                    <Link href={`/explore?scope=${org.code}`} className="text-primary hover:underline">Explore all</Link>
                    <Link href={`/changes?scope=${org.code}`} className="text-primary hover:underline">Changes in this area</Link>
                  </div>
                </Panel>
              ) : null}
              {hasMembers ? (
                <Panel title={members.title} bodyClassName="p-2">
                  <ul>
                    {detail.childGroups.slice(0, 8).map((g) => (
                      <li key={g.group}>
                        <Link href={`${base}?tab=members&group=${g.group}`} className="flex min-h-8 items-center gap-2 rounded-lg px-2 py-1.5 text-sm hover:bg-accent">
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
                { value: 'own', label: `This organisation (${detail.events.length})` },
                { value: 'related', label: `Involving it (${detail.relatedEvents.length})` },
              ]}
              hrefFor={(v) => `${base}?tab=timeline${v === 'related' ? '&view=related' : ''}`}
            />
            <p className="text-xs text-muted-foreground">Grouped by the year each change took effect, newest first.</p>
            <ChangeList
              grouped
              by="effective"
              hideOrg={view !== 'related'}
              items={view === 'related' ? detail.relatedEvents : detail.events}
              empty="No changes recorded."
            />
            <a rel="nofollow" href={rss} className="inline-flex min-h-8 items-center gap-1.5 text-sm text-muted-foreground hover:text-primary">
              <Rss aria-hidden className="h-3.5 w-3.5" /> Follow changes to this organisation (RSS)
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
          <div className="grid gap-6 lg:grid-cols-3 *:min-w-0">
            <Panel title="Roles" className="lg:col-span-2">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="text-left text-xs text-muted-foreground">
                    <tr className="border-b">
                      <th className="py-2 pr-3 font-medium">Role</th>
                      <th className="py-2 pr-3 font-medium">Operational</th>
                      <th className="hidden py-2 pr-3 font-medium md:table-cell">Legal</th>
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
                        <td className="whitespace-nowrap py-2 pr-3 tabular">{dateRange(r.opStart, r.opEnd)}</td>
                        <td className="hidden whitespace-nowrap py-2 pr-3 tabular md:table-cell">{dateRange(r.legalStart, r.legalEnd)}</td>
                        <td className="py-2"><StatusBadge status={r.status} labels={['Active', 'Ended']} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Panel>
            <Panel title="Record">
              <dl className="space-y-3">
                <Fact label="ODS code"><span className="font-mono">{org.code}</span></Fact>
                <Fact label="Type"><GroupBadge group={org.group} /></Fact>
                <Fact label="ODS status">{org.status}</Fact>
                <Fact label="Record class">{org.recordClass === 'RC2' ? 'Site (RC2)' : 'Organisation (RC1)'}</Fact>
                {org.legalStart ? <Fact label="Legal dates">{formatRange(org.legalStart, org.legalEnd)}</Fact> : null}
                {org.country ? <Fact label="Country">{displayName(org.country)}</Fact> : null}
                {org.uprn ? <Fact label="UPRN (property reference)"><span className="font-mono">{org.uprn}</span></Fact> : null}
                <Fact label="Source records">
                  <span className="flex flex-col gap-1">
                    <a className={cn('inline-flex items-center gap-1', inlineLink)} href={`https://directory.spineservices.nhs.uk/ORD/2-0-0/organisations/${org.code}?_format=json`} target="_blank" rel="noreferrer">
                      Official ODS record <ExternalLink aria-hidden className="h-3 w-3" /><span className="sr-only"> (opens in a new tab)</span>
                    </a>
                    <a className={cn('inline-flex items-center gap-1', inlineLink)} href={`${API_BASE}/api/orgs/${org.code}`} target="_blank" rel="nofollow noreferrer">
                      This record as JSON <ExternalLink aria-hidden className="h-3 w-3" /><span className="sr-only"> (opens in a new tab)</span>
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
