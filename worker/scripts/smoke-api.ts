// API contract and resilience smoke test.
// Checks every endpoint with valid, invalid and hostile parameters, response shapes, data freshness,
// latency, and org detail for sample orgs of every type.
// Usage: node scripts/smoke-api.ts [baseUrl]   (default: deployed Worker)
import { GROUPS } from '../src/ods/groups.ts'

const BASE = (process.argv[2] ?? 'https://ods-tracker-api.eddiefox-davison.workers.dev').replace(/\/$/, '')
const SLOW_MS = 3000

type Body = Record<string, any>
interface Check {
  path: string
  status: number
  method?: string
  // Returns an error message, or null when the body is as expected.
  test?: (body: Body, res: Response) => string | null
}

const today = new Date().toISOString().slice(0, 10)
const daysAgo = (iso: string) => (Date.parse(today) - Date.parse(iso)) / 86_400_000
const has = (b: Body, ...keys: string[]) => {
  const missing = keys.filter((k) => !(k in b))
  return missing.length ? `missing keys: ${missing.join(', ')}` : null
}

const checks: Check[] = [
  { path: '/', status: 200, test: (b) => has(b, 'endpoints') },
  {
    path: '/api/meta', status: 200,
    test: (b) => has(b, 'lastSyncDate', 'stats', 'groups', 'runs')
      ?? (b.stats.orgs < 300_000 ? `only ${b.stats.orgs} orgs` : null)
      ?? (b.groups.length < 15 ? `only ${b.groups.length} groups` : null)
      ?? (daysAgo(b.lastSyncDate) > 2 ? `data stale: last sync ${b.lastSyncDate}` : null)
      ?? (b.runs[0]?.status === 'error' ? `latest sync run failed: ${b.runs[0].error}` : null),
  },
  { path: '/api/scopes', status: 200, test: (b) => (b.regions.length < 7 ? 'too few regions' : b.icbs.some((i: Body) => i.counts) ? null : 'no area counts') },
  { path: '/api/orgs?group=gp&limit=5', status: 200, test: (b) => (b.items.length !== 5 ? 'expected 5 items' : b.total < 7000 ? `only ${b.total} practices` : null) },
  { path: '/api/orgs?q=archway&status=all', status: 200, test: (b) => (b.total > 0 ? null : 'no results') },
  { path: '/api/orgs?q=F83004', status: 200, test: (b) => (b.items[0]?.code === 'F83004' ? null : 'exact code not ranked first') },
  { path: '/api/orgs?q=%22%27%3B--%20DROP%20TABLE%20org', status: 200 },
  { path: '/api/orgs?q=%E2%9C%93%F0%9F%8F%A5', status: 200 },
  { path: '/api/orgs?q=a', status: 200 },
  { path: '/api/orgs?scope=Z9B2Z&group=pharmacy', status: 200, test: (b) => (b.total > 0 ? null : 'no pharmacies in Z9B2Z') },
  { path: '/api/orgs?parent=RRV', status: 200, test: (b) => (b.total > 0 ? null : 'no RRV sites') },
  { path: '/api/orgs?sort=recent&status=inactive&limit=3', status: 200 },
  { path: '/api/orgs?group=nope', status: 400 },
  { path: '/api/orgs?status=bogus', status: 400 },
  { path: '/api/orgs?limit=-1', status: 400 },
  { path: '/api/orgs?scope=<script>', status: 400 },
  { path: '/api/orgs?sort=evil', status: 400 },
  { path: '/api/facets?q=archway', status: 200, test: (b) => (b.groups.length ? null : 'no facets') },
  { path: '/api/facets?scope=Y56&status=all', status: 200, test: (b) => (b.total > 10_000 ? null : `only ${b.total}`) },
  { path: '/api/suggest?q=F83004', status: 200, test: (b) => (b.items[0]?.code === 'F83004' ? null : 'exact code not first') },
  { path: '/api/suggest?q=university%20college', status: 200, test: (b) => (b.items[0]?.code === 'RRV' ? null : `expected RRV first, got ${b.items[0]?.code}`) },
  { path: '/api/suggest?q=', status: 200, test: (b) => (b.items.length === 0 ? null : 'expected no items') },
  { path: '/api/suggest?q=%22', status: 200 },
  { path: '/api/orgs/F83004', status: 200, test: (b) => has(b, 'org', 'hierarchy', 'parents', 'children', 'events', 'relatedEvents') ?? (b.parents.length ? null : 'no parents') },
  { path: '/api/orgs/f83004', status: 200 },
  { path: '/api/orgs/Y00057', status: 200 },
  { path: '/api/orgs/Z9B2Z', status: 200, test: (b) => (b.area?.length ? null : 'ICB has no area counts') },
  { path: '/api/orgs/NOPE99999', status: 404 },
  { path: '/api/orgs/%3Cscript%3E', status: 404 },
  { path: '/api/orgs/RRV/children?group=trust_site', status: 200, test: (b) => (b.total > 0 ? null : 'no sites') },
  { path: '/api/orgs/RRV/children?status=past', status: 200 },
  { path: '/api/orgs/RRV/children?status=bad', status: 400 },
  { path: '/api/practices?asAt=2019-06-01&scope=Z9B2Z', status: 200, test: (b) => (b.total > 400 ? null : `only ${b.total}`) },
  { path: '/api/practices?asAt=2019-13-45', status: 400 },
  { path: '/api/pcns?scope=93C', status: 200, test: (b) => (b.total > 0 ? null : 'no PCNs') },
  { path: '/api/orgs?page=2', status: 400 },
  { path: '/api/orgs?type=gp', status: 400 },
  { path: '/api/orgs?limit=5000', status: 400 },
  { path: '/api/orgs?q=N19%203NU', status: 200, test: (b) => (b.items[0]?.postcode === 'N19 3NU' ? null : `expected N19 3NU first, got ${b.items[0]?.postcode}`) },
  { path: '/api/orgs?q=N19&group=gp', status: 200, test: (b) => (b.total > 0 && b.items.every((o: Body) => o.postcode?.startsWith('N19 ')) ? null : 'district search leaked') },
  { path: '/api/orgs?group=gp&limit=5', status: 200, test: (b) => has(b, 'limit', 'offset', 'nextOffset', 'dataAsOf') },
  { path: '/api/changes?limit=5', status: 200, test: (b) => (b.items.length === 5 && b.nextBefore && b.nextCursor ? null : 'expected 5 items and cursors') },
  { path: '/api/changes?limit=3&date=effective', status: 200, test: (b) => (b.items.every((i: Body) => i.effectiveDate) && b.nextCursor ? null : 'expected effective dates and a cursor') },
  { path: '/api/changes?cursor=2024-04-01%7C999999999&limit=3', status: 200, test: (b) => (b.items.every((i: Body) => i.detectedAt <= '2024-04-01') ? null : 'cursor ignored') },
  { path: '/api/changes?cursor=bad', status: 400 },
  { path: '/api/changes?date=whenever', status: 400 },
  { path: '/api/changes?kinds=rel_added,rel_ended&field=RE8&limit=5', status: 200, test: (b) => (b.items.every((i: Body) => i.field === 'RE8') ? null : 'field filter ignored') },
  { path: '/api/changes?field=%27%3B', status: 400 },
  { path: '/api/changes/activity?interval=year&years=9', status: 200, test: (b) => (b.months.length === 9 && b.months[0].month.length === 4 ? null : `got ${JSON.stringify(b.months[0])}`) },
  { path: '/api/changes/activity?interval=week', status: 400 },
  { path: '/api/changes/activity?months=12&date=effective&kinds=created', status: 200 },
  { path: '/api/export/changes.csv?scope=93C&since=2026-01-01', status: 200, test: (_b, r) => (r.headers.get('content-type')?.includes('csv') ? null : 'not CSV') },
  { path: '/api/changes?group=gp,pcn&kinds=created,closed&scope=Y56', status: 200 },
  { path: '/api/changes?code=F83004', status: 200, test: (b) => (b.items.length ? null : 'no events for F83004') },
  { path: '/api/changes?kinds=bogus', status: 400 },
  { path: '/api/changes?before=abc', status: 400 },
  { path: '/api/changes?since=yesterday', status: 400 },
  { path: '/api/changes/activity?months=12', status: 200, test: (b) => (b.months.length === 12 ? null : `got ${b.months.length} months`) },
  { path: '/api/changes/activity?months=100&group=gp', status: 200 },
  { path: '/api/changes.rss?scope=Z9B2Z', status: 200, test: (_b, r) => (r.headers.get('content-type')?.includes('xml') ? null : 'not XML') },
  { path: '/api/export/orgs.csv?group=trust', status: 200, test: (_b, r) => (r.headers.get('content-type')?.includes('csv') ? null : 'not CSV') },
  { path: '/api/export/practices.csv?scope=93C&asAt=2021-01-01', status: 200 },
  { path: '/admin/sync', status: 405 },
  { path: '/admin/sync', method: 'POST', status: 401 },
  { path: '/nope', status: 404 },
]

