// Public read API over D1.
import { GROUP_KEYS, type GroupKey } from '../ods/groups.ts'
import { summarise } from './summary.ts'
import type {
  ActivityPoint, AreaCounts, ChangeItem, ChangeKind, ChangesResponse, ChildRow, Facets, GroupCount, Hierarchy,
  ListResponse, Meta, OrgDetail, OrgListRow, OrgRef, OrgRelInfo, PcnRow, PracticeRow, RoleRef, ScopeOption,
  Scopes, Stats, Suggestion, SyncRunInfo,
} from './types.ts'

type Row = Record<string, string | number | null>
type Params = (string | number | null)[]

export class HttpError extends Error {
  status: number
  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/
const CODE_RE = /^[A-Z0-9]{1,12}$/

function dateParam(url: URL, key: string): string | null {
  const v = url.searchParams.get(key)
  if (!v) return null
  // Round-trip rejects impossible dates such as 2019-13-45 or 2021-02-30.
  const d = new Date(`${v}T00:00:00Z`)
  if (!DATE_RE.test(v) || Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== v) {
    throw new HttpError(400, `${key} must be a real date as YYYY-MM-DD`)
  }
  return v
}

function codeParam(url: URL, key: string): string | null {
  const v = url.searchParams.get(key)?.trim().toUpperCase()
  if (!v) return null
  if (!CODE_RE.test(v)) throw new HttpError(400, `${key} must be an ODS code`)
  return v
}

function intParam(url: URL, key: string, def: number, max: number): number {
  const v = Number(url.searchParams.get(key) ?? def)
  if (!Number.isInteger(v) || v < 0) throw new HttpError(400, `${key} must be a non-negative integer`)
  return Math.min(v, max)
}

function groupsParam(url: URL): GroupKey[] {
  const groups = url.searchParams.get('group')?.split(',').filter(Boolean) ?? []
  for (const g of groups) if (!GROUP_KEYS.has(g as GroupKey)) throw new HttpError(400, `unknown group ${g}`)
  return groups as GroupKey[]
}

// FTS5 prefix query: each word must match the start of a token in code, name, town or postcode.
function ftsQuery(q: string | null | undefined): string | null {
  const tokens = (q ?? '').normalize('NFKD').split(/[^\p{L}\p{N}]+/u).filter((t) => t.length >= 2).slice(0, 6)
  return tokens.length ? tokens.map((t) => `"${t}"*`).join(' ') : null
}

async function all<T = Row>(db: D1Database, sql: string, params: Params = []): Promise<T[]> {
  return (await db.prepare(sql).bind(...params).all<T>()).results
}

const ref = (code: unknown, name: unknown): OrgRef | null => (code ? { code: String(code), name: name == null ? null : String(name) } : null)
const str = (v: unknown) => (v == null ? null : String(v))
const placeholders = (n: number) => Array.from({ length: n }, () => '?').join(', ')

// Role and relationship-type names change rarely; cache per isolate.
let refCache: { at: number; roles: Map<string, string>; rels: Map<string, string> } | null = null
async function refs(db: D1Database) {
  if (!refCache || Date.now() - refCache.at > 3_600_000) {
    const [roles, rels] = await db.batch<{ code: string; name: string }>([
      db.prepare('SELECT code, name FROM role_ref'),
      db.prepare('SELECT code, name FROM rel_type_ref'),
    ])
    refCache = {
      at: Date.now(),
      roles: new Map(roles.results.map((r) => [r.code, r.name])),
      rels: new Map(rels.results.map((r) => [r.code, r.name])),
    }
  }
  return refCache
}

// SQL fragment matching org_scope alias `s` against any area level.
const SCOPE_WHERE = '(s.pcn = ? OR s.sicbl = ? OR s.icb = ? OR s.region = ?)'
const scopeParams = (scope: string) => [scope, scope, scope, scope]

const HIERARCHY_NAMES = `
  LEFT JOIN org pn ON pn.code = s.pcn
  LEFT JOIN org sn ON sn.code = s.sicbl
  LEFT JOIN org iname ON iname.code = s.icb
  LEFT JOIN org rn ON rn.code = s.region`

const hierarchy = (r: Row): Hierarchy => ({
  pcn: ref(r.pcn, r.pcn_name),
  sicbl: ref(r.sicbl, r.sicbl_name),
  icb: ref(r.icb, r.icb_name),
  region: ref(r.region, r.region_name),
})

async function metaMap(db: D1Database): Promise<Map<string, string>> {
  const rows = await all<{ key: string; value: string }>(db, 'SELECT key, value FROM meta')
  return new Map(rows.map((r) => [r.key, r.value]))
}

function groupCounts(m: Map<string, string>): GroupCount[] {
  const rows = JSON.parse(m.get('group_counts') ?? '[]') as { grp: GroupKey; active: number; total: number }[]
  return rows.map((r) => ({ group: r.grp, active: Number(r.active), total: Number(r.total) }))
}

export async function meta(db: D1Database): Promise<Meta> {
  const [m, runs] = await Promise.all([metaMap(db), all(db, 'SELECT * FROM sync_run ORDER BY id DESC LIMIT 10')])
  return {
    lastSyncDate: m.get('last_sync_date') ?? null,
    lastSyncAt: m.get('last_sync_at') ?? null,
    snapshotDate: m.get('snapshot_date') ?? null,
    historyFrom: m.get('history_from') ?? null,
    stats: m.has('stats') ? (JSON.parse(m.get('stats')!) as Stats) : null,
    groups: groupCounts(m),
    runs: runs.map((r): SyncRunInfo => ({
      id: Number(r.id), startedAt: String(r.started_at), finishedAt: str(r.finished_at),
      trigger: String(r.trigger), since: str(r.since), listed: r.listed as number | null,
      processed: r.processed as number | null, changed: r.changed as number | null, events: r.events as number | null,
      failed: r.failed as number | null,
      remaining: r.remaining as number | null, status: String(r.status), error: str(r.error),
    })),
  }
}

export async function scopes(db: D1Database): Promise<Scopes> {
  const q = (role: string, parentCol: string) =>
    all(db, `
      SELECT o.code, o.name, s.${parentCol} AS parent, MAX(r.status = 'Active' AND o.status = 'Active') AS active
      FROM org_role r JOIN org o ON o.code = r.code LEFT JOIN org_scope s ON s.code = o.code
      WHERE r.role = ? GROUP BY o.code ORDER BY active DESC, o.name`, [role])
  const [regions, icbs, sicbls, m] = await Promise.all([
    q('RO209', 'region'), q('RO318', 'region'), q('RO319', 'icb'), metaMap(db),
  ])
  const areaRows = JSON.parse(m.get('area_counts') ?? '[]') as Record<string, string | number | null>[]
  const totals = (level: 'region' | 'icb' | 'sicbl') => {
    const out = new Map<string, AreaCounts>()
    for (const r of areaRows) {
      const code = r[level]
      if (!code) continue
      const c = out.get(String(code)) ?? { active: 0, gp: 0, pcn: 0 }
      c.active += Number(r.active)
      c.gp += Number(r.gp)
      c.pcn += Number(r.pcn)
      out.set(String(code), c)
    }
    return out
  }
  const map = (rows: Row[], type: ScopeOption['type']): ScopeOption[] => {
    const counts = totals(type)
    return rows.map((r) => ({
      code: String(r.code), name: String(r.name), type,
      parent: type === 'region' ? null : str(r.parent), active: Number(r.active) === 1,
      counts: counts.get(String(r.code)) ?? null,
    }))
  }
  return { regions: map(regions, 'region'), icbs: map(icbs, 'icb'), sicbls: map(sicbls, 'sicbl') }
}

function statusFilter(url: URL, col: string, def = 'active'): { sql: string; params: Params } {
  const status = url.searchParams.get('status') ?? def
  if (status === 'all') return { sql: '1 = 1', params: [] }
  if (status !== 'active' && status !== 'inactive') throw new HttpError(400, 'status must be active, inactive or all')
  return { sql: `${col} = ?`, params: [status === 'active' ? 'Active' : 'Inactive'] }
}

function textFilter(url: URL, cols: string[]): { sql: string; params: Params } {
  const q = url.searchParams.get('q')?.trim()
  if (!q) return { sql: '1 = 1', params: [] }
  const like = `%${q.replace(/[%_]/g, '')}%`
  return { sql: `(${cols.map((c) => `${c} LIKE ?`).join(' OR ')})`, params: cols.map(() => like) }
}

// Hierarchy for practices open on `asAt`, from relationship date ranges.
const AS_AT_PRACTICES = `
  WITH p AS (
    SELECT o.code, o.name, o.status, o.postcode, o.town, o.op_start, o.op_end,
      (SELECT r.target FROM org_rel r WHERE r.code = o.code AND r.rel_type = 'RE8' AND r.target_role = 'RO272'
         AND COALESCE(r.op_start, r.legal_start, '0000') <= ?1 AND (r.op_end IS NULL OR r.op_end >= ?1)
         ORDER BY r.op_start DESC LIMIT 1) AS pcn,
      (SELECT r.target FROM org_rel r WHERE r.code = o.code AND r.rel_type = 'RE4' AND r.target_role = 'RO98'
         AND COALESCE(r.op_start, r.legal_start, '0000') <= ?1 AND (r.op_end IS NULL OR r.op_end >= ?1)
         ORDER BY r.op_start DESC LIMIT 1) AS sicbl
    FROM org o
    WHERE EXISTS (SELECT 1 FROM org_role pr WHERE pr.code = o.code AND pr.role = 'RO76')
      AND COALESCE(o.op_start, '0000') <= ?1 AND (o.op_end IS NULL OR o.op_end >= ?1)
  ),
  q AS (
    SELECT p.*,
      (SELECT r.target FROM org_rel r WHERE r.code = p.sicbl AND r.rel_type = 'RE5' AND r.target_role = 'RO261'
         AND COALESCE(r.op_start, r.legal_start, '0000') <= ?1 AND (r.op_end IS NULL OR r.op_end >= ?1)
         ORDER BY r.op_start DESC LIMIT 1) AS icb
    FROM p
  ),
  s AS (
    SELECT q.*,
      (SELECT r.target FROM org_rel r WHERE r.code = q.icb AND r.rel_type = 'RE2' AND r.target_role = 'RO209'
         AND COALESCE(r.op_start, r.legal_start, '0000') <= ?1 AND (r.op_end IS NULL OR r.op_end >= ?1)
         ORDER BY r.op_start DESC LIMIT 1) AS region
    FROM q
  )
  SELECT s.*, pn.name AS pcn_name, sn.name AS sicbl_name, iname.name AS icb_name, rn.name AS region_name
  FROM s ${HIERARCHY_NAMES}`

const practiceRow = (r: Row): PracticeRow => ({
  code: String(r.code), name: String(r.name), status: String(r.status),
  postcode: str(r.postcode), town: str(r.town), opStart: str(r.op_start), opEnd: str(r.op_end),
  ...hierarchy(r),
})

export async function practiceRows(db: D1Database, url: URL, paged = true): Promise<ListResponse<PracticeRow>> {
  const scope = codeParam(url, 'scope')
  const asAt = dateParam(url, 'asAt')
  const limit = paged ? intParam(url, 'limit', 100, 1000) : 100_000
  const offset = paged ? intParam(url, 'offset', 0, 1_000_000) : 0

  if (asAt) {
    // Match the hierarchy on the date, or the practice's current one: ODS has no CCG -> STP
    // links before 2020, so "practices in today's ICB as they were in 2019" needs the latter.
    const text = textFilter(url, ['x.name', 'x.code', 'x.postcode'])
    const scopeSql = `(${SCOPE_WHERE.replace(/s\./g, 'x.')} OR EXISTS (SELECT 1 FROM org_scope s WHERE s.code = x.code AND ${SCOPE_WHERE}))`
    const where = `WHERE ${scope ? scopeSql : '1 = 1'} AND ${text.sql}`
    const params: Params = [asAt, ...(scope ? [...scopeParams(scope), ...scopeParams(scope)] : []), ...text.params]
    const base = `SELECT * FROM (${AS_AT_PRACTICES}) x ${where}`
    const [count, rows] = await Promise.all([
      db.prepare(`SELECT COUNT(*) AS n FROM (${base})`).bind(...params).first<{ n: number }>(),
      all(db, `${base} ORDER BY x.name LIMIT ${limit} OFFSET ${offset}`, params),
    ])
    return { total: count?.n ?? 0, items: rows.map(practiceRow), asAt }
  }

  const status = statusFilter(url, 'o.status')
  const text = textFilter(url, ['o.name', 'o.code', 'o.postcode'])
  const where = `WHERE s.grp = 'gp' AND ${scope ? SCOPE_WHERE : '1 = 1'} AND ${status.sql} AND ${text.sql}`
  const params: Params = [...(scope ? scopeParams(scope) : []), ...status.params, ...text.params]
  const [count, rows] = await Promise.all([
    db.prepare(`SELECT COUNT(*) AS n FROM org o JOIN org_scope s ON s.code = o.code ${where}`).bind(...params).first<{ n: number }>(),
    all(db, `
      SELECT o.code, o.name, o.status, o.postcode, o.town, o.op_start, o.op_end, s.pcn, s.sicbl, s.icb, s.region,
        pn.name AS pcn_name, sn.name AS sicbl_name, iname.name AS icb_name, rn.name AS region_name
      FROM org o JOIN org_scope s ON s.code = o.code ${HIERARCHY_NAMES} ${where}
      ORDER BY o.name LIMIT ${limit} OFFSET ${offset}`, params),
  ])
  return { total: count?.n ?? 0, items: rows.map(practiceRow), asAt: null }
}

export async function pcns(db: D1Database, url: URL): Promise<ListResponse<PcnRow>> {
  const scope = codeParam(url, 'scope')
  const status = statusFilter(url, 'o.status')
  const text = textFilter(url, ['o.name', 'o.code', 'o.postcode'])
  const limit = intParam(url, 'limit', 100, 2000)
  const offset = intParam(url, 'offset', 0, 1_000_000)
  const where = `WHERE o.primary_role = 'RO272' AND ${scope ? SCOPE_WHERE : '1 = 1'} AND ${status.sql} AND ${text.sql}`
  const params: Params = [...(scope ? scopeParams(scope) : []), ...status.params, ...text.params]
  const [count, rows] = await Promise.all([
    db.prepare(`SELECT COUNT(*) AS n FROM org o LEFT JOIN org_scope s ON s.code = o.code ${where}`).bind(...params).first<{ n: number }>(),
    all(db, `
      SELECT o.code, o.name, o.status, o.postcode, o.op_start, o.op_end, s.sicbl, s.icb, s.region,
        sn.name AS sicbl_name, iname.name AS icb_name, rn.name AS region_name,
        (SELECT COUNT(DISTINCT r.code) FROM org_rel r JOIN org m ON m.code = r.code
          WHERE r.target = o.code AND r.rel_type = 'RE8' AND r.op_end IS NULL AND m.status = 'Active') AS member_count
      FROM org o LEFT JOIN org_scope s ON s.code = o.code ${HIERARCHY_NAMES} ${where}
      ORDER BY o.name LIMIT ${limit} OFFSET ${offset}`, params),
  ])
  return {
    total: count?.n ?? 0,
    asAt: null,
    items: rows.map((r) => {
      const { pcn: _pcn, ...h } = hierarchy(r)
      return {
        code: String(r.code), name: String(r.name), status: String(r.status), postcode: str(r.postcode),
        opStart: str(r.op_start), opEnd: str(r.op_end), memberCount: Number(r.member_count), ...h,
      }
    }),
  }
}

// Filters shared by the browse list, facets and CSV export.
interface OrgFilter {
  from: string
  where: string[]
  params: Params
  match: string | null
  q: string
}

function orgFilter(url: URL, withGroups = true): OrgFilter {
  const q = url.searchParams.get('q')?.trim() ?? ''
  const match = ftsQuery(q)
  const f: OrgFilter = {
    from: match
      ? 'FROM org_search f JOIN org o ON o.code = f.code JOIN org_scope s ON s.code = o.code'
      : 'FROM org o JOIN org_scope s ON s.code = o.code',
    where: [],
    params: [],
    match,
    q,
  }
  if (match) {
    f.where.push('org_search MATCH ?')
    f.params.push(match)
  }
  const groups = withGroups ? groupsParam(url) : []
  if (groups.length) {
    f.where.push(`s.grp IN (${placeholders(groups.length)})`)
    f.params.push(...groups)
  }
  const role = codeParam(url, 'role')
  if (role) {
    f.where.push('EXISTS (SELECT 1 FROM org_role r WHERE r.code = o.code AND r.role = ?)')
    f.params.push(role)
  }
  const scope = codeParam(url, 'scope')
  if (scope) {
    f.where.push(SCOPE_WHERE)
    f.params.push(...scopeParams(scope))
  }
  const parent = codeParam(url, 'parent')
  if (parent) {
    f.where.push('s.parent = ?')
    f.params.push(parent)
  }
  const status = statusFilter(url, 'o.status')
  f.where.push(status.sql)
  f.params.push(...status.params)
  return f
}

const whereSql = (f: OrgFilter) => (f.where.length ? `WHERE ${f.where.join(' AND ')}` : '')

async function orgListRows(db: D1Database, url: URL, limit: number, offset: number) {
  const f = orgFilter(url)
  const sort = url.searchParams.get('sort') ?? (f.match ? 'relevance' : 'name')
  const orderParams: Params = []
  let order: string
  if (sort === 'relevance' && f.match) {
    order = "(o.code = ?) DESC, (o.status = 'Active') DESC, (CASE WHEN s.grp IN ('trust', 'commissioner', 'pcn', 'gp') THEN 0 WHEN s.grp IN ('school', 'other', 'devolved', 'legacy') THEN 2 ELSE 1 END), bm25(org_search, 20.0, 10.0, 1.0, 2.0)"
    orderParams.push(f.q.toUpperCase())
  } else if (sort === 'recent') order = 'o.op_start DESC, o.name'
  else if (sort === 'name' || sort === 'relevance') order = 'o.name'
  else throw new HttpError(400, 'sort must be relevance, name or recent')

  const [count, rows] = await Promise.all([
    db.prepare(`SELECT COUNT(*) AS n ${f.from} ${whereSql(f)}`).bind(...f.params).first<{ n: number }>(),
    all(db, `
      SELECT o.code, o.name, o.status, o.primary_role, o.postcode, o.town, o.op_start, o.op_end,
        s.grp, s.parent, s.pcn, s.sicbl, s.icb, s.region, par.name AS parent_name,
        pn.name AS pcn_name, sn.name AS sicbl_name, iname.name AS icb_name, rn.name AS region_name
      ${f.from} LEFT JOIN org par ON par.code = s.parent ${HIERARCHY_NAMES}
      ${whereSql(f)} ORDER BY ${order} LIMIT ${limit} OFFSET ${offset}`, [...f.params, ...orderParams]),
  ])
  const { roles } = await refs(db)
  const items = rows.map((r): OrgListRow => ({
    code: String(r.code), name: String(r.name), status: String(r.status), group: r.grp as GroupKey,
    primaryRole: r.primary_role ? { code: String(r.primary_role), name: roles.get(String(r.primary_role)) ?? null } : null,
    postcode: str(r.postcode), town: str(r.town), opStart: str(r.op_start), opEnd: str(r.op_end),
    parent: ref(r.parent, r.parent_name),
    ...hierarchy(r),
  }))
  return { total: count?.n ?? 0, items }
}

export async function orgs(db: D1Database, url: URL): Promise<ListResponse<OrgListRow>> {
  const limit = intParam(url, 'limit', 50, 500)
  const offset = intParam(url, 'offset', 0, 1_000_000)
  const { total, items } = await orgListRows(db, url, limit, offset)
  return { total, items, asAt: null }
}

export async function facets(db: D1Database, url: URL): Promise<Facets> {
  const f = orgFilter(url, false)
  const plain = !f.match && !['role', 'scope', 'parent'].some((k) => url.searchParams.get(k))
  let rows: { grp: GroupKey; n: number }[]
  if (plain) {
    // National counts are cached at refresh.
    const status = url.searchParams.get('status') ?? 'active'
    rows = groupCounts(await metaMap(db)).map((g) => ({
      grp: g.group,
      n: status === 'all' ? g.total : status === 'inactive' ? g.total - g.active : g.active,
    }))
  } else {
    rows = await all(db, `SELECT s.grp AS grp, COUNT(*) AS n ${f.from} ${whereSql(f)} GROUP BY s.grp`, f.params)
  }
  const groups = rows.filter((r) => r.n > 0).map((r) => ({ group: r.grp, count: Number(r.n) })).sort((a, b) => b.count - a.count)
  return { total: groups.reduce((a, g) => a + g.count, 0), groups }
}

export async function suggest(db: D1Database, url: URL): Promise<{ items: Suggestion[] }> {
  const q = url.searchParams.get('q')?.trim() ?? ''
  const match = ftsQuery(q)
  if (!match) return { items: [] }
  const rows = await all(db, `
    SELECT o.code, o.name, o.status, o.postcode, o.town, s.grp
    FROM org_search f JOIN org o ON o.code = f.code LEFT JOIN org_scope s ON s.code = o.code
    WHERE org_search MATCH ?
    ORDER BY (o.code = ?) DESC, (o.status = 'Active') DESC, (CASE WHEN s.grp IN ('trust', 'commissioner', 'pcn', 'gp') THEN 0 WHEN s.grp IN ('school', 'other', 'devolved', 'legacy') THEN 2 ELSE 1 END),
      bm25(org_search, 20.0, 10.0, 1.0, 2.0)
    LIMIT 8`, [match, q.toUpperCase()])
  return {
    items: rows.map((r) => ({
      code: String(r.code), name: String(r.name), status: String(r.status), group: (r.grp ?? 'other') as GroupKey,
      postcode: str(r.postcode), town: str(r.town),
    })),
  }
}

const KINDS = new Set<ChangeKind>([
  'created', 'removed', 'name', 'status', 'closed', 'reopened', 'dates', 'record_class', 'address', 'contact',
  'primary_role', 'role_added', 'role_ended', 'role_changed', 'role_removed', 'rel_added', 'rel_ended',
  'rel_changed', 'rel_removed', 'succ_added', 'succ_removed',
])

async function changeItems(db: D1Database, where: string, params: Params, limit: number): Promise<ChangeItem[]> {
  const rows = await all(db, `
    SELECT e.*, o.name AS org_name, rel.name AS related_name, s.grp AS grp
    FROM change_event e
    LEFT JOIN org o ON o.code = e.code
    LEFT JOIN org rel ON rel.code = e.related
    LEFT JOIN org_scope s ON s.code = e.code
    ${where}
    ORDER BY e.id DESC LIMIT ${limit}`, params)
  const { roles, rels } = await refs(db)
  const roleName = (c: string | null) => (c ? roles.get(c) ?? c : 'none')
  const relName = (c: string | null) => (c ? rels.get(c) ?? c : 'related to')
  return rows.map((r) => {
    const e = {
      kind: r.kind as ChangeKind, field: str(r.field), oldValue: str(r.old_value), newValue: str(r.new_value),
      related: str(r.related), relatedName: str(r.related_name), detail: str(r.detail),
    }
    return {
      id: Number(r.id),
      org: { code: String(r.code), name: str(r.org_name) ?? (r.kind === 'created' ? e.newValue : null) },
      group: (r.grp as GroupKey | null) ?? null,
      primaryRole: r.primary_role ? { code: String(r.primary_role), name: roles.get(String(r.primary_role)) ?? null } : null,
      kind: e.kind, field: e.field, oldValue: e.oldValue, newValue: e.newValue,
      related: ref(e.related, e.relatedName),
      effectiveDate: str(r.effective_date),
      detectedAt: String(r.detected_at),
      source: r.source as 'trud' | 'ord',
      summary: summarise(e, roleName, relName),
    }
  })
}

// Filters shared by the change feed and activity chart (alias e = change_event, s = org_scope).
function changeFilter(url: URL): { clauses: string[]; params: Params } {
  const clauses: string[] = []
  const params: Params = []
  const scope = codeParam(url, 'scope')
  if (scope) {
    clauses.push(SCOPE_WHERE)
    params.push(...scopeParams(scope))
  }
  const code = codeParam(url, 'code')
  if (code) {
    clauses.push('(e.code = ? OR e.related = ?)')
    params.push(code, code)
  }
  const kinds = url.searchParams.get('kinds')?.split(',').filter(Boolean) ?? []
  for (const k of kinds) if (!KINDS.has(k as ChangeKind)) throw new HttpError(400, `unknown kind ${k}`)
  if (kinds.length) {
    clauses.push(`e.kind IN (${placeholders(kinds.length)})`)
    params.push(...kinds)
  }
  const groups = groupsParam(url)
  if (groups.length) {
    clauses.push(`s.grp IN (${placeholders(groups.length)})`)
    params.push(...groups)
  }
  const since = dateParam(url, 'since')
  if (since) {
    clauses.push('e.detected_at >= ?')
    params.push(since)
  }
  const until = dateParam(url, 'until')
  if (until) {
    clauses.push('e.detected_at <= ?')
    params.push(until)
  }
  const source = url.searchParams.get('source')
  if (source) {
    if (source !== 'trud' && source !== 'ord') throw new HttpError(400, 'source must be trud or ord')
    clauses.push('e.source = ?')
    params.push(source)
  }
  return { clauses, params }
}

export async function changes(db: D1Database, url: URL, defaultLimit = 50): Promise<ChangesResponse> {
  const { clauses, params } = changeFilter(url)
  if (url.searchParams.get('before')) {
    clauses.push('e.id < ?')
    params.push(intParam(url, 'before', 0, Number.MAX_SAFE_INTEGER))
  }
  const limit = intParam(url, 'limit', defaultLimit, 500)
  const items = await changeItems(db, clauses.length ? `WHERE ${clauses.join(' AND ')}` : '', params, limit + 1)
  const more = items.length > limit
  return { items: items.slice(0, limit), nextBefore: more ? items[limit - 1].id : null }
}

// Monthly counts of openings, closures and other changes, by detected date.
export async function activity(db: D1Database, url: URL): Promise<{ months: ActivityPoint[] }> {
  const months = Math.max(1, intParam(url, 'months', 24, 120))
  const now = new Date()
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - (months - 1), 1))
  const { clauses, params } = changeFilter(url)
  // Join org_scope only when an area or type filter needs it; unfiltered months scan events alone.
  const join = clauses.some((c) => c.includes('s.')) ? 'JOIN org_scope s ON s.code = e.code' : ''
  clauses.unshift('e.detected_at >= ?')
  params.unshift(start.toISOString().slice(0, 10))
  const rows = await all(db, `
    SELECT substr(e.detected_at, 1, 7) AS month,
      SUM(e.kind IN ('created', 'reopened')) AS opened,
      SUM(e.kind = 'closed') AS closed,
      SUM(e.kind NOT IN ('created', 'reopened', 'closed')) AS changed
    FROM change_event e ${join}
    WHERE ${clauses.join(' AND ')}
    GROUP BY month ORDER BY month`, params)
  const byMonth = new Map(rows.map((r) => [String(r.month), r]))
  const out: ActivityPoint[] = []
  for (let i = 0; i < months; i++) {
    const d = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + i, 1))
    const month = d.toISOString().slice(0, 7)
    const r = byMonth.get(month)
    out.push({ month, opened: Number(r?.opened ?? 0), closed: Number(r?.closed ?? 0), changed: Number(r?.changed ?? 0) })
  }
  return { months: out }
}

