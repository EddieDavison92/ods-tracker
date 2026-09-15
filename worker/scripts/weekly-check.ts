// Weekly maintenance check against the public API and live ORD.
// No wrangler/D1 credentials. Rate-limited to ≤2 rps. Never hits /admin/* or full CSV dumps.
//
// Usage:
//   node worker/scripts/weekly-check.ts [baseUrl] [--json] [--smoke]
//   npm run qa:weekly
//   npm run qa:weekly:full
//
// Exit 0 if every check is PASS or WARN; non-zero on any FAIL.
// Latest sync `partial` or failed>0 is WARN; `error` is FAIL.
// Stats swings >2% vs baselines are WARN; >10% are FAIL.
import { spawn } from 'node:child_process'
import { parseArgs } from 'node:util'
import { fileURLToPath } from 'node:url'
import { GROUPS, GP_ROLE } from '../src/ods/groups.ts'
import { fetchOrg } from '../src/ods/ord.ts'
import { primaryRole } from '../src/ods/model.ts'
import type { ChangeItem, ChangesResponse, ListResponse, Meta, OrgDetail, OrgListRow } from '../src/api/types.ts'

const USAGE = `Weekly ODS Tracker checkup (public API + ORD, no Cloudflare credentials).

  node worker/scripts/weekly-check.ts [baseUrl] [--json] [--smoke] [--ord <url>]

  --json    machine-readable object on stdout
  --smoke   also run worker/scripts/smoke-api.ts (slow; or npm run qa:weekly:full)
  --ord     ORD base (default https://directory.spineservices.nhs.uk/ORD/2-0-0)

  GP sample: 10 active GPs from GET /api/orgs?group=gp&limit=10&offset=H
  where H = FNV-1a(lastSyncDate) % max(1, total - 10). Same lastSyncDate → same page.`

const { values: args, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    json: { type: 'boolean', default: false },
    smoke: { type: 'boolean', default: false },
    ord: { type: 'string' },
    help: { type: 'boolean', default: false },
  },
})
if (args.help) {
  console.log(USAGE)
  process.exit(0)
}

const BASE = (
  positionals[0] ?? process.env.ODS_API_URL ?? process.env.ODS_API_BASE ?? process.env.NEXT_PUBLIC_ODS_API_URL ?? 'https://api.ods-tracker.org'
).replace(/\/$/, '')
const ORD = (args.ord ?? process.env.ORD_BASE ?? 'https://directory.spineservices.nhs.uk/ORD/2-0-0').replace(/\/$/, '')

// Matches src/lib/freshness.ts: two missed 6-hour syncs.
const STALE_AFTER_MS = 13 * 3_600_000
const DAY_MS = 86_400_000
const GAP_MS = 500
const HEADERS = {
  Accept: 'application/json',
  'User-Agent': 'ods-tracker (https://github.com/EddieDavison92/ods-tracker)',
}

const STAT_BASELINES = { orgs: 371_000, active_practices: 7_600, active_pcns: 1_300 } as const
const KNOWN_ORGS = ['RRV', 'F83004', 'Z9B2Z'] as const
const EXPECTED_RECORD_CLASSES = new Map([['RC1', 'HSCOrg'], ['RC2', 'HSCSite']])
// LABELS / INVERSE in src/lib/rels.ts.
const KNOWN_RELS = new Set(['RE2', 'RE3', 'RE4', 'RE5', 'RE6', 'RE8', 'RE9', 'RE10', 'RE11'])
// Primary ORD roles that fall through to group `other` (not a weekly surprise).
const OTHER_PRIMARY_ROLES = new Set([
  'RO89', 'RO90', 'RO91', 'RO92', 'RO93', 'RO102', 'RO103', 'RO105', 'RO116', 'RO126',
  'RO128', 'RO131', 'RO134', 'RO137', 'RO138', 'RO140', 'RO146', 'RO147', 'RO157', 'RO158',
  'RO159', 'RO161', 'RO162', 'RO168', 'RO169', 'RO189', 'RO191',
])

type Status = 'pass' | 'warn' | 'fail'
interface Check {
  id: string
  title: string
  status: Status
  summary: string
  notes: string[]
}
interface Snap { code: string; name: string; status: string; primaryRole: string | null }

