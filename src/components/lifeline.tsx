'use client'

import { useState } from 'react'
import Link from 'next/link'
import { formatRange } from '@/lib/format'
import { shortName } from '@/lib/scopes'
import { REL_ORDER, relColour, relLabel, relTypeLabel } from '@/lib/rels'
import type { OrgRelInfo } from '../../worker/src/api/types'

const MAX_ROWS = 24
const toYear = (iso: string) => {
  const d = new Date(`${iso}T00:00:00Z`)
  return d.getUTCFullYear() + d.getUTCMonth() / 12 + (d.getUTCDate() - 1) / 365
}

// Relationship bars on a shared time axis: when this org belonged to each parent.
export function Lifeline({ rels, today }: { rels: OrgRelInfo[]; today: string }) {
  const [hover, setHover] = useState<number | null>(null)
  const rows = rels
    .filter((r) => r.opStart ?? r.legalStart)
    .sort((a, b) => {
      const ta = REL_ORDER.indexOf(a.type.code)
      const tb = REL_ORDER.indexOf(b.type.code)
      return (ta === -1 ? 99 : ta) - (tb === -1 ? 99 : tb) || (a.opStart ?? '').localeCompare(b.opStart ?? '')
    })
    .slice(0, MAX_ROWS)
  if (rows.length === 0) return null

  const now = toYear(today)
  const start = Math.floor(Math.min(...rows.map((r) => toYear((r.opStart ?? r.legalStart)!))))
  const span = Math.max(1, now - start)
  const stepYears = [1, 2, 5, 10, 20].find((s) => span / s <= 8) ?? 20
  const ticks: number[] = []
  for (let t = Math.ceil(start / stepYears) * stepYears; t <= now; t += stepYears) ticks.push(t)
  const pct = (yr: number) => `${((yr - start) / span) * 100}%`
  const types = [...new Set(rows.map((r) => r.type.code))]

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
      <div className="relative">
        {/* Year gridlines behind the tracks */}
        <div aria-hidden className="pointer-events-none absolute inset-y-0 left-0 right-0 sm:left-[19rem]">
          {ticks.map((t) => (
            <div key={t} className="absolute inset-y-0 w-px bg-[#e1e0d9]" style={{ left: pct(t) }} />
          ))}
        </div>
        <ul className="relative space-y-1">
          {rows.map((r, i) => {
            const s = toYear((r.opStart ?? r.legalStart)!)
            const e = r.opEnd ? toYear(r.opEnd) : now
            const open = !r.opEnd
            return (
              <li
                key={r.id}
                className="grid grid-cols-1 items-center gap-x-3 sm:grid-cols-[18.25rem_1fr]"
                onMouseEnter={() => setHover(i)}
                onMouseLeave={() => setHover(null)}
              >
                <div className="min-w-0 truncate text-xs" title={`${r.org.name ?? r.org.code} · ${relLabel(r)}`}>
                  <Link href={`/org/${r.org.code}`} className="font-medium hover:text-primary hover:underline">
                    {shortName(r.org.name) || r.org.code}
                  </Link>
                  <span className="text-muted-foreground"> · {relLabel(r)}</span>
                </div>
                <div className="relative h-6">
                  <div
                    className="absolute top-1/2 h-2.5 -translate-y-1/2 rounded-full"
                    style={{
                      left: pct(s),
                      width: `max(6px, ${((e - s) / span) * 100}%)`,
                      backgroundColor: relColour(r.type.code),
                      opacity: hover == null || hover === i ? 1 : 0.35,
                      borderTopRightRadius: open ? 0 : undefined,
                      borderBottomRightRadius: open ? 0 : undefined,
                    }}
                  />
                  {hover === i ? (
                    <div
                      className="pointer-events-none absolute -top-9 z-10 whitespace-nowrap rounded-md border bg-popover px-2 py-1 text-xs shadow-md"
                      style={{ left: `min(${pct(s)}, calc(100% - 14rem))` }}
                    >
                      {relLabel(r)} · {formatRange(r.opStart ?? r.legalStart, r.opEnd)}
                    </div>
                  ) : null}
                </div>
              </li>
            )
          })}
        </ul>
        <div className="relative mt-1 h-5 text-[11px] text-muted-foreground sm:ml-[19rem]" aria-hidden>
          {ticks.map((t) => (
            <span key={t} className="absolute -translate-x-1/2 tabular" style={{ left: pct(t) }}>
              {t}
            </span>
          ))}
        </div>
      </div>
      {rels.length > MAX_ROWS ? (
        <p className="text-xs text-muted-foreground">Showing {MAX_ROWS} of {rels.length} relationships; see the Relationships tab for all.</p>
      ) : null}
    </div>
  )
}
