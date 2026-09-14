// D1 reads/writes of OrgRecords and change events.
import type { OrgRecord } from '../ods/model.ts'
import type { OrgDiff } from '../ods/diff.ts'
import {
  EVENT_COLS, ORG_COLS, REL_COLS, ROLE_COLS, SUCC_COLS,
  eventRow, insertSql, orgFromRows, orgRow, relRow, roleRow, succRow, type Value,
} from './rows.ts'
import {
  AREA_COUNTS_SQL, FULL_SCOPE_STAGES, GROUP_COUNTS_SQL, INCREMENTAL, REINDEX_SEARCH_SQL, STATS_SQL,
} from './derived.ts'

type Row = Record<string, Value>

export async function storedHashes(db: D1Database, codes: string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>()
  for (let i = 0; i < codes.length; i += 90) {
    const chunk = codes.slice(i, i + 90)
    const { results } = await db
      .prepare(`SELECT code, hash FROM org WHERE code IN (${chunk.map(() => '?').join(',')})`)
      .bind(...chunk)
      .all<{ code: string; hash: string }>()
    for (const r of results) out.set(r.code, r.hash)
  }
  return out
}

export async function loadOrg(db: D1Database, code: string): Promise<OrgRecord | null> {
  const [org, roles, rels, succs] = await db.batch<Row>([
    db.prepare('SELECT * FROM org WHERE code = ?').bind(code),
    db.prepare('SELECT * FROM org_role WHERE code = ?').bind(code),
    db.prepare('SELECT * FROM org_rel WHERE code = ?').bind(code),
    db.prepare('SELECT * FROM org_succ WHERE code = ?').bind(code),
  ])
  const o = org.results[0]
  return o ? orgFromRows(o, roles.results, rels.results, succs.results) : null
}

// Statements applying one org's diff: upsert/delete changed rows, refresh its search entry, append events.
export function orgWrites(
  db: D1Database, code: string, next: OrgRecord | null, diff: OrgDiff, detectedAt: string, source: string, now: string,
): D1PreparedStatement[] {
  const stmts: D1PreparedStatement[] = []
  const del = (table: string, idCol: string, ids: number[]) => {
    for (const id of ids) stmts.push(db.prepare(`DELETE FROM ${table} WHERE code = ? AND ${idCol} = ?`).bind(code, id))
  }
  if (next) stmts.push(db.prepare(insertSql('org', ORG_COLS)).bind(...orgRow(next, now)))
  else stmts.push(db.prepare('DELETE FROM org WHERE code = ?').bind(code))
  del('org_role', 'role_id', diff.roles.remove)
  del('org_rel', 'rel_id', diff.rels.remove)
  del('org_succ', 'succ_id', diff.succs.remove)
  for (const r of diff.roles.upsert) stmts.push(db.prepare(insertSql('org_role', ROLE_COLS)).bind(...roleRow(code, r)))
  for (const r of diff.rels.upsert) stmts.push(db.prepare(insertSql('org_rel', REL_COLS)).bind(...relRow(code, r)))
  for (const s of diff.succs.upsert) stmts.push(db.prepare(insertSql('org_succ', SUCC_COLS)).bind(...succRow(code, s)))
  for (const e of diff.events) {
    stmts.push(db.prepare(insertSql('change_event', EVENT_COLS, 'INSERT')).bind(...eventRow(e, detectedAt, source)))
  }
  // FTS rows are found via MATCH (indexed) rather than a column scan.
  stmts.push(
    db.prepare('DELETE FROM org_search WHERE rowid IN (SELECT rowid FROM org_search WHERE org_search MATCH ?)')
      .bind(`code:"${code.replace(/"/g, '')}"`),
  )
  if (next) {
    stmts.push(
      db.prepare('INSERT INTO org_search (code, name, town, postcode) VALUES (?, ?, ?, ?)')
        .bind(next.code, next.name, next.town, next.postcode),
    )
  }
  return stmts
}

