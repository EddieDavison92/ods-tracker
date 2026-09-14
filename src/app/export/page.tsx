import type { Metadata } from 'next'
import { Download } from 'lucide-react'
import { AreaPicker } from '@/components/area-picker'
import { Field, PageHeading, Panel, fieldClass } from '@/components/field'
import { API_BASE, fetchScopes, optional } from '@/lib/api'
import { GROUPS } from '@/lib/groups'
import { type Query } from '@/lib/href'
import { displayName } from '@/lib/names'
import { codeParam } from '@/lib/params'
import { EMPTY_SCOPES, scopeLabel } from '@/lib/scopes'
import { cn } from '@/lib/utils'

export const metadata: Metadata = { title: 'Export' }

const ENDPOINTS = [
  ['/api/orgs?q=&group=&scope=&status=', 'Search and browse every organisation'],
  ['/api/orgs/{code}', 'Organisation detail: hierarchy, relationships, members, changes'],
  ['/api/changes?scope=&group=&kinds=&since=', 'Change feed (cursor with before=)'],
  ['/api/changes/activity?scope=&months=', 'Monthly openings, closures and other changes'],
  ['/api/scopes', 'Regions, ICBs and Sub-ICB locations with counts'],
  ['/api/export/orgs.csv', 'Directory CSV (same filters as /api/orgs)'],
  ['/api/export/practices.csv?asAt=', 'GP practice hierarchy, current or on a date'],
]

const button = 'inline-flex h-9 items-center gap-2 rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground shadow-sm hover:bg-primary/90'

export default async function ExportPage({ searchParams }: { searchParams: Promise<Query> }) {
  const scope = codeParam((await searchParams).scope)
  const scopes = (await optional(fetchScopes())) ?? EMPTY_SCOPES
  const place = displayName(scopeLabel(scopes, scope))

  return (
    <div className="mx-auto max-w-7xl px-4 py-8">
      <PageHeading title="Export" description="Download CSVs for spreadsheets and analysis, or use the JSON API directly. Everything is open data.">
        <AreaPicker scopes={scopes} tone="light" />
      </PageHeading>
      <div className="grid gap-6 lg:grid-cols-2">
        <Panel title="Directory">
          <form method="get" action={`${API_BASE}/api/export/orgs.csv`} className="space-y-4">
            <p className="text-sm text-muted-foreground">
              One row per organisation with its type, role, status, dates, parent and area (PCN, Sub-ICB, ICB, region). Up to 50,000 rows.
            </p>
            {scope ? <input type="hidden" name="scope" value={scope} /> : null}
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Type" htmlFor="group">
                <select id="group" name="group" className={fieldClass} defaultValue="gp">
                  <option value="">All types</option>
                  {GROUPS.map((g) => <option key={g.key} value={g.key}>{g.label}</option>)}
                </select>
              </Field>
              <Field label="Status" htmlFor="status">
                <select id="status" name="status" className={fieldClass} defaultValue="active">
                  <option value="active">Active</option>
                  <option value="inactive">Closed</option>
                  <option value="all">All</option>
                </select>
              </Field>
              <Field label="Name, code or postcode (optional)" htmlFor="q">
                <input id="q" name="q" maxLength={100} className={fieldClass} placeholder="e.g. Boots" />
              </Field>
              <Field label="Area" htmlFor="area">
                <input id="area" readOnly value={place} className={cn(fieldClass, 'bg-muted text-muted-foreground')} />
              </Field>
            </div>
            <button type="submit" className={button}><Download aria-hidden className="h-4 w-4" /> Download CSV</button>
          </form>
        </Panel>

        <Panel title="GP practice mapping">
          <form method="get" action={`${API_BASE}/api/export/practices.csv`} className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Practice → PCN → Sub-ICB → ICB → region, today or as it was on any date. Past dates use each relationship&apos;s ODS start and end dates.
            </p>
            {scope ? <input type="hidden" name="scope" value={scope} /> : null}
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="As at (leave blank for today)" htmlFor="asAt">
                <input id="asAt" type="date" name="asAt" min="2013-04-01" className={fieldClass} />
              </Field>
              <Field label="Status (today only)" htmlFor="pstatus">
                <select id="pstatus" name="status" className={fieldClass} defaultValue="active">
                  <option value="active">Active</option>
                  <option value="all">All</option>
                </select>
              </Field>
            </div>
            <p className="text-xs text-muted-foreground">Area: {place}. ODS has no CCG-to-STP links before 2020, so ICB is often blank for earlier dates.</p>
            <button type="submit" className={button}><Download aria-hidden className="h-4 w-4" /> Download CSV</button>
          </form>
        </Panel>

        <Panel title="JSON API" className="lg:col-span-2">
          <p className="mb-3 text-sm text-muted-foreground">
            Base URL <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs">{API_BASE}</code>. No key needed; responses are cached for up to 5 minutes.
          </p>
          <ul className="divide-y text-sm">
            {ENDPOINTS.map(([path, desc]) => (
              <li key={path} className="flex flex-col gap-1 py-2 sm:flex-row sm:items-center sm:justify-between">
                <code className="font-mono text-xs">{path}</code>
                <span className="text-muted-foreground">{desc}</span>
              </li>
            ))}
          </ul>
        </Panel>
      </div>
    </div>
  )
}