const RANK: Record<Status, number> = { pass: 0, warn: 1, fail: 2 }
const isoDate = (t = Date.now()) => new Date(t).toISOString().slice(0, 10)
const daysAgo = (iso: string) => (Date.parse(isoDate()) - Date.parse(iso)) / DAY_MS
const age = (iso: string | null) => {
  if (!iso) return 'missing'
  const ms = Date.now() - Date.parse(iso)
  if (!Number.isFinite(ms)) return iso
  const h = Math.round(ms / 3_600_000)
  return h < 48 ? `${h}h ago` : `${Math.round(h / 24)}d ago`
}
const isStale = (iso: string | null | undefined) => !iso || Date.now() - Date.parse(iso) > STALE_AFTER_MS
const mappedRoles = new Set(GROUPS.flatMap((g) => g.roles).concat(GP_ROLE))

function fnv1a(s: string): number {
  let h = 0x811c9dc5
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return h >>> 0
}

let nextSlot = 0
async function throttle() {
  const wait = Math.max(0, nextSlot - Date.now())
  nextSlot = Math.max(Date.now(), nextSlot) + GAP_MS
  if (wait) await new Promise((r) => setTimeout(r, wait))
}

async function getJson<T>(url: string): Promise<T> {
  await throttle()
  const res = await fetch(url, { headers: HEADERS, signal: AbortSignal.timeout(20_000) })
  const text = await res.text()
  if (!res.ok) throw new Error(`HTTP ${res.status} ${shortUrl(url)}: ${text.slice(0, 140)}`)
  try {
    return JSON.parse(text) as T
  } catch {
    throw new Error(`invalid JSON from ${shortUrl(url)}`)
  }
}

function shortUrl(url: string) {
  return url.replace(BASE, '').replace(ORD, 'ORD')
}

const api = <T>(path: string) => getJson<T>(BASE + path)
const ordJson = <T>(path: string) => getJson<T>(`${ORD}${path}${path.includes('?') ? '&' : '?'}_format=json`)

async function ordOrg(code: string) {
  await throttle()
  return fetchOrg(ORD, code)
}

function bump(c: Check, status: Status, msg: string) {
  if (RANK[status] > RANK[c.status]) c.status = status
  c.notes.push(msg)
}
const fail = (c: Check, msg: string) => bump(c, 'fail', msg)
const warn = (c: Check, msg: string) => bump(c, 'warn', msg)

function counts(items: string[], n = 5): string {
  const m = new Map<string, number>()
  for (const x of items) m.set(x, (m.get(x) ?? 0) + 1)
  return [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, n).map(([k, v]) => `${k} ${v}`).join(', ') || 'none'
}

function swingNote(c: Check, label: string, actual: number | null | undefined, baseline: number) {
  if (actual == null || !Number.isFinite(actual)) return fail(c, `${label} missing`)
  const pct = Math.abs(actual - baseline) / baseline
  const shown = `${label} ${actual.toLocaleString('en-GB')} (baseline ${baseline.toLocaleString('en-GB')})`
  if (pct > 0.10) fail(c, `${shown}: ${(pct * 100).toFixed(1)}% swing`)
  else if (pct > 0.02) warn(c, `${shown}: ${(pct * 100).toFixed(1)}% swing`)
}

