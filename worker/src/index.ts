// ODS tracker API: public read endpoints over D1, plus scheduled ORD sync.
import { runSync } from './sync.ts'
import { refreshDerived } from './db/store.ts'
import {
  HttpError, changes, changesRss, meta, orgDetail, pcns, practiceRows, practicesCsv, scopes, searchOrgs,
} from './api/routes.ts'

// Cron runs have a 15 min wall clock; leave headroom.
const CRON_BUDGET_MS = 12 * 60_000
const CRON_MAX_ORGS = 6000

const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET, OPTIONS' }
const CACHE = { 'Cache-Control': 'public, max-age=300' }

const json = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
  Response.json(body, { status, headers: { ...CORS, ...headers } })

function authorised(req: Request, env: Env): boolean {
  const token = req.headers.get('Authorization')?.replace(/^Bearer\s+/i, '')
  return !!env.ADMIN_TOKEN && token === env.ADMIN_TOKEN
}

async function route(req: Request, env: Env): Promise<Response> {
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
      return json(result)
    }
    if (path === '/admin/refresh') {
      await refreshDerived(db)
      return json(await meta(db))
    }
    throw new HttpError(404, 'not found')
  }

  if (req.method !== 'GET') throw new HttpError(405, 'GET required')

  switch (path) {
    case '/':
      return json({
        name: 'ODS tracker API',
        endpoints: [
          '/api/meta', '/api/scopes', '/api/practices', '/api/pcns', '/api/orgs?q=', '/api/orgs/{code}',
          '/api/changes', '/api/changes.rss', '/api/export/practices.csv',
        ],
      })
    case '/api/meta':
      return json(await meta(db), 200, { 'Cache-Control': 'public, max-age=60' })
    case '/api/scopes':
      return json(await scopes(db), 200, CACHE)
    case '/api/practices':
      return json(await practiceRows(db, url), 200, CACHE)
    case '/api/pcns':
      return json(await pcns(db, url), 200, CACHE)
    case '/api/orgs':
      return json(await searchOrgs(db, url), 200, CACHE)
    case '/api/changes':
      return json(await changes(db, url), 200, CACHE)
    case '/api/changes.rss':
      return new Response(await changesRss(db, url, env.APP_URL), {
        headers: { ...CORS, ...CACHE, 'Content-Type': 'application/rss+xml; charset=utf-8' },
      })
    case '/api/export/practices.csv': {
      const asAt = url.searchParams.get('asAt') ?? 'current'
      const scope = url.searchParams.get('scope') ?? 'england'
      return new Response(await practicesCsv(db, url), {
        headers: {
          ...CORS, ...CACHE, 'Content-Type': 'text/csv; charset=utf-8',
          'Content-Disposition': `attachment; filename="practices-${scope}-${asAt}.csv"`,
        },
      })
    }
  }

  const org = path.match(/^\/api\/orgs\/([A-Za-z0-9]+)$/)
  if (org) return json(await orgDetail(db, org[1].toUpperCase()), 200, CACHE)

  throw new HttpError(404, 'not found')
}

export default {
  async fetch(req, env): Promise<Response> {
    try {
      return await route(req, env)
    } catch (err) {
      if (err instanceof HttpError) return json({ error: err.message }, err.status)
      console.error(err)
      return json({ error: 'internal error' }, 500)
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
