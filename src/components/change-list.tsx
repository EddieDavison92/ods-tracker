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

// 'detected': grouped by the date the change appeared in ODS (the change feed).
// 'effective': grouped by year of the date it took effect (an org's own history).
// 'effectiveDay': grouped by the date it took effect (the change feed by effective date).
export type GroupBy = 'detected' | 'effective' | 'effectiveDay'

const effectiveOf = (i: ChangeItem) => i.effectiveDate ?? i.detectedAt
const newestEffectiveFirst = (a: ChangeItem, b: ChangeItem) => effectiveOf(b).localeCompare(effectiveOf(a)) || b.id - a.id

function groupItems(items: ChangeItem[], by: GroupBy) {
  const groups: { key: string; label: string; items: ChangeItem[] }[] = []
  const sorted = by === 'detected' ? items : [...items].sort(newestEffectiveFirst)
  for (const item of sorted) {
    const key = by === 'effective' ? effectiveOf(item).slice(0, 4) : by === 'effectiveDay' ? effectiveOf(item) : item.detectedAt
    const last = groups[groups.length - 1]
    if (last && last.key === key) last.items.push(item)
    else groups.push({ key, label: by === 'effective' ? key : formatDate(key), items: [item] })
  }
  // Within a detection date, older effective dates sit lower.
  if (by === 'detected') for (const g of groups) g.items.sort(newestEffectiveFirst)
  return groups
}

// The summary minus the trailing "NAME (CODE)", so the related org can be rendered as a link.
function verbPhrase(item: ChangeItem): string | null {
  if (!item.related) return null
  const suffix = `${item.related.name ?? 'unknown'} (${item.related.code})`
  return item.summary.endsWith(suffix) ? item.summary.slice(0, -suffix.length).trim() : null
}

const singular = (item: ChangeItem) =>
  groupDef(item.group).singular.toLowerCase().replace(/^gp /, 'GP ').replace(/^nhs /, 'NHS ').replace(/^pcn$/, 'PCN')

function Detail({ item }: { item: ChangeItem }) {
  if (item.kind === 'created') return <span>New {singular(item)}</span>
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
        {item.oldValue ? <span className="block truncate text-xs text-muted-foreground">was {displayName(item.oldValue)}</span> : null}
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

function Dates({ item, by, showDate }: { item: ChangeItem; by?: GroupBy; showDate?: boolean }) {
  const effective = item.effectiveDate
  const differs = effective && effective !== item.detectedAt
  const parts: string[] = []
  if (by === 'effective') {
    parts.push(formatDate(effectiveOf(item)))
    if (differs) parts.push(`recorded ${formatDate(item.detectedAt)}`)
  } else {
    if (showDate) parts.push(`Detected ${formatDate(item.detectedAt)}`)
    if (differs) parts.push(`Effective ${formatDate(effective)}`)
  }
  return parts.length ? <p className="text-xs text-muted-foreground">{parts.join(' · ')}</p> : null
}

export function ChangeRow({
  item,
  showDate = false,
  hideOrg = false,
  by,
}: {
  item: ChangeItem
  showDate?: boolean
  hideOrg?: boolean
  by?: GroupBy
}) {
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
        <Dates item={item} by={by} showDate={showDate} />
      </div>
    </li>
  )
}

export function ChangeList({
  items,
  grouped = false,
  by = 'detected',
  hideOrg = false,
  empty = 'No changes match these filters.',
  className,
}: {
  items: ChangeItem[]
  grouped?: boolean
  by?: GroupBy
  // Omit the org name on each row (e.g. an org's own timeline).
  hideOrg?: boolean
  empty?: string
  className?: string
}) {
  if (items.length === 0) return <EmptyState>{empty}</EmptyState>
  if (!grouped) {
    const list = by === 'effective' ? [...items].sort(newestEffectiveFirst) : items
    return (
      <ul className={cn('divide-y rounded-xl border bg-card shadow-sm', className)}>
        {list.map((item) => (
          <ChangeRow key={item.id} item={item} showDate hideOrg={hideOrg} by={by} />
        ))}
      </ul>
    )
  }
  return (
    <div className={cn('space-y-5', className)}>
      {groupItems(items, by).map((group) => (
        <section key={group.key} aria-label={group.label}>
          <h3 className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            {group.label}
            <span className="rounded-full bg-muted px-1.5 py-px font-medium normal-case tracking-normal tabular">{group.items.length}</span>
          </h3>
          <ul className="divide-y rounded-xl border bg-card shadow-sm">
            {group.items.map((item) => (
              <ChangeRow key={item.id} item={item} hideOrg={hideOrg} by={by} />
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
