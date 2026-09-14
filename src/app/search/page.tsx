import Link from 'next/link'
import { Field, fieldClass, PageHeading } from '@/components/field'
import { CodeLink } from '@/components/org-link'
import { StatusBadge } from '@/components/status-badge'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { fetchOrgs } from '@/lib/api'
import { COMMON_ROLES } from '@/lib/constants'
import { firstParam, type Query } from '@/lib/href'

export const metadata = { title: 'Search' }

export default async function SearchPage({ searchParams }: { searchParams: Promise<Query> }) {
  const sp = await searchParams
  const scope = firstParam(sp.scope)
  const q = (firstParam(sp.q) ?? '').trim()
  const role = firstParam(sp.role) ?? ''
  const ready = q.length >= 2 || Boolean(role)
  const data = ready ? await fetchOrgs({ q: q || undefined, role: role || undefined, limit: 100 }) : null

  return (
    <div>
      <PageHeading title="Search organisations" />
      <form className="mb-4 flex flex-wrap items-end gap-3" method="get">
        {scope ? <input type="hidden" name="scope" value={scope} /> : null}
        <Field label="Query" htmlFor="q">
          <input
            id="q"
            name="q"
            defaultValue={q}
            minLength={role ? undefined : 2}
            placeholder="Name, code or postcode"
            className={`${fieldClass} w-64`}
          />
        </Field>
        <Field label="Role" htmlFor="role">
          <select id="role" name="role" defaultValue={role} className={fieldClass}>
            <option value="">Any role</option>
            {COMMON_ROLES.map((r) => (
              <option key={r.value} value={r.value}>
                {r.label} ({r.value})
              </option>
            ))}
          </select>
        </Field>
        <button type="submit" className={`${fieldClass} bg-primary px-3 text-primary-foreground`}>
          Search
        </button>
      </form>
      {!ready ? (
        <p className="text-sm text-muted-foreground">Enter at least two characters, or choose a role.</p>
      ) : (
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Code</TableHead>
                <TableHead>Name</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Town</TableHead>
                <TableHead>Postcode</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data?.items.length ? (
                data.items.map((org) => (
                  <TableRow key={org.code} className="whitespace-nowrap">
                    <TableCell className="font-mono text-xs">
                      <Link href={`/org/${org.code}${scope ? `?scope=${scope}` : ''}`} className="text-primary hover:underline">
                        {org.code}
                      </Link>
                    </TableCell>
                    <TableCell className="max-w-[20rem] truncate font-medium">
                      <CodeLink code={org.code} name={org.name} scope={scope} />
                    </TableCell>
                    <TableCell>{org.primaryRole?.name ?? org.primaryRole?.code ?? '—'}</TableCell>
                    <TableCell>{org.town ?? '—'}</TableCell>
                    <TableCell>{org.postcode ?? '—'}</TableCell>
                    <TableCell>
                      <StatusBadge status={org.status} />
                    </TableCell>
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell colSpan={6} className="py-8 text-center text-muted-foreground">
                    No organisations found.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  )
}
