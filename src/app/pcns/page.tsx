import { Field, fieldClass, PageHeading, Pagination } from '@/components/field'
import { CodeLink } from '@/components/org-link'
import { StatusBadge } from '@/components/status-badge'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { fetchPcns } from '@/lib/api'
import { PAGE_SIZE } from '@/lib/constants'
import { formatNumber } from '@/lib/format'
import { firstParam, type Query } from '@/lib/href'

export const metadata = { title: 'PCNs' }

export default async function PcnsPage({ searchParams }: { searchParams: Promise<Query> }) {
  const sp = await searchParams
  const scope = firstParam(sp.scope)
  const q = firstParam(sp.q) ?? ''
  const status = firstParam(sp.status) ?? 'active'
  const offset = Number(firstParam(sp.offset) ?? 0) || 0
  const data = await fetchPcns({ scope, q, status, limit: PAGE_SIZE, offset })

  return (
    <div>
      <PageHeading title="PCNs" />
      <form className="mb-4 flex flex-wrap items-end gap-3" method="get">
        {scope ? <input type="hidden" name="scope" value={scope} /> : null}
        <Field label="Search" htmlFor="q">
          <input id="q" name="q" defaultValue={q} placeholder="Name or code" className={`${fieldClass} w-56`} />
        </Field>
        <Field label="Status" htmlFor="status">
          <select id="status" name="status" defaultValue={status} className={fieldClass}>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
            <option value="all">All</option>
          </select>
        </Field>
        <button type="submit" className={`${fieldClass} bg-primary px-3 text-primary-foreground`}>
          Apply
        </button>
      </form>
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Code</TableHead>
              <TableHead>Name</TableHead>
              <TableHead className="text-right">Members</TableHead>
              <TableHead>Sub-ICB</TableHead>
              <TableHead>ICB</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.items.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="py-8 text-center text-muted-foreground">
                  No PCNs match these filters.
                </TableCell>
              </TableRow>
            ) : (
              data.items.map((p) => (
                <TableRow key={p.code} className="whitespace-nowrap">
                  <TableCell className="font-mono text-xs">
                    <CodeLink code={p.code} name={p.code} scope={scope} />
                  </TableCell>
                  <TableCell className="max-w-[20rem] truncate font-medium">
                    <CodeLink code={p.code} name={p.name} scope={scope} />
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{formatNumber(p.memberCount)}</TableCell>
                  <TableCell className="max-w-[14rem] truncate">
                    {p.sicbl ? <CodeLink code={p.sicbl.code} name={p.sicbl.name} scope={scope} /> : '—'}
                  </TableCell>
                  <TableCell className="max-w-[14rem] truncate">
                    {p.icb ? <CodeLink code={p.icb.code} name={p.icb.name} scope={scope} /> : '—'}
                  </TableCell>
                  <TableCell>
                    <StatusBadge status={p.status} />
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
      <Pagination pathname="/pcns" query={sp} total={data.total} offset={offset} limit={PAGE_SIZE} />
    </div>
  )
}
