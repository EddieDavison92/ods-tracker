// Compare two versions of an org and describe what changed.
import { primaryRole, type OrgRecord, type Rel, type Role, type Succ } from './model.ts'

export type ChangeKind =
  | 'created' | 'removed' | 'name' | 'status' | 'closed' | 'reopened' | 'dates' | 'record_class'
  | 'address' | 'contact' | 'primary_role'
  | 'role_added' | 'role_ended' | 'role_changed' | 'role_removed'
  | 'rel_added' | 'rel_ended' | 'rel_changed' | 'rel_removed'
  | 'succ_added' | 'succ_removed'

export interface ChangeEvent {
  code: string
  primaryRole: string | null
  kind: ChangeKind
  field: string | null
  oldValue: string | null
  newValue: string | null
  related: string | null
  detail: string | null
  effectiveDate: string | null
}

export interface ChildDiff<T> {
  upsert: T[]
  remove: number[]
}

export interface OrgDiff {
  events: ChangeEvent[]
  roles: ChildDiff<Role>
  rels: ChildDiff<Rel>
  succs: ChildDiff<Succ>
}

const ADDRESS_FIELDS = ['addr1', 'addr2', 'addr3', 'town', 'county', 'postcode', 'country'] as const
// Fax is stored but not tracked: ORD JSON drops some faxes that TRUD XML still carries.
const CONTACT_FIELDS = ['tel', 'url'] as const
const DATE_FIELDS = ['opStart', 'legalStart', 'legalEnd'] as const

export function formatAddress(o: OrgRecord): string {
  return ADDRESS_FIELDS.map((f) => o[f]).filter(Boolean).join(', ')
}

const same = (a: object, b: object) => JSON.stringify(a) === JSON.stringify(b)

function diffChildren<T extends { id: number }>(prev: T[], next: T[]) {
  const before = new Map(prev.map((x) => [x.id, x]))
  const after = new Map(next.map((x) => [x.id, x]))
  const added: T[] = []
  const changed: [T, T][] = []
  const removed: T[] = []
  for (const [id, n] of after) {
    const p = before.get(id)
    if (!p) added.push(n)
    else if (!same(p, n)) changed.push([p, n])
  }
  for (const [id, p] of before) if (!after.has(id)) removed.push(p)
  return { added, changed, removed }
}

