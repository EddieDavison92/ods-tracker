// Response shapes of the public read API. Imported by the Next.js UI.

export interface OrgRef {
  code: string
  name: string | null
}

export interface RoleRef {
  code: string
  name: string | null
}

export interface Stats {
  orgs: number
  practices: number
  active_practices: number
  pcns: number
  active_pcns: number
  active_sicbls: number
  active_icbs: number
  events: number
}

export interface SyncRunInfo {
  id: number
  startedAt: string
  finishedAt: string | null
  trigger: string
  since: string | null
  listed: number | null
  processed: number | null
  changed: number | null
  events: number | null
  failed: number | null
  remaining: number | null
  status: string
  error: string | null
}

export interface Meta {
  // ODS data is complete up to this date (last fully drained ORD sync).
  lastSyncDate: string | null
  lastSyncAt: string | null
  // Publication date of the TRUD snapshot the database was built from.
  snapshotDate: string | null
  historyFrom: string | null
  stats: Stats | null
  runs: SyncRunInfo[]
}

export interface ScopeOption {
  code: string
  name: string
  type: 'region' | 'icb' | 'sicbl'
  parent: string | null
  active: boolean
}

export interface Scopes {
  regions: ScopeOption[]
  icbs: ScopeOption[]
  sicbls: ScopeOption[]
}

export interface Hierarchy {
  pcn: OrgRef | null
  sicbl: OrgRef | null
  icb: OrgRef | null
  region: OrgRef | null
}

export interface PracticeRow extends Hierarchy {
  code: string
  name: string
  status: string
  postcode: string | null
  town: string | null
  opStart: string | null
  opEnd: string | null
}

export interface PcnRow extends Omit<Hierarchy, 'pcn'> {
  code: string
  name: string
  status: string
  postcode: string | null
  opStart: string | null
  opEnd: string | null
  memberCount: number
}

export interface OrgSearchRow {
  code: string
  name: string
  status: string
  postcode: string | null
  town: string | null
  primaryRole: RoleRef | null
}

export interface ListResponse<T> {
  total: number
  items: T[]
  asAt: string | null
}

export interface DateRange {
  opStart: string | null
  opEnd: string | null
  legalStart: string | null
  legalEnd: string | null
}

export interface OrgRoleInfo extends DateRange {
  id: number
  role: RoleRef
  primary: boolean
  status: string | null
}

export interface OrgRelInfo extends DateRange {
  id: number
  type: RoleRef
  // For parents: the target org. For children: the source org.
  org: OrgRef
  orgStatus: string | null
  orgPrimaryRole: RoleRef | null
  status: string | null
}

export interface OrgSuccInfo {
  id: number
  type: string
  org: OrgRef
  date: string | null
}

export interface OrgDetail {
  org: DateRange & {
    code: string
    name: string
    status: string
    recordClass: string | null
    primaryRole: RoleRef | null
    address: string[]
    town: string | null
    county: string | null
    postcode: string | null
    country: string | null
    uprn: number | null
    tel: string | null
    url: string | null
    lastChange: string | null
    updatedAt: string
  }
  hierarchy: Hierarchy
  roles: OrgRoleInfo[]
  parents: OrgRelInfo[]
  children: OrgRelInfo[]
  childrenTotal: number
  successions: OrgSuccInfo[]
  events: ChangeItem[]
}

export type ChangeKind =
  | 'created' | 'removed' | 'name' | 'status' | 'closed' | 'reopened' | 'dates' | 'record_class'
  | 'address' | 'contact' | 'primary_role'
  | 'role_added' | 'role_ended' | 'role_changed' | 'role_removed'
  | 'rel_added' | 'rel_ended' | 'rel_changed' | 'rel_removed'
  | 'succ_added' | 'succ_removed'

export interface ChangeItem {
  id: number
  org: OrgRef
  primaryRole: RoleRef | null
  kind: ChangeKind
  field: string | null
  oldValue: string | null
  newValue: string | null
  related: OrgRef | null
  effectiveDate: string | null
  detectedAt: string
  source: 'trud' | 'ord'
  // Human-readable description, e.g. "Joined PCN NORTH 2 ISLINGTON PCN (U02795)".
  summary: string
}

export interface ChangesResponse {
  items: ChangeItem[]
  // Pass as ?before= to fetch the next page; null when exhausted.
  nextBefore: number | null
}
