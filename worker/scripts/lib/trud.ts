// NHS TRUD API client for item 341 (HSCOrgRefData XML releases, monthly since 2018).
// Needs TRUD_API_KEY from a free TRUD account (https://isd.digital.nhs.uk) subscribed to item 341.
import { createWriteStream, existsSync, renameSync } from 'node:fs'
import { join } from 'node:path'
import { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'

export interface TrudRelease {
  releaseDate: string
  archiveFileName: string
  archiveFileUrl: string
  archiveFileSizeBytes: number
}

export async function listReleases(latestOnly = false): Promise<TrudRelease[]> {
  const key = process.env.TRUD_API_KEY
  if (!key) throw new Error('TRUD_API_KEY not set (use node --env-file=.env)')
  const res = await fetch(`https://isd.digital.nhs.uk/trud/api/v1/keys/${key}/items/341/releases${latestOnly ? '?latest' : ''}`)
  const body = (await res.json()) as { releases?: TrudRelease[]; message?: string }
  if (!res.ok || !body.releases) throw new Error(`TRUD API ${res.status}: ${body.message ?? 'no releases'}`)
  return body.releases
}

// Downloads to dir/archiveFileName unless already present. Returns the path.
export async function downloadRelease(r: TrudRelease, dir: string): Promise<string> {
  const file = join(dir, r.archiveFileName)
  if (existsSync(file)) return file
  const res = await fetch(r.archiveFileUrl)
  if (!res.ok || !res.body) throw new Error(`download ${r.archiveFileName} failed (${res.status})`)
  await pipeline(Readable.fromWeb(res.body), createWriteStream(`${file}.part`))
  renameSync(`${file}.part`, file)
  return file
}
