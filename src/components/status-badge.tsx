import { cn } from '@/lib/utils'
import { KIND_ICONS, KIND_LABELS, TONE_COLOURS, kindTone } from '@/lib/kinds'
import type { ChangeKind } from '../../worker/src/api/types'

export function StatusBadge({
  status,
  labels = ['Active', 'Closed'],
  className,
}: {
  status: string | null | undefined
  labels?: [string, string]
  className?: string
}) {
  const active = status?.toLowerCase() === 'active'
  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset',
        active ? 'bg-emerald-50 text-emerald-800 ring-emerald-200' : 'bg-zinc-100 text-zinc-600 ring-zinc-200',
        className,
      )}
    >
      <span aria-hidden className={cn('h-1.5 w-1.5 rounded-full', active ? 'bg-emerald-600' : 'bg-zinc-400')} />
      {active ? labels[0] : labels[1]}
    </span>
  )
}

export function KindIcon({ kind, className }: { kind: ChangeKind; className?: string }) {
  const Icon = KIND_ICONS[kind]
  const colour = TONE_COLOURS[kindTone(kind)]
  return (
    <span
      title={KIND_LABELS[kind]}
      className={cn('inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg', className)}
      style={{ backgroundColor: `${colour}1f`, color: colour }}
    >
      <Icon aria-hidden className="h-3.5 w-3.5" strokeWidth={2.25} />
      <span className="sr-only">{KIND_LABELS[kind]}</span>
    </span>
  )
}
