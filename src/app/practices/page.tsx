import Link from 'next/link'
import { Field, fieldClass, PageHeading, Pagination } from '@/components/field'
import { CodeLink } from '@/components/org-link'
import { StatusBadge } from '@/components/status-badge'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { apiUrl, fetchPractices } from '@/lib/api'
import { PAGE_SIZE } from '@/lib/constants'
import { formatDate } from '@/lib/format'
import { firstParam, type Query } from '@/lib/href'

export const metadata = { title: 'Practices' }

export default async function PracticesPage({ searchParams }: { searchParams: Promise<Query> }) {
  const sp = await searchParams
  const scope = firstParam(sp.scope)
  const q = firstParam(sp.q) ?? ''
  const status = firstParam(sp.status) ?? 'active'
  const asAt = firstParam(sp.asAt) ?? ''
  const offset = Number(firstParam(sp.offset) ?? 0) || 0
  const data = await fetchPractices({
    scope,
    q,
    status: asAt ? undefined : status,
    asAt,
    limit: PAGE_SIZE,
    offset,
  })
  const csvHref = apiUrl('/api/export/practices.csv', { scope, q, status: asAt ? undefined : status, asAt })

  return (
    <div>
      <PageHeading title="Practices">
        <a href={csvHref} className="text-sm text-primary hover:underline">
          Download CSV
        </a>
      </PageHeading>
      <form className="mb-4 flex flex-wrap items-end gap-3" method="get">
        {scope ? <input type="hidden" name="scope" value={scope} /> : null}
        <Field label="Search" htmlFor="q">
          <input id="q" name="q" defaultValue={q} placeholder="Name, code or postcode" className={`${fieldClass} w-56`} />
        </Field>
        <Field label="Status" htmlFor="status">
          <select id="status" name="status" defaultValue={status} className={fieldClass} disabled={Boolean(asAt)}>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
            <option value="all">All</option>
          </select>
        </Field>
        <Field label="As at" htmlFor="asAt">
          <input id="asAt" name="asAt" type="date" defaultValue={asAt} className={fieldClass} />
        </Field>
        <button type="submit" className={`${fieldClass} bg-primary px-3 text-primary-foreground`}>
          Apply
        </button>
      </form>
      {asAt ? (
        <p className="mb-3 text-xs text-muted-foreground">As-at lists practices open on that date with the PCN, Sub-ICB and ICB as they were then. Status shows today&apos;s status.</p>
      ) : null}
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Code</TableHead>
              <TableHead>Name</TableHead>
              <TableHead>PCN</TableHead>
              <TableHead>Sub-ICB</TableHead>
              <TableHead>ICB</TableHead>
              <TableHead>Postcode</TableHead>
              <TableHead>{asAt ? 'Status now' : 'Status'}</TableHead>
              <TableHead>Opened</TableHead>
              <TableHead>Closed</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.items.length === 0 ? (
              <TableRow>
                <TableCell colSpan={9} className="py-8 text-center text-muted-foreground">
                  No practices match these filters.
                </TableCell>
              </TableRow>
            ) : (
              data.items.map((p) => (
                <TableRow key={p.code} className="whitespace-nowrap">
                  <TableCell className="font-mono text-xs">
                    <Link href={`/org/${p.code}${scope ? `?scope=${scope}` : ''}`} className="text-primary hover:underline">
                      {p.code}
                    </Link>
                  </TableCell>
                  <TableCell className="max-w-[16rem] truncate font-medium">
                    <CodeLink code={p.code} name={p.name} scope={scope} />
                  </TableCell>
                  <TableCell className="max-w-[12rem] truncate">
                    {p.pcn ? <CodeLink code={p.pcn.code} name={p.pcn.name} scope={scope} /> : '—'}
                  </TableCell>
                  <TableCell className="max-w-[12rem] truncate">
                    {p.sicbl ? <CodeLink code={p.sicbl.code} name={p.sicbl.name} scope={scope} /> : '—'}
                  </TableCell>
                  <TableCell className="max-w-[12rem] truncate">
                    {p.icb ? <CodeLink code={p.icb.code} name={p.icb.name} scope={scope} /> : '—'}
                  </TableCell>
                  <TableCell>{p.postcode ?? '—'}</TableCell>
                  <TableCell>
                    <StatusBadge status={p.status} />
                  </TableCell>
                  <TableCell>{formatDate(p.opStart)}</TableCell>
                  <TableCell>{formatDate(p.opEnd)}</TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
      <Pagination pathname="/practices" query={sp} total={data.total} offset={offset} limit={PAGE_SIZE} />
    </div>
  )
}
