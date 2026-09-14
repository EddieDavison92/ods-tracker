// Column order and row mapping for D1 tables, shared by the Worker and the Node backfill.
import { hashOrg, makeOrg, primaryRole, type OrgRecord, type Rel, type Role, type Succ } from '../ods/model.ts'
import type { ChangeEvent } from '../ods/diff.ts'

export type Value = string | number | null

export const ORG_COLS = [
  'code', 'name', 'status', 'record_class', 'primary_role', 'op_start', 'op_end', 'legal_start', 'legal_end',
  'addr1', 'addr2', 'addr3', 'town', 'county', 'postcode', 'country', 'uprn', 'tel', 'fax', 'url',
  'last_change', 'hash', 'updated_at',
] as const
export const ROLE_COLS = ['code', 'role_id', 'role', 'is_primary', 'status', 'op_start', 'op_end', 'legal_start', 'legal_end'] as const
export const REL_COLS = ['code', 'rel_id', 'rel_type', 'target', 'target_role', 'status', 'op_start', 'op_end', 'legal_start', 'legal_end'] as const
export const SUCC_COLS = ['code', 'succ_id', 'succ_type', 'target', 'target_role', 'start_date'] as const
export const EVENT_COLS = [
  'code', 'primary_role', 'kind', 'field', 'old_value', 'new_value', 'related', 'detail', 'effective_date', 'detected_at', 'source',
] as const

export const orgRow = (o: OrgRecord, updatedAt: string): Value[] => [
  o.code, o.name, o.status, o.recordClass, primaryRole(o), o.opStart, o.opEnd, o.legalStart, o.legalEnd,
  o.addr1, o.addr2, o.addr3, o.town, o.county, o.postcode, o.country, o.uprn, o.tel, o.fax, o.url,
  o.lastChange, hashOrg(o), updatedAt,
]
export const roleRow = (code: string, r: Role): Value[] => [
  code, r.id, r.role, r.primary ? 1 : 0, r.status, r.opStart, r.opEnd, r.legalStart, r.legalEnd,
]
export const relRow = (code: string, r: Rel): Value[] => [
  code, r.id, r.type, r.target, r.targetRole, r.status, r.opStart, r.opEnd, r.legalStart, r.legalEnd,
]
export const succRow = (code: string, s: Succ): Value[] => [code, s.id, s.type, s.target, s.targetRole, s.start]
export const eventRow = (e: ChangeEvent, detectedAt: string, source: string): Value[] => [
  e.code, e.primaryRole, e.kind, e.field, e.oldValue, e.newValue, e.related, e.detail, e.effectiveDate, detectedAt, source,
]

type Row = Record<string, Value>
const s = (v: Value) => (v == null ? null : String(v))

export function orgFromRows(o: Row, roles: Row[], rels: Row[], succs: Row[]): OrgRecord {
  return makeOrg({
    code: String(o.code), name: String(o.name), status: String(o.status),
    recordClass: s(o.record_class), lastChange: s(o.last_change),
    opStart: s(o.op_start), opEnd: s(o.op_end), legalStart: s(o.legal_start), legalEnd: s(o.legal_end),
    addr1: s(o.addr1), addr2: s(o.addr2), addr3: s(o.addr3), town: s(o.town), county: s(o.county),
    postcode: s(o.postcode), country: s(o.country), uprn: o.uprn == null ? null : Number(o.uprn),
    tel: s(o.tel), fax: s(o.fax), url: s(o.url),
    roles: roles.map((r) => ({
      id: Number(r.role_id), role: String(r.role), primary: Number(r.is_primary) === 1, status: s(r.status),
      opStart: s(r.op_start), opEnd: s(r.op_end), legalStart: s(r.legal_start), legalEnd: s(r.legal_end),
    })),
    rels: rels.map((r) => ({
      id: Number(r.rel_id), type: String(r.rel_type), target: String(r.target), targetRole: s(r.target_role),
      status: s(r.status), opStart: s(r.op_start), opEnd: s(r.op_end), legalStart: s(r.legal_start), legalEnd: s(r.legal_end),
    })),
    succs: succs.map((x) => ({
      id: Number(x.succ_id), type: String(x.succ_type), target: String(x.target), targetRole: s(x.target_role), start: s(x.start_date),
    })),
  })
}

export const insertSql = (table: string, cols: readonly string[], verb = 'INSERT OR REPLACE') =>
  `${verb} INTO ${table} (${cols.join(', ')}) VALUES (${cols.map(() => '?').join(', ')})`

// Keeps org_scope in step with scope_calc, writing only rows that changed.
export const REFRESH_SCOPE_SQL = [
  `INSERT OR REPLACE INTO org_scope (code, pcn, sicbl, icb, region)
   SELECT c.code, c.pcn, c.sicbl, c.icb, c.region FROM scope_calc c
   LEFT JOIN org_scope s ON s.code = c.code
   WHERE s.code IS NULL OR c.pcn IS NOT s.pcn OR c.sicbl IS NOT s.sicbl OR c.icb IS NOT s.icb OR c.region IS NOT s.region`,
  `DELETE FROM org_scope WHERE code NOT IN (SELECT code FROM scope_calc)`,
]

// Headline counts cached in meta.stats.
export const STATS_SQL = `
  SELECT
    (SELECT COUNT(*) FROM org) AS orgs,
    (SELECT COUNT(*) FROM org_role WHERE role = 'RO76') AS practices,
    (SELECT COUNT(*) FROM org_role r JOIN org o ON o.code = r.code WHERE r.role = 'RO76' AND o.status = 'Active') AS active_practices,
    (SELECT COUNT(*) FROM org WHERE primary_role = 'RO272') AS pcns,
    (SELECT COUNT(*) FROM org WHERE primary_role = 'RO272' AND status = 'Active') AS active_pcns,
    (SELECT COUNT(*) FROM org_role r JOIN org o ON o.code = r.code WHERE r.role = 'RO319' AND r.status = 'Active') AS active_sicbls,
    (SELECT COUNT(*) FROM org_role r JOIN org o ON o.code = r.code WHERE r.role = 'RO318' AND r.status = 'Active') AS active_icbs,
    (SELECT COUNT(*) FROM change_event) AS events`
