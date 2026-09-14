// D1 reads/writes of OrgRecords and change events.
import type { OrgRecord } from '../ods/model.ts'
import type { OrgDiff } from '../ods/diff.ts'
import {
  EVENT_COLS, ORG_COLS, REFRESH_SCOPE_SQL, REL_COLS, ROLE_COLS, STATS_SQL, SUCC_COLS,
  eventRow, insertSql, orgFromRows, orgRow, relRow, roleRow, succRow, type Value,
} from './rows.ts'

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

// Statements applying one org's diff: upsert/delete changed rows and append events.
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
  return stmts
}

export async function getMeta(db: D1Database, key: string): Promise<string | null> {
  const row = await db.prepare('SELECT value FROM meta WHERE key = ?').bind(key).first<{ value: string }>()
  return row?.value ?? null
}

export const setMeta = (db: D1Database, key: string, value: string) =>
  db.prepare('INSERT OR REPLACE INTO meta (key, value) VALUES (?, ?)').bind(key, value)

export async function refreshDerived(db: D1Database) {
  await db.batch(REFRESH_SCOPE_SQL.map((sql) => db.prepare(sql)))
  const stats = await db.prepare(STATS_SQL).first()
  await setMeta(db, 'stats', JSON.stringify(stats)).run()
}
