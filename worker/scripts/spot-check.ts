// Spot-check D1 against independent current ODS sources:
//  1. epraccur (ODS Data Search and Export prescribing cost centre extract): name, status, postcode,
//     open/close dates, commissioner (Sub-ICB) and ICB for every row.
//  2. Live ORD API records for a random sample of orgs, compared by record hash.
// Usage: node scripts/spot-check.ts [--local] [--sample 150]
import { execSync } from 'node:child_process'
import { parseArgs } from 'node:util'
import { fetchOrg } from '../src/ods/ord.ts'
import { hashOrg } from '../src/ods/model.ts'

const ORD = 'https://directory.spineservices.nhs.uk/ORD/2-0-0'
const EPRACCUR = 'https://www.odsdatasearchandexport.nhs.uk/api/getReport?report=epraccur'
const { values: args } = parseArgs({
  options: { local: { type: 'boolean', default: false }, sample: { type: 'string', default: '150' } },
})

function d1<T>(sql: string): T[] {
  const out = execSync(
    `npx wrangler d1 execute ods-tracker ${args.local ? '--local' : '--remote'} --json --command "${sql.replace(/\s+/g, ' ')}"`,
    { cwd: import.meta.dirname + '/..', maxBuffer: 512 * 1024 * 1024, stdio: ['ignore', 'pipe', 'ignore'] },
  )
  return JSON.parse(out.toString())[0].results as T[]
}

// Minimal CSV parser for quoted epraccur rows.
function parseCsv(text: string): string[][] {
  return text.trim().split(/\r?\n/).map((line) => [...line.matchAll(/"((?:[^"]|"")*)"|([^,]*)(?:,|$)/g)]
    .map((m) => (m[1] ?? m[2] ?? '').replace(/""/g, '"')))
}

const isoDate = (d: string) => (d ? `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}` : null)

const [meta] = d1<{ value: string }>("SELECT value FROM meta WHERE key = 'last_sync_date'")
console.log(`D1 data complete up to ${meta?.value ?? 'unknown'}\n`)

// 1. epraccur
const csv = parseCsv(await (await fetch(EPRACCUR)).text())
console.log(`epraccur: ${csv.length} rows`)
type Row = { code: string; name: string; status: string; postcode: string | null; op_start: string | null; op_end: string | null; sicbl: string | null; icb: string | null }
const rows = d1<Row>(`
  SELECT o.code, o.name, o.status, o.postcode, o.op_start, o.op_end,
    (SELECT r.target FROM org_rel r WHERE r.code = o.code AND r.rel_type = 'RE4' AND r.op_end IS NULL
       ORDER BY r.op_start DESC LIMIT 1) AS sicbl,
    s.icb
  FROM org o LEFT JOIN org_scope s ON s.code = o.code
  WHERE o.primary_role IN ('RO177', 'RO76')`)
const db = new Map(rows.map((r) => [r.code, r]))

const fields = ['name', 'status', 'postcode', 'open', 'close', 'sub_icb', 'icb'] as const
const mismatches: Record<string, string[]> = Object.fromEntries(fields.map((f) => [f, []]))
let missing = 0, compared = 0
for (const c of csv) {
  const [code, name, , icbCode, , , , , , postcode, open, close, status, , commissioner] = c
  const r = db.get(code)
  if (!r) { missing++; continue }
  compared++
  const expectStatus = status === 'INACTIVE' ? 'Inactive' : 'Active'
  const checks: [typeof fields[number], unknown, unknown][] = [
    ['name', r.name, name],
    ['status', r.status, expectStatus],
    ['postcode', r.postcode, postcode || null],
    ['open', r.op_start, isoDate(open)],
    ['close', r.op_end, isoDate(close)],
    // epraccur keeps the last commissioner for closed orgs; D1 only compares open relationships.
    ['sub_icb', r.sicbl ?? commissioner, commissioner],
    ['icb', r.op_end ? icbCode : r.icb, icbCode],
  ]
  for (const [f, got, want] of checks) {
    if ((got ?? null) !== (want ?? null)) mismatches[f].push(`${code}: d1=${got} epraccur=${want}`)
  }
}
console.log(`compared ${compared}, missing from D1 ${missing}`)
for (const f of fields) {
  const m = mismatches[f]
  console.log(`  ${f.padEnd(8)} ${m.length} mismatches (${((100 * (compared - m.length)) / compared).toFixed(2)}% match)`)
  for (const x of m.slice(0, 5)) console.log(`      ${x}`)
}

// 2. Live ORD sample
const sample = d1<{ code: string; hash: string }>(
  `SELECT code, hash FROM org WHERE status = 'Active' ORDER BY RANDOM() LIMIT ${Number(args.sample)}`,
)
let same = 0, newer = 0, differ = 0, gone = 0
const diffs: string[] = []
for (const { code, hash } of sample) {
  const live = await fetchOrg(ORD, code)
  if (!live) { gone++; continue }
  if (hashOrg(live) === hash) { same++; continue }
  if ((live.lastChange ?? '') >= (meta?.value ?? '')) { newer++; continue }
  differ++
  diffs.push(code)
}
console.log(`\nORD sample of ${sample.length}: ${same} identical, ${newer} changed since last sync, ${differ} differ, ${gone} not in ORD`)
if (diffs.length) console.log(`  differing: ${diffs.join(', ')}`)
