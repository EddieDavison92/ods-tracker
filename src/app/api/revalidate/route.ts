import { timingSafeEqual } from 'node:crypto'
import { revalidateTag } from 'next/cache'
import { ODS_TAG } from '@/lib/api'

// Refreshes cached API data. POST with "Authorization: Bearer <REVALIDATE_TOKEN>".
// Default (after each sync): the next visitor gets the cached copy while fresh data loads.
// ?mode=hard (after an API deploy that changes response shapes): cached data is dropped at once,
// so no page renders against the old shape.
export async function POST(request: Request) {
  const expected = process.env.REVALIDATE_TOKEN
  const given = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '') ?? ''
  const ok = !!expected && given.length === expected.length && timingSafeEqual(Buffer.from(given), Buffer.from(expected))
  if (!ok) return Response.json({ error: 'unauthorised' }, { status: 401 })
  const hard = new URL(request.url).searchParams.get('mode') === 'hard'
  revalidateTag(ODS_TAG, hard ? { expire: 0 } : 'max')
  return Response.json({ revalidated: true, mode: hard ? 'hard' : 'stale-while-revalidate', now: Date.now() })
}
