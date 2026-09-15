import type { Metadata } from 'next'
import type { ReactNode } from 'react'
import { PageHeading, Panel } from '@/components/field'
import { GroupIcon } from '@/components/group-badge'
import { API_BASE } from '@/lib/api'
import { GROUPS } from '@/lib/groups'
import { KIND_LABELS } from '@/lib/kinds'

export const metadata: Metadata = { title: 'API' }

const Code = ({ children }: { children: ReactNode }) => (
  <code className="rounded bg-muted px-1 py-0.5 font-mono text-[0.8em]">{children}</code>
)

interface Endpoint {
  path: string
  desc: string
  params: [string, string][]
  cache: string
}

const ORG_FILTERS: [string, string][] = [
  ['q', 'Name, ODS code or postcode (full, sector like "N19 3" or district like "N19"). Up to 100 characters.'],
  ['group', 'Organisation type key (see Types below). Comma-separate for several.'],
  ['role', 'ODS primary role code, e.g. RO182.'],
  ['scope', 'Region, ICB, Sub-ICB location or PCN code. Includes everything within it.'],
  ['parent', 'Organisations directly linked to this code.'],
  ['status', 'active (default), inactive or all.'],
]

const CHANGE_FILTERS: [string, string][] = [
  ['scope', 'Region, ICB, Sub-ICB location or PCN code.'],
  ['code', 'Changes to one organisation.'],
  ['group', 'Organisation type key; comma-separate for several.'],
  ['kinds', 'Comma-separated change kinds (see below).'],
  ['field', 'Relationship type code. field=RE8&kinds=rel_added,rel_ended gives PCN joins and leaves.'],
  ['since, until', 'YYYY-MM-DD, inclusive, on the date basis below.'],
  ['date', 'detected (default): when the change first appeared in ODS. effective: the date ODS says it took effect; changes without one are left out.'],
  ['source', 'trud (monthly releases, to August 2026) or ord (ODS API, every 6 hours since).'],
]

const ENDPOINTS: Endpoint[] = [
  { path: '/api/meta', desc: 'Data freshness, totals, per-type counts and latestEventId (a watermark for the change feed).', params: [], cache: '60 s' },
  { path: '/api/scopes', desc: 'Regions, ICBs and Sub-ICB locations with active counts per type.', params: [], cache: '1 h' },
  {
    path: '/api/orgs',
    desc: 'Search and browse every organisation.',
    params: [...ORG_FILTERS, ['sort', 'relevance (default with q), name or recent.'], ['limit', '1–500, default 50.'], ['offset', 'Rows to skip.']],
    cache: '5 min',
  },
  { path: '/api/facets', desc: 'Counts per type for the same filters as /api/orgs (without group).', params: ORG_FILTERS.filter(([k]) => k !== 'group'), cache: '5 min' },
  { path: '/api/suggest', desc: 'Up to 8 quick matches for a search box.', params: [['q', 'Search text.'], ['group', 'Limit to one type.']], cache: '5 min' },
  {
    path: '/api/orgs/{code}',
    desc: 'One organisation: hierarchy, relationships, successions, roles, its changes and changes that name it, and linked organisations (first page).',
    params: [],
    cache: '5 min',
  },
  {
    path: '/api/orgs/{code}/children',
    desc: 'Organisations linked to this one (members, sites, commissioned organisations).',
    params: [['group', 'Type key.'], ['status', 'current (default), past or all.'], ['limit', '1–500, default 50.'], ['offset', 'Rows to skip.']],
    cache: '5 min',
  },
  {
    path: '/api/changes',
    desc: 'Change feed, newest first on the chosen date basis.',
    params: [...CHANGE_FILTERS, ['limit', '1–500, default 50.'], ['cursor', 'nextCursor from the previous page.'], ['before', 'Legacy id cursor (nextBefore); detected order only.']],
    cache: '5 min',
  },
  { path: '/api/changes.rss', desc: 'The same feed as RSS, 50 items.', params: CHANGE_FILTERS, cache: '5 min' },
  {
    path: '/api/changes/activity',
    desc: 'Openings, closures and other changes per month or year. Empty buckets are returned as zeros.',
    params: [
      ...CHANGE_FILTERS.filter(([k]) => k !== 'since, until'),
      ['interval', 'month (default) or year.'],
      ['months', 'Months back including this one, 1–120, default 24.'],
      ['years', 'Years back including this one, 1–60, default 10 (interval=year).'],
    ],
    cache: '1 h',
  },
  {
    path: '/api/practices',
    desc: 'GP practices with PCN, Sub-ICB, ICB and region, today or on a past date.',
    params: [['scope', 'Area code.'], ['q', 'Search text.'], ['asAt', 'YYYY-MM-DD. Practices open that day, with the links that applied then.'], ['status', 'active (default) or all; today only.'], ['limit', '1–1000, default 100.'], ['offset', 'Rows to skip.']],
    cache: '5 min; 6 h with asAt',
  },
  { path: '/api/pcns', desc: 'PCNs with member counts.', params: [['scope', 'Area code.'], ['q', 'Search text.'], ['status', 'active (default) or all.'], ['limit', '1–2000, default 100.'], ['offset', 'Rows to skip.']], cache: '5 min' },
  { path: '/api/export/orgs.csv', desc: 'Directory CSV, streamed with no row cap. X-Total-Count gives the row count.', params: ORG_FILTERS, cache: '5 min' },
  { path: '/api/export/changes.csv', desc: 'Change feed CSV, up to 20,000 rows. X-Truncated: true means more matched; narrow the filters.', params: CHANGE_FILTERS, cache: '5 min' },
  { path: '/api/export/practices.csv', desc: 'GP practice mapping CSV, current or as at a date.', params: [['scope', 'Area code.'], ['q', 'Search text.'], ['asAt', 'YYYY-MM-DD.'], ['status', 'active or all; today only.']], cache: '1 h' },
]

