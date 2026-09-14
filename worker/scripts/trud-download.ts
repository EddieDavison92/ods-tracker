// Download TRUD HSCOrgRefData releases (item 341) for scripts/backfill.ts --dir.
// Usage: node --env-file=.env scripts/trud-download.ts [--all] [--out ../.cache/trud]
import { mkdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { parseArgs } from 'node:util'
import { downloadRelease, listReleases } from './lib/trud.ts'

const { values: args } = parseArgs({
  options: { all: { type: 'boolean', default: false }, out: { type: 'string', default: '../.cache/trud' } },
})
const out = resolve(import.meta.dirname, '..', args.out!)
mkdirSync(out, { recursive: true })
for (const r of await listReleases(!args.all)) {
  console.log(`${r.releaseDate} ${await downloadRelease(r, out)}`)
}
