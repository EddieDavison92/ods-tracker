import type {
  ChangesResponse,
  ListResponse,
  Meta,
  OrgDetail,
  OrgSearchRow,
  PcnRow,
  PracticeRow,
  Scopes,
} from '../../worker/src/api/types'

const DEFAULT_API = 'https://ods-tracker-api.eddiefox-davison.workers.dev'

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message)
    this.name = 'ApiError'
  }
}

export function apiUrl(
  path: string,
  query: Record<string, string | number | undefined | null> = {},
): string {
  const base = process.env.NEXT_PUBLIC_ODS_API_URL ?? DEFAULT_API
  const url = new URL(path, base.endsWith('/') ? base : `${base}/`)
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === null || value === '') continue
    url.searchParams.set(key, String(value))
  }
  return url.toString()
}

async function getJson<T>(
  path: string,
  query: Record<string, string | number | undefined | null> = {},
  revalidate = 300,
): Promise<T> {
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

export function fetchMeta() {
  return getJson<Meta>('/api/meta', {}, 60)
}

export function fetchScopes() {
  return getJson<Scopes>('/api/scopes')
}

export function fetchPractices(query: Record<string, string | number | undefined | null> = {}) {
  return getJson<ListResponse<PracticeRow>>('/api/practices', query)
}

export function fetchPcns(query: Record<string, string | number | undefined | null> = {}) {
  return getJson<ListResponse<PcnRow>>('/api/pcns', query)
}

export function fetchOrgs(query: Record<string, string | number | undefined | null> = {}) {
  return getJson<ListResponse<OrgSearchRow>>('/api/orgs', query)
}

export async function fetchOrg(code: string): Promise<OrgDetail | null> {
  try {
    return await getJson<OrgDetail>(`/api/orgs/${encodeURIComponent(code)}`)
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) return null
    throw err
  }
}

export function fetchChanges(query: Record<string, string | number | undefined | null> = {}) {
  return getJson<ChangesResponse>('/api/changes', query)
}
