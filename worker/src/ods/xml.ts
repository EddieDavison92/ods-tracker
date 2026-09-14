// TRUD HSCOrgRefData XML (item 341) -> OrgRecord. Parses one <Organisation> block at a time;
// callers split the file on </Organisation> boundaries.
import { clean, makeOrg, toDates, type OrgRecord, type RawDate } from './model.ts'

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" }

function decode(s: string | undefined | null): string | null {
  if (s == null) return null
  return clean(
    s.replace(/&(#x[0-9a-f]+|#\d+|\w+);/gi, (m, e: string) => {
      if (e[0] === '#') return String.fromCodePoint(e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10))
      return ENTITIES[e] ?? m
    }),
  )
}

function attrs(tag: string): Record<string, string> {
  const out: Record<string, string> = {}
  for (const m of tag.matchAll(/(\w+)="([^"]*)"/g)) out[m[1]] = m[2]
  return out
}

const text = (block: string, tag: string) => {
  const m = block.match(new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`))
  return m ? decode(m[1]) : null
}

const valueOf = (block: string, tag: string) => {
  const m = block.match(new RegExp(`<${tag}\\b[^>]*value="([^"]*)"`))
  return m ? decode(m[1]) : null
}

function rawDates(block: string): RawDate[] {
  const out: RawDate[] = []
  for (const m of block.matchAll(/<Date>([\s\S]*?)<\/Date>/g)) {
    out.push({ type: valueOf(m[1], 'Type') ?? '', start: valueOf(m[1], 'Start'), end: valueOf(m[1], 'End') })
  }
  return out
}

function targetOf(block: string) {
  const t = block.match(/<Target>([\s\S]*?)<\/Target>/)?.[1] ?? ''
  const orgId = t.match(/<OrgId\b[^>]*>/)?.[0] ?? ''
  const role = t.match(/<PrimaryRoleId\b[^>]*>/)?.[0] ?? ''
  return { target: attrs(orgId).extension, targetRole: clean(attrs(role).id) }
}

// Strip a nested <Target> so its tags don't leak into the parent's Date/Status lookups.
const withoutTarget = (block: string) => block.replace(/<Target>[\s\S]*?<\/Target>/, '')

export function parseOrgBlock(block: string): OrgRecord {
  const open = block.match(/<Organisation\b[^>]*>/)?.[0] ?? ''
  const cut = block.search(/<Roles>|<Rels>|<Succs>/)
  const head = cut === -1 ? block : block.slice(0, cut)
  const section = (tag: string) => block.match(new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`))?.[1] ?? ''
  const contact = (type: string) => {
    const m = head.match(new RegExp(`<Contact\\s+type="${type}"\\s+value="([^"]*)"`))
    return m ? decode(m[1]) : null
  }
  const uprn = text(head, 'UPRN')

  return makeOrg({
    code: attrs(head.match(/<OrgId\b[^>]*>/)?.[0] ?? '').extension,
    name: text(head, 'Name') ?? '',
    status: valueOf(head, 'Status') ?? '',
    recordClass: clean(attrs(open).orgRecordClass),
    lastChange: valueOf(head, 'LastChangeDate'),
    ...toDates(rawDates(head)),
    addr1: text(head, 'AddrLn1'),
    addr2: text(head, 'AddrLn2'),
    addr3: text(head, 'AddrLn3'),
    town: text(head, 'Town'),
    county: text(head, 'County'),
    postcode: text(head, 'PostCode'),
    country: text(head, 'Country'),
    uprn: uprn == null || !Number.isFinite(Number(uprn)) ? null : Number(uprn),
    tel: contact('tel'),
    fax: contact('fax'),
    url: contact('http'),
    roles: [...section('Roles').matchAll(/<Role\b([^>]*)>([\s\S]*?)<\/Role>/g)].map((m) => {
      const a = attrs(m[1])
      return {
        id: Number(a.uniqueRoleId),
        role: a.id,
        primary: a.primaryRole === 'true',
        status: valueOf(m[2], 'Status'),
        ...toDates(rawDates(m[2])),
      }
    }),
    rels: [...section('Rels').matchAll(/<Rel\b([^>]*)>([\s\S]*?)<\/Rel>/g)].map((m) => {
      const a = attrs(m[1])
      const body = withoutTarget(m[2])
      return {
        id: Number(a.uniqueRelId),
        type: a.id,
        ...targetOf(m[2]),
        status: valueOf(body, 'Status'),
        ...toDates(rawDates(body)),
      }
    }),
    succs: [...section('Succs').matchAll(/<Succ\b([^>]*)>([\s\S]*?)<\/Succ>/g)].map((m) => {
      const a = attrs(m[1])
      const body = withoutTarget(m[2])
      return {
        id: Number(a.uniqueSuccId),
        type: text(body, 'Type') ?? '',
        ...targetOf(m[2]),
        start: rawDates(body)[0]?.start ?? null,
      }
    }),
  })
}

// Manifest PublicationDate (YYYY-MM-DD) from the first few KB of a file.
export function publicationDate(head: string): string | null {
  return head.match(/<PublicationDate value="([^"]+)"/)?.[1] ?? null
}
