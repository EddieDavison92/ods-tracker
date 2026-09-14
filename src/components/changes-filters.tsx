'use client'

import { useRouter, useSearchParams } from 'next/navigation'
import { Field, fieldClass } from '@/components/field'
import { KIND_LABELS, NOTABLE_KINDS, ORG_TYPES, OTHER_KINDS } from '@/lib/constants'
import type { ChangeKind } from '../../worker/src/api/types'

export function ChangesFilters() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const showAll = searchParams.get('all') === '1'
  const type = searchParams.get('type') ?? 'all'
  const since = searchParams.get('since') ?? ''
  const selected = new Set(
    (searchParams.get('kinds')?.split(',').filter(Boolean) as ChangeKind[] | undefined) ??
      (showAll ? [] : NOTABLE_KINDS),
  )

  function push(mutate: (params: URLSearchParams) => void) {
    const params = new URLSearchParams(searchParams.toString())
    params.delete('before')
    mutate(params)
    const qs = params.toString()
    router.push(qs ? `/changes?${qs}` : '/changes')
  }

  function toggleKind(kind: ChangeKind) {
    const next = new Set(selected)
    if (next.has(kind)) {
      if (next.size === 1) return
      next.delete(kind)
    } else next.add(kind)
    push((params) => {
      params.delete('all')
      params.set('kinds', [...next].join(','))
    })
  }

  const chips = showAll ? [...NOTABLE_KINDS, ...OTHER_KINDS] : NOTABLE_KINDS

  return (
    <form className="mb-4 space-y-3" onSubmit={(e) => e.preventDefault()}>
      <div className="flex flex-wrap gap-3">
        <Field label="Organisation type" htmlFor="type">
          <select
            id="type"
            className={fieldClass}
            value={type}
            onChange={(e) =>
              push((params) => {
                if (!e.target.value || e.target.value === 'all') params.delete('type')
                else params.set('type', e.target.value)
              })
            }
          >
            {ORG_TYPES.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Since" htmlFor="since">
          <input
            id="since"
            type="date"
            className={fieldClass}
            value={since}
            onChange={(e) =>
              push((params) => {
                if (e.target.value) params.set('since', e.target.value)
                else params.delete('since')
              })
            }
          />
        </Field>
        <label className="flex items-end gap-2 pb-1 text-sm">
          <input
            type="checkbox"
            checked={showAll}
            onChange={(e) =>
              push((params) => {
                if (e.target.checked) {
                  params.set('all', '1')
                  params.delete('kinds')
                } else {
                  params.delete('all')
                  params.delete('kinds')
                }
              })
            }
          />
          Show all changes
        </label>
      </div>
      <fieldset>
        <legend className="mb-1 text-xs font-medium text-muted-foreground">Kinds</legend>
        <div className="flex flex-wrap gap-1">
          {chips.map((kind) => {
            const on = selected.has(kind)
            return (
              <button
                key={kind}
                type="button"
                aria-pressed={on}
                onClick={() => toggleKind(kind)}
                className={`rounded-full border px-2 py-0.5 text-xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring ${
                  on ? 'border-primary bg-primary text-primary-foreground' : 'hover:bg-accent'
                }`}
              >
                {KIND_LABELS[kind]}
              </button>
            )
          })}
        </div>
      </fieldset>
    </form>
  )
}
