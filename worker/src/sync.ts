// Incremental sync from the ORD API.
// 1. List orgs changed since the last completed sync (minus a day of overlap) into sync_queue.
// 2. Fetch queued orgs, diff against stored state, write changes + events.
// 3. When the queue drains, advance meta.last_sync_date to the listing date.
import { diffOrg } from './ods/diff.ts'
import { hashOrg } from './ods/model.ts'
import { fetchOrg, listChangedSince } from './ods/ord.ts'
import { getMeta, loadOrg, orgWrites, refreshDerived, setMeta, storedHashes } from './db/store.ts'

export interface SyncOptions {
  trigger: string
  maxOrgs: number
  budgetMs: number
  list?: boolean
}

export interface SyncResult {
  since: string | null
  listed: number
  processed: number
  changed: number
  events: number
  remaining: number
  status: 'ok' | 'partial' | 'error'
  error?: string
}

const DAY = 86_400_000
// ORD rejects LastChangeDate older than 185 days.
const MAX_LOOKBACK_DAYS = 185
const CONCURRENCY = 4

const isoDate = (t: number) => new Date(t).toISOString().slice(0, 10)

export async function runSync(env: Env, opts: SyncOptions): Promise<SyncResult> {
  const db = env.DB
  const started = Date.now()
  const now = new Date(started).toISOString()
  const today = isoDate(started)
  const run = await db
    .prepare("INSERT INTO sync_run (started_at, trigger, status) VALUES (?, ?, 'running') RETURNING id")
    .bind(now, opts.trigger)
    .first<{ id: number }>()
  const result: SyncResult = { since: null, listed: 0, processed: 0, changed: 0, events: 0, remaining: 0, status: 'ok' }

  try {
    const last = await getMeta(db, 'last_sync_date')
    if (!last) throw new Error('meta.last_sync_date missing: load a TRUD snapshot first')

    if (opts.list !== false) {
      const sinceMs = Math.max(Date.parse(last) - DAY, started - (MAX_LOOKBACK_DAYS - 1) * DAY)
      if (Date.parse(last) - DAY < started - (MAX_LOOKBACK_DAYS - 1) * DAY) {
        throw new Error(`last sync ${last} is beyond ORD's ${MAX_LOOKBACK_DAYS}-day window: reload from TRUD`)
      }
      result.since = isoDate(sinceMs)
      const codes = await listChangedSince(env.ORD_BASE, result.since)
      result.listed = codes.length
      const stmts = []
      for (let i = 0; i < codes.length; i += 90) {
        const chunk = codes.slice(i, i + 90)
        stmts.push(
          db.prepare(`INSERT OR IGNORE INTO sync_queue (code, queued_at) VALUES ${chunk.map(() => '(?, ?)').join(', ')}`)
            .bind(...chunk.flatMap((c) => [c, now])),
        )
      }
      if (stmts.length) await db.batch(stmts)
      await setMeta(db, 'pending_sync_date', today).run()
    }

    const { results: queued } = await db
      .prepare('SELECT code FROM sync_queue ORDER BY queued_at, code LIMIT ?')
      .bind(opts.maxOrgs)
      .all<{ code: string }>()
    const hashes = await storedHashes(db, queued.map((q) => q.code))

    let next = 0
    const worker = async () => {
      while (next < queued.length && Date.now() - started < opts.budgetMs) {
        const { code } = queued[next++]
        const live = await fetchOrg(env.ORD_BASE, code)
        const dequeue = db.prepare('DELETE FROM sync_queue WHERE code = ?').bind(code)
        if (!live || hashes.get(code) === hashOrg(live)) {
          await dequeue.run()
        } else {
          const prev = hashes.has(code) ? await loadOrg(db, code) : null
          const diff = diffOrg(prev, live)
          await db.batch([...orgWrites(db, code, live, diff, today, 'ord', now), dequeue])
          result.changed++
          result.events += diff.events.length
        }
        result.processed++
      }
    }
    await Promise.all(Array.from({ length: CONCURRENCY }, worker))

    const left = await db.prepare('SELECT COUNT(*) AS n FROM sync_queue').first<{ n: number }>()
    result.remaining = left?.n ?? 0
    if (result.remaining === 0) {
      const pending = (await getMeta(db, 'pending_sync_date')) ?? today
      await setMeta(db, 'last_sync_date', pending).run()
    } else {
      result.status = 'partial'
    }
    if (result.changed > 0) await refreshDerived(db)
    await setMeta(db, 'last_sync_at', now).run()
  } catch (err) {
    result.status = 'error'
    result.error = err instanceof Error ? err.message : String(err)
  }

  await db
    .prepare(
      `UPDATE sync_run SET finished_at = ?, since = ?, listed = ?, processed = ?, changed = ?, events = ?,
       remaining = ?, status = ?, error = ? WHERE id = ?`,
    )
    .bind(
      new Date().toISOString(), result.since, result.listed, result.processed, result.changed, result.events,
      result.remaining, result.status, result.error ?? null, run!.id,
    )
    .run()
  return result
}
