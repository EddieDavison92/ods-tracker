import type { OrgRelInfo } from '../../worker/src/api/types'

// Plain-English relationship labels, from the child's point of view.
const LABELS: Record<string, string> = {
  RE2: 'Part of',
  RE3: 'Directed by',
  RE4: 'Commissioned by',
  RE5: 'In the area of',
  RE6: 'Operated by',
  RE8: 'Partner of',
  RE9: 'Nominated payee for',
  RE10: 'COVID payee for',
  RE11: 'Constituent of',
}

// From the parent's point of view, for member lists.
const INVERSE: Record<string, string> = {
  RE2: 'Sub-division',
  RE3: 'Directs',
  RE4: 'Commissions',
  RE5: 'In area',
  RE6: 'Operates',
  RE8: 'Partner',
  RE9: 'Payee',
  RE10: 'COVID payee',
  RE11: 'Constituent',
}

export const relLabel = (r: Pick<OrgRelInfo, 'type' | 'orgPrimaryRole'>) =>
  r.type.code === 'RE8' && r.orgPrimaryRole?.code === 'RO272' ? 'Member of PCN' : LABELS[r.type.code] ?? r.type.name ?? r.type.code

export const inverseRelLabel = (code: string) => INVERSE[code] ?? code

// Timeline order and hues (validated categorical slots 1-5; others grey).
export const REL_ORDER = ['RE8', 'RE4', 'RE6', 'RE5', 'RE11', 'RE9', 'RE10', 'RE3', 'RE2']
const REL_COLOURS: Record<string, string> = {
  RE8: '#2a78d6',
  RE4: '#eb6834',
  RE6: '#1baf7a',
  RE5: '#eda100',
  RE11: '#e87ba4',
}
export const relColour = (code: string) => REL_COLOURS[code] ?? '#898781'
export const relTypeLabel = (code: string) => LABELS[code] ?? code
