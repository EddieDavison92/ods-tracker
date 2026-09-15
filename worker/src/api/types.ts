// Response shapes of the public read API. Imported by the Next.js UI.
import type { GroupKey } from '../ods/groups.ts'

export type { GroupKey } from '../ods/groups.ts'

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
  active_orgs: number
  practices: number
  active_practices: number
  pcns: number
  active_pcns: number
  active_sicbls: number
  active_icbs: number
  events: number
  events_30d: number
}

export interface GroupCount {
  group: GroupKey
  active: number
  total: number
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
  // Highest change event id: a watermark for incremental loads of /api/changes.
  latestEventId: number | null
  stats: Stats | null
  groups: GroupCount[]
  runs: SyncRunInfo[]
}

export interface AreaCounts {
  // Active organisations in the area, all types.
  active: number
  gp: number
  pcn: number
}

export interface ScopeOption {
  code: string
  name: string
  type: 'region' | 'icb' | 'sicbl'
  parent: string | null
  active: boolean
  counts: AreaCounts | null
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

// Row in the universal browse/search list.
export interface OrgListRow extends Hierarchy {
  code: string
  name: string
  status: string
  group: GroupKey
  primaryRole: RoleRef | null
  postcode: string | null
  town: string | null
  opStart: string | null
  opEnd: string | null
  // The org this one is operated by (e.g. a trust site's trust).
  parent: OrgRef | null
}

export interface Suggestion {
  code: string
  name: string
  status: string
  group: GroupKey
  postcode: string | null
  town: string | null
}

export interface Facets {
  total: number
  groups: { group: GroupKey; count: number }[]
}

export interface ListResponse<T> {
  total: number
  items: T[]
  // The as-at date for historical lists (practices ?asAt=), otherwise null.
  asAt: string | null
  limit?: number
  offset?: number
  // Pass as ?offset= for the next page; null on the last page.
  nextOffset?: number | null
  // ODS data is complete up to this date (the snapshot the rows come from).
  dataAsOf?: string | null
}

export interface ActivityPoint {
  // YYYY-MM
  month: string
  opened: number
  closed: number
  changed: number
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

// A relationship from this org to a parent.
export interface OrgRelInfo extends DateRange {
  id: number
  type: RoleRef
  org: OrgRef
  orgStatus: string | null
  orgPrimaryRole: RoleRef | null
  orgGroup: GroupKey | null
  status: string | null
}

// An org with a relationship to this one (member, site, commissioned org), one row per org.
export interface ChildRow {
  code: string
  name: string
  status: string
  group: GroupKey
  relTypes: RoleRef[]
  // Earliest start and latest end across its relationships to this org; end null while current.
  start: string | null
  end: string | null
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
    group: GroupKey
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
  parent: OrgRef | null
  roles: OrgRoleInfo[]
  parents: OrgRelInfo[]
  // Current children first, up to 50; use /api/orgs/{code}/children for more.
  children: ChildRow[]
  childrenTotal: number
  childrenCurrent: number
  childGroups: GroupCount[]
  // Linked orgs by relationship type and group (an org linked two ways counts under each type).
  childRels: { type: RoleRef; group: GroupKey; active: number; total: number }[]
  // Orgs within this area (for PCNs, Sub-ICBs, ICBs and regions), by group.
  area: GroupCount[] | null
  successions: OrgSuccInfo[]
  // Changes to this org.
  events: ChangeItem[]
  // Changes to other orgs that reference this one (e.g. practices joining a PCN).
  relatedEvents: ChangeItem[]
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
  group: GroupKey | null
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
  // Pass as ?cursor= for the next page (works with either date basis); null when exhausted.
  nextCursor: string | null
  // Legacy id cursor for ?before= (detected-date order only).
  nextBefore: number | null
}
