// Build the D1 database from TRUD HSCOrgRefData releases (item 341).
// Diffs consecutive releases into change_event history, then writes the latest release as current state.
// Output: numbered .sql files in --out, loaded with scripts/import.ts.
//
// Usage:
//   node --env-file=.env --max-old-space-size=16000 scripts/backfill.ts --trud   # all releases via TRUD API
//   node --max-old-space-size=16000 scripts/backfill.ts --dir ../.cache/trud      # local release zips
//   options: --from YYYY-MM-DD (skip older releases)  --out .backfill  --cache ../.cache/trud
import { mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { basename, join, resolve } from 'node:path'
import { parseArgs } from 'node:util'
import { readSnapshot, type Snapshot } from './lib/snapshot.ts'
import { SqlWriter } from './lib/sql.ts'
import { downloadRelease, listReleases, type TrudRelease } from './lib/trud.ts'
import { diffOrg } from '../src/ods/diff.ts'
import { hashOrg, type OrgRecord } from '../src/ods/model.ts'
import { EVENT_COLS, ORG_COLS, REL_COLS, ROLE_COLS, SUCC_COLS, eventRow, orgRow, relRow, roleRow, succRow } from '../src/db/rows.ts'

const { values: args } = parseArgs({
  options: {
    dir: { type: 'string' },
    trud: { type: 'boolean', default: false },
    from: { type: 'string' },
    out: { type: 'string', default: '.backfill' },
    cache: { type: 'string', default: '../.cache/trud' },
  },
})

const ROOT = resolve(import.meta.dirname, '..')
const out = resolve(ROOT, args.out!)
const cache = resolve(ROOT, args.cache!)
const releaseDate = (name: string) => name.match(/_(\d{4})(\d{2})(\d{2})\d+\.zip$/)?.slice(1, 4).join('-') ?? ''

// Release zips oldest-first; TRUD releases are downloaded on demand into --cache.
interface Release { date: string; path: string; trud?: TrudRelease }
let releases: Release[]
if (args.trud) {
  mkdirSync(cache, { recursive: true })
  releases = (await listReleases()).map((r) => ({ date: releaseDate(r.archiveFileName), path: join(cache, r.archiveFileName), trud: r }))
} else if (args.dir) {
  const dir = resolve(ROOT, args.dir)
  releases = readdirSync(dir).filter((f) => /^hscorgrefdataxml_data_.*\.zip$/.test(f))
    .map((f) => ({ date: releaseDate(f), path: join(dir, f) }))
} else {
  throw new Error('pass --trud or --dir <folder>')
}
releases = releases.filter((r) => !args.from || r.date >= args.from).sort((a, b) => a.date.localeCompare(b.date))
if (!releases.length) throw new Error('no releases found')

const fetchRelease = async (r: Release) => {
  if (r.trud) await downloadRelease(r.trud, cache)
}

rmSync(out, { recursive: true, force: true })
const events = new SqlWriter(out, '50-events', 'change_event', EVENT_COLS)
const summary: Record<string, unknown>[] = []

let prev: { orgs: Map<string, OrgRecord>; hashes: Map<string, string> } | null = null
let last: Snapshot | null = null
let prefetch = fetchRelease(releases[0])

for (let i = 0; i < releases.length; i++) {
  const r = releases[i]
  await prefetch
  prefetch = i + 1 < releases.length ? fetchRelease(releases[i + 1]) : Promise.resolve()

  const t0 = Date.now()
  const snap = readSnapshot(r.path)
  const hashes = new Map<string, string>()
  for (const [code, org] of snap.orgs) hashes.set(code, hashOrg(org))

  const kinds: Record<string, number> = {}
  let changed = 0
  if (prev) {
    const codes = new Set([...prev.orgs.keys(), ...snap.orgs.keys()])
    for (const code of codes) {
      if (prev.hashes.get(code) === hashes.get(code)) continue
      const diff = diffOrg(prev.orgs.get(code) ?? null, snap.orgs.get(code) ?? null)
      if (!diff.events.length) continue
      changed++
      for (const e of diff.events) {
        kinds[e.kind] = (kinds[e.kind] ?? 0) + 1
        events.add(eventRow(e, snap.date, 'trud'))
      }
    }
  }
  const secs = ((Date.now() - t0) / 1000).toFixed(1)
  console.log(`${snap.date} ${snap.orgs.size} orgs, ${changed} changed, ${Object.values(kinds).reduce((a, b) => a + b, 0)} events (${secs}s)`)
  summary.push({ release: basename(r.path), date: snap.date, orgs: snap.orgs.size, changed, kinds })

  prev = { orgs: snap.orgs, hashes }
  last = snap
}
events.close()

// Current state from the latest release.
const snap = last!
const now = new Date().toISOString()
const writers = {
  org: new SqlWriter(out, '20-org', 'org', ORG_COLS),
  role: new SqlWriter(out, '21-org_role', 'org_role', ROLE_COLS),
  rel: new SqlWriter(out, '22-org_rel', 'org_rel', REL_COLS),
  succ: new SqlWriter(out, '23-org_succ', 'org_succ', SUCC_COLS),
}
for (const org of snap.orgs.values()) {
  writers.org.add(orgRow(org, now))
  for (const r of org.roles) writers.role.add(roleRow(org.code, r))
  for (const r of org.rels) writers.rel.add(relRow(org.code, r))
  for (const s of org.succs) writers.succ.add(succRow(org.code, s))
}
Object.values(writers).forEach((w) => w.close())

const refs = new SqlWriter(out, '10-refs', 'role_ref', ['code', 'name'])
for (const [code, name] of snap.roles) refs.add([code, name])
refs.close()
const relRefs = new SqlWriter(out, '11-rel_type_ref', 'rel_type_ref', ['code', 'name'])
for (const [code, name] of snap.relTypes) relRefs.add([code, name])
relRefs.close()

// ORD sync resumes from the snapshot's publication date.
const meta = new SqlWriter(out, '90-meta', 'meta', ['key', 'value'])
meta.add(['snapshot_date', snap.date])
meta.add(['last_sync_date', snap.date])
meta.add(['history_from', String(summary[0].date)])
meta.add(['backfill_at', now])
meta.close()

writeFileSync(join(out, 'summary.json'), JSON.stringify(summary, null, 2))
console.log(`\nwrote ${out}: ${writers.org.rows} orgs, ${writers.role.rows} roles, ${writers.rel.rows} rels, ${writers.succ.rows} succs, ${events.rows} events`)
