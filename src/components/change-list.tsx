import Link from 'next/link'
import { KindBadge } from '@/components/status-badge'
import { OrgLink } from '@/components/org-link'
import { EmptyState } from '@/components/field'
import { formatDate } from '@/lib/format'
import { scopedHref } from '@/lib/href'
import type { ChangeItem } from '../../worker/src/api/types'

function groupByDetected(items: ChangeItem[]) {
  const groups: { date: string; items: ChangeItem[] }[] = []
  for (const item of items) {
    const last = groups[groups.length - 1]
    if (last && last.date === item.detectedAt) last.items.push(item)
    else groups.push({ date: item.detectedAt, items: [item] })
  }
  return groups
}

function ChangeRow({ item, scope }: { item: ChangeItem; scope?: string }) {
  return (
    <li className="flex flex-col gap-1 border-b py-2 last:border-0 sm:flex-row sm:items-baseline sm:gap-3">
      <div className="min-w-0 flex-1">
        <Link href={scopedHref(`/org/${item.org.code}`, scope)} className="font-medium hover:underline">
          {item.org.name ?? item.org.code}{' '}
          <span className="font-normal text-muted-foreground">({item.org.code})</span>
        </Link>
        <p className="text-sm">{item.summary}</p>
        <p className="text-xs text-muted-foreground">
          Effective {formatDate(item.effectiveDate)}
          {item.related ? (
            <>
              {' · '}
              <OrgLink org={item.related} scope={scope} />
            </>
          ) : null}
        </p>
      </div>
      <KindBadge kind={item.kind} />
    </li>
  )
}

export function ChangeList({
  items,
  grouped = false,
  scope,
}: {
  items: ChangeItem[]
  grouped?: boolean
  scope?: string
}) {
  if (items.length === 0) {
    return <EmptyState>No changes recorded yet.</EmptyState>
  }
  if (!grouped) {
    return (
      <ul>
        {items.map((item) => (
          <ChangeRow key={item.id} item={item} scope={scope} />
        ))}
      </ul>
    )
  }
  return (
    <div className="space-y-6">
      {groupByDetected(items).map((group) => (
        <section key={group.date}>
          <h2 className="mb-1 text-sm font-semibold text-muted-foreground">{formatDate(group.date)}</h2>
          <ul className="rounded-md border px-3">
            {group.items.map((item) => (
              <ChangeRow key={item.id} item={item} scope={scope} />
            ))}
          </ul>
        </section>
      ))}
    </div>
  )
}