async function checkSyncHealth(): Promise<Check> {
  const c: Check = { id: 'sync', title: 'Sync health', status: 'pass', summary: '', notes: [] }
  const meta = await api<Meta>('/api/meta')
  if (!meta.lastSyncDate) fail(c, 'lastSyncDate missing')
  else if (daysAgo(meta.lastSyncDate) > 1) fail(c, `lastSyncDate ${meta.lastSyncDate} is more than 1 day old`)
  if (isStale(meta.lastSyncAt)) fail(c, `lastSyncAt stale (${age(meta.lastSyncAt)}; fail after 13h)`)
  const run = meta.runs?.[0]
  if (!run) fail(c, 'no sync runs')
  else if (run.status === 'error') fail(c, `latest run error: ${run.error ?? 'unknown'}`)
  else {
    if (run.status === 'partial') warn(c, `latest run partial (remaining ${run.remaining ?? '?'})`)
    if ((run.failed ?? 0) > 0) warn(c, `latest run failed=${run.failed}`)
  }
  const s = meta.stats
  swingNote(c, 'orgs', s?.orgs, STAT_BASELINES.orgs)
  swingNote(c, 'active_practices', s?.active_practices, STAT_BASELINES.active_practices)
  swingNote(c, 'active_pcns', s?.active_pcns, STAT_BASELINES.active_pcns)
  if ((s?.events_30d ?? 0) === 0) warn(c, 'events_30d is 0')
  c.summary = `lastSyncAt ${age(meta.lastSyncAt)}; run #${run?.id ?? '?'} ${run?.status ?? 'none'}; ${s?.orgs?.toLocaleString('en-GB') ?? '?'} orgs`
  return Object.assign(c, { meta }) as Check & { meta: Meta }
}

async function checkOrdDrift(meta: Meta): Promise<Check> {
  const c: Check = { id: 'ord', title: 'ORD drift', status: 'pass', summary: '', notes: [] }
  const rolesBody = await ordJson<{ Roles?: { id: string; displayName: string; primaryRole?: string | boolean }[] }>('/roles')
  const relsBody = await ordJson<{ Relationships?: { id: string; displayName: string }[] }>('/rels')
  const classesBody = await ordJson<{ RecordClasses?: { id: string; displayName: string }[] }>('/recordclasses')

  const ordRoles = new Set((rolesBody.Roles ?? []).map((r) => r.id))
  const primary = (rolesBody.Roles ?? []).filter((r) => String(r.primaryRole).toLowerCase() === 'true')
  const mappedPrimary = new Set(GROUPS.flatMap((g) => g.roles))
  const unmapped = primary.filter((r) => !mappedRoles.has(r.id)).map((r) => r.id).sort()
  const unexpected = unmapped.filter((id) => !OTHER_PRIMARY_ROLES.has(id))
  const goneOther = [...OTHER_PRIMARY_ROLES].filter((id) => !ordRoles.has(id)).sort()
  const goneMapped = [...mappedPrimary].filter((id) => !ordRoles.has(id)).sort()
  if (unexpected.length) warn(c, `new primary roles not in any group: ${unexpected.join(', ')}`)
  if (goneOther.length) warn(c, `expected-other primary roles missing from ORD: ${goneOther.join(', ')}`)
  if (goneMapped.length) warn(c, `mapped primary roles missing from ORD: ${goneMapped.join(', ')}`)

  const rels = relsBody.Relationships ?? []
  const ordRels = new Set(rels.map((r) => r.id))
  const newRels = rels.map((r) => r.id).filter((id) => !KNOWN_RELS.has(id))
  const goneRels = [...KNOWN_RELS].filter((id) => !ordRels.has(id))
  if (newRels.length) warn(c, `ORD rels not in rels.ts: ${newRels.join(', ')}`)
  if (goneRels.length) warn(c, `rels.ts codes missing from ORD: ${goneRels.join(', ')}`)

  const classes = classesBody.RecordClasses ?? []
  const classIds = new Set(classes.map((r) => r.id))
  for (const [id, name] of EXPECTED_RECORD_CLASSES) {
    const got = classes.find((r) => r.id === id)
    if (!got) fail(c, `record class ${id} (${name}) missing`)
    else if (got.displayName !== name) warn(c, `record class ${id} renamed ${got.displayName} (expected ${name})`)
  }
  const extraClasses = classes.filter((r) => !EXPECTED_RECORD_CLASSES.has(r.id))
  if (extraClasses.length) warn(c, `unexpected record classes: ${extraClasses.map((r) => r.id).join(', ')}`)
  if (classes.length === 0) fail(c, 'ORD /recordclasses empty')

  const last = meta.lastSyncDate
  const syncSince = last && daysAgo(last) <= 2 ? last : isoDate(Date.now() - DAY_MS)
  if (last && daysAgo(last) > 2) warn(c, `skipped deep ORD /sync list; lastSyncDate ${last} is >2 days old`)
  try {
    const sync = await ordJson<{ Organisations?: { OrgLink: string }[]; errorText?: string }>(`/sync?LastChangeDate=${syncSince}`)
    const n = sync.Organisations?.length ?? 0
    if (sync.errorText) warn(c, `ORD /sync: ${sync.errorText}`)
    else if (last && daysAgo(last) >= 1 && n > 0) warn(c, `ORD listed ${n} orgs changed since ${syncSince}; lastSyncDate ${last}`)
    else c.notes.push(`ORD /sync since ${syncSince}: ${n} orgs`)
  } catch (err) {
    warn(c, `ORD /sync failed: ${(err as Error).message}`)
  }

  let matched = 0
  for (const code of KNOWN_ORGS) {
    const result = await compareOrg(code, meta.lastSyncDate, { requirePresent: true })
    if (result === 'match') matched++
    else if (result.startsWith('fail:')) fail(c, result.slice(5))
    else if (result.startsWith('warn:')) warn(c, result.slice(5))
  }
  c.summary = `${primary.length} primary roles (${unmapped.length}→other); ${rels.length}/${KNOWN_RELS.size} rels; ${[...classIds].sort().join('+')}; known orgs ${matched}/${KNOWN_ORGS.length}`
  return c
}

