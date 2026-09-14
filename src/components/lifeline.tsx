'use client'

import { useState } from 'react'
import Link from 'next/link'
import { formatDate, formatRange } from '@/lib/format'
import { shortName } from '@/lib/scopes'
import { relColour } from '@/lib/rels'
import type { OrgRelInfo } from '../../worker/src/api/types'

// One swimlane per kind of relationship; each lane shows the successive orgs as labelled segments,
// e.g. Commissioner: PCG -> PCT -> CCG -> Sub-ICB location.
interface Lane {
  key: string
  label: string
  colour: string
  order: number
}

function laneOf(r: OrgRelInfo): Lane {
  const c = r.type.code
  if (c === 'RE8' && r.orgPrimaryRole?.code === 'RO272') return { key: 'pcn', label: 'PCN', colour: relColour('RE8'), order: 0 }
  const lanes: Record<string, [string, number]> = {
    RE8: ['Partner of', 1], RE4: ['Commissioner', 2], RE6: ['Operated by', 3], RE5: ['Area', 4],
    RE11: ['Locality', 5], RE9: ['Payee for', 6], RE10: ['COVID payee for', 7], RE3: ['Directed by', 8], RE2: ['Part of', 9],
  }
  const [label, order] = lanes[c] ?? [r.type.name ?? c, 10]
  return { key: c, label, colour: relColour(c), order }
}

interface Segment {
  id: number
  org: OrgRelInfo['org']
  start: string
  end: string | null
  // Other lanes this same org and date range also appears in (e.g. "operated by").
  also: string[]
  row: number
}

const toYear = (iso: string) => {
  const d = new Date(`${iso}T00:00:00Z`)
  return d.getUTCFullYear() + d.getUTCMonth() / 12 + (d.getUTCDate() - 1) / 365
}
const yearOf = (iso: string | null) => (iso ? iso.slice(0, 4) : 'now')
const ROW_PX = 40

function buildLanes(rels: OrgRelInfo[]) {
  const lanes = new Map<string, { lane: Lane; segments: Segment[] }>()
  for (const r of rels) {
    const start = r.opStart ?? r.legalStart
    if (!start) continue
    const lane = laneOf(r)
    const entry = lanes.get(lane.key) ?? { lane, segments: [] }
    entry.segments.push({ id: r.id, org: r.org, start, end: r.opEnd, also: [], row: 0 })
    lanes.set(lane.key, entry)
  }
  // A segment repeated in a lower-priority lane (same org and dates) folds into the higher one.
  const sorted = [...lanes.values()].sort((a, b) => a.lane.order - b.lane.order)
  for (const [i, hi] of sorted.entries()) {
    for (const lo of sorted.slice(i + 1)) {
      lo.segments = lo.segments.filter((s) => {
        const twin = hi.segments.find((h) => h.org.code === s.org.code && h.start === s.start && h.end === s.end)
        if (twin) twin.also.push(lo.lane.label.toLowerCase())
        return !twin
      })
    }
  }
  // Overlapping segments within a lane go on separate rows.
  for (const l of sorted) {
    l.segments.sort((a, b) => a.start.localeCompare(b.start))
    const rowEnds: string[] = []
    for (const s of l.segments) {
      let row = rowEnds.findIndex((end) => end <= s.start)
      if (row === -1) row = rowEnds.length
      rowEnds[row] = s.end ?? '9999'
      s.row = row
    }
  }
  return sorted.filter((l) => l.segments.length)
}

