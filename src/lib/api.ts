import type {
  ActivityPoint, ChangesResponse, ChildRow, Facets, ListResponse, Meta, OrgDetail, OrgListRow, PracticeRow, Scopes,
} from '../../worker/src/api/types'

const DEFAULT_API = 'https://ods-tracker-api.eddiefox-davison.workers.dev'
export const API_BASE = (process.env.NEXT_PUBLIC_ODS_API_URL ?? DEFAULT_API).replace(/\/$/, '')

export type QueryInput = Record<string, string | number | undefined | null>

export class ApiError extends Error {
  status: number
  constructor(status: number, message: string) {
    super(message)
    this.name = 'ApiError'
    this.status = status
  }
}

export function apiUrl(path: string, query: QueryInput = {}): string {
  const url = new URL(`${API_BASE}${path}`)
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === null || value === '') continue
    url.searchParams.set(key, String(value))
  }
  return url.toString()
}

async function getJson<T>(path: string, query: QueryInput = {}, revalidate = 300): Promise<T> {
  const res = await fetch(apiUrl(path, query), { next: { revalidate } })
  if (!res.ok) {
    let message = res.statusText || `HTTP ${res.status}`
    try {
      const body = (await res.json()) as { error?: string }
      if (body.error) message = body.error
    } catch {
      // body was not JSON
    }
    throw new ApiError(res.status, message)
  }
  return res.json() as Promise<T>
}

export const fetchMeta = () => getJson<Meta>('/api/meta', {}, 60)
export const fetchScopes = () => getJson<Scopes>('/api/scopes', {}, 3600)
export const fetchOrgs = (q: QueryInput) => getJson<ListResponse<OrgListRow>>('/api/orgs', q)
export const fetchFacets = (q: QueryInput) => getJson<Facets>('/api/facets', q)
export const fetchPractices = (q: QueryInput) => getJson<ListResponse<PracticeRow>>('/api/practices', q)
export const fetchChanges = (q: QueryInput) => getJson<ChangesResponse>('/api/changes', q)
export const fetchActivity = (q: QueryInput) => getJson<{ months: ActivityPoint[] }>('/api/changes/activity', q, 3600)
export const fetchChildren = (code: string, q: QueryInput) =>
  getJson<ListResponse<ChildRow>>(`/api/orgs/${encodeURIComponent(code)}/children`, q)

export async function fetchOrg(code: string): Promise<OrgDetail | null> {
  try {
    return await getJson<OrgDetail>(`/api/orgs/${encodeURIComponent(code)}`)
  } catch (err) {
    if (err instanceof ApiError && (err.status === 404 || err.status === 400)) return null
    throw err
  }
}
