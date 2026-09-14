import type { Metadata } from 'next'
import type { ReactNode } from 'react'
import { notFound } from 'next/navigation'
import { ChangeList } from '@/components/change-list'
import { EmptyState } from '@/components/field'
import { CodeLink, OrgLink } from '@/components/org-link'
import { StatusBadge } from '@/components/status-badge'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { fetchOrg } from '@/lib/api'
import { formatDate, formatRange } from '@/lib/format'
import { firstParam, type Query } from '@/lib/href'
import type { Hierarchy, OrgRelInfo } from '../../../../worker/src/api/types'

type Params = Promise<{ code: string }>

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { code } = await params
  const detail = await fetchOrg(code.toUpperCase())
  if (!detail) return { title: code.toUpperCase() }
  return { title: `${detail.org.name} (${detail.org.code})` }
}

export default async function OrgPage({ params, searchParams }: { params: Params; searchParams: Promise<Query> }) {
  const [{ code }, sp] = await Promise.all([params, searchParams])
  const scope = firstParam(sp.scope)
  const detail = await fetchOrg(code.toUpperCase())
  if (!detail) notFound()
  const { org, hierarchy, roles, parents, children, childrenTotal, successions, events } = detail
  const activeChildren = children.filter((c) => !c.opEnd)
  const historicChildren = children.filter((c) => c.opEnd)
  const website = org.url ? (org.url.startsWith('http') ? org.url : `https://${org.url}`) : null
  const ord = `https://directory.spineservices.nhs.uk/ORD/2-0-0/organisations/${org.code}?_format=json`

  return (
    <article className="space-y-8">
      <header className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-2xl font-semibold tracking-tight">{org.name}</h1>
          <span className="font-mono text-sm text-muted-foreground">{org.code}</span>
          <StatusBadge status={org.status} />
        </div>
        <p className="text-sm text-muted-foreground">
          {org.primaryRole?.name ?? 'No primary role'}
          {org.primaryRole ? ` (${org.primaryRole.code})` : null}
        </p>
        <HierarchyCrumb hierarchy={hierarchy} scope={scope} />
        <dl className="grid gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
          <Info label="Address">
            {[...org.address, org.town, org.county, org.postcode].filter(Boolean).join(', ') || '—'}
          </Info>
          <Info label="Phone">
            {org.tel ? <a className="text-primary hover:underline" href={`tel:${org.tel.replace(/\s/g, '')}`}>{org.tel}</a> : '—'}
          </Info>
          <Info label="Website">
            {website ? (
              <a className="text-primary hover:underline" href={website} rel="noreferrer" target="_blank">
                {org.url}
              </a>
            ) : '—'}
          </Info>
          <Info label="Open">
            {formatRange(org.opStart, org.opEnd)}
          </Info>
          <Info label="ORD record">
            <a className="text-primary hover:underline" href={ord} rel="noreferrer" target="_blank">
              directory.spineservices.nhs.uk
            </a>
          </Info>
        </dl>
      </header>

      <section>
        <h2 className="mb-2 text-lg font-semibold">Events</h2>
        <ChangeList items={events} grouped scope={scope} />
      </section>

      <RelTable title="Relationships (parents)" rows={parents} scope={scope} empty="No parent relationships." />
      <RelTable
        title={`Members and children${childrenTotal > children.length ? ` (showing ${children.length} of ${childrenTotal})` : ''}`}
        rows={activeChildren}
        historic={historicChildren}
        scope={scope}
        empty="No child organisations."
      />

      <section>
        <h2 className="mb-2 text-lg font-semibold">Roles</h2>
        {roles.length === 0 ? (
          <EmptyState>No roles recorded.</EmptyState>
        ) : (
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Role</TableHead>
                  <TableHead>Primary</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Dates</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {roles.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell>
                      {r.role.name ?? r.role.code} <span className="text-muted-foreground">({r.role.code})</span>
                    </TableCell>
                    <TableCell>{r.primary ? 'Yes' : '—'}</TableCell>
                    <TableCell><StatusBadge status={r.status} /></TableCell>
                    <TableCell className="whitespace-nowrap">{formatRange(r.opStart, r.opEnd)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </section>

      <section>
        <h2 className="mb-2 text-lg font-semibold">Successions</h2>
        {successions.length === 0 ? (
          <EmptyState>No successions recorded.</EmptyState>
        ) : (
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Type</TableHead>
                  <TableHead>Organisation</TableHead>
                  <TableHead>Date</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {successions.map((s) => (
                  <TableRow key={s.id}>
                    <TableCell>{s.type}</TableCell>
                    <TableCell><OrgLink org={s.org} scope={scope} /></TableCell>
                    <TableCell>{formatDate(s.date)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </section>
    </article>
  )
}

function Info({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd>{children}</dd>
    </div>
  )
}

function HierarchyCrumb({ hierarchy, scope }: { hierarchy: Hierarchy; scope?: string }) {
  const parts = [
    hierarchy.region,
    hierarchy.icb,
    hierarchy.sicbl,
    hierarchy.pcn,
  ].filter((p): p is NonNullable<typeof p> => Boolean(p?.code))
  if (parts.length === 0) return null
  return (
    <nav aria-label="Hierarchy" className="text-sm">
      {parts.map((part, i) => (
        <span key={part.code}>
          {i > 0 ? <span className="mx-1 text-muted-foreground">›</span> : null}
          <CodeLink code={part.code} name={part.name} scope={scope} />
        </span>
      ))}
    </nav>
  )
}

function RelTable({
  title,
  rows,
  historic,
  scope,
  empty,
}: {
  title: string
  rows: OrgRelInfo[]
  historic?: OrgRelInfo[]
  scope?: string
  empty: string
}) {
  return (
    <section>
      <h2 className="mb-2 text-lg font-semibold">{title}</h2>
      {rows.length === 0 && !historic?.length ? (
        <EmptyState>{empty}</EmptyState>
      ) : (
        <div className="space-y-4">
          {rows.length > 0 ? <RelRows caption={historic ? 'Active' : undefined} rows={rows} scope={scope} /> : null}
          {historic && historic.length > 0 ? (
            <RelRows caption="Historic" rows={historic} scope={scope} />
          ) : null}
        </div>
      )}
    </section>
  )
}

function RelRows({ caption, rows, scope }: { caption?: string; rows: OrgRelInfo[]; scope?: string }) {
  return (
    <div className="rounded-md border">
      {caption ? <p className="border-b px-3 py-1.5 text-xs font-medium text-muted-foreground">{caption}</p> : null}
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Organisation</TableHead>
            <TableHead>Role</TableHead>
            <TableHead>Relationship</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Membership dates</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((r) => (
            <TableRow key={r.id} className="whitespace-nowrap">
              <TableCell className="max-w-[20rem] truncate">
                <OrgLink org={r.org} scope={scope} />
              </TableCell>
              <TableCell>{r.orgPrimaryRole?.name ?? r.orgPrimaryRole?.code ?? '—'}</TableCell>
              <TableCell>{r.type.name ?? r.type.code}</TableCell>
              {/* Relationship status, not the linked org's: an ended membership shows Inactive. */}
              <TableCell><StatusBadge status={r.status ?? r.orgStatus} /></TableCell>
              <TableCell>{formatRange(r.opStart, r.opEnd)}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}