// Orgs with a relationship to `code`, one row per org (e.g. a PCN's practices, a trust's sites).
async function childRows(db: D1Database, code: string, url: URL, limit: number, offset: number) {
  const groups = groupsParam(url)
  const status = url.searchParams.get('status') ?? 'current'
  if (!['current', 'past', 'all'].includes(status)) throw new HttpError(400, 'status must be current, past or all')
  const current = "(end_date IS NULL AND c.status = 'Active')"
  const having = status === 'current' ? `HAVING ${current}` : status === 'past' ? `HAVING NOT ${current}` : ''
  const base = `
    SELECT r.code, c.name, c.status, s.grp,
      GROUP_CONCAT(DISTINCT r.rel_type) AS rel_types,
      MIN(COALESCE(r.op_start, r.legal_start)) AS start,
      CASE WHEN SUM(r.op_end IS NULL) > 0 THEN NULL ELSE MAX(r.op_end) END AS end_date
    FROM org_rel r JOIN org c ON c.code = r.code LEFT JOIN org_scope s ON s.code = r.code
    WHERE r.target = ? ${groups.length ? `AND s.grp IN (${placeholders(groups.length)})` : ''}
    GROUP BY r.code ${having}`
  const params: Params = [code, ...groups]
  const [count, rows] = await Promise.all([
    db.prepare(`SELECT COUNT(*) AS n FROM (${base})`).bind(...params).first<{ n: number }>(),
    all(db, `${base} ORDER BY (end_date IS NULL) DESC, c.name LIMIT ${limit} OFFSET ${offset}`, params),
  ])
  const { rels } = await refs(db)
  const items = rows.map((r): ChildRow => ({
    code: String(r.code), name: String(r.name), status: String(r.status), group: (r.grp ?? 'other') as GroupKey,
    relTypes: String(r.rel_types ?? '').split(',').filter(Boolean).map((t) => ({ code: t, name: rels.get(t) ?? null })),
    start: str(r.start), end: str(r.end_date),
  }))
  return { total: count?.n ?? 0, items }
}

