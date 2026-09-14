// UI crawler: visits every page type, edge-case URLs and sample orgs of every type (every tab),
// and fails on error states, console errors, 5xx responses, missing headings or mobile overflow.
// Usage: node scripts/qa-crawl.mjs [baseUrl]     (default http://localhost:3100)
//        API=https://... to choose where sample org codes come from.
import { chromium } from 'playwright'

const BASE = (process.argv[2] ?? 'http://localhost:3100').replace(/\/$/, '')
const API = (process.env.API ?? 'https://ods-tracker-api.eddiefox-davison.workers.dev').replace(/\/$/, '')
const CONCURRENCY = 4
const ERROR_TEXT = /could not be loaded|Something went wrong|Application error|Unhandled Runtime Error|Internal Server Error/i
const GROUPS = ['gp', 'pcn', 'branch', 'prescribing', 'pharmacy', 'dental', 'optical', 'trust', 'trust_site', 'independent',
  'social_care', 'commissioner', 'local_authority', 'school', 'justice', 'devolved', 'legacy', 'other']

// [path, expected status]
const pages = [
  ['/', 200], ['/?scope=Y56', 200], ['/?scope=Z9B2Z', 200], ['/?scope=BAD!!', 200],
  ['/explore', 200], ['/explore?status=all&sort=recent', 200], ['/explore?q=archway', 200],
  ['/explore?q=%22%3B--%20drop', 200], ['/explore?q=zzzzqqqq', 200], ['/explore?group=nope&scope=bad!!&status=weird&sort=x', 200],
  ['/explore?group=gp&asAt=2019-06-01&scope=Z9B2Z', 200], ['/explore?group=gp&asAt=not-a-date', 200],
  ['/explore?offset=-5', 200], ['/explore?offset=999999', 200], ['/explore?group=pharmacy&scope=Y56&offset=50', 200],
  ['/changes', 200], ['/changes?kinds=all&period=all', 200], ['/changes?kinds=lifecycle&period=30d&group=gp', 200],
  ['/changes?kinds=identity&period=1y&scope=Z9B2Z', 200], ['/changes?kinds=membership&group=trust,trust_site', 200],
  ['/changes?before=abc&kinds=bogus&period=x&group=zzz', 200], ['/changes?scope=93C', 200],
  ['/areas', 200], ['/export', 200], ['/export?scope=Z9B2Z', 200],
  ['/practices', 200], ['/pcns', 200], ['/search?q=boots', 200],
  ['/org/F83004', 200], ['/org/f83004', 200], ['/org/Y00057', 200], ['/org/nope!!', 404], ['/org/ZZZZZZ9', 404],
  ['/does-not-exist', 404],
]

async function sampleOrgs() {
  const codes = []
  for (const g of GROUPS) {
    for (const q of [`group=${g}&limit=2`, `group=${g}&status=inactive&sort=recent&limit=1`]) {
      const res = await fetch(`${API}/api/orgs?${q}`)
      if (res.ok) codes.push(...(await res.json()).items.map((o) => o.code))
    }
  }
  return [...new Set(codes)]
}

const codes = await sampleOrgs()
for (const [i, code] of codes.entries()) {
  pages.push([`/org/${code}`, 200])
  // Every tab for one org of each type.
  if (i % 3 === 0) {
    for (const tab of ['timeline', 'timeline&view=related', 'members', 'members&status=past', 'relationships', 'details']) {
      pages.push([`/org/${code}?tab=${tab}`, 200])
    }
  }
}

const browser = await chromium.launch()
const failures = []
let done = 0

async function visit(context, [path, expected]) {
  const page = await context.newPage()
  const errors = []
  page.on('console', (m) => {
    // Resource 404s are expected on 404 pages.
    if (m.type() === 'error' && !(expected === 404 && /404/.test(m.text()))) errors.push(m.text().slice(0, 200))
  })
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message.slice(0, 200)}`))
  try {
    // 'load' plus a short settle: networkidle can hang on link prefetching.
    const res = await page.goto(BASE + path, { waitUntil: 'load', timeout: 45_000 })
    await page.waitForTimeout(1200)
    const status = res?.status() ?? 0
    const text = await page.evaluate(() => document.body.innerText)
    const problems = []
    if (status !== expected) problems.push(`status ${status}, expected ${expected}`)
    if (ERROR_TEXT.test(text)) problems.push(`error state: "${text.match(ERROR_TEXT)[0]}"`)
    if (!(await page.locator('h1').count())) problems.push('no h1')
    if (errors.length) problems.push(`console: ${[...new Set(errors)].slice(0, 2).join(' | ')}`)
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
    if (overflow > 2) problems.push(`horizontal overflow ${overflow}px`)
    if (problems.length) failures.push(`${path}: ${problems.join('; ')}`)
  } catch (err) {
    failures.push(`${path}: ${err.message.split('\n')[0]}`)
  } finally {
    await page.close()
    done++
    if (done % 10 === 0) console.log(`  ${done} pages, ${failures.length} failures`)
  }
}

async function crawl(viewport, list) {
  const context = await browser.newContext({ viewport })
  let i = 0
  await Promise.all(Array.from({ length: CONCURRENCY }, async () => {
    while (i < list.length) await visit(context, list[i++])
  }))
  await context.close()
}

const t0 = Date.now()
await crawl({ width: 1440, height: 900 }, pages)
// Mobile pass over a representative subset.
const mobile = pages.filter((_, i) => i % 4 === 0).map(([p, s]) => [`${p}${p.includes('?') ? '&' : '?'}m=1`, s])
await crawl({ width: 390, height: 844 }, mobile)
await browser.close()

console.log(`${done} page loads (${pages.length} desktop, ${mobile.length} mobile, ${codes.length} sample orgs) in ${((Date.now() - t0) / 1000).toFixed(0)}s`)
if (failures.length) {
  console.log(`\n${failures.length} failures:\n  ${failures.join('\n  ')}`)
  process.exit(1)
}
console.log('no failures')
