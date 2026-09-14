// Public read API over D1.
import { summarise } from './summary.ts'
import type {
  ChangeItem, ChangeKind, ChangesResponse, Hierarchy, ListResponse, Meta, OrgDetail, OrgRef, OrgRelInfo,
  OrgSearchRow, PcnRow, PracticeRow, RoleRef, ScopeOption, Scopes, Stats, SyncRunInfo,
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
  if (!DATE_RE.test(v)) throw new HttpError(400, `${key} must be YYYY-MM-DD`)
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

async function all<T = Row>(db: D1Database, sql: string, params: Params = []): Promise<T[]> {
  return (await db.prepare(sql).bind(...params).all<T>()).results
}

const ref = (code: unknown, name: unknown): OrgRef | null => (code ? { code: String(code), name: name == null ? null : String(name) } : null)

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

async function roleRef(db: D1Database, code: unknown): Promise<RoleRef | null> {
  if (!code) return null
  return { code: String(code), name: (await refs(db)).roles.get(String(code)) ?? null }
}

// SQL fragment matching org_scope alias `s` against any hierarchy level.
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

export async function meta(db: D1Database): Promise<Meta> {
  const rows = await all<{ key: string; value: string }>(db, 'SELECT key, value FROM meta')
  const m = new Map(rows.map((r) => [r.key, r.value]))
  const runs = await all(db, 'SELECT * FROM sync_run ORDER BY id DESC LIMIT 10')
  return {
    lastSyncDate: m.get('last_sync_date') ?? null,
    lastSyncAt: m.get('last_sync_at') ?? null,
    snapshotDate: m.get('snapshot_date') ?? null,
    historyFrom: m.get('history_from') ?? null,
    stats: m.has('stats') ? (JSON.parse(m.get('stats')!) as Stats) : null,
    runs: runs.map((r): SyncRunInfo => ({
      id: Number(r.id), startedAt: String(r.started_at), finishedAt: r.finished_at as string | null,
      trigger: String(r.trigger), since: r.since as string | null, listed: r.listed as number | null,
      processed: r.processed as number | null, changed: r.changed as number | null, events: r.events as number | null,
      remaining: r.remaining as number | null, status: String(r.status), error: r.error as string | null,
    })),
  }
}

export async function scopes(db: D1Database): Promise<Scopes> {
  const q = (role: string, parentCol: string) =>
    all(db, `
      SELECT o.code, o.name, s.${parentCol} AS parent, MAX(r.status = 'Active' AND o.status = 'Active') AS active
      FROM org_role r JOIN org o ON o.code = r.code LEFT JOIN org_scope s ON s.code = o.code
      WHERE r.role = ? GROUP BY o.code ORDER BY active DESC, o.name`, [role])
  const [regions, icbs, sicbls] = await Promise.all([q('RO209', 'region'), q('RO318', 'region'), q('RO319', 'icb')])
  const map = (rows: Row[], type: ScopeOption['type']): ScopeOption[] =>
    rows.map((r) => ({
      code: String(r.code), name: String(r.name), type,
      parent: type === 'region' ? null : (r.parent as string | null), active: Number(r.active) === 1,
    }))
  return { regions: map(regions, 'region'), icbs: map(icbs, 'icb'), sicbls: map(sicbls, 'sicbl') }
}

function statusFilter(url: URL, col: string): { sql: string; params: Params } {
  const status = url.searchParams.get('status') ?? 'active'
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
  postcode: r.postcode as string | null, town: r.town as string | null,
  opStart: r.op_start as string | null, opEnd: r.op_end as string | null,
  ...hierarchy(r),
})

