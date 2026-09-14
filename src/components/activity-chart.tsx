'use client'

import { useEffect, useRef, useState } from 'react'
import { format, parseISO } from 'date-fns'
import { TONE_COLOURS, TONE_LABELS, type KindTone } from '@/lib/kinds'
import type { ActivityPoint } from '../../worker/src/api/types'

// Stacked monthly columns: openings and closures at the baseline, other changes on top.
const STACK: KindTone[] = ['opened', 'closed', 'changed']
const LEGEND: KindTone[] = ['changed', 'closed', 'opened']
const M = { top: 8, right: 8, bottom: 26, left: 48 }

function niceMax(max: number): { top: number; step: number } {
  if (max <= 0) return { top: 4, step: 1 }
  const raw = max / 4
  const mag = 10 ** Math.floor(Math.log10(raw))
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw) ?? 10 * mag
  return { top: Math.ceil(max / step) * step, step }
}

const compact = (n: number) => new Intl.NumberFormat('en-GB', { notation: 'compact', maximumFractionDigits: 1 }).format(n)
// Buckets are YYYY-MM, or YYYY for yearly charts.
const monthLabel = (m: string, withYear = false) =>
  m.length === 4 ? m : format(parseISO(`${m}-01`), withYear ? 'MMM yyyy' : 'MMM', {})

export function ActivityChart({ data, height = 200 }: { data: ActivityPoint[]; height?: number }) {
  // The measured wrapper stays mounted; observing an element that is then replaced reports width 0.
  const ref = useRef<HTMLDivElement>(null)
  // Unknown until measured: drawing at a guessed width would widen the page on phones.
  const [width, setWidth] = useState<number | null>(null)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const ro = new ResizeObserver(([entry]) => setWidth(Math.floor(entry.contentRect.width)))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  return (
    <div ref={ref} className="w-full min-w-0">
      {width ? <Chart data={data} height={height} width={width} /> : <div style={{ height: height + 28 }} aria-hidden />}
    </div>
  )
}

