// ODS tracker API: public read endpoints over D1, plus scheduled ORD sync.
import { runSync } from './sync.ts'
import { refreshDerived, reindexSearch } from './db/store.ts'
import {
  HttpError, activity, changes, changesRss, children, facets, meta, orgDetail, orgs, orgsCsv, pcns, practiceRows,
  practicesCsv, scopes, suggest,
} from './api/routes.ts'

// Cron runs have a 15 min wall clock; leave headroom.
const CRON_BUDGET_MS = 12 * 60_000
const CRON_MAX_ORGS = 6000

const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET, OPTIONS' }
const cacheControl = (seconds: number) => ({ 'Cache-Control': `public, max-age=${seconds}` })

// D1 errors worth retrying once for read requests (brief contention, network, restarts).
const TRANSIENT = /network connection lost|reset|timed? ?out|overloaded|busy|locked|unavailable|internal error|storage caused object to be reset/i

interface Payload {
  body: string
  type: string
  seconds: number
  filename?: string
}

const jsonPayload = (data: unknown, seconds = 300): Payload => ({ body: JSON.stringify(data), type: 'application/json', seconds })

function respond(p: Payload, cacheStatus?: string): Response {
  const headers: Record<string, string> = { ...CORS, ...cacheControl(p.seconds), 'Content-Type': p.type }
  if (p.filename) headers['Content-Disposition'] = `attachment; filename="${p.filename}"`
  if (cacheStatus) headers['X-Cache'] = cacheStatus
  return new Response(p.body, { headers })
}

// Heavy, slow-changing responses are kept in KV for `ttl` seconds, keyed by path and sorted query.
async function kvCached(env: Env, ctx: ExecutionContext, url: URL, ttl: number, make: () => Promise<Payload>): Promise<Response> {
  const params = [...url.searchParams.entries()].sort(([a], [b]) => a.localeCompare(b))
  const key = `v1:${url.pathname}?${new URLSearchParams(params).toString()}`
  const hit = await env.CACHE.get<Payload>(key, 'json').catch(() => null)
  if (hit) return respond(hit, 'HIT')
  const payload = await make()
  ctx.waitUntil(env.CACHE.put(key, JSON.stringify(payload), { expirationTtl: ttl }).catch(() => undefined))
  return respond(payload, 'MISS')
}

function authorised(req: Request, env: Env): boolean {
  const token = req.headers.get('Authorization')?.replace(/^Bearer\s+/i, '')
  return !!env.ADMIN_TOKEN && token === env.ADMIN_TOKEN
}

