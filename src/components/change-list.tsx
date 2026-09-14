import { ArrowRight } from 'lucide-react'
import { GroupIcon } from '@/components/group-badge'
import { KindIcon } from '@/components/status-badge'
import { EmptyState } from '@/components/field'
import { OrgLink } from '@/components/org-link'
import { formatDate } from '@/lib/format'
import { groupDef } from '@/lib/groups'
import { displayName } from '@/lib/names'
import { cn } from '@/lib/utils'
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

// The summary minus the trailing "NAME (CODE)", so the related org can be rendered as a link.
function verbPhrase(item: ChangeItem): string | null {
  if (!item.related) return null
  const suffix = `${item.related.name ?? 'unknown'} (${item.related.code})`
  return item.summary.endsWith(suffix) ? item.summary.slice(0, -suffix.length).trim() : null
}

function Detail({ item }: { item: ChangeItem }) {
  if (item.kind === 'created') return <span>New {groupDef(item.group).singular.toLowerCase().replace(/^gp /, 'GP ').replace(/^nhs /, 'NHS ').replace(/^pcn$/, 'PCN')}</span>
  if (item.kind === 'name' && item.oldValue && item.newValue) {
    return (
      <span>
        Renamed from <span className="text-muted-foreground line-through decoration-muted-foreground/50">{displayName(item.oldValue)}</span>
      </span>
    )
  }
  if (item.kind === 'address' && item.newValue) {
    return (
      <span className="block">
        <span>Moved to {displayName(item.newValue)}</span>
        {item.oldValue ? (
          <span className="block truncate text-xs text-muted-foreground">was {displayName(item.oldValue)}</span>
        ) : null}
      </span>
    )
  }
  const verb = verbPhrase(item)
  if (verb && item.related) {
    return (
      <span>
        {verb} <OrgLink org={item.related} className="font-medium" />
      </span>
    )
  }
  return <span>{item.summary}</span>
}

export function ChangeRow({ item, showDate = false, hideOrg = false }: { item: ChangeItem; showDate?: boolean; hideOrg?: boolean }) {
  const effective = item.effectiveDate && item.effectiveDate !== item.detectedAt ? item.effectiveDate : null
  return (
    <li className="flex gap-3 px-4 py-3">
      <KindIcon kind={item.kind} className="mt-0.5" />
      <div className="min-w-0 flex-1 space-y-0.5">
        {hideOrg ? null : (
          <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5">
            <GroupIcon group={item.group} size="xs" />
            <OrgLink org={item.org} className="min-w-0 font-medium" />
          </div>
        )}
        <div className={cn('text-sm leading-snug', hideOrg && 'pt-1')}>
          <Detail item={item} />
        </div>
        {effective || showDate ? (
          <p className="text-xs text-muted-foreground">
            {showDate ? `Detected ${formatDate(item.detectedAt)}` : null}
            {showDate && effective ? ' · ' : null}
            {effective ? `Effective ${formatDate(effective)}` : null}
          </p>
        ) : null}
      </div>
    </li>
  )
}

export function ChangeList({
  items,
  grouped = false,
  hideOrg = false,
  empty = 'No changes match these filters.',
  className,
}: {
  items: ChangeItem[]
  grouped?: boolean
  // Omit the org name on each row (e.g. an org's own timeline).
  hideOrg?: boolean
  empty?: string
  className?: string
}) {
  if (items.length === 0) return <EmptyState>{empty}</EmptyState>
  if (!grouped) {
    return (
      <ul className={cn('divide-y rounded-xl border bg-card shadow-sm', className)}>
        {items.map((item) => (
          <ChangeRow key={item.id} item={item} showDate hideOrg={hideOrg} />
        ))}
      </ul>
    )
  }
  return (
    <div className={cn('space-y-5', className)}>
      {groupByDetected(items).map((group) => (
        <section key={group.date} aria-label={formatDate(group.date)}>
          <h3 className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            {formatDate(group.date)}
            <span className="rounded-full bg-muted px-1.5 py-px font-medium normal-case tracking-normal tabular">
              {group.items.length}
            </span>
          </h3>
          <ul className="divide-y rounded-xl border bg-card shadow-sm">
            {group.items.map((item) => (
              <ChangeRow key={item.id} item={item} hideOrg={hideOrg} />
            ))}
          </ul>
        </section>
      ))}
    </div>
  )
}

export function MoreLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a href={href} className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline">
      {children} <ArrowRight aria-hidden className="h-3.5 w-3.5" />
    </a>
  )
}
