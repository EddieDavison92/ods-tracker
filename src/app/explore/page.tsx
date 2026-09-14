import type { Metadata } from 'next'
import Link from 'next/link'
import { Download, Search } from 'lucide-react'
import { AreaPicker } from '@/components/area-picker'
import { scopeLabel } from '@/lib/scopes'
import { EmptyState, PageHeading, Pagination, Segmented, fieldClass } from '@/components/field'
import { GroupIcon } from '@/components/group-badge'
import { OrgLink, orgHref } from '@/components/org-link'
import { StatusBadge } from '@/components/status-badge'
import { apiUrl, fetchFacets, fetchOrgs, fetchPractices, fetchScopes } from '@/lib/api'
import { formatDate, formatNumber } from '@/lib/format'
import { GROUPS, groupDef, type GroupKey } from '@/lib/groups'
import { firstParam, pageHref, type Query } from '@/lib/href'
import { displayName } from '@/lib/names'
import { cn } from '@/lib/utils'
import type { OrgListRow, PracticeRow } from '../../../worker/src/api/types'

export const metadata: Metadata = { title: 'Explore' }

const PAGE = 50

function Context({ row }: { row: OrgListRow }) {
  const bits: React.ReactNode[] = []
  if (row.parent && row.parent.code !== row.pcn?.code) {
    bits.push(<span key="p">Part of <OrgLink org={row.parent} showCode={false} className="text-foreground/80" /></span>)
  }
  if (row.pcn && row.group !== 'pcn') bits.push(<span key="pcn"><OrgLink org={row.pcn} showCode={false} className="text-foreground/80" /></span>)
  const area = row.sicbl ?? row.icb
  if (area && row.group !== 'commissioner') {
    bits.push(<span key="a">{displayName(area.name)}</span>)
  }
  if (!bits.length) return null
  return (
    <p className="flex min-w-0 flex-wrap gap-x-2 truncate text-xs text-muted-foreground">
      {bits.map((b, i) => (
        <span key={i} className="inline-flex min-w-0 items-center gap-2 truncate">
          {i > 0 ? <span aria-hidden>·</span> : null}
          {b}
        </span>
      ))}
    </p>
  )
}

function OrgRow({ row }: { row: OrgListRow }) {
  const closed = row.status !== 'Active'
  return (
    <li className="flex gap-3 px-4 py-3 transition hover:bg-accent/40">
      <GroupIcon group={row.group} className="mt-0.5" />
      <div className="min-w-0 flex-1 space-y-0.5">
        <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
          <Link href={orgHref(row.code)} className={cn('min-w-0 truncate font-medium hover:text-primary hover:underline', closed && 'text-muted-foreground')}>
            {displayName(row.name)}
          </Link>
          <span className="font-mono text-xs text-muted-foreground">{row.code}</span>
          {closed ? <StatusBadge status={row.status} /> : null}
        </div>
        <p className="truncate text-xs text-muted-foreground">
          {displayName(row.primaryRole?.name) || groupDef(row.group).singular}
          {row.town ? ` · ${displayName(row.town)}` : ''}
          {row.postcode ? ` · ${row.postcode}` : ''}
        </p>
        <Context row={row} />
      </div>
      <div className="hidden shrink-0 text-right text-xs text-muted-foreground sm:block">
        {row.opEnd ? <p>Closed {formatDate(row.opEnd)}</p> : <p>Opened {formatDate(row.opStart)}</p>}
      </div>
    </li>
  )
}

function PracticeAsAtRow({ row }: { row: PracticeRow }) {
  return (
    <li className="flex gap-3 px-4 py-3">
      <GroupIcon group="gp" className="mt-0.5" />
      <div className="min-w-0 flex-1 space-y-0.5">
        <div className="flex flex-wrap items-center gap-x-2">
          <Link href={orgHref(row.code)} className="font-medium hover:text-primary hover:underline">{displayName(row.name)}</Link>
          <span className="font-mono text-xs text-muted-foreground">{row.code}</span>
        </div>
        <p className="flex flex-wrap gap-x-2 text-xs text-muted-foreground">
          <span>PCN: {row.pcn ? <OrgLink org={row.pcn} showCode={false} className="text-foreground/80" /> : 'none'}</span>
          <span>· Sub-ICB: {row.sicbl ? <OrgLink org={row.sicbl} showCode={false} className="text-foreground/80" /> : '—'}</span>
          {row.icb ? <span>· ICB: <OrgLink org={row.icb} showCode={false} className="text-foreground/80" /></span> : null}
        </p>
      </div>
      <div className="hidden shrink-0 text-right text-xs text-muted-foreground sm:block">
        <p>Status now: {row.status === 'Active' ? 'Active' : 'Closed'}</p>
      </div>
    </li>
  )
}