export default function DocsPage() {
  return (
    <div className="mx-auto max-w-5xl px-4 py-8">
      <PageHeading
        title="API"
        description="A free JSON and CSV API over the same data as this site. No key is needed. Please keep to a few requests per second."
      />
      <div className="space-y-6">
        <Panel title="Basics">
          <ul className="list-disc space-y-2 pl-5 text-sm">
            <li>Base URL <Code>{API_BASE}</Code>. All endpoints are GET and allow cross-origin requests.</li>
            <li>Unknown parameters, out-of-range limits and invalid dates return <Code>400</Code> with a message, so typos never return the wrong rows. Parameters starting with <Code>_</Code> are ignored (use them to bust caches).</li>
            <li>Lists return <Code>items</Code>, <Code>total</Code>, <Code>limit</Code>, <Code>offset</Code>, <Code>nextOffset</Code> (null on the last page) and <Code>dataAsOf</Code>, the date the data was last synced. Use <Code>offset</Code>, not <Code>page</Code>.</li>
            <li>The change feed pages with <Code>cursor</Code>: pass <Code>nextCursor</Code> from the previous response until it is null. Cursors stay stable as new changes arrive.</li>
            <li>To follow changes, poll <Code>/api/meta</Code> and compare <Code>latestEventId</Code>; new events have higher ids. Data syncs every 6 hours, so polling more often gains nothing.</li>
            <li>Unknown codes return <Code>404</Code>. If the database is briefly busy you get <Code>503</Code> with <Code>Retry-After</Code>.</li>
            <li>CSVs are UTF-8 with a byte-order mark so Excel opens them correctly, and include a <Code>data_as_of</Code> or <Code>as_at</Code> column.</li>
          </ul>
        </Panel>

        <Panel title="Endpoints" bodyClassName="p-0">
          <ul className="divide-y">
            {ENDPOINTS.map((e) => (
              <li key={e.path} id={e.path.replace(/[^a-z0-9]+/gi, '-')} className="space-y-2 p-4">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <a rel="nofollow" href={e.path.includes('{') ? undefined : `${API_BASE}${e.path}`} className="font-mono text-sm font-semibold text-primary underline-offset-2 hover:underline">
                    {e.path}
                  </a>
                  <span className="text-xs text-muted-foreground">Cached {e.cache}</span>
                </div>
                <p className="text-sm text-muted-foreground">{e.desc}</p>
                {e.params.length ? (
                  <dl className="grid gap-x-4 gap-y-1 text-sm sm:grid-cols-[9rem_1fr]">
                    {e.params.map(([k, v]) => (
                      <div key={k} className="contents">
                        <dt className="font-mono text-xs leading-5">{k}</dt>
                        <dd className="text-muted-foreground">{v}</dd>
                      </div>
                    ))}
                  </dl>
                ) : null}
              </li>
            ))}
          </ul>
        </Panel>

        <Panel title="Types" bodyClassName="p-0">
          <p className="px-4 pt-4 text-sm text-muted-foreground">
            Each organisation gets one type from its ODS primary role. GP practices are those holding the GP practice role (RO76), since their primary role is the generic prescribing cost centre (RO177).
          </p>
          <div className="overflow-x-auto">
            <table className="mt-2 w-full text-sm">
              <thead className="text-left text-xs text-muted-foreground">
                <tr className="border-b">
                  <th className="px-4 py-2 font-medium">group</th>
                  <th className="px-4 py-2 font-medium">Type</th>
                  <th className="px-4 py-2 font-medium">Primary roles</th>
                </tr>
              </thead>
              <tbody>
                {GROUPS.map((g) => (
                  <tr key={g.key} className="border-b last:border-0 align-top">
                    <td className="px-4 py-2 font-mono text-xs">{g.key}</td>
                    <td className="px-4 py-2">
                      <span className="flex items-center gap-2"><GroupIcon group={g.key} size="xs" />{g.label}</span>
                    </td>
                    <td className="px-4 py-2 font-mono text-xs text-muted-foreground">
                      {g.key === 'gp' ? 'holds RO76' : g.roles.length ? g.roles.join(', ') : 'anything else'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>

        <div className="grid gap-6 md:grid-cols-2">
          <Panel title="Change kinds">
            <dl className="grid grid-cols-[9rem_1fr] gap-y-1 text-sm">
              {Object.entries(KIND_LABELS).map(([k, v]) => (
                <div key={k} className="contents">
                  <dt className="font-mono text-xs leading-5">{k}</dt>
                  <dd className="text-muted-foreground">{v}</dd>
                </div>
              ))}
            </dl>
          </Panel>
          <Panel title="Relationship types (field)">
            <dl className="grid grid-cols-[4rem_1fr] gap-y-1 text-sm">
              {[
                ['RE2', 'Part of'],
                ['RE3', 'Directed by'],
                ['RE4', 'Commissioned by'],
                ['RE5', 'In the geography of'],
                ['RE6', 'Operated by'],
                ['RE8', 'Partner of (practice to PCN)'],
                ['RE9', 'Nominated payee for'],
                ['RE11', 'Constituent of'],
              ].map(([k, v]) => (
                <div key={k} className="contents">
                  <dt className="font-mono text-xs leading-5">{k}</dt>
                  <dd className="text-muted-foreground">{v}</dd>
                </div>
              ))}
            </dl>
            <p className="mt-3 text-xs text-muted-foreground">Succession changes use Predecessor or Successor as the field.</p>
          </Panel>
        </div>

        <Panel title="Dates and history">
          <ul className="list-disc space-y-2 pl-5 text-sm">
            <li>History starts with the June 2018 TRUD release. Changes up to August 2026 are dated to the monthly release that first showed them, so a reorganisation such as April 2020 appears as one spike.</li>
            <li>From September 2026 the ODS API is checked every 6 hours, so detected dates are within hours of ODS publishing.</li>
            <li><Code>effectiveDate</Code> is the date ODS records for the change (a relationship start or end, an organisation&apos;s open or close). It can be earlier than detection when ODS back-dates a record.</li>
          </ul>
        </Panel>
      </div>
    </div>
  )
}