export async function practiceRows(db: D1Database, url: URL, paged = true): Promise<ListResponse<PracticeRow>> {
  const scope = codeParam(url, 'scope')
  const asAt = dateParam(url, 'asAt')
  const limit = paged ? intParam(url, 'limit', 100, 1000) : 100_000
  const offset = paged ? intParam(url, 'offset', 0, 1_000_000) : 0

  if (asAt) {
    const text = textFilter(url, ['x.name', 'x.code', 'x.postcode'])
    const where = `WHERE ${scope ? SCOPE_WHERE.replace(/s\./g, 'x.') : '1 = 1'} AND ${text.sql}`
    const params: Params = [asAt, ...(scope ? scopeParams(scope) : []), ...text.params]
    const base = `SELECT * FROM (${AS_AT_PRACTICES}) x ${where}`
    const [count, rows] = await Promise.all([
      db.prepare(`SELECT COUNT(*) AS n FROM (${base})`).bind(...params).first<{ n: number }>(),
      all(db, `${base} ORDER BY x.name LIMIT ${limit} OFFSET ${offset}`, params),
    ])
    return { total: count?.n ?? 0, items: rows.map(practiceRow), asAt }
  }

  const status = statusFilter(url, 'o.status')
  const text = textFilter(url, ['o.name', 'o.code', 'o.postcode'])
  const from = `
    FROM org o JOIN org_role pr ON pr.code = o.code AND pr.role = 'RO76'
    LEFT JOIN org_scope s ON s.code = o.code
    WHERE ${scope ? SCOPE_WHERE : '1 = 1'} AND ${status.sql} AND ${text.sql}`
  const params: Params = [...(scope ? scopeParams(scope) : []), ...status.params, ...text.params]
  const [count, rows] = await Promise.all([
    db.prepare(`SELECT COUNT(*) AS n ${from}`).bind(...params).first<{ n: number }>(),
    all(db, `
      SELECT o.code, o.name, o.status, o.postcode, o.town, o.op_start, o.op_end, s.pcn, s.sicbl, s.icb, s.region,
        pn.name AS pcn_name, sn.name AS sicbl_name, iname.name AS icb_name, rn.name AS region_name
      ${from.replace('LEFT JOIN org_scope s ON s.code = o.code', `LEFT JOIN org_scope s ON s.code = o.code ${HIERARCHY_NAMES}`)}
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
  const from = `
    FROM org o LEFT JOIN org_scope s ON s.code = o.code
    WHERE o.primary_role = 'RO272' AND ${scope ? SCOPE_WHERE : '1 = 1'} AND ${status.sql} AND ${text.sql}`
  const params: Params = [...(scope ? scopeParams(scope) : []), ...status.params, ...text.params]
  const [count, rows] = await Promise.all([
    db.prepare(`SELECT COUNT(*) AS n ${from}`).bind(...params).first<{ n: number }>(),
    all(db, `
      SELECT o.code, o.name, o.status, o.postcode, o.op_start, o.op_end, s.sicbl, s.icb, s.region,
        sn.name AS sicbl_name, iname.name AS icb_name, rn.name AS region_name,
        (SELECT COUNT(*) FROM org_rel r JOIN org m ON m.code = r.code
          WHERE r.target = o.code AND r.rel_type = 'RE8' AND r.op_end IS NULL AND m.status = 'Active') AS member_count
      ${from.replace('LEFT JOIN org_scope s ON s.code = o.code', `LEFT JOIN org_scope s ON s.code = o.code ${HIERARCHY_NAMES}`)}
      ORDER BY o.name LIMIT ${limit} OFFSET ${offset}`, params),
  ])
  return {
    total: count?.n ?? 0,
    asAt: null,
    items: rows.map((r) => {
      const { pcn: _pcn, ...h } = hierarchy(r)
      return {
        code: String(r.code), name: String(r.name), status: String(r.status), postcode: r.postcode as string | null,
        opStart: r.op_start as string | null, opEnd: r.op_end as string | null, memberCount: Number(r.member_count),
        ...h,
      }
    }),
  }
}

export async function searchOrgs(db: D1Database, url: URL): Promise<ListResponse<OrgSearchRow>> {
  const q = url.searchParams.get('q')?.trim().toUpperCase() ?? ''
  const role = codeParam(url, 'role')
  const limit = intParam(url, 'limit', 25, 100)
  if (q.length < 2 && !role) throw new HttpError(400, 'q must be at least 2 characters')
  const status = statusFilter(url, 'o.status')
  const text = q ? textFilter(url, ['o.name', 'o.postcode']) : { sql: '1 = 1', params: [] }
  const where = `WHERE (${q ? `o.code = ? OR ${text.sql}` : '1 = 1'})
    AND ${role ? 'EXISTS (SELECT 1 FROM org_role r WHERE r.code = o.code AND r.role = ?)' : '1 = 1'}
    AND ${url.searchParams.has('status') ? status.sql : '1 = 1'}`
  const params: Params = [
    ...(q ? [q, ...text.params] : []), ...(role ? [role] : []), ...(url.searchParams.has('status') ? status.params : []),
  ]
  const rows = await all(db, `
    SELECT o.code, o.name, o.status, o.postcode, o.town, o.primary_role FROM org o ${where}
    ORDER BY (o.code = ?) DESC, (o.status = 'Active') DESC, o.name LIMIT ${limit}`, [...params, q])
  const { roles } = await refs(db)
  return {
    total: rows.length,
    asAt: null,
    items: rows.map((r) => ({
      code: String(r.code), name: String(r.name), status: String(r.status), postcode: r.postcode as string | null,
      town: r.town as string | null,
      primaryRole: r.primary_role ? { code: String(r.primary_role), name: roles.get(String(r.primary_role)) ?? null } : null,
    })),
  }
}

const KINDS = new Set<ChangeKind>([
  'created', 'removed', 'name', 'status', 'closed', 'reopened', 'dates', 'record_class', 'address', 'contact',
  'primary_role', 'role_added', 'role_ended', 'role_changed', 'role_removed', 'rel_added', 'rel_ended',
  'rel_changed', 'rel_removed', 'succ_added', 'succ_removed',
])

// Org type filters for the change feed.
const TYPE_FILTERS: Record<string, string> = {
  practice: "e.code IN (SELECT code FROM org_role WHERE role = 'RO76')",
  pcn: "e.primary_role = 'RO272'",
  commissioner: "e.primary_role IN ('RO98', 'RO261', 'RO209')",
  trust: "e.primary_role IN ('RO197', 'RO57')",
  pharmacy: "e.primary_role IN ('RO182', 'RO181')",
}

async function changeItems(db: D1Database, where: string, params: Params, limit: number): Promise<ChangeItem[]> {
  const rows = await all(db, `
    SELECT e.*, o.name AS org_name, rel.name AS related_name
    FROM change_event e
    LEFT JOIN org o ON o.code = e.code
    LEFT JOIN org rel ON rel.code = e.related
    ${where}
    ORDER BY e.id DESC LIMIT ${limit}`, params)
  const { roles, rels } = await refs(db)
  const roleName = (c: string | null) => (c ? roles.get(c) ?? c : 'none')
  const relName = (c: string | null) => (c ? rels.get(c) ?? c : 'related to')
  return rows.map((r) => {
    const e = {
      kind: r.kind as ChangeKind, field: r.field as string | null, oldValue: r.old_value as string | null,
      newValue: r.new_value as string | null, related: r.related as string | null,
      relatedName: r.related_name as string | null, detail: r.detail as string | null,
    }
    return {
      id: Number(r.id),
      org: { code: String(r.code), name: (r.org_name as string | null) ?? (r.kind === 'created' ? e.newValue : null) },
      primaryRole: r.primary_role ? { code: String(r.primary_role), name: roles.get(String(r.primary_role)) ?? null } : null,
      kind: e.kind, field: e.field, oldValue: e.oldValue, newValue: e.newValue,
      related: ref(e.related, e.relatedName),
      effectiveDate: r.effective_date as string | null,
      detectedAt: String(r.detected_at),
      source: r.source as 'trud' | 'ord',
      summary: summarise(e, roleName, relName),
    }
  })
}

export async function changes(db: D1Database, url: URL, defaultLimit = 50): Promise<ChangesResponse> {
  const clauses: string[] = []
  const params: Params = []
  let join = ''
  const scope = codeParam(url, 'scope')
  if (scope) {
    join = 'JOIN org_scope s ON s.code = e.code'
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
    clauses.push(`e.kind IN (${kinds.map(() => '?').join(',')})`)
    params.push(...kinds)
  }
  const type = url.searchParams.get('type')
  if (type && type !== 'all') {
    if (!TYPE_FILTERS[type]) throw new HttpError(400, `type must be one of ${Object.keys(TYPE_FILTERS).join(', ')}, all`)
    clauses.push(TYPE_FILTERS[type])
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
  const before = url.searchParams.get('before')
  if (before) {
    clauses.push('e.id < ?')
    params.push(intParam(url, 'before', 0, Number.MAX_SAFE_INTEGER))
  }
  const limit = intParam(url, 'limit', defaultLimit, 500)
  const where = `${join} ${clauses.length ? `WHERE ${clauses.join(' AND ')}` : ''}`
  const items = await changeItems(db, where, params, limit + 1)
  const more = items.length > limit
  return { items: items.slice(0, limit), nextBefore: more ? items[limit - 1].id : null }
}

export async function orgDetail(db: D1Database, code: string): Promise<OrgDetail> {
  if (!CODE_RE.test(code)) throw new HttpError(400, 'invalid ODS code')
  const [org, roles, parents, children, childCount, succs, scope] = await db.batch<Row>([
    db.prepare('SELECT * FROM org WHERE code = ?').bind(code),
    db.prepare('SELECT * FROM org_role WHERE code = ? ORDER BY is_primary DESC, op_start').bind(code),
    db.prepare(`
      SELECT r.*, t.name AS org_name, t.status AS org_status, t.primary_role AS org_role
      FROM org_rel r LEFT JOIN org t ON t.code = r.target
      WHERE r.code = ? ORDER BY (r.op_end IS NULL) DESC, r.op_start DESC`).bind(code),
    db.prepare(`
      SELECT r.*, c.code AS child_code, c.name AS org_name, c.status AS org_status, c.primary_role AS org_role
      FROM org_rel r JOIN org c ON c.code = r.code
      WHERE r.target = ? ORDER BY (r.op_end IS NULL) DESC, (c.status = 'Active') DESC, c.name LIMIT 1000`).bind(code),
    db.prepare('SELECT COUNT(*) AS n FROM org_rel WHERE target = ?').bind(code),
    db.prepare(`
      SELECT s.*, t.name AS org_name FROM org_succ s LEFT JOIN org t ON t.code = s.target
      WHERE s.code = ? ORDER BY s.start_date`).bind(code),
    db.prepare(`
      SELECT s.*, pn.name AS pcn_name, sn.name AS sicbl_name, iname.name AS icb_name, rn.name AS region_name
      FROM org_scope s ${HIERARCHY_NAMES} WHERE s.code = ?`).bind(code),
  ])
  const o = org.results[0]
  if (!o) throw new HttpError(404, `no organisation ${code}`)
  const { roles: roleNames, rels: relNames } = await refs(db)
  const rr = (c: unknown): RoleRef | null => (c ? { code: String(c), name: roleNames.get(String(c)) ?? null } : null)
  const dates = (r: Row) => ({
    opStart: r.op_start as string | null, opEnd: r.op_end as string | null,
    legalStart: r.legal_start as string | null, legalEnd: r.legal_end as string | null,
  })
  const rel = (r: Row, orgCode: unknown): OrgRelInfo => ({
    id: Number(r.rel_id),
    type: { code: String(r.rel_type), name: relNames.get(String(r.rel_type)) ?? null },
    org: ref(orgCode, r.org_name)!,
    orgStatus: r.org_status as string | null,
    orgPrimaryRole: rr(r.org_role ?? r.target_role),
    status: r.status as string | null,
    ...dates(r),
  })
  const events = await changeItems(db, 'WHERE e.code = ? OR e.related = ?', [code, code], 300)
  const s = scope.results[0]

  return {
    org: {
      code: String(o.code), name: String(o.name), status: String(o.status), recordClass: o.record_class as string | null,
      primaryRole: rr(o.primary_role),
      address: [o.addr1, o.addr2, o.addr3].filter(Boolean) as string[],
      town: o.town as string | null, county: o.county as string | null, postcode: o.postcode as string | null,
      country: o.country as string | null, uprn: o.uprn as number | null, tel: o.tel as string | null,
      url: o.url as string | null, lastChange: o.last_change as string | null, updatedAt: String(o.updated_at),
      ...dates(o),
    },
    hierarchy: s ? hierarchy(s) : { pcn: null, sicbl: null, icb: null, region: null },
    roles: roles.results.map((r) => ({
      id: Number(r.role_id), role: rr(r.role)!, primary: Number(r.is_primary) === 1, status: r.status as string | null,
      ...dates(r),
    })),
    parents: parents.results.map((r) => rel(r, r.target)),
    children: children.results.map((r) => rel(r, r.child_code)),
    childrenTotal: Number(childCount.results[0]?.n ?? 0),
    successions: succs.results.map((r) => ({
      id: Number(r.succ_id), type: String(r.succ_type), org: ref(r.target, r.org_name)!, date: r.start_date as string | null,
    })),
    events,
  }
}

// CSV of practice -> PCN -> Sub-ICB -> ICB -> region, current or as at a date.
export async function practicesCsv(db: D1Database, url: URL): Promise<string> {
  const { items, asAt } = await practiceRows(db, url, false)
  const cols = [
    'practice_code', 'practice_name', 'status', 'postcode', 'open_date', 'close_date', 'pcn_code', 'pcn_name',
    'sub_icb_code', 'sub_icb_name', 'icb_code', 'icb_name', 'region_code', 'region_name', 'as_at',
  ]
  const esc = (v: unknown) => {
    const s = v == null ? '' : String(v)
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }
  const lines = items.map((p) =>
    [
      p.code, p.name, p.status, p.postcode, p.opStart, p.opEnd, p.pcn?.code, p.pcn?.name, p.sicbl?.code, p.sicbl?.name,
      p.icb?.code, p.icb?.name, p.region?.code, p.region?.name, asAt ?? new Date().toISOString().slice(0, 10),
    ].map(esc).join(','),
  )
  return [cols.join(','), ...lines].join('\n') + '\n'
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