export async function children(db: D1Database, code: string, url: URL): Promise<ListResponse<ChildRow>> {
  if (!CODE_RE.test(code)) throw new HttpError(400, 'invalid ODS code')
  const { total, items } = await childRows(db, code, url, intParam(url, 'limit', 50, 500), intParam(url, 'offset', 0, 1_000_000))
  return { total, items, asAt: null }
}

const AREA_ROLES = new Set(['RO272', 'RO98', 'RO261', 'RO209'])

export async function orgDetail(db: D1Database, code: string): Promise<OrgDetail> {
  if (!CODE_RE.test(code)) throw new HttpError(400, 'invalid ODS code')
  const [org, roles, parents, succs, scope, childGroups] = await db.batch<Row>([
    db.prepare('SELECT * FROM org WHERE code = ?').bind(code),
    db.prepare('SELECT * FROM org_role WHERE code = ? ORDER BY is_primary DESC, op_start').bind(code),
    db.prepare(`
      SELECT r.*, t.name AS org_name, t.status AS org_status, t.primary_role AS org_role, ts.grp AS org_grp
      FROM org_rel r LEFT JOIN org t ON t.code = r.target LEFT JOIN org_scope ts ON ts.code = r.target
      WHERE r.code = ? ORDER BY (r.op_end IS NULL) DESC, r.op_start DESC`).bind(code),
    db.prepare(`
      SELECT s.*, t.name AS org_name FROM org_succ s LEFT JOIN org t ON t.code = s.target
      WHERE s.code = ? ORDER BY s.start_date`).bind(code),
    db.prepare(`
      SELECT s.*, par.name AS parent_name, pn.name AS pcn_name, sn.name AS sicbl_name, iname.name AS icb_name,
        rn.name AS region_name
      FROM org_scope s LEFT JOIN org par ON par.code = s.parent ${HIERARCHY_NAMES} WHERE s.code = ?`).bind(code),
    db.prepare(`
      SELECT s.grp AS grp,
        COUNT(DISTINCT CASE WHEN r.op_end IS NULL AND c.status = 'Active' THEN r.code END) AS active,
        COUNT(DISTINCT r.code) AS total
      FROM org_rel r JOIN org c ON c.code = r.code LEFT JOIN org_scope s ON s.code = r.code
      WHERE r.target = ? GROUP BY s.grp ORDER BY total DESC`).bind(code),
  ])
  const o = org.results[0]
  if (!o) throw new HttpError(404, `no organisation ${code}`)

  const isArea = AREA_ROLES.has(String(o.primary_role))
  const [kids, events, relatedEvents, area] = await Promise.all([
    childRows(db, code, new URL('https://x/?status=current'), 50, 0),
    changeItems(db, 'WHERE e.code = ?', [code], 200),
    changeItems(db, 'WHERE e.related = ? AND e.code <> ?', [code, code], 100),
    isArea
      ? all(db, `
          SELECT s.grp AS grp, SUM(o.status = 'Active') AS active, COUNT(*) AS total
          FROM org_scope s JOIN org o ON o.code = s.code
          WHERE (s.pcn = ?1 OR s.sicbl = ?1 OR s.icb = ?1 OR s.region = ?1) AND s.code <> ?1
          GROUP BY s.grp ORDER BY active DESC`, [code])
      : Promise.resolve(null),
  ])
  const { roles: roleNames, rels: relNames } = await refs(db)
  const rr = (c: unknown): RoleRef | null => (c ? { code: String(c), name: roleNames.get(String(c)) ?? null } : null)
  const dates = (r: Row) => ({
    opStart: str(r.op_start), opEnd: str(r.op_end), legalStart: str(r.legal_start), legalEnd: str(r.legal_end),
  })
  const counts = (rows: Row[]): GroupCount[] =>
    rows.map((r) => ({ group: (r.grp ?? 'other') as GroupKey, active: Number(r.active), total: Number(r.total) }))
  const s = scope.results[0]
  const childCounts = counts(childGroups.results)

  return {
    org: {
      code: String(o.code), name: String(o.name), status: String(o.status), recordClass: str(o.record_class),
      group: (s?.grp ?? 'other') as GroupKey,
      primaryRole: rr(o.primary_role),
      address: [o.addr1, o.addr2, o.addr3].filter(Boolean) as string[],
      town: str(o.town), county: str(o.county), postcode: str(o.postcode), country: str(o.country),
      uprn: o.uprn as number | null, tel: str(o.tel), url: str(o.url), lastChange: str(o.last_change),
      updatedAt: String(o.updated_at),
      ...dates(o),
    },
    hierarchy: s ? hierarchy(s) : { pcn: null, sicbl: null, icb: null, region: null },
    parent: s ? ref(s.parent, s.parent_name) : null,
    roles: roles.results.map((r) => ({
      id: Number(r.role_id), role: rr(r.role)!, primary: Number(r.is_primary) === 1, status: str(r.status), ...dates(r),
    })),
    parents: parents.results.map((r): OrgRelInfo => ({
      id: Number(r.rel_id),
      type: { code: String(r.rel_type), name: relNames.get(String(r.rel_type)) ?? null },
      org: ref(r.target, r.org_name)!,
      orgStatus: str(r.org_status),
      orgPrimaryRole: rr(r.org_role ?? r.target_role),
      orgGroup: (r.org_grp as GroupKey | null) ?? null,
      status: str(r.status),
      ...dates(r),
    })),
    children: kids.items,
    childrenCurrent: kids.total,
    childrenTotal: childCounts.reduce((a, g) => a + g.total, 0),
    childGroups: childCounts,
    area: area ? counts(area) : null,
    successions: succs.results.map((r) => ({
      id: Number(r.succ_id), type: String(r.succ_type), org: ref(r.target, r.org_name)!, date: str(r.start_date),
    })),
    events,
    relatedEvents,
  }
}