export function diffOrg(prev: OrgRecord | null, next: OrgRecord | null): OrgDiff {
  const org = (next ?? prev)!
  const role = primaryRole(org)
  const events: ChangeEvent[] = []
  const emit = (e: Partial<ChangeEvent> & { kind: ChangeKind }) =>
    events.push({
      code: org.code, primaryRole: role, field: null, oldValue: null, newValue: null,
      related: null, detail: null, effectiveDate: null, ...e,
    })

  if (!next) {
    emit({ kind: 'removed', oldValue: prev!.name })
    return { events, roles: { upsert: [], remove: prev!.roles.map((r) => r.id) }, rels: { upsert: [], remove: prev!.rels.map((r) => r.id) }, succs: { upsert: [], remove: prev!.succs.map((s) => s.id) } }
  }
  if (!prev) {
    emit({ kind: 'created', newValue: next.name, effectiveDate: next.opStart ?? next.legalStart })
    return { events, roles: { upsert: next.roles, remove: [] }, rels: { upsert: next.rels, remove: [] }, succs: { upsert: next.succs, remove: [] } }
  }

  const when = next.lastChange
  if (prev.name !== next.name) emit({ kind: 'name', oldValue: prev.name, newValue: next.name, effectiveDate: when })

  let closure = false
  if (prev.opEnd !== next.opEnd) {
    if (!prev.opEnd) {
      closure = true
      emit({ kind: 'closed', newValue: next.opEnd, effectiveDate: next.opEnd })
    } else if (!next.opEnd) {
      closure = true
      emit({ kind: 'reopened', oldValue: prev.opEnd, effectiveDate: when })
    } else {
      emit({ kind: 'dates', field: 'opEnd', oldValue: prev.opEnd, newValue: next.opEnd, effectiveDate: when })
    }
  }
  if (prev.status !== next.status && !closure) {
    emit({ kind: 'status', oldValue: prev.status, newValue: next.status, effectiveDate: when })
  }
  for (const f of DATE_FIELDS) {
    if (prev[f] !== next[f]) emit({ kind: 'dates', field: f, oldValue: prev[f], newValue: next[f], effectiveDate: when })
  }
  if (prev.recordClass !== next.recordClass) {
    emit({ kind: 'record_class', oldValue: prev.recordClass, newValue: next.recordClass, effectiveDate: when })
  }

  const addressChanged = ADDRESS_FIELDS.filter((f) => prev[f] !== next[f])
  if (addressChanged.length) {
    emit({
      kind: 'address', field: addressChanged.includes('postcode') ? 'postcode' : 'address',
      oldValue: formatAddress(prev), newValue: formatAddress(next), effectiveDate: when,
      detail: JSON.stringify({ fields: addressChanged }),
    })
  }
  for (const f of CONTACT_FIELDS) {
    if (prev[f] !== next[f]) emit({ kind: 'contact', field: f, oldValue: prev[f], newValue: next[f], effectiveDate: when })
  }
  const prevRole = primaryRole(prev)
  if (prevRole !== role) emit({ kind: 'primary_role', oldValue: prevRole, newValue: role, effectiveDate: when })

  const roles = diffChildren(prev.roles, next.roles)
  for (const r of roles.added) emit({ kind: 'role_added', field: r.role, effectiveDate: r.opStart ?? r.legalStart, detail: JSON.stringify(r) })
  for (const [p, n] of roles.changed) {
    const ended = !p.opEnd && !!n.opEnd
    emit({
      kind: ended ? 'role_ended' : 'role_changed', field: n.role,
      effectiveDate: ended ? n.opEnd : when, detail: JSON.stringify({ before: p, after: n }),
    })
  }
  for (const r of roles.removed) emit({ kind: 'role_removed', field: r.role, effectiveDate: when, detail: JSON.stringify(r) })

  const rels = diffChildren(prev.rels, next.rels)
  for (const r of rels.added) {
    emit({ kind: 'rel_added', field: r.type, related: r.target, effectiveDate: r.opStart ?? r.legalStart, detail: JSON.stringify(r) })
  }
  for (const [p, n] of rels.changed) {
    const ended = !p.opEnd && !!n.opEnd
    emit({
      kind: ended ? 'rel_ended' : 'rel_changed', field: n.type, related: n.target,
      effectiveDate: ended ? n.opEnd : when, detail: JSON.stringify({ before: p, after: n }),
    })
  }
  for (const r of rels.removed) {
    emit({ kind: 'rel_removed', field: r.type, related: r.target, effectiveDate: when, detail: JSON.stringify(r) })
  }

  const succs = diffChildren(prev.succs, next.succs)
  for (const s of [...succs.added, ...succs.changed.map(([, n]) => n)]) {
    emit({ kind: 'succ_added', field: s.type, related: s.target, effectiveDate: s.start, detail: JSON.stringify(s) })
  }
  for (const s of succs.removed) {
    emit({ kind: 'succ_removed', field: s.type, related: s.target, effectiveDate: when, detail: JSON.stringify(s) })
  }

  return {
    events,
    roles: { upsert: [...roles.added, ...roles.changed.map(([, n]) => n)], remove: roles.removed.map((r) => r.id) },
    rels: { upsert: [...rels.added, ...rels.changed.map(([, n]) => n)], remove: rels.removed.map((r) => r.id) },
    succs: { upsert: [...succs.added, ...succs.changed.map(([, n]) => n)], remove: succs.removed.map((s) => s.id) },
  }
}
