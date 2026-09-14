export type QueryValue = string | string[] | undefined
export type Query = Record<string, QueryValue>

export function firstParam(value: QueryValue): string | undefined {
  if (Array.isArray(value)) return value[0]
  return value || undefined
}

export function asParams(query: Query): Record<string, string> {
  const out: Record<string, string> = {}
  for (const [key, value] of Object.entries(query)) {
    const v = firstParam(value)
    if (v) out[key] = v
  }
  return out
}

export function pageHref(
  pathname: string,
  current: Query,
  updates: Record<string, string | number | null | undefined> = {},
): string {
  const params = new URLSearchParams()
  const keys = new Set([...Object.keys(current), ...Object.keys(updates)])
  for (const key of keys) {
    if (Object.prototype.hasOwnProperty.call(updates, key)) {
      const v = updates[key]
      if (v === null || v === undefined || v === '') continue
      params.set(key, String(v))
    } else {
      const v = firstParam(current[key])
      if (v) params.set(key, v)
    }
  }
  const qs = params.toString()
  return qs ? `${pathname}?${qs}` : pathname
}

export function scopedHref(pathname: string, scope?: string | null): string {
  return scope ? `${pathname}?scope=${encodeURIComponent(scope)}` : pathname
}
