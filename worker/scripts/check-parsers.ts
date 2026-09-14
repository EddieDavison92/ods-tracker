// Verify the TRUD XML parser and ORD JSON parser produce identical records.
// Samples orgs from a snapshot whose live LastChangeDate predates the snapshot (so both should match).
// Usage: node scripts/check-parsers.ts <release.zip> [sampleSize]
import { readSnapshot } from './lib/snapshot.ts'
import { fetchOrg } from '../src/ods/ord.ts'
import { hashOrg, makeOrg } from '../src/ods/model.ts'

const ORD = 'https://directory.spineservices.nhs.uk/ORD/2-0-0'
const [zip, n = '200'] = process.argv.slice(2)
const snap = readSnapshot(zip)
console.log(`snapshot ${snap.date}: ${snap.orgs.size} orgs, ${snap.roles.size} roles, ${snap.relTypes.size} rel types`)

const codes = [...snap.orgs.keys()]
const sample = Array.from({ length: Number(n) }, () => codes[Math.floor(Math.random() * codes.length)])
// Always include some primary care orgs.
sample.push('F83004', 'U02795', '93C', 'QMJ', 'Y56', 'RRV', '5QCAH')

let same = 0, differ = 0, changedSince = 0, missing = 0
for (const code of sample) {
  const xml = snap.orgs.get(code)!
  const live = await fetchOrg(ORD, code)
  if (!live) { missing++; continue }
  if ((live.lastChange ?? '') >= snap.date) { changedSince++; continue }
  if (hashOrg(xml) === hashOrg(live)) { same++; continue }
  differ++
  const a = makeOrg(xml) as unknown as Record<string, unknown>
  const b = makeOrg(live) as unknown as Record<string, unknown>
  for (const k of Object.keys(a)) {
    if (JSON.stringify(a[k]) !== JSON.stringify(b[k])) {
      console.log(`DIFF ${code}.${k}\n  xml: ${JSON.stringify(a[k]).slice(0, 400)}\n  ord: ${JSON.stringify(b[k]).slice(0, 400)}`)
    }
  }
}
console.log({ same, differ, changedSince, missing })
