// Plain-English descriptions of change events.
import type { ChangeKind } from './types.ts'

export interface SummaryInput {
  kind: ChangeKind
  field: string | null
  oldValue: string | null
  newValue: string | null
  related: string | null
  relatedName: string | null
  detail: string | null
}

type Names = (code: string | null) => string

const DATE_LABELS: Record<string, string> = {
  opStart: 'Operational start',
  opEnd: 'Operational end',
  legalStart: 'Legal start',
  legalEnd: 'Legal end',
}
const CONTACT_LABELS: Record<string, string> = { tel: 'Phone', fax: 'Fax', url: 'Website' }

// Relationship phrasing by type: [joined, left].
const REL_PHRASES: Record<string, [string, string]> = {
  RE2: ['Became a sub-division of', 'No longer a sub-division of'],
  RE3: ['Now directed by', 'No longer directed by'],
  RE4: ['Now commissioned by', 'No longer commissioned by'],
  RE5: ['Now in the geography of', 'No longer in the geography of'],
  RE6: ['Now operated by', 'No longer operated by'],
  RE8: ['Became a partner of', 'No longer a partner of'],
  RE9: ['Became nominated payee for', 'No longer nominated payee for'],
  RE10: ['Became COVID nominated payee for', 'No longer COVID nominated payee for'],
  RE11: ['Became a constituent of', 'No longer a constituent of'],
}

function targetRole(detail: string | null): string | null {
  if (!detail) return null
  try {
    const d = JSON.parse(detail)
    return d.targetRole ?? d.after?.targetRole ?? null
  } catch {
    return null
  }
}

const change = (from: string | null, to: string | null) =>
  from && to ? `from ${from} to ${to}` : to ? `added: ${to}` : `removed (was ${from})`

export function summarise(e: SummaryInput, roleName: Names, relName: Names): string {
  const target = e.related ? `${e.relatedName ?? 'unknown'} (${e.related})` : ''
  switch (e.kind) {
    case 'created': return 'Opened'
    case 'removed': return 'Removed from ODS'
    case 'name': return `Renamed from "${e.oldValue}" to "${e.newValue}"`
    case 'status': return `Status changed ${change(e.oldValue, e.newValue)}`
    case 'closed': return `Closed${e.newValue ? ` (operational end ${e.newValue})` : ''}`
    case 'reopened': return 'Reopened'
    case 'dates': return `${DATE_LABELS[e.field ?? ''] ?? 'Date'} ${change(e.oldValue, e.newValue)}`
    case 'record_class': return `Record class changed ${change(e.oldValue, e.newValue)}`
    case 'address': return `Address changed ${change(e.oldValue, e.newValue)}`
    case 'contact': return `${CONTACT_LABELS[e.field ?? ''] ?? 'Contact'} ${change(e.oldValue, e.newValue)}`
    case 'primary_role': return `Primary role changed ${change(roleName(e.oldValue), roleName(e.newValue))}`
    case 'role_added': return `Role added: ${roleName(e.field)}`
    case 'role_ended': return `Role ended: ${roleName(e.field)}`
    case 'role_changed': return `Role updated: ${roleName(e.field)}`
    case 'role_removed': return `Role removed: ${roleName(e.field)}`
    case 'rel_added':
    case 'rel_ended':
    case 'rel_changed':
    case 'rel_removed': {
      if (e.field === 'RE8' && targetRole(e.detail) === 'RO272') {
        return { rel_added: 'Joined PCN', rel_ended: 'Left PCN', rel_changed: 'PCN membership updated:', rel_removed: 'PCN membership removed:' }[e.kind] + ` ${target}`
      }
      const [joined, left] = REL_PHRASES[e.field ?? ''] ?? [`${relName(e.field)}`, `No longer ${relName(e.field)}`]
      if (e.kind === 'rel_added') return `${joined} ${target}`
      if (e.kind === 'rel_ended') return `${left} ${target}`
      if (e.kind === 'rel_changed') return `Relationship updated (${relName(e.field).toLowerCase()}) ${target}`
      return `Relationship removed (${relName(e.field).toLowerCase()}) ${target}`
    }
    case 'succ_added':
      return e.field === 'Successor' ? `Succeeded by ${target}` : `Predecessor recorded: ${target}`
    case 'succ_removed':
      return `Succession removed: ${target}`
  }
}
