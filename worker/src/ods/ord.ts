// ORD API (https://directory.spineservices.nhs.uk/ORD/2-0-0) JSON -> OrgRecord.
import { clean, makeOrg, toDates, type OrgRecord, type RawDate } from './model.ts'

type One<T> = T | T[] | null | undefined

interface OrdDate { Type: string; Start?: string; End?: string }
interface OrdTarget { OrgId: { extension: string }; PrimaryRoleId?: { id: string } }

export interface OrdOrganisation {
  Name: string
  Date?: One<OrdDate>
  OrgId: { extension: string }
  Status: string
  LastChangeDate?: string
  orgRecordClass?: string
  GeoLoc?: { Location?: Record<string, string | number | undefined> }
  Contacts?: { Contact?: One<{ type: string; value: string }> }
  Roles?: { Role?: One<{ id: string; uniqueRoleId: number; primaryRole?: boolean; Date?: One<OrdDate>; Status?: string }> }
  Rels?: { Rel?: One<{ id: string; uniqueRelId: number; Date?: One<OrdDate>; Status?: string; Target: OrdTarget }> }
  Succs?: { Succ?: One<{ uniqueSuccId: number; Date?: One<OrdDate>; Type: string; Target: OrdTarget }> }
}

const arr = <T>(x: One<T>): T[] => (x == null ? [] : Array.isArray(x) ? x : [x])

const rawDates = (d: One<OrdDate>): RawDate[] => arr(d).map((x) => ({ type: x.Type, start: x.Start, end: x.End }))

export function fromOrd(o: OrdOrganisation): OrgRecord {
  const loc = o.GeoLoc?.Location ?? {}
  const contact = (type: string) => clean(arr(o.Contacts?.Contact).find((c) => c.type === type)?.value)
  const uprn = loc.UPRN == null ? null : Number(loc.UPRN)
  return makeOrg({
    code: o.OrgId.extension,
    name: clean(o.Name) ?? '',
    status: clean(o.Status) ?? '',
    recordClass: clean(o.orgRecordClass),
    lastChange: clean(o.LastChangeDate),
    ...toDates(rawDates(o.Date)),
    addr1: clean(loc.AddrLn1),
    addr2: clean(loc.AddrLn2),
    addr3: clean(loc.AddrLn3),
    town: clean(loc.Town),
    county: clean(loc.County),
    postcode: clean(loc.PostCode),
    country: clean(loc.Country),
    uprn: Number.isFinite(uprn) ? uprn : null,
    tel: contact('tel'),
    fax: contact('fax'),
    url: contact('http'),
    roles: arr(o.Roles?.Role).map((r) => ({
      id: Number(r.uniqueRoleId),
      role: r.id,
      primary: r.primaryRole === true,
      status: clean(r.Status),
      ...toDates(rawDates(r.Date)),
    })),
    rels: arr(o.Rels?.Rel).map((r) => ({
      id: Number(r.uniqueRelId),
      type: r.id,
      target: r.Target.OrgId.extension,
      targetRole: clean(r.Target.PrimaryRoleId?.id),
      status: clean(r.Status),
      ...toDates(rawDates(r.Date)),
    })),
    succs: arr(o.Succs?.Succ).map((s) => ({
      id: Number(s.uniqueSuccId),
      type: s.Type,
      target: s.Target.OrgId.extension,
      targetRole: clean(s.Target.PrimaryRoleId?.id),
      start: clean(arr(s.Date)[0]?.Start),
    })),
  })
}

const HEADERS = {
  Accept: 'application/json',
  'User-Agent': 'ods-tracker (https://github.com/EddieDavison92/ods-tracker)',
}

// Org codes changed on or after `since` (YYYY-MM-DD). ORD rejects dates over 185 days old.
export async function listChangedSince(base: string, since: string): Promise<string[]> {
  const res = await fetch(`${base}/sync?LastChangeDate=${since}&_format=json`, { headers: HEADERS })
  const body = (await res.json()) as { Organisations?: { OrgLink: string }[]; errorText?: string }
  if (!res.ok || body.errorText) throw new Error(`ORD sync failed (${res.status}): ${body.errorText ?? 'unknown'}`)
  return (body.Organisations ?? []).map((o) => o.OrgLink.split('/').pop()!).filter(Boolean)
}

// Returns null when ORD has no record for the code (404, or 410 for withdrawn records).
export async function fetchOrg(base: string, code: string): Promise<OrgRecord | null> {
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(`${base}/organisations/${encodeURIComponent(code)}?_format=json`, { headers: HEADERS })
    if (res.status === 404 || res.status === 410) return null
    if (res.ok) {
      const body = (await res.json()) as { Organisation?: OrdOrganisation }
      return body.Organisation ? fromOrd(body.Organisation) : null
    }
    if (attempt >= 2 || (res.status < 500 && res.status !== 429)) {
      throw new Error(`ORD fetch ${code} failed (${res.status})`)
    }
    await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)))
  }
}
