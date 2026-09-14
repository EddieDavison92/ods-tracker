import { cn } from '@/lib/utils'
import { KIND_LABELS } from '@/lib/constants'
import type { ChangeKind } from '../../worker/src/api/types'

export function StatusBadge({ status }: { status: string | null | undefined }) {
  const active = status?.toLowerCase() === 'active'
  return (
    <span
      className={cn(
        'inline-flex rounded px-1.5 py-0.5 text-xs font-medium',
        active ? 'bg-emerald-100 text-emerald-800' : 'bg-zinc-100 text-zinc-600',
      )}
    >
      {status || 'Unknown'}
    </span>
  )
}

export function KindBadge({ kind }: { kind: ChangeKind }) {
  const closed = kind === 'closed' || kind === 'removed'
  const opened = kind === 'created' || kind === 'reopened'
  return (
    <span
      className={cn(
        'inline-flex rounded px-1.5 py-0.5 text-xs font-medium',
        closed && 'bg-rose-100 text-rose-800',
        opened && 'bg-emerald-100 text-emerald-800',
        !closed && !opened && 'bg-zinc-100 text-zinc-700',
      )}
    >
      {KIND_LABELS[kind] ?? kind}
    </span>
  )
}
