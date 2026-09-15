#!/usr/bin/env node
// Read-only health check: public API /api/meta, optional site homepage, optional PID/port.
import { parseArgs } from 'node:util'
import { readFileSync } from 'node:fs'

const { values } = parseArgs({
  options: {
    api: { type: 'string', default: 'https://api.ods-tracker.org' },
    site: { type: 'string' },
    'pid-file': { type: 'string' },
    help: { type: 'boolean', default: false },
  },
})

if (values.help) {
  console.log(`Usage: node doctor.mjs [--api URL] [--site URL] [--pid-file PATH]
  GET /api/meta must be fresh (≥300000 orgs, lastSyncDate ≤2 days, latest run not error).
  GET / (if --site) must be 200 and contain "ODS Tracker" plus an h1.
  --pid-file, when set, must name a live process.`)
  process.exit(0)
}

const API = values.api.replace(/\/$/, '')
const HEADERS = { Accept: 'application/json', 'User-Agent': 'ods-tracker-verify' }
const problems = []

function fail(msg) {
  problems.push(msg)
}

const res = await fetch(`${API}/api/meta`, { headers: HEADERS, signal: AbortSignal.timeout(20_000) })
const text = await res.text()
if (!res.ok) {
  fail(`GET /api/meta HTTP ${res.status}: ${text.slice(0, 140)}`)
} else {
  let meta
  try {
    meta = JSON.parse(text)
  } catch {
    fail('GET /api/meta: invalid JSON')
  }
  if (meta) {
    const orgs = meta.stats?.orgs ?? 0
    const last = meta.lastSyncDate
    const ageDays = last ? (Date.parse(new Date().toISOString().slice(0, 10)) - Date.parse(last)) / 86_400_000 : Infinity
    const run = meta.runs?.[0]
    console.log(`API     ${API}`)
    console.log(`meta    lastSyncDate ${last ?? 'missing'}  lastSyncAt ${meta.lastSyncAt ?? 'missing'}  orgs ${orgs}`)
    console.log(`run     #${run?.id ?? '?'} ${run?.status ?? 'none'}${run?.error ? ` ${run.error}` : ''}`)
    if (orgs < 300_000) fail(`stats.orgs ${orgs} (< 300000)`)
    if (!last) fail('lastSyncDate missing')
    else if (ageDays > 2) fail(`lastSyncDate ${last} is more than 2 days old`)
    if (run?.status === 'error') fail(`latest sync run failed: ${run.error ?? 'unknown'}`)
  }
}

if (values.site) {
  const site = values.site.replace(/\/$/, '')
  const home = await fetch(`${site}/`, { signal: AbortSignal.timeout(30_000), redirect: 'follow' })
  const html = await home.text()
  console.log(`site    ${site} HTTP ${home.status}`)
  if (home.status !== 200) fail(`GET ${site}/ HTTP ${home.status}`)
  if (!/ODS Tracker/.test(html)) fail('homepage missing "ODS Tracker"')
  if (!/<h1[\s>]/i.test(html)) fail('homepage missing h1')
}

if (values['pid-file']) {
  let pid
  try {
    pid = Number(readFileSync(values['pid-file'], 'utf8').trim())
  } catch {
    fail(`pid-file unreadable: ${values['pid-file']}`)
  }
  if (pid) {
    try {
      process.kill(pid, 0)
      console.log(`pid     ${pid} alive`)
    } catch {
      fail(`pid ${pid} is not running`)
    }
  }
}

if (problems.length) {
  console.log(`DOCTOR FAIL\n  ${problems.join('\n  ')}`)
  process.exit(1)
}
console.log('DOCTOR PASS')