export default async function ExplorePage({ searchParams }: { searchParams: Promise<Query> }) {
  const sp = await searchParams
  const q = firstParam(sp.q)?.trim() ?? ''
  const group = firstParam(sp.group) as GroupKey | undefined
  const scope = firstParam(sp.scope)
  const status = firstParam(sp.status) ?? 'active'
  const sort = firstParam(sp.sort) ?? (q ? 'relevance' : 'name')
  const asAt = group === 'gp' ? firstParam(sp.asAt) ?? '' : ''
  const offset = Number(firstParam(sp.offset) ?? 0) || 0

  const [list, facets, scopes] = await Promise.all([
    asAt
      ? fetchPractices({ scope, q, asAt, limit: PAGE, offset }).then((r) => ({ ...r, kind: 'asAt' as const }))
      : fetchOrgs({ q, group, scope, status, sort, limit: PAGE, offset }).then((r) => ({ ...r, kind: 'orgs' as const })),
    fetchFacets({ q, scope, status }),
    fetchScopes(),
  ])

  const def = group ? groupDef(group) : null
  const place = scopeLabel(scopes, scope)
  const href = (updates: Record<string, string | null>) => pageHref('/explore', sp, { offset: null, ...updates })
  const csv = apiUrl('/api/export/orgs.csv', { q, group, scope, status, sort })
  const title = q ? <>Results for “{q}”</> : def ? def.label : 'Explore organisations'

  return (
    <div className="mx-auto max-w-7xl px-4 py-8">
      <PageHeading
        eyebrow={displayName(place)}
        title={title}
        description={
          asAt
            ? `GP practices open on ${formatDate(asAt)}, with the PCN, Sub-ICB and ICB they belonged to then.`
            : `${formatNumber(list.total)} ${status === 'active' ? 'active ' : status === 'inactive' ? 'closed ' : ''}${def ? def.label.toLowerCase() : 'organisations'}${scope ? ` in ${displayName(place)}` : ' in England'}.`
        }
      >
        <AreaPicker scopes={scopes} tone="light" />
        <a href={asAt ? apiUrl('/api/export/practices.csv', { scope, asAt }) : csv} className="inline-flex h-9 items-center gap-2 rounded-lg border bg-card px-3 text-sm shadow-sm hover:bg-accent">
          <Download aria-hidden className="h-4 w-4" /> CSV
        </a>
      </PageHeading>

      <div className="grid gap-6 lg:grid-cols-[16rem_1fr]">
        <aside className="space-y-5">
          <form method="get" action="/explore" className="relative">
            {group ? <input type="hidden" name="group" value={group} /> : null}
            {scope ? <input type="hidden" name="scope" value={scope} /> : null}
            {status !== 'active' ? <input type="hidden" name="status" value={status} /> : null}
            <Search aria-hidden className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
            <input name="q" defaultValue={q} placeholder="Name, code or postcode" className={cn(fieldClass, 'w-full pl-9')} aria-label="Search" />
          </form>
          <nav aria-label="Organisation type">
            <p className="mb-2 px-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Type</p>
            <ul className="space-y-0.5">
              <li>
                <Link
                  href={href({ group: null, asAt: null })}
                  className={cn('flex items-center justify-between rounded-lg px-2 py-1.5 text-sm hover:bg-accent', !group && 'bg-accent font-medium text-accent-foreground')}
                >
                  <span>All types</span>
                  <span className="tabular text-xs text-muted-foreground">{formatNumber(facets.total)}</span>
                </Link>
              </li>
              {facets.groups.map((f) => (
                <li key={f.group}>
                  <Link
                    href={href({ group: f.group, asAt: null })}
                    className={cn('flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm hover:bg-accent', group === f.group && 'bg-accent font-medium text-accent-foreground')}
                  >
                    <GroupIcon group={f.group} size="xs" />
                    <span className="min-w-0 flex-1 truncate">{groupDef(f.group).label}</span>
                    <span className="tabular text-xs text-muted-foreground">{formatNumber(f.count)}</span>
                  </Link>
                </li>
              ))}
            </ul>
            {group && !facets.groups.some((f) => f.group === group) ? (
              <p className="mt-2 px-2 text-xs text-muted-foreground">No {groupDef(group).label.toLowerCase()} match these filters.</p>
            ) : null}
          </nav>
        </aside>

        <div className="min-w-0 space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            {!asAt ? (
              <Segmented
                label="Status"
                value={status}
                options={[{ value: 'active', label: 'Active' }, { value: 'inactive', label: 'Closed' }, { value: 'all', label: 'All' }]}
                hrefFor={(v) => href({ status: v === 'active' ? null : v })}
              />
            ) : null}
            {!asAt ? (
              <Segmented
                label="Sort"
                value={sort}
                options={[...(q ? [{ value: 'relevance', label: 'Best match' }] : []), { value: 'name', label: 'A–Z' }, { value: 'recent', label: 'Newest' }]}
                hrefFor={(v) => href({ sort: v === (q ? 'relevance' : 'name') ? null : v })}
              />
            ) : null}
            {group === 'gp' ? (
              <form method="get" action="/explore" className="ml-auto flex items-center gap-2">
                <input type="hidden" name="group" value="gp" />
                {scope ? <input type="hidden" name="scope" value={scope} /> : null}
                {q ? <input type="hidden" name="q" value={q} /> : null}
                <label htmlFor="asAt" className="text-xs text-muted-foreground">As at</label>
                <input id="asAt" type="date" name="asAt" defaultValue={asAt} min="2013-04-01" className={cn(fieldClass, 'h-8 px-2')} />
                <button type="submit" className="h-8 rounded-lg bg-primary px-3 text-sm text-primary-foreground shadow-sm hover:bg-primary/90">Apply</button>
                {asAt ? <Link href={href({ asAt: null })} className="text-xs text-primary hover:underline">Today</Link> : null}
              </form>
            ) : null}
          </div>

          {list.items.length === 0 ? (
            <EmptyState>No organisations match. Try another search, type or area.</EmptyState>
          ) : (
            <ul className="divide-y overflow-hidden rounded-xl border bg-card shadow-sm">
              {list.kind === 'asAt'
                ? list.items.map((row) => <PracticeAsAtRow key={row.code} row={row} />)
                : list.items.map((row) => <OrgRow key={row.code} row={row} />)}
            </ul>
          )}
          <Pagination pathname="/explore" query={sp} total={list.total} offset={offset} limit={PAGE} />
          {!group && !q ? (
            <p className="pt-2 text-xs text-muted-foreground">
              Types are derived from each organisation&apos;s ODS primary role. {GROUPS.length} types cover {formatNumber(facets.total)} organisations.
            </p>
          ) : null}
        </div>
      </div>
    </div>
  )
}