async function compareOrg(code: string, lastSyncDate: string | null, opts: { snap?: Snap; requirePresent?: boolean }): Promise<string> {
  let ours = opts.snap
  if (!ours) {
    try {
      const detail = await api<OrgDetail>(`/api/orgs/${encodeURIComponent(code)}`)
      ours = {
        code: detail.org.code,
        name: detail.org.name,
        status: detail.org.status,
        primaryRole: detail.org.primaryRole?.code ?? null,
      }
    } catch (err) {
      return `fail: ${code} missing from API (${(err as Error).message})`
    }
  }
  let live
  try {
    live = await ordOrg(code)
  } catch (err) {
    return `warn: ORD fetch ${code} failed (${(err as Error).message})`
  }
  if (!live) {
    return opts.requirePresent || ours.status === 'Active'
      ? `fail: ${code} Active in API but missing from ORD`
      : `warn: ${code} not in ORD (archived records are not served)`
  }
  if (lastSyncDate && (live.lastChange ?? '') >= lastSyncDate) return `newer:${code}`
  const bits: string[] = []
  if (live.name !== ours.name) bits.push(`name api=${ours.name} ord=${live.name}`)
  if (live.status !== ours.status) bits.push(`status api=${ours.status} ord=${live.status}`)
  const role = primaryRole(live)
  if (role !== ours.primaryRole) bits.push(`primaryRole api=${ours.primaryRole} ord=${role}`)
  if (bits.length && ours.status === 'Active') return `fail: ${code} ${bits.join('; ')}`
  if (bits.length) return `warn: ${code} (Inactive) ${bits.join('; ')}`
  return 'match'
}

async function checkSpotSample(meta: Meta): Promise<Check> {
  const c: Check = { id: 'spot', title: 'Spot sample', status: 'pass', summary: '', notes: [] }
  const changes = await api<ChangesResponse>('/api/changes?limit=50')
  const recent: Snap[] = []
  const seen = new Set<string>(KNOWN_ORGS)
  for (const it of changes.items) {
    if (seen.has(it.org.code) || !it.org.name) continue
    seen.add(it.org.code)
    recent.push({
      code: it.org.code, name: it.org.name, status: '', primaryRole: it.primaryRole?.code ?? null,
    })
    if (recent.length >= 20) break
  }
  const gpMeta = await api<ListResponse<OrgListRow>>('/api/orgs?group=gp&limit=1')
  const total = gpMeta.total ?? 0
  const span = Math.max(1, total - 10)
  const offset = fnv1a(meta.lastSyncDate ?? isoDate()) % span
  const gps = await api<ListResponse<OrgListRow>>(`/api/orgs?group=gp&limit=10&offset=${offset}`)
  const gpSnaps: Snap[] = (gps.items ?? []).map((o) => ({
    code: o.code, name: o.name, status: o.status, primaryRole: o.primaryRole?.code ?? null,
  }))

  let match = 0, newer = 0, compared = 0, issues = 0
  const samples: { snap: Snap; needStatus: boolean }[] = [
    ...recent.map((snap) => ({ snap, needStatus: true })),
    ...gpSnaps.filter((s) => !seen.has(s.code)).map((snap) => ({ snap, needStatus: false })),
  ]
  for (const { snap, needStatus } of samples) {
    const result = await compareOrg(snap.code, meta.lastSyncDate, { snap: needStatus ? undefined : snap })
    compared++
    if (result === 'match') match++
    else if (result.startsWith('newer:')) newer++
    else if (result.startsWith('fail:')) { issues++; fail(c, result.slice(5)) }
    else { issues++; warn(c, result.replace(/^warn: /, '')) }
  }
  c.notes.push(`GPs from offset ${offset} of ${total} (FNV-1a of lastSyncDate)`)
  c.summary = `${compared} compared, ${match} match, ${newer} ORD-newer, ${issues} issues`
  return c
}

