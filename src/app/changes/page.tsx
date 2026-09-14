import Link from 'next/link'
import { ChangeList } from '@/components/change-list'
import { ChangesFilters } from '@/components/changes-filters'
import { PageHeading } from '@/components/field'
import { apiUrl, fetchChanges } from '@/lib/api'
import { NOTABLE_KINDS } from '@/lib/constants'
import { firstParam, pageHref, type Query } from '@/lib/href'

export const metadata = { title: 'Changes' }

export default async function ChangesPage({ searchParams }: { searchParams: Promise<Query> }) {
  const sp = await searchParams
  const scope = firstParam(sp.scope)
  const showAll = firstParam(sp.all) === '1'
  const kinds = showAll ? undefined : (firstParam(sp.kinds) ?? NOTABLE_KINDS.join(','))
  const type = firstParam(sp.type)
  const since = firstParam(sp.since)
  const before = firstParam(sp.before)
  const data = await fetchChanges({ scope, kinds, type, since, before, limit: 50 })
  const rssHref = apiUrl('/api/changes.rss', { scope, kinds, type, since })

  return (
    <div>
      <PageHeading title="Changes">
        <a href={rssHref} className="text-sm text-primary hover:underline">
          RSS feed
        </a>
      </PageHeading>
      <ChangesFilters />
      <ChangeList items={data.items} grouped scope={scope} />
      <div className="mt-4 flex flex-wrap gap-3 text-sm">
        {before ? (
          <Link href={pageHref('/changes', sp, { before: null })} className="text-primary hover:underline">
            Latest
          </Link>
        ) : null}
        {data.nextBefore ? (
          <Link href={pageHref('/changes', sp, { before: data.nextBefore })} className="text-primary hover:underline">
            Load more
          </Link>
        ) : data.items.length > 0 ? (
          <span className="text-muted-foreground">End of feed</span>
        ) : null}
      </div>
    </div>
  )
}
