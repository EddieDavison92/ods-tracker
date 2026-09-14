import { cn } from '@/lib/utils'
import { GROUP_ICONS, groupColour, groupDef, type GroupKey } from '@/lib/groups'

const SIZES = {
  xs: 'h-5 w-5 rounded-md [&_svg]:h-3 [&_svg]:w-3',
  sm: 'h-7 w-7 rounded-lg [&_svg]:h-3.5 [&_svg]:w-3.5',
  md: 'h-9 w-9 rounded-lg [&_svg]:h-[18px] [&_svg]:w-[18px]',
  lg: 'h-14 w-14 rounded-2xl [&_svg]:h-7 [&_svg]:w-7',
}

export function GroupIcon({
  group,
  size = 'sm',
  className,
}: {
  group: GroupKey | null | undefined
  size?: keyof typeof SIZES
  className?: string
}) {
  const key = groupDef(group).key
  const Icon = GROUP_ICONS[key]
  const colour = groupColour(key)
  return (
    <span
      title={groupDef(key).singular}
      className={cn('inline-flex shrink-0 items-center justify-center', SIZES[size], className)}
      style={{ backgroundColor: `${colour}1f`, color: colour }}
    >
      <Icon aria-hidden strokeWidth={2} />
    </span>
  )
}

export function GroupBadge({ group, className }: { group: GroupKey | null | undefined; className?: string }) {
  return (
    <span className={cn('inline-flex items-center gap-1.5 text-xs text-muted-foreground', className)}>
      <GroupIcon group={group} size="xs" />
      {groupDef(group).singular}
    </span>
  )
}
