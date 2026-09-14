// URL parameter validation. Invalid values are dropped rather than sent to the API, so a
// hand-edited or stale link degrades to the unfiltered view instead of an error page.
import { GROUP_KEYS, type GroupKey } from '../../worker/src/ods/groups'
import { firstParam, type QueryValue } from '@/lib/href'

const CODE_RE = /^[A-Z0-9]{1,12}$/
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

export function codeParam(v: QueryValue): string | undefined {
  const s = firstParam(v)?.trim().toUpperCase()
  return s && CODE_RE.test(s) ? s : undefined
}

export function dateParam(v: QueryValue): string | undefined {
  const s = firstParam(v)?.trim()
  if (!s || !DATE_RE.test(s)) return undefined
  const d = new Date(`${s}T00:00:00Z`)
  return Number.isNaN(d.getTime()) || d.getUTCFullYear() < 1900 ? undefined : s
}

export function groupParam(v: QueryValue): GroupKey | undefined {
  const s = firstParam(v)
  return s && GROUP_KEYS.has(s as GroupKey) ? (s as GroupKey) : undefined
}

// Comma list of groups, keeping only known keys.
export function groupsParam(v: QueryValue): string | undefined {
  const keys = (firstParam(v) ?? '').split(',').filter((g) => GROUP_KEYS.has(g as GroupKey))
  return keys.length ? keys.join(',') : undefined
}

export function oneOf<T extends string>(v: QueryValue, options: readonly T[], fallback: T): T {
  const s = firstParam(v)
  return s && (options as readonly string[]).includes(s) ? (s as T) : fallback
}

export function offsetParam(v: QueryValue): number {
  const n = Number(firstParam(v) ?? 0)
  return Number.isInteger(n) && n >= 0 && n <= 1_000_000 ? n : 0
}

export function textParam(v: QueryValue, max = 100): string {
  return (firstParam(v) ?? '').trim().slice(0, max)
}