async function route(req: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
  const url = new URL(req.url)
  const path = url.pathname.replace(/\/+$/, '') || '/'
  const db = env.DB

  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS })

  if (path.startsWith('/admin/')) {
    if (req.method !== 'POST') throw new HttpError(405, 'POST required')
    if (!authorised(req, env)) throw new HttpError(401, 'unauthorised')
    if (path === '/admin/sync') {
      const result = await runSync(env, {
        trigger: 'manual',
        maxOrgs: Math.min(Number(url.searchParams.get('max') ?? 1000), 5000),
        budgetMs: 10 * 60_000,
        list: url.searchParams.get('list') !== '0',
      })
      return respond(jsonPayload(result, 0))
    }
    if (path === '/admin/refresh') {
      // ?codes=A,B recomputes just those orgs and their dependants; otherwise a full rebuild.
      const codes = url.searchParams.get('codes')?.split(',').map((c) => c.trim().toUpperCase()).filter(Boolean)
      const timings = await refreshDerived(db, codes)
      return respond(jsonPayload({ timings, meta: await meta(db) }, 0))
    }
    if (path === '/admin/reindex') {
      await reindexSearch(db)
      return respond(jsonPayload({ ok: true }, 0))
    }
    throw new HttpError(404, 'not found')
  }

  if (req.method !== 'GET') throw new HttpError(405, 'GET required')

  switch (path) {
    case '/':
      return respond(jsonPayload({
        name: 'ODS tracker API',
        endpoints: [
          '/api/meta', '/api/scopes', '/api/orgs?q=&group=&scope=&status=', '/api/facets', '/api/suggest?q=',
          '/api/orgs/{code}', '/api/orgs/{code}/children', '/api/practices', '/api/pcns', '/api/changes',
          '/api/changes/activity', '/api/changes.rss', '/api/export/orgs.csv', '/api/export/practices.csv',
        ],
      }))
    case '/api/meta':
      return respond(jsonPayload(await meta(db), 60))
    case '/api/scopes':
      return kvCached(env, ctx, url, 3600, async () => jsonPayload(await scopes(db), 3600))
    case '/api/orgs':
      return respond(jsonPayload(await orgs(db, url)))
    case '/api/facets':
      return respond(jsonPayload(await facets(db, url)))
    case '/api/suggest':
      return respond(jsonPayload(await suggest(db, url)))
    case '/api/practices':
      // Past dates change only when ODS back-dates a correction.
      return url.searchParams.get('asAt')
        ? kvCached(env, ctx, url, 6 * 3600, async () => jsonPayload(await practiceRows(db, url), 3600))
        : respond(jsonPayload(await practiceRows(db, url)))
    case '/api/pcns':
      return respond(jsonPayload(await pcns(db, url)))
    case '/api/changes':
      return respond(jsonPayload(await changes(db, url)))
    case '/api/changes/activity':
      return kvCached(env, ctx, url, 3600, async () => jsonPayload(await activity(db, url), 3600))
    case '/api/changes.rss':
      return respond({ body: await changesRss(db, url, env.APP_URL), type: 'application/rss+xml; charset=utf-8', seconds: 300 })
    case '/api/export/practices.csv':
      return kvCached(env, ctx, url, 3600, async () => ({
        body: await practicesCsv(db, url),
        type: 'text/csv; charset=utf-8',
        seconds: 300,
        filename: `practices-${url.searchParams.get('scope') || 'england'}-${url.searchParams.get('asAt') || 'current'}.csv`,
      }))
    case '/api/export/orgs.csv':
      return kvCached(env, ctx, url, 3600, async () => ({
        body: await orgsCsv(db, url),
        type: 'text/csv; charset=utf-8',
        seconds: 300,
        filename: `ods-${url.searchParams.get('group') || 'all'}-${url.searchParams.get('scope') || 'england'}.csv`,
      }))
  }

  const kids = path.match(/^\/api\/orgs\/([A-Za-z0-9]+)\/children$/)
  if (kids) return respond(jsonPayload(await children(db, kids[1].toUpperCase(), url)))
  const org = path.match(/^\/api\/orgs\/([A-Za-z0-9]+)$/)
  if (org) return respond(jsonPayload(await orgDetail(db, org[1].toUpperCase())))

  throw new HttpError(404, 'not found')
}

export default {
  async fetch(req, env, ctx): Promise<Response> {
    for (let attempt = 0; ; attempt++) {
      try {
        return await route(req, env, ctx)
      } catch (err) {
        if (err instanceof HttpError) {
          return Response.json({ error: err.message }, { status: err.status, headers: CORS })
        }
        const message = err instanceof Error ? err.message : String(err)
        if (req.method === 'GET' && attempt === 0 && TRANSIENT.test(message)) {
          console.warn('retrying after transient error', req.url, message)
          await new Promise((r) => setTimeout(r, 200))
          continue
        }
        console.error('request failed', req.url, message)
        return Response.json(
          { error: 'The ODS database is busy or unavailable. Please try again shortly.' },
          { status: 503, headers: { ...CORS, 'Retry-After': '5' } },
        )
      }
    }
  },

  async scheduled(_event, env, ctx): Promise<void> {
    ctx.waitUntil(
      runSync(env, { trigger: 'cron', maxOrgs: CRON_MAX_ORGS, budgetMs: CRON_BUDGET_MS }).then((r) => {
        console.log('sync', JSON.stringify(r))
      }),
    )
  },
} satisfies ExportedHandler<Env>