let failures = 0
const slow: string[] = []

async function run(c: Check) {
  const t0 = Date.now()
  let res: Response
  try {
    res = await fetch(BASE + c.path, { method: c.method ?? 'GET', signal: AbortSignal.timeout(20_000) })
  } catch (err) {
    failures++
    console.log(`FAIL ${c.method ?? 'GET'} ${c.path}: ${(err as Error).message}`)
    return
  }
  const ms = Date.now() - t0
  if (ms > SLOW_MS) slow.push(`${c.path} ${ms}ms`)
  const text = await res.text()
  let problem: string | null = res.status === c.status ? null : `status ${res.status}, expected ${c.status}: ${text.slice(0, 120)}`
  if (!problem && res.headers.get('access-control-allow-origin') !== '*' && c.path.startsWith('/api/')) problem = 'missing CORS header'
  if (!problem && c.test) {
    let body: Body = {}
    try {
      body = res.headers.get('content-type')?.includes('json') ? JSON.parse(text) : {}
    } catch {
      problem = 'invalid JSON'
    }
    if (!problem) {
      try {
        problem = c.test(body, res)
      } catch (err) {
        problem = `test threw: ${(err as Error).message}`
      }
    }
  }
  if (problem) {
    failures++
    console.log(`FAIL ${c.method ?? 'GET'} ${c.path} (${ms}ms): ${problem}`)
  }
}

console.log(`Smoke testing ${BASE}`)
for (let i = 0; i < checks.length; i += 6) await Promise.all(checks.slice(i, i + 6).map(run))

// Org detail for sample orgs of every type, active and closed.
const samples: string[] = []
for (const g of GROUPS) {
  for (const status of ['active', 'inactive']) {
    const res = await fetch(`${BASE}/api/orgs?group=${g.key}&status=${status}&sort=recent&limit=2`)
    if (res.ok) samples.push(...((await res.json()) as Body).items.map((o: Body) => o.code))
  }
}
const detail: Check[] = samples.flatMap((code) => [
  { path: `/api/orgs/${code}`, status: 200, test: (b: Body) => has(b, 'org', 'parents', 'events') },
  { path: `/api/orgs/${code}/children?status=all`, status: 200 },
])
for (let i = 0; i < detail.length; i += 6) await Promise.all(detail.slice(i, i + 6).map(run))

console.log(`\n${checks.length + detail.length} checks, ${samples.length} sample orgs, ${failures} failures`)
if (slow.length) console.log(`slow (>${SLOW_MS}ms):\n  ${slow.join('\n  ')}`)
process.exit(failures ? 1 : 0)