function Chart({ data, height, width }: { data: ActivityPoint[]; height: number; width: number }) {
  const [hover, setHover] = useState<number | null>(null)
  const totals = data.map((d) => d.opened + d.closed + d.changed)
  const { top, step } = niceMax(Math.max(0, ...totals))
  const plotW = width - M.left - M.right
  const plotH = height - M.top - M.bottom
  const band = plotW / Math.max(1, data.length)
  const barW = Math.max(2, Math.min(24, band * 0.68))
  const y = (v: number) => M.top + plotH - (v / top) * plotH
  const ticks = Array.from({ length: Math.round(top / step) + 1 }, (_, i) => i * step)
  const labelEvery = Math.max(1, Math.ceil(44 / band))
  const active = hover == null ? null : data[hover]

  return (
    <div className="space-y-3">
      <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground" aria-label="Legend">
        {LEGEND.map((k) => (
          <li key={k} className="inline-flex items-center gap-1.5">
            <span aria-hidden className="h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: TONE_COLOURS[k] }} />
            {TONE_LABELS[k]}
          </li>
        ))}
      </ul>
      {/* Announces the month under the keyboard cursor. */}
      <p aria-live="polite" className="sr-only">
        {active
          ? `${monthLabel(active.month, true)}: ${active.opened} openings, ${active.closed} closures, ${active.changed} other changes`
          : ''}
      </p>
      <div
        className="relative rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40 focus-visible:ring-offset-2"
        tabIndex={0}
        role="img"
        aria-label="Monthly changes chart. Use left and right arrow keys to read each month, or open the table below."
        onMouseLeave={() => setHover(null)}
        onBlur={() => setHover(null)}
        onKeyDown={(e) => {
          if (e.key === 'ArrowRight') setHover((h) => Math.min(data.length - 1, (h ?? -1) + 1))
          if (e.key === 'ArrowLeft') setHover((h) => Math.max(0, (h ?? data.length) - 1))
        }}
      >
        <svg width={width} height={height} className="block">
          {ticks.map((t) => (
            <g key={t}>
              <line x1={M.left} x2={width - M.right} y1={y(t)} y2={y(t)} stroke="#e1e0d9" strokeWidth={1} />
              <text x={M.left - 8} y={y(t)} dy="0.32em" textAnchor="end" className="fill-muted-foreground tabular text-[11px]">
                {compact(t)}
              </text>
            </g>
          ))}
          {data.map((d, i) => {
            const x = M.left + i * band + (band - barW) / 2
            let acc = 0
            const segs = STACK.map((k) => ({ k, v: d[k] })).filter((s) => s.v > 0)
            return (
              <g key={d.month} opacity={hover == null || hover === i ? 1 : 0.45}>
                {segs.map((s, j) => {
                  const y0 = y(acc)
                  acc += s.v
                  const y1 = y(acc)
                  // 2px surface gap between stacked segments.
                  const h = Math.max(1, y0 - y1 - (j > 0 ? 2 : 0))
                  const yTop = y1
                  const last = j === segs.length - 1
                  const r = last ? Math.min(4, barW / 2, h) : 0
                  const path = r
                    ? `M${x},${yTop + h} V${yTop + r} Q${x},${yTop} ${x + r},${yTop} H${x + barW - r} Q${x + barW},${yTop} ${x + barW},${yTop + r} V${yTop + h} Z`
                    : `M${x},${yTop + h} V${yTop} H${x + barW} V${yTop + h} Z`
                  return <path key={s.k} d={path} fill={TONE_COLOURS[s.k]} />
                })}
                {i % labelEvery === 0 ? (
                  <text
                    x={M.left + i * band + band / 2}
                    y={height - 8}
                    textAnchor="middle"
                    className="fill-muted-foreground text-[11px]"
                  >
                    {monthLabel(d.month, i === 0 || d.month.endsWith('-01'))}
                  </text>
                ) : null}
                <rect
                  x={M.left + i * band}
                  y={M.top}
                  width={band}
                  height={plotH}
                  fill="transparent"
                  onMouseEnter={() => setHover(i)}
                />
              </g>
            )
          })}
          <line x1={M.left} x2={width - M.right} y1={y(0)} y2={y(0)} stroke="#c3c2b7" strokeWidth={1} />
        </svg>
        {active && hover != null ? (
          <div
            className="pointer-events-none absolute top-0 z-10 w-44 rounded-lg border bg-popover p-2.5 text-xs shadow-lg"
            style={{
              left: Math.min(width - 184, Math.max(0, M.left + hover * band + band / 2 - 88)),
            }}
          >
            <p className="mb-1.5 font-semibold">{monthLabel(active.month, true)}</p>
            {LEGEND.map((k) => (
              <p key={k} className="flex items-center justify-between gap-3">
                <span className="inline-flex items-center gap-1.5 text-muted-foreground">
                  <span className="h-2 w-2 rounded-sm" style={{ backgroundColor: TONE_COLOURS[k] }} />
                  {TONE_LABELS[k]}
                </span>
                <span className="tabular font-medium">{active[k].toLocaleString('en-GB')}</span>
              </p>
            ))}
            <p className="mt-1 flex justify-between border-t pt-1 font-medium">
              <span>Total</span>
              <span className="tabular">{(active.opened + active.closed + active.changed).toLocaleString('en-GB')}</span>
            </p>
          </div>
        ) : null}
      </div>
      <details className="text-xs">
        <summary className="cursor-pointer text-muted-foreground hover:text-foreground">View as table</summary>
        <div className="mt-2 max-h-64 overflow-auto rounded-lg border">
          <table className="w-full text-left">
            <thead className="sticky top-0 bg-muted">
              <tr>
                <th className="px-2 py-1 font-medium">Month</th>
                {LEGEND.map((k) => (
                  <th key={k} className="px-2 py-1 text-right font-medium">{TONE_LABELS[k]}</th>
                ))}
              </tr>
            </thead>
            <tbody className="tabular">
              {[...data].reverse().map((d) => (
                <tr key={d.month} className="border-t">
                  <td className="px-2 py-1">{monthLabel(d.month, true)}</td>
                  {LEGEND.map((k) => (
                    <td key={k} className="px-2 py-1 text-right">{d[k].toLocaleString('en-GB')}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </div>
  )
}
