import {
  ArrowLeftRight, Calendar, CircleMinus, CirclePlus, GitMerge, Link2, Link2Off, MapPin, Phone, RotateCcw, Tag,
  Type, type LucideIcon,
} from 'lucide-react'
import type { ChangeKind } from '../../worker/src/api/types'

// Change kinds fall into three buckets, matching the activity chart series.
export type KindTone = 'opened' | 'closed' | 'changed'

// Chart and badge hues (validated: blue, orange, aqua).
export const TONE_COLOURS: Record<KindTone, string> = {
  changed: '#2a78d6',
  closed: '#eb6834',
  opened: '#1baf7a',
}

export const TONE_LABELS: Record<KindTone, string> = {
  opened: 'Openings',
  closed: 'Closures',
  changed: 'Other changes',
}

export const kindTone = (kind: ChangeKind): KindTone =>
  kind === 'created' || kind === 'reopened' ? 'opened' : kind === 'closed' || kind === 'removed' ? 'closed' : 'changed'

export const KIND_LABELS: Record<ChangeKind, string> = {
  created: 'Opened',
  removed: 'Removed',
  name: 'Renamed',
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
  rel_added: 'Joined',
  rel_ended: 'Left',
  rel_changed: 'Relationship',
  rel_removed: 'Relationship removed',
  succ_added: 'Succession',
  succ_removed: 'Succession removed',
}

export const KIND_ICONS: Record<ChangeKind, LucideIcon> = {
  created: CirclePlus,
  removed: CircleMinus,
  name: Type,
  status: ArrowLeftRight,
  closed: CircleMinus,
  reopened: RotateCcw,
  dates: Calendar,
  record_class: Tag,
  address: MapPin,
  contact: Phone,
  primary_role: Tag,
  role_added: Tag,
  role_ended: Tag,
  role_changed: Tag,
  role_removed: Tag,
  rel_added: Link2,
  rel_ended: Link2Off,
  rel_changed: Link2,
  rel_removed: Link2Off,
  succ_added: GitMerge,
  succ_removed: GitMerge,
}

// Presets for the change feed filter. `field` narrows to one relationship type and `relatedGroup` to
// the type of organisation on the other side: RE8 "partner of" also covers councils and trusts
// partnering ICBs, so PCN joins and leaves need both.
export const KIND_PRESETS: { key: string; label: string; kinds: ChangeKind[] | null; field?: string; relatedGroup?: string }[] = [
  { key: 'notable', label: 'Notable', kinds: ['created', 'closed', 'reopened', 'name', 'address', 'rel_added', 'rel_ended', 'succ_added'] },
  { key: 'lifecycle', label: 'Openings and closures', kinds: ['created', 'closed', 'reopened', 'removed'] },
  { key: 'pcn', label: 'PCN joins and leaves', kinds: ['rel_added', 'rel_ended'], field: 'RE8', relatedGroup: 'pcn' },
  { key: 'identity', label: 'Names and addresses', kinds: ['name', 'address', 'contact'] },
  { key: 'membership', label: 'All relationships', kinds: ['rel_added', 'rel_ended', 'rel_changed', 'succ_added'] },
  { key: 'all', label: 'Everything', kinds: null },
]

const preset = (key: string | undefined) => KIND_PRESETS.find((p) => p.key === key) ?? KIND_PRESETS[0]
export const presetKinds = (key: string | undefined) => preset(key).kinds
export const presetField = (key: string | undefined) => preset(key).field
export const presetRelatedGroup = (key: string | undefined) => preset(key).relatedGroup