export async function getMeta(db: D1Database, key: string): Promise<string | null> {
  const row = await db.prepare('SELECT value FROM meta WHERE key = ?').bind(key).first<{ value: string }>()
  return row?.value ?? null
}

export const setMeta = (db: D1Database, key: string, value: string) =>
  db.prepare('INSERT OR REPLACE INTO meta (key, value) VALUES (?, ?)').bind(key, value)

export type StageTimings = Record<string, number>

async function timed(timings: StageTimings, name: string, fn: () => Promise<unknown>) {
  const t0 = Date.now()
  await fn()
  timings[name] = (timings[name] ?? 0) + Date.now() - t0
}

// Codes per statement for incremental stages; keeps each json_each list and query small.
const CHUNK = 2000

// Recompute org_scope. Without `changed`, rebuilds every stage for all orgs (after a bulk load).
// With `changed`, recomputes those orgs and the orgs whose area or parent points at them.
export async function refreshScope(db: D1Database, changed?: string[]): Promise<StageTimings> {
  const timings: StageTimings = {}
  if (!changed) {
    for (const stage of FULL_SCOPE_STAGES) await timed(timings, stage.name, () => db.prepare(stage.sql).run())
    return timings
  }
  if (!changed.length) return timings

  const chunks = <T>(xs: T[]) => Array.from({ length: Math.ceil(xs.length / CHUNK) }, (_, i) => xs.slice(i * CHUNK, (i + 1) * CHUNK))
  for (const c of chunks(changed)) {
    const json = JSON.stringify(c)
    await timed(timings, 'top', () => db.batch([
      db.prepare(INCREMENTAL.topClear).bind(json),
      db.prepare(INCREMENTAL.top).bind(json),
    ]))
  }
  // Dependants two levels out: orgs pointing at a changed org, then orgs operated by those.
  const affected = new Set(changed)
  let frontier = changed
  for (let depth = 0; depth < 2 && frontier.length; depth++) {
    const next: string[] = []
    for (const c of chunks(frontier)) {
      await timed(timings, 'dependants', async () => {
        const { results } = await db.prepare(INCREMENTAL.dependants).bind(JSON.stringify(c)).all<{ code: string }>()
        for (const r of results) if (!affected.has(r.code)) {
          affected.add(r.code)
          next.push(r.code)
        }
      })
    }
    frontier = next
  }
  for (const c of chunks([...affected])) {
    const json = JSON.stringify(c)
    await timed(timings, 'chain', () => db.prepare(INCREMENTAL.chain).bind(json).run())
    await timed(timings, 'scope', () => db.prepare(INCREMENTAL.scope).bind(json).run())
  }
  for (const c of chunks(changed)) {
    const json = JSON.stringify(c)
    await timed(timings, 'prune', () => db.batch(INCREMENTAL.prune.map((sql) => db.prepare(sql).bind(json))))
  }
  timings.affected = affected.size
  return timings
}

export async function refreshCounts(db: D1Database): Promise<StageTimings> {
  const timings: StageTimings = {}
  let stats: unknown, groups: D1Result, areas: D1Result
  await timed(timings, 'stats', async () => { stats = await db.prepare(STATS_SQL).first() })
  await timed(timings, 'groups', async () => { groups = await db.prepare(GROUP_COUNTS_SQL).all() })
  await timed(timings, 'areas', async () => { areas = await db.prepare(AREA_COUNTS_SQL).all() })
  await db.batch([
    setMeta(db, 'stats', JSON.stringify(stats)),
    setMeta(db, 'group_counts', JSON.stringify(groups!.results)),
    setMeta(db, 'area_counts', JSON.stringify(areas!.results)),
  ])
  return timings
}

export async function refreshDerived(db: D1Database, changed?: string[]): Promise<StageTimings> {
  const scope = await refreshScope(db, changed)
  const counts = await refreshCounts(db)
  return { ...scope, ...counts }
}

// Full rebuild of the search index, after a bulk import.
export async function reindexSearch(db: D1Database) {
  for (const sql of REINDEX_SEARCH_SQL) await db.prepare(sql).run()
}
