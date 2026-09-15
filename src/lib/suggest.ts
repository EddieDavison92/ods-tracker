import { API_BASE } from '@/lib/api'
import type { Suggestion } from '../../worker/src/api/types'

// Browser-side search suggestions, shared by the search box and area picker. Results are kept for the
// page session (the data changes every 6 hours at most), so retyping or reopening costs no request.
const MAX_ENTRIES = 200
const cache = new Map<string, Promise<Suggestion[]>>()

export function suggest(q: string, group?: string): Promise<Suggestion[]> {
  const key = `${group ?? ''}|${q.trim().toLowerCase()}`
  const hit = cache.get(key)
  if (hit) return hit
  const params = new URLSearchParams({ q: q.trim() })
  if (group) params.set('group', group)
  const request = fetch(`${API_BASE}/api/suggest?${params}`)
    .then((r) => {
      if (!r.ok) throw new Error(`suggest ${r.status}`)
      return r.json() as Promise<{ items?: Suggestion[] }>
    })
    .then((b) => b.items ?? [])
  // Failed requests are not cached, so the next keystroke retries.
  request.catch(() => cache.delete(key))
  if (cache.size >= MAX_ENTRIES) cache.delete(cache.keys().next().value!)
  cache.set(key, request)
  return request
}
