import { format, formatDistanceToNow, parseISO } from 'date-fns'
import { enGB } from 'date-fns/locale'

export function formatDate(iso: string | null | undefined): string {
  if (!iso) return '—'
  const date = parseISO(iso)
  if (Number.isNaN(date.getTime())) return iso
  return format(date, 'd MMM yyyy', { locale: enGB })
}

// YYYY-MM -> "August 2026"
export function formatMonth(month: string): string {
  const date = parseISO(`${month}-01`)
  return Number.isNaN(date.getTime()) ? month : format(date, 'MMMM yyyy', { locale: enGB })
}

export function formatRange(start: string | null | undefined, end: string | null | undefined): string {
  if (!start && !end) return '—'
  return `${formatDate(start)} – ${end ? formatDate(end) : 'current'}`
}

export function formatRelative(iso: string | null | undefined): string | null {
  if (!iso) return null
  const date = parseISO(iso)
  if (Number.isNaN(date.getTime())) return iso
  return formatDistanceToNow(date, { addSuffix: true, locale: enGB })
}

export function freshnessCopy(lastSyncDate: string | null, lastSyncAt: string | null): string {
  if (!lastSyncDate && !lastSyncAt) return 'Change history is still loading'
  const upTo = lastSyncDate ? formatDate(lastSyncDate) : '—'
  const checked = formatRelative(lastSyncAt)
  return checked ? `Data up to ${upTo} · checked ${checked}` : `Data up to ${upTo}`
}

export function daysAgoIso(days: number): string {
  return new Date(Date.now() - days * 86_400_000).toISOString().slice(0, 10)
}

export function formatNumber(n: number | null | undefined): string {
  if (n == null) return '—'
  return n.toLocaleString('en-GB')
}