async function checkChanges(): Promise<Check> {
  const c: Check = { id: 'changes', title: 'Changes', status: 'pass', summary: '', notes: [] }
  const since = isoDate(Date.now() - 7 * DAY_MS)
  const items: ChangeItem[] = []
  let cursor: string | null = null
  for (let page = 0; page < 3; page++) {
    const q = new URLSearchParams({ since, limit: '50' })
    if (cursor) q.set('cursor', cursor)
    const body = await api<ChangesResponse>(`/api/changes?${q}`)
    items.push(...body.items)
    cursor = body.nextCursor
    if (!cursor) break
  }
  if (items.length === 0) fail(c, `no /api/changes since ${since}`)
  const kinds = items.map((i) => i.kind)
  const groups = items.map((i) => i.group ?? 'none')
  const byKey = new Map<string, ChangeItem[]>()
  const byOrg = new Map<string, number>()
  for (const it of items) {
    const key = `${it.org.code}|${it.field ?? it.kind}`
    const list = byKey.get(key) ?? []
    list.push(it)
    byKey.set(key, list)
    byOrg.set(it.org.code, (byOrg.get(it.org.code) ?? 0) + 1)
  }
  let flips = 0
  for (const [key, list] of byKey) {
    if (list.length >= 6) fail(c, `repeated ${key} ×${list.length}`)
    else if (list.length >= 4) warn(c, `repeated ${key} ×${list.length}`)
    const oscillating = list.some((a, i) => list.slice(i + 1).some((b) => a.oldValue === b.newValue && a.newValue === b.oldValue && a.oldValue !== a.newValue))
    if (oscillating) {
      flips++
      if (list.length >= 5) fail(c, `flip-flop ${key} ×${list.length}`)
      else warn(c, `flip-flop ${key} ×${list.length}`)
    }
  }
  for (const [code, n] of byOrg) if (n >= 8) warn(c, `${code} appears ${n} times in the window`)
  const topKind = [...new Map(kinds.map((k) => [k, kinds.filter((x) => x === k).length])).entries()].sort((a, b) => b[1] - a[1])[0]
  if (topKind && items.length >= 50 && topKind[1] / items.length >= 0.85) {
    warn(c, `mass ${topKind[0]} (${topKind[1]}/${items.length})`)
  }
  c.summary = `${items.length} events since ${since}; ${counts(kinds)}; flips ${flips}`
  c.notes.unshift(`groups: ${counts(groups)}`)
  return c
}

async function checkHistory(): Promise<Check> {
  const c: Check = { id: 'history', title: 'History', status: 'pass', summary: '', notes: [] }
  const old = await api<ChangesResponse>('/api/changes?cursor=2025-12-31%7C999999999&limit=5')
  if (!old.items.length) fail(c, 'pre-2026 /api/changes cursor returned nothing')
  else if (old.items.some((i) => i.detectedAt > '2025-12-31')) fail(c, 'pre-2026 cursor returned later events')
  const past = await api<ListResponse<unknown>>('/api/practices?asAt=2019-06-01&limit=1')
  if ((past.total ?? 0) < 2000) fail(c, `asAt=2019-06-01 practices total ${past.total} (expected thousands)`)
  const activity = await api<{ months: { month: string; opened: number; closed: number; changed: number }[] }>(
    '/api/changes/activity?interval=year&years=9',
  )
  if (activity.months.length !== 9) fail(c, `yearly activity length ${activity.months.length}, expected 9`)
  if (activity.months[0]?.month.length !== 4) fail(c, `yearly activity not years: ${activity.months[0]?.month}`)
  const empty = activity.months.filter((m) => m.opened + m.closed + m.changed === 0).map((m) => m.month)
  if (empty.length > 1) fail(c, `gappy yearly activity: ${empty.join(', ')} empty`)
  else if (empty.length === 1) warn(c, `yearly activity empty in ${empty[0]}`)
  const span = `${activity.months[0]?.month}–${activity.months.at(-1)?.month}`
  c.summary = `pre-2026 changes ${old.items.length}; 2019 practices ${past.total?.toLocaleString('en-GB')}; activity ${span}`
  return c
}

