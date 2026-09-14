import Link from 'next/link'
import { scopedHref } from '@/lib/href'
import type { OrgRef } from '../../worker/src/api/types'

export function OrgLink({
  org,
  scope,
  className,
}: {
  org: OrgRef | null | undefined
  scope?: string
  className?: string
}) {
  if (!org?.code) return <span className="text-muted-foreground">—</span>
  const label = org.name ? `${org.name} (${org.code})` : org.code
  return (
    <Link href={scopedHref(`/org/${org.code}`, scope)} className={className ?? 'text-primary hover:underline'}>
      {label}
    </Link>
  )
}

export function CodeLink({
  code,
  name,
  scope,
}: {
  code: string
  name?: string | null
  scope?: string
}) {
  return (
    <Link href={scopedHref(`/org/${code}`, scope)} className="text-primary hover:underline">
      {name || code}
    </Link>
  )
}
