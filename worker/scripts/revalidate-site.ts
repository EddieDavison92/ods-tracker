// Drops the site's cached API data at once. Run after deploying API changes that alter response
// shapes, so pages never render against data cached from the previous version.
// Usage: node scripts/revalidate-site.ts   (reads REVALIDATE_TOKEN from .dev.vars)
import { readFileSync } from 'node:fs'

const SITE = process.env.APP_URL ?? 'https://ods-tracker.org'
const token = readFileSync(new URL('../.dev.vars', import.meta.url), 'utf8').match(/^REVALIDATE_TOKEN=(.+)$/m)?.[1]?.trim()
if (!token) throw new Error('REVALIDATE_TOKEN missing from worker/.dev.vars')

const res = await fetch(`${SITE}/api/revalidate?mode=hard`, { method: 'POST', headers: { Authorization: `Bearer ${token}` } })
console.log(`revalidate ${SITE}: HTTP ${res.status} ${await res.text()}`)
if (!res.ok) process.exit(1)