async function checkSmoke(): Promise<Check> {
  const c: Check = { id: 'smoke', title: 'Smoke API', status: 'pass', summary: '', notes: [] }
  const script = fileURLToPath(new URL('./smoke-api.ts', import.meta.url))
  const inherit = !args.json
  const result = await new Promise<{ code: number; out: string }>((resolve) => {
    const child = spawn(process.execPath, [...process.execArgv, script, BASE], {
      stdio: inherit ? 'inherit' : ['ignore', 'pipe', 'pipe'],
    })
    let out = ''
    child.stdout?.on('data', (b: Buffer) => { out += b })
    child.stderr?.on('data', (b: Buffer) => { out += b })
    child.on('close', (code) => resolve({ code: code ?? 1, out }))
  })
  if (result.code !== 0) {
    fail(c, `smoke-api exited ${result.code}`)
    const fails = result.out.split('\n').filter((l) => l.startsWith('FAIL')).slice(0, 5)
    for (const line of fails) c.notes.push(line)
  }
  c.summary = result.code === 0 ? 'smoke-api exited 0' : `smoke-api exited ${result.code}`
  return c
}

function printHuman(checks: Check[]) {
  const lines = [`Weekly check  ${BASE}`]
  for (const c of checks) {
    lines.push(`${c.status.toUpperCase().padEnd(4)} ${c.title.padEnd(12)} ${c.summary}`)
    if (c.status !== 'pass') {
      for (const n of c.notes.slice(0, 4)) lines.push(`     ${n}`)
    }
  }
  const n = (s: Status) => checks.filter((c) => c.status === s).length
  lines.push(`${n('pass')} PASS, ${n('warn')} WARN, ${n('fail')} FAIL`)
  console.log(lines.slice(0, 40).join('\n'))
}

async function run(id: string, title: string, fn: () => Promise<Check>): Promise<Check> {
  try {
    return await fn()
  } catch (err) {
    return { id, title, status: 'fail', summary: (err as Error).message, notes: [] }
  }
}

const checks: Check[] = []
const sync = await run('sync', 'Sync health', checkSyncHealth)
checks.push(sync)
const meta = (sync as Check & { meta?: Meta }).meta
if (!meta) {
  checks.push({ id: 'ord', title: 'ORD drift', status: 'fail', summary: 'skipped (no meta)', notes: [] })
  checks.push({ id: 'spot', title: 'Spot sample', status: 'fail', summary: 'skipped (no meta)', notes: [] })
} else {
  checks.push(await run('ord', 'ORD drift', () => checkOrdDrift(meta)))
  checks.push(await run('spot', 'Spot sample', () => checkSpotSample(meta)))
}
checks.push(await run('changes', 'Changes', checkChanges))
checks.push(await run('history', 'History', checkHistory))
if (args.smoke) checks.push(await run('smoke', 'Smoke API', checkSmoke))

const failed = checks.some((c) => c.status === 'fail')
if (args.json) {
  const n = (s: Status) => checks.filter((c) => c.status === s).length
  console.log(JSON.stringify({
    ok: !failed,
    checks: checks.map(({ id, title, status, summary, notes }) => ({ id, title, status, summary, notes })),
    summary: { pass: n('pass'), warn: n('warn'), fail: n('fail'), base: BASE, ord: ORD },
  }))
} else {
  printHuman(checks)
}
process.exit(failed ? 1 : 0)
