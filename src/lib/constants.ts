import type { ChangeKind } from '../../worker/src/api/types'

export const NOTABLE_KINDS: ChangeKind[] = [
  'created', 'closed', 'reopened', 'name', 'address', 'status', 'rel_added', 'rel_ended', 'succ_added',
]

export const OTHER_KINDS: ChangeKind[] = [
  'removed', 'dates', 'record_class', 'contact', 'primary_role',
  'role_added', 'role_ended', 'role_changed', 'role_removed',
  'rel_changed', 'rel_removed', 'succ_removed',
]

export const KIND_LABELS: Record<ChangeKind, string> = {
  created: 'Created',
  removed: 'Removed',
  name: 'Name',
  status: 'Status',
  closed: 'Closed',
  reopened: 'Reopened',
  dates: 'Dates',
  record_class: 'Record class',
  address: 'Address',
  contact: 'Contact',
  primary_role: 'Primary role',
  role_added: 'Role added',
  role_ended: 'Role ended',
  role_changed: 'Role changed',
  role_removed: 'Role removed',
  rel_added: 'Relationship added',
  rel_ended: 'Relationship ended',
  rel_changed: 'Relationship changed',
  rel_removed: 'Relationship removed',
  succ_added: 'Succession added',
  succ_removed: 'Succession removed',
}

export const ORG_TYPES = [
  { value: 'all', label: 'All types' },
  { value: 'practice', label: 'GP practice' },
  { value: 'pcn', label: 'PCN' },
  { value: 'commissioner', label: 'Commissioner' },
  { value: 'trust', label: 'Trust' },
  { value: 'pharmacy', label: 'Pharmacy' },
] as const

export const COMMON_ROLES = [
  { value: 'RO76', label: 'GP practice' },
  { value: 'RO177', label: 'Prescribing cost centre' },
  { value: 'RO272', label: 'PCN' },
  { value: 'RO98', label: 'Sub-ICB location (RO98)' },
  { value: 'RO319', label: 'Sub-ICB location (RO319)' },
  { value: 'RO261', label: 'ICB (RO261)' },
  { value: 'RO318', label: 'ICB (RO318)' },
  { value: 'RO209', label: 'NHS England region' },
  { value: 'RO197', label: 'NHS trust' },
  { value: 'RO57', label: 'NHS trust site' },
  { value: 'RO182', label: 'Pharmacy' },
  { value: 'RO181', label: 'Pharmacy headquarters' },
] as const

export const PAGE_SIZE = 50
