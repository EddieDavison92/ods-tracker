import Link from 'next/link'
import { cn } from '@/lib/utils'
import { displayName } from '@/lib/names'
import type { OrgRef } from '../../worker/src/api/types'

export function orgHref(code: string) {
  return `/org/${encodeURIComponent(code)}`
}

export function OrgLink({
  org,
  showCode = true,
  className,
}: {
  org: OrgRef | null | undefined
  showCode?: boolean
  className?: string
}) {
  if (!org?.code) return <span className="text-muted-foreground">—</span>
  return (
    <Link href={orgHref(org.code)} className={cn('group/link text-foreground hover:text-primary', className)}>
      <span className="underline-offset-2 group-hover/link:underline">{org.name ? displayName(org.name) : org.code}</span>
      {showCode && org.name ? <span className="ml-1 font-mono text-[0.8em] text-muted-foreground">{org.code}</span> : null}
    </Link>
  )
}
