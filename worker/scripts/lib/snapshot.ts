// Read a TRUD HSCOrgRefData release zip (item 341) into OrgRecords.
// Release zip -> fullfile.zip + archive.zip -> one XML each. Archive holds long-closed orgs.
import { readFileSync } from 'node:fs'
import { unzipSync } from 'fflate'
import type { OrgRecord } from '../../src/ods/model.ts'
import { parseOrgBlock, publicationDate } from '../../src/ods/xml.ts'

export interface Snapshot {
  date: string
  orgs: Map<string, OrgRecord>
  roles: Map<string, string>
  relTypes: Map<string, string>
}

const OPEN = Buffer.from('<Organisation ')
const CLOSE = Buffer.from('</Organisation>')

function xmlFrom(zip: Uint8Array): Buffer {
  const files = unzipSync(zip, { filter: (f) => f.name.toLowerCase().endsWith('.xml') })
  const [data] = Object.values(files)
  if (!data) throw new Error('no XML in zip')
  return Buffer.from(data.buffer, data.byteOffset, data.byteLength)
}

function codeSystem(head: string, name: string): Map<string, string> {
  const out = new Map<string, string>()
  const block = head.match(new RegExp(`<CodeSystem name="${name}"[\\s\\S]*?</CodeSystem>`))?.[0] ?? ''
  for (const m of block.matchAll(/<concept\b[^>]*\bid="([^"]+)"[^>]*\bdisplayName="([^"]+)"/g)) {
    out.set(m[1], m[2].replace(/&amp;/g, '&'))
  }
  return out
}

function scan(xml: Buffer, into: Map<string, OrgRecord>, keepExisting: boolean) {
  let pos = 0
  for (;;) {
    const start = xml.indexOf(OPEN, pos)
    if (start === -1) break
    const end = xml.indexOf(CLOSE, start)
    if (end === -1) throw new Error('unterminated <Organisation>')
    pos = end + CLOSE.length
    const org = parseOrgBlock(xml.toString('utf8', start, pos))
    if (!keepExisting || !into.has(org.code)) into.set(org.code, org)
  }
}

export function readSnapshot(zipPath: string): Snapshot {
  const outer = unzipSync(readFileSync(zipPath), {
    filter: (f) => f.name === 'fullfile.zip' || f.name === 'archive.zip',
  })
  if (!outer['fullfile.zip']) throw new Error(`${zipPath}: fullfile.zip missing`)

  const full = xmlFrom(outer['fullfile.zip'])
  const head = full.toString('utf8', 0, Math.min(full.length, 2_000_000))
  const date = publicationDate(head)
  if (!date) throw new Error(`${zipPath}: no PublicationDate`)

  const orgs = new Map<string, OrgRecord>()
  scan(full, orgs, false)
  if (outer['archive.zip']) scan(xmlFrom(outer['archive.zip']), orgs, true)

  return { date, orgs, roles: codeSystem(head, 'OrganisationRole'), relTypes: codeSystem(head, 'OrganisationRelationship') }
}