const csvEscape = (v: unknown) => {
  const s = v == null ? '' : String(v)
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}
const toCsv = (cols: string[], rows: unknown[][]) =>
  [cols.join(','), ...rows.map((r) => r.map(csvEscape).join(','))].join('\n') + '\n'

// CSV of practice -> PCN -> Sub-ICB -> ICB -> region, current or as at a date.
export async function practicesCsv(db: D1Database, url: URL): Promise<string> {
  const { items, asAt } = await practiceRows(db, url, false)
  const day = asAt ?? new Date().toISOString().slice(0, 10)
  return toCsv(
    ['practice_code', 'practice_name', 'status', 'postcode', 'open_date', 'close_date', 'pcn_code', 'pcn_name',
      'sub_icb_code', 'sub_icb_name', 'icb_code', 'icb_name', 'region_code', 'region_name', 'as_at'],
    items.map((p) => [
      p.code, p.name, p.status, p.postcode, p.opStart, p.opEnd, p.pcn?.code, p.pcn?.name, p.sicbl?.code, p.sicbl?.name,
      p.icb?.code, p.icb?.name, p.region?.code, p.region?.name, day,
    ]),
  )
}

// CSV of the browse list with the same filters (up to 50,000 rows).
export async function orgsCsv(db: D1Database, url: URL): Promise<string> {
  const { items } = await orgListRows(db, url, 50_000, 0)
  return toCsv(
    ['code', 'name', 'type', 'primary_role', 'status', 'postcode', 'town', 'open_date', 'close_date', 'parent_code',
      'parent_name', 'pcn_code', 'pcn_name', 'sub_icb_code', 'sub_icb_name', 'icb_code', 'icb_name', 'region_code',
      'region_name'],
    items.map((o) => [
      o.code, o.name, o.group, o.primaryRole?.name, o.status, o.postcode, o.town, o.opStart, o.opEnd, o.parent?.code,
      o.parent?.name, o.pcn?.code, o.pcn?.name, o.sicbl?.code, o.sicbl?.name, o.icb?.code, o.icb?.name,
      o.region?.code, o.region?.name,
    ]),
  )
}

export async function changesRss(db: D1Database, url: URL, appUrl: string): Promise<string> {
  const { items } = await changes(db, url, 100)
  const x = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
  const scope = url.searchParams.get('scope')
  const entries = items.map((c) => `
    <item>
      <title>${x(`${c.org.name ?? c.org.code} (${c.org.code}): ${c.summary}`)}</title>
      <link>${x(`${appUrl}/org/${c.org.code}`)}</link>
      <guid isPermaLink="false">ods-change-${c.id}</guid>
      <pubDate>${new Date(`${c.detectedAt}T00:00:00Z`).toUTCString()}</pubDate>
      <description>${x(`${c.summary}${c.effectiveDate ? ` (effective ${c.effectiveDate})` : ''}`)}</description>
    </item>`)
  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>${x(`ODS changes${scope ? ` in ${scope}` : ''}`)}</title>
    <link>${x(`${appUrl}/changes${scope ? `?scope=${scope}` : ''}`)}</link>
    <description>Changes to NHS Organisation Data Service records</description>${entries.join('')}
  </channel>
</rss>
`
}
