import { displayName } from '@/lib/names'
import type { ScopeOption, Scopes } from '../../worker/src/api/types'

export const EMPTY_SCOPES: Scopes = { regions: [], icbs: [], sicbls: [] }

export function scopeLabel(scopes: Scopes, code: string | null | undefined): string {
  if (!code) return 'All England'
  const s = [...scopes.sicbls, ...scopes.icbs, ...scopes.regions].find((o) => o.code === code)
  return s ? displayName(s.name) : code
}

// ODS keeps some merged ICBs active with nothing left in them; treat an area as current only if
// it is active and contains other organisations.
export const isLiveArea = (s: ScopeOption) => s.active && (s.counts?.active ?? 0) > 1

// Compact organisation names for tight spaces (chart labels, cards).
export function shortName(name: string | null | undefined): string {
  return displayName(name)
    .replace(/ Integrated Care Board$/i, ' ICB')
    .replace(/ Commissioning Region$/i, '')
    .replace(/ Strategic Health Authority$/i, ' SHA')
    .replace(/ NHS Foundation Trust$/i, ' NHS FT')
    .replace(/ Clinical Commissioning Group$/i, ' CCG')
}
