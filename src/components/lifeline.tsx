'use client'

import { useState } from 'react'
import Link from 'next/link'
import { formatRange } from '@/lib/format'
import { shortName } from '@/lib/scopes'
import { REL_ORDER, relColour, relLabel, relTypeLabel } from '@/lib/rels'
import type { OrgRelInfo } from '../../worker/src/api/types'

const MAX_ROWS = 20
const toYear = (iso: string) => {
  const d = new Date(`${iso}T00:00:00Z`)
  return d.getUTCFullYear() + d.getUTCMonth() / 12 + (d.getUTCDate() - 1) / 365
}
const rank = (code: string) => {
  const i = REL_ORDER.indexOf(code)
  return i === -1 ? 99 : i
}
const yearOf = (iso: string | null) => (iso ? iso.slice(0, 4) : 'now')

interface Row {
  key: string
  org: OrgRelInfo['org']
  // Relationship types to this org over the same dates, most significant first.
  rels: OrgRelInfo[]
  start: string
  end: string | null
}

// One row per parent org and date range: ODS often records "commissioned by" and "operated by"
// (or "partner of" and "payee for") to the same org with identical dates.
function toRows(rels: OrgRelInfo[]): Row[] {
  const rows = new Map<string, Row>()
  for (const r of rels) {
    const start = r.opStart ?? r.legalStart
    if (!start) continue
    const key = `${r.org.code}|${start}|${r.opEnd ?? ''}`
    const row = rows.get(key) ?? { key, org: r.org, rels: [], start, end: r.opEnd }
    row.rels.push(r)
    rows.set(key, row)
  }
  for (const row of rows.values()) row.rels.sort((a, b) => rank(a.type.code) - rank(b.type.code))
  return [...rows.values()].sort((a, b) => rank(a.rels[0].type.code) - rank(b.rels[0].type.code) || a.start.localeCompare(b.start))
}

// Relationship bars on a shared time axis: when this org belonged to each parent.
export function Lifeline({ rels, today }: { rels: OrgRelInfo[]; today: string }) {
  const [hover, setHover] = useState<string | null>(null)
  const all = toRows(rels)
  const rows = all.slice(0, MAX_ROWS)
  if (rows.length === 0) return null

  const now = toYear(today)
  const start = Math.floor(Math.min(...rows.map((r) => toYear(r.start))))
  const span = Math.max(1, now - start)
  const stepYears = [1, 2, 5, 10, 20].find((s) => span / s <= 7) ?? 20
  const ticks: number[] = []
  for (let t = Math.ceil(start / stepYears) * stepYears; t <= now; t += stepYears) ticks.push(t)
  const pct = (yr: number) => `${((yr - start) / span) * 100}%`
  // Legend lists the colours actually drawn (each row takes its most significant type's colour).
  const types = [...new Set(rows.map((r) => r.rels[0].type.code))]

  const Grid = () => (
    <div aria-hidden className="pointer-events-none absolute inset-0">
      {ticks.map((t) => (
        <div key={t} className="absolute inset-y-0 w-px bg-[#e1e0d9]" style={{ left: pct(t) }} />
      ))}
    </div>
  )

  return (
    <div className="space-y-3">
      <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground" aria-label="Legend">
        {types.map((t) => (
          <li key={t} className="inline-flex items-center gap-1.5">
            <span aria-hidden className="h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: relColour(t) }} />
            {relTypeLabel(t)}
          </li>
        ))}
      </ul>
      <ul className="space-y-3 sm:space-y-1">
        {rows.map((r) => {
          const s = toYear(r.start)
          const e = r.end ? toYear(r.end) : now
          const labels = [...new Set(r.rels.map((x) => relLabel(x)))]
          const colour = relColour(r.rels[0].type.code)
          const active = hover == null || hover === r.key
          return (
            <li
              key={r.key}
              className="grid grid-cols-1 items-center gap-x-3 gap-y-1 sm:grid-cols-[18.25rem_1fr]"
              onMouseEnter={() => setHover(r.key)}
              onMouseLeave={() => setHover(null)}
            >
              <div className="flex min-w-0 items-baseline justify-between gap-2 text-xs" title={`${r.org.name ?? r.org.code} · ${labels.join(', ')}`}>
                <span className="min-w-0 truncate">
                  <Link href={`/org/${r.org.code}`} className="font-medium hover:text-primary hover:underline">
                    {shortName(r.org.name) || r.org.code}
                  </Link>
                  <span className="text-muted-foreground"> · {labels.join(', ').replace(/(?<=, )\w/, (c) => c.toLowerCase())}</span>
                </span>
                {/* Dates in words on small screens, where the axis is harder to read. */}
                <span className="shrink-0 tabular text-muted-foreground sm:hidden">
                  {yearOf(r.start)}–{r.end ? yearOf(r.end) : 'now'}
                </span>
              </div>
              <div className="relative h-4 rounded-full bg-muted/60 sm:h-6 sm:rounded-none sm:bg-transparent">
                <div className="hidden sm:block">
                  <Grid />
                </div>
                <div
                  className="absolute top-1/2 h-2.5 -translate-y-1/2 rounded-full transition-opacity"
                  style={{
                    left: pct(s),
                    width: `max(6px, ${((e - s) / span) * 100}%)`,
                    backgroundColor: colour,
                    opacity: active ? 1 : 0.35,
                    borderTopRightRadius: r.end ? undefined : 0,
                    borderBottomRightRadius: r.end ? undefined : 0,
                  }}
                />
                {hover === r.key ? (
                  <div
                    className="pointer-events-none absolute -top-8 z-10 hidden whitespace-nowrap rounded-md border bg-popover px-2 py-1 text-xs shadow-md sm:block"
                    style={{ left: `min(${pct(s)}, calc(100% - 14rem))` }}
                  >
                    {labels.join(', ')} · {formatRange(r.start, r.end)}
                  </div>
                ) : null}
              </div>
            </li>
          )
        })}
      </ul>
      <div className="grid grid-cols-1 sm:grid-cols-[18.25rem_1fr] sm:gap-x-3" aria-hidden>
        <div className="hidden sm:block" />
        <div className="relative h-5 text-[11px] text-muted-foreground">
          {ticks.map((t, i) => (
            <span
              key={t}
              className="absolute tabular"
              style={{ left: pct(t), transform: i === 0 && t === start ? 'none' : 'translateX(-50%)' }}
            >
              {t}
            </span>
          ))}
        </div>
      </div>
      {all.length > MAX_ROWS ? (
        <p className="text-xs text-muted-foreground">Showing {MAX_ROWS} of {all.length} relationships; see the Relationships tab for all.</p>
      ) : null}
    </div>
  )
}
