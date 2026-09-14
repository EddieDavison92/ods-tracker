// Import backfill SQL files into D1 in file-name order. Run migrations first.
// Usage: node scripts/import.ts --remote|--local [--dir .backfill] [--only 50,90]
//   --only: comma list of file prefixes (e.g. 50 = change events, 90 = meta)
// Then POST /admin/refresh on the Worker to rebuild org_scope and stats.
import { execFileSync } from 'node:child_process'
import { readdirSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { parseArgs } from 'node:util'

const { values: args } = parseArgs({
  options: {
    remote: { type: 'boolean', default: false },
    local: { type: 'boolean', default: false },
    dir: { type: 'string', default: '.backfill' },
    only: { type: 'string' },
  },
})
if (args.remote === args.local) throw new Error('pass exactly one of --remote or --local')

const root = resolve(import.meta.dirname, '..')
const dir = resolve(root, args.dir!)
const prefixes = args.only?.split(',')
const files = readdirSync(dir)
  .filter((f) => f.endsWith('.sql') && (!prefixes || prefixes.some((p) => f.startsWith(`${p}-`))))
  .sort()

for (const f of files) {
  const t0 = Date.now()
  execFileSync(
    'npx',
    ['wrangler', 'd1', 'execute', 'ods-tracker', args.remote ? '--remote' : '--local', '--yes', '--file', join(dir, f)],
    { cwd: root, stdio: ['ignore', 'ignore', 'inherit'], shell: process.platform === 'win32' },
  )
  console.log(`${f} ${((Date.now() - t0) / 1000).toFixed(0)}s`)
}
