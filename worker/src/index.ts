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
const cache = (seconds: number) => ({ 'Cache-Control': `public, max-age=${seconds}` })

const json = (body: unknown, seconds = 300) =>
  Response.json(body, { headers: { ...CORS, ...cache(seconds) } })

function authorised(req: Request, env: Env): boolean {
  const token = req.headers.get('Authorization')?.replace(/^Bearer\s+/i, '')
  return !!env.ADMIN_TOKEN && token === env.ADMIN_TOKEN
}

function csv(body: string, filename: string) {
  return new Response(body, {
    headers: {
      ...CORS, ...cache(300), 'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  })
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
      return json(result, 0)
    }
    if (path === '/admin/refresh') {
      await refreshDerived(db)
      return json(await meta(db), 0)
    }
    if (path === '/admin/reindex') {
      await reindexSearch(db)
      return json({ ok: true }, 0)
    }
    throw new HttpError(404, 'not found')
  }

  if (req.method !== 'GET') throw new HttpError(405, 'GET required')

  switch (path) {
    case '/':
      return json({
        name: 'ODS tracker API',
        endpoints: [
          '/api/meta', '/api/scopes', '/api/orgs?q=&group=&scope=&status=', '/api/facets', '/api/suggest?q=',
          '/api/orgs/{code}', '/api/orgs/{code}/children', '/api/practices', '/api/pcns', '/api/changes',
          '/api/changes/activity', '/api/changes.rss', '/api/export/orgs.csv', '/api/export/practices.csv',
        ],
      })
    case '/api/meta':
      return json(await meta(db), 60)
    case '/api/scopes':
      return json(await scopes(db), 3600)
    case '/api/orgs':
      return json(await orgs(db, url))
    case '/api/facets':
      return json(await facets(db, url))
    case '/api/suggest':
      return json(await suggest(db, url))
    case '/api/practices':
      return json(await practiceRows(db, url))
    case '/api/pcns':
      return json(await pcns(db, url))
    case '/api/changes':
      return json(await changes(db, url))
    case '/api/changes/activity':
      return json(await activity(db, url), 3600)
    case '/api/changes.rss':
      return new Response(await changesRss(db, url, env.APP_URL), {
        headers: { ...CORS, ...cache(300), 'Content-Type': 'application/rss+xml; charset=utf-8' },
      })
    case '/api/export/practices.csv':
      return csv(
        await practicesCsv(db, url),
        `practices-${url.searchParams.get('scope') ?? 'england'}-${url.searchParams.get('asAt') ?? 'current'}.csv`,
      )
    case '/api/export/orgs.csv':
      return csv(
        await orgsCsv(db, url),
        `ods-${url.searchParams.get('group') || 'all'}-${url.searchParams.get('scope') ?? 'england'}.csv`,
      )
  }

  const kids = path.match(/^\/api\/orgs\/([A-Za-z0-9]+)\/children$/)
  if (kids) return json(await children(db, kids[1].toUpperCase(), url))
  const org = path.match(/^\/api\/orgs\/([A-Za-z0-9]+)$/)
  if (org) return json(await orgDetail(db, org[1].toUpperCase()))

  throw new HttpError(404, 'not found')
}

export default {
  async fetch(req, env): Promise<Response> {
    try {
      return await route(req, env)
    } catch (err) {
      if (err instanceof HttpError) {
        return Response.json({ error: err.message }, { status: err.status, headers: CORS })
      }
      console.error(err)
      return Response.json({ error: 'internal error' }, { status: 500, headers: CORS })
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
