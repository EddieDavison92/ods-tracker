// Canonical ODS organisation record. Built identically from TRUD XML and ORD API JSON so records
// from either source hash and diff consistently.

export interface Dates {
  opStart: string | null
  opEnd: string | null
  legalStart: string | null
  legalEnd: string | null
}

export interface Role extends Dates {
  id: number
  role: string
  primary: boolean
  status: string | null
}

export interface Rel extends Dates {
  id: number
  type: string
  target: string
  targetRole: string | null
  status: string | null
}

export interface Succ {
  id: number
  type: string
  target: string
  targetRole: string | null
  start: string | null
}

export interface OrgRecord extends Dates {
  code: string
  name: string
  status: string
  recordClass: string | null
  lastChange: string | null
  addr1: string | null
  addr2: string | null
  addr3: string | null
  town: string | null
  county: string | null
  postcode: string | null
  country: string | null
  uprn: number | null
  tel: string | null
  fax: string | null
  url: string | null
  roles: Role[]
  rels: Rel[]
  succs: Succ[]
}

export interface RawDate {
  type: string
  start?: string | null
  end?: string | null
}

// Trim, collapse internal whitespace, empty -> null.
export function clean(v: unknown): string | null {
  if (v == null) return null
  const s = String(v).replace(/\s+/g, ' ').trim()
  return s === '' ? null : s
}

export function toDates(raw: RawDate[]): Dates {
  const out: Dates = { opStart: null, opEnd: null, legalStart: null, legalEnd: null }
  for (const d of raw) {
    if (d.type === 'Operational') {
      out.opStart = clean(d.start)
      out.opEnd = clean(d.end)
    } else if (d.type === 'Legal') {
      out.legalStart = clean(d.start)
      out.legalEnd = clean(d.end)
    }
  }
  return out
}

// Fixed key order and sorted children, so JSON.stringify is a stable fingerprint.
// Address lines are compacted (TRUD XML can skip AddrLn2 where ORD JSON does not).
export function makeOrg(o: OrgRecord): OrgRecord {
  const [addr1 = null, addr2 = null, addr3 = null] = [o.addr1, o.addr2, o.addr3].filter((l) => l != null)
  return {
    code: o.code,
    name: o.name,
    status: o.status,
    recordClass: o.recordClass,
    lastChange: o.lastChange,
    opStart: o.opStart,
    opEnd: o.opEnd,
    legalStart: o.legalStart,
    legalEnd: o.legalEnd,
    addr1,
    addr2,
    addr3,
    town: o.town,
    county: o.county,
    postcode: o.postcode,
    country: o.country,
    uprn: o.uprn,
    tel: o.tel,
    fax: o.fax,
    url: o.url,
    roles: o.roles
      .map((r) => ({
        id: r.id, role: r.role, primary: r.primary, status: r.status,
        opStart: r.opStart, opEnd: r.opEnd, legalStart: r.legalStart, legalEnd: r.legalEnd,
      }))
      .sort((a, b) => a.id - b.id),
    rels: o.rels
      .map((r) => ({
        id: r.id, type: r.type, target: r.target, targetRole: r.targetRole, status: r.status,
        opStart: r.opStart, opEnd: r.opEnd, legalStart: r.legalStart, legalEnd: r.legalEnd,
      }))
      .sort((a, b) => a.id - b.id),
    succs: o.succs
      .map((s) => ({ id: s.id, type: s.type, target: s.target, targetRole: s.targetRole, start: s.start }))
      .sort((a, b) => a.id - b.id),
  }
}

export function primaryRole(o: OrgRecord): string | null {
  return o.roles.find((r) => r.primary)?.role ?? null
}

// cyrb53: fast 64-bit string hash, identical in Node and Workers.
function cyrb53(str: string): string {
  let h1 = 0xdeadbeef
  let h2 = 0x41c6ce57
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i)
    h1 = Math.imul(h1 ^ ch, 2654435761)
    h2 = Math.imul(h2 ^ ch, 1597334677)
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909)
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909)
  return (h2 >>> 0).toString(16).padStart(8, '0') + (h1 >>> 0).toString(16).padStart(8, '0')
}

export function hashOrg(o: OrgRecord): string {
  return cyrb53(JSON.stringify(makeOrg(o)))
}