export function Lifeline({ rels, today }: { rels: OrgRelInfo[]; today: string }) {
  const [hover, setHover] = useState<number | null>(null)
  const lanes = buildLanes(rels)
  if (!lanes.length) return null

  const now = toYear(today)
  const first = Math.min(...lanes.flatMap((l) => l.segments.map((s) => toYear(s.start))))
  const start = Math.floor(first)
  // Half a year of air after "now" so ongoing bars do not run into the edge.
  const end = now + 0.5
  const span = Math.max(1, end - start)
  const step = [1, 2, 5, 10].find((s) => (now - start) / s <= 7) ?? 20
  const ticks: number[] = []
  for (let t = Math.ceil(start / step) * step; t <= now - step / 3; t += step) ticks.push(t)
  const pos = (yr: number) => ((yr - start) / span) * 100

  const tooltip = (s: Segment, lane: Lane) =>
    `${s.org.name ?? s.org.code} (${s.org.code}) · ${[lane.label, ...s.also].join(', ')} · ${formatRange(s.start, s.end)}`

  return (
    <div className="space-y-3">
      {/* Chart for pointer users; the list below carries the same facts as text. */}
      <div aria-hidden className="hidden sm:block">
        <div className="space-y-1.5">
          {lanes.map(({ lane, segments }) => {
            const rows = Math.max(...segments.map((s) => s.row)) + 1
            return (
              <div key={lane.key} className="grid grid-cols-[6.5rem_1fr] items-start gap-3">
                <div className="pt-1 text-xs font-medium text-muted-foreground">{lane.label}</div>
                <div className="relative border-l border-[#c3c2b7]" style={{ height: rows * ROW_PX }}>
                  {ticks.map((t) => (
                    <div key={t} className="absolute inset-y-0 w-px bg-[#ecebe6]" style={{ left: `${pos(t)}%` }} />
                  ))}
                  <div className="absolute inset-y-0 w-px bg-[#c3c2b7]" style={{ left: `${pos(now)}%` }} />
                  {segments.map((s) => {
                    const left = pos(toYear(s.start))
                    const right = pos(s.end ? toYear(s.end) : now)
                    const active = hover == null || hover === s.id
                    return (
                      <div
                        key={s.id}
                        className="absolute px-px"
                        style={{ top: s.row * ROW_PX + 2, left: `${left}%`, width: `max(8px, calc(${right - left}% - 2px))` }}
                        onMouseEnter={() => setHover(s.id)}
                        onMouseLeave={() => setHover(null)}
                        title={tooltip(s, lane)}
                      >
                        <Link
                          href={`/org/${s.org.code}`}
                          tabIndex={-1}
                          className="block truncate pb-1 text-[11px] font-medium leading-4 text-foreground/80 hover:text-primary hover:underline"
                        >
                          {shortName(s.org.name) || s.org.code}
                        </Link>
                        <div
                          className="h-2.5 rounded-full transition-opacity"
                          style={{
                            backgroundColor: lane.colour,
                            opacity: active ? 1 : 0.3,
                            // Ongoing relationships fade into "now" rather than stopping dead.
                            backgroundImage: s.end ? undefined : `linear-gradient(to right, ${lane.colour} 70%, ${lane.colour}66)`,
                          }}
                        />
                      </div>
                    )
                  })}
                </div>
              </div>
            )
          })}
        </div>
        <div className="grid grid-cols-[6.5rem_1fr] gap-3">
          <div />
          <div className="relative h-5 text-[11px] text-muted-foreground">
            {ticks.map((t) => (
              <span key={t} className="absolute -translate-x-1/2 tabular" style={{ left: `${pos(t)}%` }}>{t}</span>
            ))}
            <span className="absolute -translate-x-1/2 font-medium text-foreground/70" style={{ left: `${pos(now)}%` }}>Now</span>
          </div>
        </div>
      </div>

      {/* Text version: visible on phones, read by screen readers everywhere. */}
      <div className="space-y-4 sm:sr-only">
        {lanes.map(({ lane, segments }) => (
          <section key={lane.key} aria-label={lane.label}>
            <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">{lane.label}</h3>
            <ol className="space-y-2">
              {segments.map((s) => {
                const left = pos(toYear(s.start))
                const right = pos(s.end ? toYear(s.end) : now)
                return (
                  <li key={s.id}>
                    <div className="flex items-baseline justify-between gap-3 text-sm">
                      <Link href={`/org/${s.org.code}`} className="min-w-0 truncate font-medium hover:text-primary hover:underline">
                        {shortName(s.org.name) || s.org.code}
                      </Link>
                      <span className="shrink-0 tabular text-xs text-muted-foreground">
                        <span aria-hidden>{yearOf(s.start)}–{s.end ? yearOf(s.end) : 'now'}</span>
                        <span className="sr-only">
                          from {formatDate(s.start)} {s.end ? `to ${formatDate(s.end)}` : 'to now'}
                          {s.also.length ? `, also ${s.also.join(' and ')}` : ''}
                        </span>
                      </span>
                    </div>
                    <div aria-hidden className="relative mt-1 h-1.5 rounded-full bg-muted">
                      <div
                        className="absolute inset-y-0 rounded-full"
                        style={{ left: `${left}%`, width: `max(4px, ${right - left}%)`, backgroundColor: lane.colour }}
                      />
                    </div>
                  </li>
                )
              })}
            </ol>
          </section>
        ))}
      </div>
    </div>
  )
}
