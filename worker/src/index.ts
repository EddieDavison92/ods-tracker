// ODS tracker API: public read endpoints over D1, plus scheduled ORD sync.
import { runSync } from './sync.ts'
import { refreshDerived, reindexSearch } from './db/store.ts'
import {
  HttpError, activity, changes, changesCsv, changesRss, checkParams, children, facets, meta, orgDetail, orgs, orgsCsvStream, pcns,
  practiceRows, practicesCsv, scopes, suggest,
} from './api/routes.ts'

// Cron runs have a 15 min wall clock; leave headroom.
const CRON_BUDGET_MS = 12 * 60_000
const CRON_MAX_ORGS = 6000

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Expose-Headers': 'X-Total-Count, X-Data-As-Of, X-Cache',
}
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
  const params = [...url.searchParams.entries()].filter(([k]) => !k.startsWith('_')).sort(([a], [b]) => a.localeCompare(b))
  const key = `v2:${url.pathname}?${new URLSearchParams(params).toString()}`
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

// Human-readable filename parts: "trust-site", "all-types".
const slug = (s: string | null, fallback: string) => (s ? s.toLowerCase().replace(/[^a-z0-9]+/g, '-') : fallback)

async function route(req: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
  const url = new URL(req.url)
  const path = url.pathname.replace(/\/+$/, '') || '/'

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
      const timings = await refreshDerived(env.DB, codes)
      return respond(jsonPayload({ timings, meta: await meta(env.DB) }, 0))
    }
    if (path === '/admin/reindex') {
      await reindexSearch(env.DB)
      return respond(jsonPayload({ ok: true }, 0))
    }
    throw new HttpError(404, 'unknown endpoint')
  }

  if (req.method !== 'GET') throw new HttpError(405, 'GET required')

  // Public reads may use any read replica; data changes at most every 6 hours, so replica lag is harmless.
  const db = env.DB.withSession('first-unconstrained')

  if (path !== '/' && path in ALLOWED_ENDPOINTS) checkParams(path, url)

  switch (path) {
    case '/':
      return respond(jsonPayload({
        name: 'ODS tracker API',
        docs: `${env.APP_URL}/docs`,
        endpoints: Object.keys(ALLOWED_ENDPOINTS),
      }))
    case '/robots.txt':
      // The API is for people and programs, not crawlers (a full CSV export reads every organisation).
      return new Response('User-agent: *\nDisallow: /\n', { headers: { ...cacheControl(86_400), 'Content-Type': 'text/plain' } })
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
        filename: `gp-practices-${slug(url.searchParams.get('scope'), 'england')}-${url.searchParams.get('asAt') || 'current'}.csv`,
      }))
    case '/api/export/changes.csv': {
      const { body, truncated } = await changesCsv(db, url)
      return new Response(body, {
        headers: {
          ...CORS, ...cacheControl(300), 'Content-Type': 'text/csv; charset=utf-8',
          'Content-Disposition': `attachment; filename="ods-changes-${slug(url.searchParams.get('scope'), 'england')}.csv"`,
          // More rows exist than the cap; narrow the filters or page the JSON feed.
          'X-Truncated': String(truncated),
        },
      })
    }
    case '/api/export/orgs.csv': {
      // Streamed with no row cap; X-Total-Count gives the expected row count.
      const { total, stream } = await orgsCsvStream(db, url)
      const status = url.searchParams.get('status') ?? 'active'
      const name = `ods-${slug(url.searchParams.get('group'), 'all-types')}-${slug(url.searchParams.get('scope'), 'england')}-${status}.csv`
      return new Response(stream, {
        headers: {
          ...CORS, ...cacheControl(300), 'Content-Type': 'text/csv; charset=utf-8',
          'Content-Disposition': `attachment; filename="${name}"`, 'X-Total-Count': String(total),
        },
      })
    }
  }

  const kids = path.match(/^\/api\/orgs\/([^/]+)\/children$/)
  if (kids) {
    checkParams('children', url)
    return respond(jsonPayload(await children(db, decodeURIComponent(kids[1]).trim().toUpperCase(), url)))
  }
  const org = path.match(/^\/api\/orgs\/([^/]+)$/)
  if (org) {
    checkParams('org', url)
    return respond(jsonPayload(await orgDetail(db, decodeURIComponent(org[1]).trim().toUpperCase())))
  }

  throw new HttpError(404, 'unknown endpoint')
}

// Endpoints with a fixed path (parameter rules live in routes.ts ALLOWED_PARAMS).
const ALLOWED_ENDPOINTS: Record<string, true> = {
  '/api/meta': true, '/api/scopes': true, '/api/orgs': true, '/api/facets': true, '/api/suggest': true,
  '/api/practices': true, '/api/pcns': true, '/api/changes': true, '/api/changes/activity': true,
  '/api/changes.rss': true, '/api/export/orgs.csv': true, '/api/export/practices.csv': true,
  '/api/export/changes.csv': true,
}

// Delays before each retry of a GET that hit a transient D1 error (plus up to 50% jitter).
const RETRY_DELAYS_MS = [150, 500, 1200]

// JSON API responses are kept in this data centre's edge cache for their Cache-Control max-age,
// so repeated requests skip D1. Exports stream large bodies and are left out.
const edgeCacheable = (req: Request, url: URL) =>
  req.method === 'GET' && url.pathname.startsWith('/api/') && !url.pathname.startsWith('/api/export/')

async function cachedRoute(req: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
  const url = new URL(req.url)
  if (!edgeCacheable(req, url)) return route(req, env, ctx)
  const cache = caches.default
  // Keyed by Worker version: after a deploy, data centres stop serving the old version's responses at once
  // (otherwise up to max-age later, and the site could re-cache an old response for hours).
  const keyUrl = new URL(url)
  keyUrl.searchParams.set('__v', env.CF_VERSION_METADATA?.id ?? 'dev')
  const key = new Request(keyUrl, { method: 'GET' })
  const hit = await cache.match(key).catch(() => undefined)
  if (hit) {
    const res = new Response(hit.body, hit)
    res.headers.set('X-Edge-Cache', 'HIT')
    return res
  }
  const res = await route(req, env, ctx)
  if (res.ok && /max-age=[1-9]/.test(res.headers.get('Cache-Control') ?? '')) {
    ctx.waitUntil(cache.put(key, res.clone()).catch(() => undefined))
  }
  return res
}

export default {
  async fetch(req, env, ctx): Promise<Response> {
    for (let attempt = 0; ; attempt++) {
      try {
        return await cachedRoute(req, env, ctx)
      } catch (err) {
        if (err instanceof HttpError) {
          return Response.json({ error: err.message }, { status: err.status, headers: CORS })
        }
        const message = err instanceof Error ? err.message : String(err)
        if (req.method === 'GET' && attempt < RETRY_DELAYS_MS.length && TRANSIENT.test(message)) {
          console.warn('retrying after transient error', attempt + 1, req.url, message)
          const delay = RETRY_DELAYS_MS[attempt]
          await new Promise((r) => setTimeout(r, delay + Math.random() * delay * 0.5))
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
