import { Field, fieldClass, PageHeading } from '@/components/field'
import { apiUrl, fetchScopes } from '@/lib/api'
import { firstParam, type Query } from '@/lib/href'
import { scopeName } from '@/lib/utils'

export const metadata = { title: 'Export' }

export default async function ExportPage({ searchParams }: { searchParams: Promise<Query> }) {
  const sp = await searchParams
  const scope = firstParam(sp.scope)
  const asAt = firstParam(sp.asAt) ?? ''
  const scopes = await fetchScopes()
  const csvHref = apiUrl('/api/export/practices.csv', { scope, asAt })

  return (
    <div className="max-w-2xl space-y-4">
      <PageHeading title="Export practices" />
      <p className="text-sm text-muted-foreground">
        Download a CSV of GP practices for {scopeName(scopes, scope)}
        {asAt ? ` as at ${asAt}` : ' (current hierarchy)'}. Columns are practice code and name, status,
        postcode, open and close dates, then PCN, Sub-ICB, ICB and region (code and name), and the as-at date.
      </p>
      <form className="flex flex-wrap items-end gap-3" method="get">
        {scope ? <input type="hidden" name="scope" value={scope} /> : null}
        <Field label="As at (optional)" htmlFor="asAt">
          <input id="asAt" name="asAt" type="date" defaultValue={asAt} className={fieldClass} />
        </Field>
        <button type="submit" className={`${fieldClass} px-3`}>
          Update link
        </button>
      </form>
      <a
        href={csvHref}
        className="inline-flex h-9 items-center rounded-md bg-primary px-3 text-sm text-primary-foreground hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
      >
        Download CSV
      </a>
    </div>
  )
}
