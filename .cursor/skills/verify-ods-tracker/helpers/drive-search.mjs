#!/usr/bin/env node
// Drive search: GET /api/suggest?q=F83004, then home hero → org page. ≤2 rps. No export/admin.
import { parseArgs } from 'node:util'
import { mkdirSync, writeFileSync } from 'node:fs'
import { chromium } from 'playwright'

const { values } = parseArgs({
  options: {
    site: { type: 'string', default: 'http://127.0.0.1:3100' },
    api: { type: 'string', default: 'https://api.ods-tracker.org' },
    out: { type: 'string', default: '.cursor/skills/verify-ods-tracker/proof/search' },
    help: { type: 'boolean', default: false },
  },
})

if (values.help) {
  console.log(`Usage: node drive-search.mjs [--site URL] [--api URL] [--out DIR]
  Proves search-suggest + hero search-open + search-open-result for F83004.`)
  process.exit(0)
}

const SITE = values.site.replace(/\/$/, '')
const API = values.api.replace(/\/$/, '')
const OUT = values.out
const CODE = 'F83004'
const GAP_MS = 500
const HEADERS = { Accept: 'application/json', 'User-Agent': 'ods-tracker-verify' }
mkdirSync(OUT, { recursive: true })

const log = []
const note = (line) => {
  log.push(line)
  console.log(line)
}

let nextSlot = 0
async function throttle() {
  const wait = Math.max(0, nextSlot - Date.now())
  nextSlot = Math.max(Date.now(), nextSlot) + GAP_MS
  if (wait) await new Promise((r) => setTimeout(r, wait))
}

await throttle()
const suggestRes = await fetch(`${API}/api/suggest?q=${CODE}`, { headers: HEADERS, signal: AbortSignal.timeout(20_000) })
const suggestBody = await suggestRes.text()
writeFileSync(`${OUT}/suggest.json`, suggestBody)
if (!suggestRes.ok) throw new Error(`GET /api/suggest HTTP ${suggestRes.status}: ${suggestBody.slice(0, 140)}`)
const suggest = JSON.parse(suggestBody)
if (suggest.items?.[0]?.code !== CODE) {
  throw new Error(`suggest expected ${CODE} first, got ${suggest.items?.[0]?.code ?? 'none'}`)
}
note(`API suggest ${CODE} → ${suggest.items[0].code} ${suggest.items[0].name}`)

const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
const errors = []
const noise = /hydrat(e|ion)|aria-hidden/i
page.on('pageerror', (e) => {
  if (!noise.test(e.message)) errors.push(e.message)
})
page.on('console', (m) => {
  if (m.type() === 'error' && !noise.test(m.text())) errors.push(m.text())
})

async function hideDevOverlay(page) {
  await page.addStyleTag({ content: 'nextjs-portal { display: none !important }' }).catch(() => {})
}

try {
  await page.goto(`${SITE}/`, { waitUntil: 'load', timeout: 45_000 })
  await page.getByRole('button', { name: /Search by name, ODS code or postcode/ }).click()
  const box = page.getByPlaceholder('Name, ODS code or postcode')
  await box.waitFor({ state: 'visible' })
  await box.fill(CODE)
  // "See all results for F83004" appears immediately; wait for the organisation hit.
  const row = page.locator('[cmdk-item]').filter({ hasText: CODE }).filter({ hasNotText: 'See all results' })
  await row.first().waitFor({ state: 'visible', timeout: 15_000 })
  if (!(await row.first().innerText()).match(/archway/i)) {
    throw new Error(`suggestion row was "${(await row.first().innerText()).slice(0, 120)}"`)
  }
  await hideDevOverlay(page)
  writeFileSync(`${OUT}/dialog.aria.txt`, await page.locator('body').ariaSnapshot())
  await page.screenshot({ path: `${OUT}/dialog.png`, fullPage: false })
  await row.first().click()
  await page.waitForURL(new RegExp(`/org/${CODE}$`), { timeout: 20_000 })
  const heading = await page.locator('h1').innerText()
  if (!/archway/i.test(heading)) throw new Error(`org h1 was "${heading}", expected Archway`)
  if (errors.length) throw new Error(`console: ${[...new Set(errors)].slice(0, 2).join(' | ')}`)
  await hideDevOverlay(page)
  writeFileSync(`${OUT}/org.aria.txt`, await page.locator('body').ariaSnapshot())
  await page.screenshot({ path: `${OUT}/org.png`, fullPage: false })
  note(`hero search ${CODE} → ${page.url()} h1=${heading}`)
} finally {
  await browser.close()
}

writeFileSync(
  `${OUT}/RUN.txt`,
  [
    `feature: search`,
    `entry: home hero + GET /api/suggest?q=${CODE}`,
    `site: ${SITE}`,
    `api: ${API}`,
    ...log,
  ].join('\n') + '\n',
)
note(`proof ${OUT}`)
